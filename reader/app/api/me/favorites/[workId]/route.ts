import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { noContent, problem, UUID_RE } from "@/lib/http";
import { requireSub } from "@/lib/me";

const { favorites } = schema;
type Ctx = RouteContext<"/api/me/favorites/[workId]">;

async function target(ctx: Ctx) {
  const sub = await requireSub();
  if (sub instanceof Response) return sub;
  const { workId } = await ctx.params;
  if (!UUID_RE.test(workId)) return problem(404, "Œuvre inconnue");
  return { sub, workId };
}

export async function PUT(_req: Request, ctx: Ctx) {
  const t = await target(ctx);
  if (t instanceof Response) return t;
  await db.insert(favorites).values({ userSub: t.sub, workId: t.workId }).onConflictDoNothing();
  return noContent();
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const t = await target(ctx);
  if (t instanceof Response) return t;
  await db
    .delete(favorites)
    .where(and(eq(favorites.userSub, t.sub), eq(favorites.workId, t.workId)));
  return noContent();
}
