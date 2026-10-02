import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { noContent, parseBody, problem, UUID_RE } from "@/lib/http";
import { requireSub } from "@/lib/me";
import { collectionPatchSchema } from "@/lib/me-schemas";
import { getCollection } from "@/lib/reader-data";

const { collections } = schema;
type Ctx = RouteContext<"/api/me/collections/[id]">;

async function target(ctx: Ctx) {
  const sub = await requireSub();
  if (sub instanceof Response) return sub;
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return problem(404, "Collection inconnue");
  return { sub, id };
}

export async function GET(_req: Request, ctx: Ctx) {
  const t = await target(ctx);
  if (t instanceof Response) return t;
  const col = await getCollection(t.sub, t.id);
  return col ? Response.json(col) : problem(404, "Collection inconnue");
}

export async function PATCH(req: Request, ctx: Ctx) {
  const t = await target(ctx);
  if (t instanceof Response) return t;
  const body = await parseBody(req, collectionPatchSchema);
  if (body instanceof Response) return body;
  try {
    const [row] = await db
      .update(collections)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(collections.id, t.id), eq(collections.userSub, t.sub)))
      .returning();
    return row ? Response.json(row) : problem(404, "Collection inconnue");
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      return problem(409, "Une collection porte déjà ce nom");
    }
    throw err;
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const t = await target(ctx);
  if (t instanceof Response) return t;
  await db.delete(collections).where(and(eq(collections.id, t.id), eq(collections.userSub, t.sub)));
  return noContent();
}
