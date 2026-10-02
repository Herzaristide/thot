import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { parseBody } from "@/lib/http";
import { requireSub } from "@/lib/me";
import { preferencesPutSchema } from "@/lib/prefs/schema";

const { preferences } = schema;

export async function GET() {
  const sub = await requireSub();
  if (sub instanceof Response) return sub;
  const [row] = await db.select().from(preferences).where(eq(preferences.userSub, sub));
  if (!row) return Response.json(null);
  return Response.json({ data: row.data, updatedAt: row.updatedAt.toISOString() });
}

/** Remplace les préférences, sauf si le serveur en a de plus récentes. */
export async function PUT(req: Request) {
  const sub = await requireSub();
  if (sub instanceof Response) return sub;
  const body = await parseBody(req, preferencesPutSchema);
  if (body instanceof Response) return body;
  const updatedAt = new Date(body.updatedAt);
  const [row] = await db
    .insert(preferences)
    .values({ userSub: sub, data: body.data, updatedAt })
    .onConflictDoUpdate({
      target: preferences.userSub,
      set: { data: body.data, updatedAt },
      setWhere: sql`${preferences.updatedAt} < ${body.updatedAt}::timestamptz`,
    })
    .returning();
  if (row) return Response.json({ data: row.data, updatedAt: row.updatedAt.toISOString() });
  // Version serveur plus récente : on la renvoie au client
  const [current] = await db.select().from(preferences).where(eq(preferences.userSub, sub));
  return Response.json(
    { data: current?.data, updatedAt: current?.updatedAt.toISOString() },
    { status: 409 },
  );
}
