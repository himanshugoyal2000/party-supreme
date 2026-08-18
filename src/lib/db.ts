import postgres from "postgres";
import { env } from "./env";

declare global {
  // Survives dev-server hot reloads, which would otherwise leak connection pools.
  var __tripBrainSql: postgres.Sql | undefined;
}

let instance: postgres.Sql | undefined;

function connection(): postgres.Sql {
  if (instance) return instance;

  instance =
    globalThis.__tripBrainSql ??
    postgres(env().DATABASE_URL, {
      max: 8,
      idle_timeout: 30,
      connect_timeout: 15,
      // Supabase's transaction-mode pooler does not support prepared statements.
      prepare: false,
      transform: { undefined: null },
    });

  if (process.env.NODE_ENV !== "production") {
    globalThis.__tripBrainSql = instance;
  }

  return instance;
}

/**
 * Deliberately a lazy proxy. `next build` evaluates route modules to collect their
 * configuration, so connecting at module scope would make the build require production
 * database credentials.
 */
export const sql: postgres.Sql = new Proxy(function () {} as unknown as postgres.Sql, {
  apply(_target, _thisArg, args: unknown[]) {
    const active = connection();
    return Reflect.apply(active as unknown as (...a: unknown[]) => unknown, active, args);
  },
  get(_target, property) {
    const active = connection() as unknown as Record<string | symbol, unknown>;
    const value = active[property];
    return typeof value === "function" ? value.bind(active) : value;
  },
  has(_target, property) {
    return property in (connection() as unknown as object);
  },
});
