import { and, desc, eq } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { db, schema } from "@/lib/db";
import { noContent, parseBody, problem, UUID_RE } from "@/lib/http";
import { requireSub } from "@/lib/me";
import { itemPatchSchema, itemPutSchema } from "@/lib/me-schemas";

const { collections, collectionItems: items } = schema;
type Ctx = RouteContext<"/api/me/collections/[id]/items/[workId]">;

/** Vérifie que la collection appartient au lecteur. */
async function target(ctx: Ctx) {
  const sub = await requireSub();
  if (sub instanceof Response) return sub;
  const { id, workId } = await ctx.params;
  if (!UUID_RE.test(id) || !UUID_RE.test(workId)) return problem(404, "Introuvable");
  const [col] = await db
    .select({ id: collections.id })
    .from(collections)
    .where(and(eq(collections.id, id), eq(collections.userSub, sub)));
  if (!col) return problem(404, "Collection inconnue");
  return { id, workId };
}

async function touch(id: string) {
  await db.update(collections).set({ updatedAt: new Date() }).where(eq(collections.id, id));
}

/** Ajoute l'œuvre (à la fin par défaut) ; idempotent. */
export async function PUT(req: Request, ctx: Ctx) {
  const t = await target(ctx);
  if (t instanceof Response) return t;
  const body = await parseBody(req, itemPutSchema);
  if (body instanceof Response) return body;
  let position = body.position;
  if (!position) {
    const [last] = await db
      .select({ position: items.position })
      .from(items)
      .where(eq(items.collectionId, t.id))
      .orderBy(desc(items.position))
      .limit(1);
    position = generateKeyBetween(last?.position ?? null, null);
  }
  await db
    .insert(items)
    .values({ collectionId: t.id, workId: t.workId, position, note: body.note ?? null })
    .onConflictDoNothing();
  await touch(t.id);
  return noContent();
}

/** Déplace l'œuvre ou change sa note. */
export async function PATCH(req: Request, ctx: Ctx) {
  const t = await target(ctx);
  if (t instanceof Response) return t;
  const body = await parseBody(req, itemPatchSchema);
  if (body instanceof Response) return body;
  const [row] = await db
    .update(items)
    .set(body)
    .where(and(eq(items.collectionId, t.id), eq(items.workId, t.workId)))
    .returning();
  if (!row) return problem(404, "Œuvre absente de la collection");
  await touch(t.id);
  return Response.json(row);
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const t = await target(ctx);
  if (t instanceof Response) return t;
  await db.delete(items).where(and(eq(items.collectionId, t.id), eq(items.workId, t.workId)));
  await touch(t.id);
  return noContent();
}
