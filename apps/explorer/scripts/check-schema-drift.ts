/**
 * Does `drizzle/*.sql` actually produce the schema `app/lib/db/schema.ts` declares?
 *
 *   pnpm --dir apps/explorer check:schema
 *
 * THE FAILURE THIS CATCHES. `schema.ts` is what the application expects; the
 * migrations are what the database has. Nothing else compares them. Edit
 * `schema.ts`, forget to write the migration, and typecheck passes, tests pass, CI
 * is green — then production 500s on a column that doesn't exist. Adopting
 * versioned migrations (2026-08-05) removed the old `drizzle-kit push` habit that
 * had made the two agree by construction, so this is the replacement.
 *
 * HOW. Two throwaway databases, one truth compared against the other:
 *
 *   A · empty → `scripts/migrate.ts`        → what the migrations build
 *   B · empty → `drizzle-kit push --force`  → what schema.ts declares
 *
 * then both structures are read out of `information_schema` and diffed. Identical
 * ⇒ the migrations and the app agree.
 *
 * Deliberately NOT done by parsing `drizzle-kit push`'s output against the real
 * database. That was the first attempt and it is wrong twice over: push prints
 * "Changes applied" whether or not it changed anything (so the output cannot be
 * trusted as a verdict), and pointing a tool that *mutates* at a real database to
 * ask a read-only question is how you lose a table. Here push only ever touches
 * database B, which exists for a few seconds.
 *
 * Uses PGlite (the same engine as the dev database) rather than a CI service
 * container, so it needs no Docker and runs identically on a laptop and in Actions.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = join(HERE, "..");

/** A column as the database sees it — the shape a drift would show up in. */
type Column = {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
};

type Constraint = {
  table_name: string;
  constraint_name: string;
  constraint_type: string;
};

type Structure = { columns: Column[]; constraints: Constraint[] };

/** Start a PGlite socket server over a fresh temp dir; resolves once it accepts. */
async function startDb(
  port: number,
): Promise<{ stop: () => void; dir: string }> {
  const dir = mkdtempSync(join(tmpdir(), "zf-schema-"));
  const child: ChildProcess = spawn(
    process.execPath,
    ["--input-type=module", "-e", SERVER_SRC],
    {
      cwd: APP,
      env: { ...process.env, PGLITE_DIR: dir, PGLITE_PORT: String(port) },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const stop = () => {
    child.kill("SIGKILL");
    rmSync(dir, { recursive: true, force: true });
  };
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`PGlite on :${port} did not start in 60s`)),
      60_000,
    );
    child.stdout?.on("data", (b: Buffer) => {
      if (b.toString().includes("ready")) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.stderr?.on("data", (b: Buffer) => process.stderr.write(b));
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`PGlite exited early (code ${code})`));
    });
  });
  return { stop, dir };
}

// Inlined so this script owns its disposable server and there is no extra file in
// scripts/ that looks like part of the normal dev workflow.
const SERVER_SRC = `
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
const db = await PGlite.create(process.env.PGLITE_DIR);
const server = new PGLiteSocketServer({
  db, port: Number(process.env.PGLITE_PORT), host: "127.0.0.1",
});
await server.start();
console.log("ready");
`;

function run(cmd: string, args: string[], url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: APP,
      env: { ...process.env, DATABASE_URL: url },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let log = "";
    child.stdout?.on("data", (b: Buffer) => (log += b.toString()));
    child.stderr?.on("data", (b: Buffer) => (log += b.toString()));
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${cmd} ${args.join(" ")} failed:\n${log}`)),
    );
  });
}

async function readStructure(url: string): Promise<Structure> {
  const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
  try {
    const columns = await sql<Column[]>`
      select table_name, column_name, data_type, is_nullable, column_default
      from information_schema.columns
      where table_schema = 'public'
      order by table_name, column_name
    `;
    const constraints = await sql<Constraint[]>`
      select table_name, constraint_name, constraint_type
      from information_schema.table_constraints
      where table_schema = 'public' and constraint_type in ('PRIMARY KEY','UNIQUE','FOREIGN KEY')
      order by table_name, constraint_name
    `;
    return { columns: [...columns], constraints: [...constraints] };
  } finally {
    await sql.end();
  }
}

const key = (c: Column) => `${c.table_name}.${c.column_name}`;
const describe = (c: Column) =>
  `${c.data_type}${c.is_nullable === "YES" ? " null" : " not null"}${
    c.column_default ? ` default ${c.column_default}` : ""
  }`;

function diff(fromMigrations: Structure, fromSchema: Structure): string[] {
  const problems: string[] = [];
  const a = new Map(fromMigrations.columns.map((c) => [key(c), c]));
  const b = new Map(fromSchema.columns.map((c) => [key(c), c]));

  for (const [k, col] of b)
    if (!a.has(k))
      problems.push(
        `MISSING FROM MIGRATIONS  ${k} (${describe(col)})\n` +
          `    schema.ts declares it; no migration creates it. Production would 500 on this column.`,
      );

  for (const [k, col] of a)
    if (!b.has(k))
      problems.push(
        `NOT IN schema.ts         ${k} (${describe(col)})\n` +
          `    a migration created it but the app does not know about it — dead column, or a missed schema.ts edit.`,
      );

  for (const [k, col] of b) {
    const mine = a.get(k);
    if (mine && describe(mine) !== describe(col))
      problems.push(
        `TYPE / NULLABILITY DIFFERS  ${k}\n` +
          `    migrations: ${describe(mine)}\n    schema.ts:  ${describe(col)}`,
      );
  }

  // Constraint names, not full definitions: a missing FK or unique index is worth
  // catching, and drizzle names them deterministically.
  const ca = new Set(
    fromMigrations.constraints.map(
      (c) => `${c.table_name}.${c.constraint_name}`,
    ),
  );
  const cb = new Set(
    fromSchema.constraints.map((c) => `${c.table_name}.${c.constraint_name}`),
  );
  for (const c of cb)
    if (!ca.has(c))
      problems.push(`MISSING CONSTRAINT       ${c} (declared in schema.ts)`);
  for (const c of ca)
    if (!cb.has(c))
      problems.push(`EXTRA CONSTRAINT         ${c} (not in schema.ts)`);

  return problems;
}

async function main() {
  const PORT_A = 5455;
  const PORT_B = 5456;
  const urlFor = (p: number) =>
    `postgres://postgres:postgres@127.0.0.1:${p}/postgres`;

  console.log("A · empty database → migrations");
  const a = await startDb(PORT_A);
  let structureA: Structure;
  try {
    await run("npx", ["tsx", "scripts/migrate.ts"], urlFor(PORT_A));
    structureA = await readStructure(urlFor(PORT_A));
    console.log(`    ${structureA.columns.length} columns`);
  } finally {
    a.stop();
  }

  console.log("B · empty database → schema.ts (drizzle-kit push)");
  const b = await startDb(PORT_B);
  let structureB: Structure;
  try {
    await run("npx", ["drizzle-kit", "push", "--force"], urlFor(PORT_B));
    structureB = await readStructure(urlFor(PORT_B));
    console.log(`    ${structureB.columns.length} columns`);
  } finally {
    b.stop();
  }

  const problems = diff(structureA, structureB);
  if (problems.length) {
    console.error(
      `\n✗ ${problems.length} difference(s) between the migrations and schema.ts:\n\n` +
        problems.map((p) => `  ${p}`).join("\n\n") +
        `\n\nWrite a migration in apps/explorer/drizzle/ that closes the gap, then re-run.\n`,
    );
    process.exit(1);
  }
  console.log(
    `\n✓ migrations and schema.ts agree (${structureA.columns.length} columns, ${structureA.constraints.length} constraints)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
