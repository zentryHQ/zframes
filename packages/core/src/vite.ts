import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

/**
 * Dev-only Vite plugin that lets the in-browser editor persist edits straight
 * back to the dashboard spec file. The editor PUTs the full spec JSON to
 * `route`; this writes it to `file` (pretty-printed), so the artifact the
 * agent generates and the one a human edits in the browser stay the *same*
 * human-editable file — round-tripped, never a separate localStorage blob.
 *
 * Only active under `vite` / `vite dev` (apply: "serve"). A production build
 * has no server to write to; the editor falls back to a download there.
 *
 * Typed loosely (returns a structural Vite Plugin) so @zframes/core needn't
 * depend on vite — the host already does.
 */
export interface DashboardWritebackOptions {
  /** Spec file to write, relative to the Vite project root. */
  file?: string;
  /** HTTP route the editor PUTs to. */
  route?: string;
}

export function dashboardWriteback(options: DashboardWritebackOptions = {}) {
  const file = options.file ?? "src/dashboard.json";
  const route = options.route ?? "/__zframes/dashboard";

  return {
    name: "zframes:dashboard-writeback",
    apply: "serve" as const,
    configureServer(server: {
      config: { root: string };
      middlewares: {
        use: (
          path: string,
          handler: (req: any, res: any, next: () => void) => void,
        ) => void;
      };
    }) {
      server.middlewares.use(route, (req, res) => {
        if (req.method !== "PUT" && req.method !== "POST") {
          res.statusCode = 405;
          res.end();
          return;
        }
        let body = "";
        req.on("data", (chunk: Buffer) => {
          body += chunk;
        });
        req.on("end", async () => {
          try {
            // Parse + re-stringify so we never persist malformed JSON and the
            // file lands consistently formatted (2-space, trailing newline).
            const json = JSON.parse(body);
            const target = resolve(server.config.root, file);
            await writeFile(
              target,
              `${JSON.stringify(json, null, 2)}\n`,
              "utf8",
            );
            res.statusCode = 200;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ ok: true, file }));
          } catch (error) {
            res.statusCode = 400;
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ ok: false, error: String(error) }));
          }
        });
      });
    },
  };
}
