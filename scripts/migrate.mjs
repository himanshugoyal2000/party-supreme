import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import postgres from "postgres";

const directory = path.join(process.cwd(), "db", "migrations");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Try: npm run migrate:local");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });

try {
  await sql`
    create table if not exists _migrations (
      name       text primary key,
      applied_at timestamptz not null default now()
    )
  `;

  const applied = new Set((await sql`select name from _migrations`).map((row) => row.name));
  const files = (await readdir(directory)).filter((file) => file.endsWith(".sql")).sort();

  let pending = 0;

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`  already applied  ${file}`);
      continue;
    }

    const contents = await readFile(path.join(directory, file), "utf8");

    await sql.begin(async (tx) => {
      await tx.unsafe(contents);
      await tx`insert into _migrations (name) values (${file})`;
    });

    pending += 1;
    console.log(`  applied          ${file}`);
  }

  console.log(pending === 0 ? "\nDatabase already up to date." : `\nApplied ${pending} migration(s).`);
} catch (error) {
  console.error("\nMigration failed:", error);
  process.exitCode = 1;
} finally {
  await sql.end();
}
