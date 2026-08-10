/**
 * Resolve and sanity-check `DATABASE_URL` for the CLI scripts.
 *
 * WHY THIS EXISTS. A malformed connection secret fails deep inside the `postgres`
 * driver as `TypeError: Invalid URL` — and because GitHub masks secrets, the error
 * prints `input: '***'`. There is no way to tell a missing scheme from a stray
 * newline from a pasted `psql '...'` wrapper. That undiagnosable failure took
 * production down on 2026-08-05: the deploy ran, the migration didn't, and the app
 * was left querying columns that did not exist yet.
 *
 * So this checks the shape up front and reports what is wrong using facts that are
 * safe to print — length, which scheme prefix was found, whether the value contains
 * whitespace or quotes — and never the value itself.
 */

const LOCAL_DEV_URL = "postgres://postgres:postgres@127.0.0.1:5433/postgres";

/**
 * The connection string, trimmed, defaulting to the local Docker Postgres
 * (`pnpm db:up`, apps/explorer/docker-compose.yml).
 *
 * `.trim()` is load-bearing: a secret set from a paste routinely carries a leading
 * space or a trailing newline, and the driver hands the raw string to `new URL()`.
 */
export function databaseUrl(): string {
  return process.env.DATABASE_URL?.trim() || LOCAL_DEV_URL;
}

/**
 * Throw with an actionable message if `url` cannot possibly be a Postgres
 * connection string. Cheap, and it converts the worst error in this codebase
 * ("Invalid URL: ***") into one that names the fix.
 */
export function assertDatabaseUrl(url: string): string {
  const problems: string[] = [];
  const raw = process.env.DATABASE_URL ?? "";

  if (!/^postgres(ql)?:\/\//.test(url))
    problems.push(
      `it does not start with "postgres://" or "postgresql://". ` +
        `A common cause is copying Neon's psql command (\`psql 'postgres://…'\`) ` +
        `instead of the connection string itself — the \`psql \` prefix and the ` +
        `quotes must not be included.`,
    );
  if (/\s/.test(url))
    problems.push(
      `it contains whitespace INSIDE the value (not just at the ends, which are ` +
        `trimmed) — usually a line-wrapped paste.`,
    );
  if (/^["']|["']$/.test(url))
    problems.push(`it is wrapped in quotes — store the bare value, unquoted.`);

  if (problems.length === 0) {
    // Final check: the driver will call this, so failing here is strictly better.
    try {
      new URL(url);
    } catch {
      problems.push(`\`new URL()\` rejects it, for a reason not caught above.`);
    }
  }

  if (problems.length === 0) return url;

  throw new Error(
    `DATABASE_URL is not a usable Postgres connection string.\n\n` +
      problems.map((p) => `  • ${p}`).join("\n") +
      `\n\n  Safe diagnostics (the value itself is never printed):\n` +
      `    length ............ ${raw.length} chars` +
      `${raw.length !== url.length ? ` (${raw.length - url.length} trimmed from the ends)` : ""}\n` +
      `    starts with ....... ${/^postgres(ql)?:\/\//.exec(url)?.[0] ?? "(not a postgres scheme)"}\n` +
      `    inner whitespace .. ${/\s/.test(url) ? "YES — this is the problem" : "no"}\n` +
      `    quoted ............ ${/^["']|["']$/.test(url) ? "YES — this is the problem" : "no"}\n\n` +
      `  Re-set it interactively, which avoids shell quoting and history entirely:\n` +
      `    gh secret set DATABASE_URL           # pooled — the read-only crons\n` +
      `    gh secret set DATABASE_URL_UNPOOLED  # direct — db-deploy's migrations\n` +
      `    (paste the Neon connection string at the prompt, then press Enter)\n`,
  );
}
