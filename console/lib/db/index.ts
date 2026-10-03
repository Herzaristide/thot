import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { consoleSql?: postgres.Sql };

// Une seule connexion par processus (le rechargement à chaud de `next dev`
// réévalue ce module).
const client = globalForDb.consoleSql ?? postgres(env().CONSOLE_DATABASE_URL, { max: 5 });
if (process.env.NODE_ENV !== "production") globalForDb.consoleSql = client;

export const db = drizzle(client, { schema, casing: "snake_case" });
export { schema };
