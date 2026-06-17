import {
  createRegistry,
  DashboardSpecSchema,
  FramesProvider,
  type DashboardSpec,
} from "@zframes/core";
import { DashboardEditor } from "@zframes/core/editor";
import { allFrames } from "@zframes/frames";
import { AlternativeMeProvider } from "@zframes/provider-alternativeme";
import { CoinGeckoProvider } from "@zframes/provider-coingecko";
import { DefiLlamaProvider } from "@zframes/provider-defillama";
import { HyperliquidProvider } from "@zframes/provider-hyperliquid";
import rawSpec from "./dashboard.json";
import { DashboardBackground } from "./background";

const registry = createRegistry(allFrames);
const providers = [
  new HyperliquidProvider(),
  new DefiLlamaProvider(),
  new AlternativeMeProvider(),
  new CoinGeckoProvider(),
];
// Per-frame config errors render as error cards (see DashboardRenderer); a
// malformed *top-level* spec is caught here so a bad dashboard.json shows a
// readable message instead of a blank screen.
const parsed = DashboardSpecSchema.safeParse(rawSpec);

function SpecError({
  issues,
}: {
  issues: { path: PropertyKey[]; message: string }[];
}) {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="font-dmsans text-strong mb-2 text-lg font-extrabold">
        dashboard.json is not a valid spec
      </h1>
      <p className="body-sm text-soft mb-4">
        Fix the issues below (or run <code>zframes lint dashboard.json</code>),
        then reload.
      </p>
      <ul className="body-sm text-normal list-disc space-y-1 pl-5">
        {issues.map((issue, i) => (
          <li key={i}>
            <code>{issue.path.join(".") || "(root)"}</code>: {issue.message}
          </li>
        ))}
      </ul>
    </main>
  );
}

// Persist editor changes back to the real dashboard.json via the dev
// write-back plugin (see vite.config.ts). On success we reload so the editor
// re-renders from the file it just wrote — the round-trip is the proof. With
// no dev server (a static build), the PUT fails and we download instead.
async function persist(next: DashboardSpec) {
  try {
    const res = await fetch("/__zframes/dashboard", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(next),
    });
    if (res.ok) {
      window.location.reload();
      return;
    }
  } catch {
    // fall through to download
  }
  const blob = new Blob([`${JSON.stringify(next, null, 2)}\n`], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "dashboard.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function App() {
  if (!parsed.success) return <SpecError issues={parsed.error.issues} />;
  const spec = parsed.data;

  return (
    <FramesProvider providers={providers}>
      <DashboardBackground background={spec.background} />
      <main className="relative z-10 mx-auto max-w-[1320px] px-4 pb-16 pt-5 sm:px-6">
        <header className="mb-5 flex flex-col gap-2 border-b border-white/[0.06] pb-4 sm:flex-row sm:items-baseline sm:justify-between">
          <div className="flex items-baseline gap-3">
            <h1 className="font-dmsans text-strong text-lg font-extrabold tracking-tight">
              z<span className="text-[#8b8df9]">frames</span>
            </h1>
            <span className="body-sm text-soft">{spec.title}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <span className="caption text-soft">
              <span className="sm:hidden">live · no API keys</span>
              <span className="hidden sm:inline">
                live · hyperliquid + defillama + alternative.me + coingecko · no
                API keys
              </span>
            </span>
          </div>
        </header>
        <DashboardEditor spec={spec} registry={registry} onSave={persist} />
      </main>
    </FramesProvider>
  );
}
