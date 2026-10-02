import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { noContent, parseBody, problem, UUID_RE } from "@/lib/http";
import { requireSub } from "@/lib/me";
import { progressPutSchema } from "@/lib/me-schemas";

const { readingProgress: rp } = schema;
type Ctx = RouteContext<"/api/me/progress/[editionId]">;

async function target(ctx: Ctx) {
  const sub = await requireSub();
  if (sub instanceof Response) return sub;
  const { editionId } = await ctx.params;
  if (!UUID_RE.test(editionId)) return problem(404, "Édition inconnue");
  return { sub, editionId };
}

export async function GET(_req: Request, ctx: Ctx) {
  const t = await target(ctx);
  if (t instanceof Response) return t;
  const [row] = await db
    .select()
    .from(rp)
    .where(and(eq(rp.userSub, t.sub), eq(rp.editionId, t.editionId)));
  return row ? Response.json(row) : problem(404, "Aucune progression");
}

/** Enregistre la position ; ignorée si une position plus récente existe (autre appareil). */
export async function PUT(req: Request, ctx: Ctx) {
  const t = await target(ctx);
  if (t instanceof Response) return t;
  const body = await parseBody(req, progressPutSchema);
  if (body instanceof Response) return body;
  const values = {
    userSub: t.sub,
    editionId: t.editionId,
    workId: body.workId,
    revision: body.revision,
    seq: body.seq,
    offset: body.offset,
    quote: body.quote,
    progress: body.progress,
    sectionPath: body.sectionPath,
    startedAt: new Date(body.startedAt),
    updatedAt: new Date(body.updatedAt),
    finishedAt: body.finishedAt ? new Date(body.finishedAt) : null,
  };
  const [row] = await db
    .insert(rp)
    .values(values)
    .onConflictDoUpdate({
      target: [rp.userSub, rp.editionId],
      set: {
        revision: values.revision,
        seq: values.seq,
        offset: values.offset,
        quote: values.quote,
        progress: values.progress,
        sectionPath: values.sectionPath,
        updatedAt: values.updatedAt,
        finishedAt: values.finishedAt,
        startedAt: sql`least(${rp.startedAt}, ${body.startedAt}::timestamptz)`,
      },
      setWhere: sql`${rp.updatedAt} < ${body.updatedAt}::timestamptz`,
    })
    .returning();
  if (row) return Response.json(row);
  const [current] = await db
    .select()
    .from(rp)
    .where(and(eq(rp.userSub, t.sub), eq(rp.editionId, t.editionId)));
  return Response.json(current, { status: 409 });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const t = await target(ctx);
  if (t instanceof Response) return t;
  await db.delete(rp).where(and(eq(rp.userSub, t.sub), eq(rp.editionId, t.editionId)));
  return noContent();
}
