import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { readerSql?: postgres.Sql };

// Une seule connexion par processus (le rechargement à chaud de `next dev`
// réévalue ce module).
const client = globalForDb.readerSql ?? postgres(env().READER_DATABASE_URL, { max: 10 });
if (process.env.NODE_ENV !== "production") globalForDb.readerSql = client;

export const db = drizzle(client, { schema, casing: "snake_case" });
export { schema };
