import { desc, eq } from "drizzle-orm";
import { generateKeyBetween } from "fractional-indexing";
import { db, schema } from "@/lib/db";
import { parseBody, problem } from "@/lib/http";
import { requireSub } from "@/lib/me";
import { collectionCreateSchema } from "@/lib/me-schemas";
import { listCollections } from "@/lib/reader-data";

const { collections } = schema;

export async function GET() {
  const sub = await requireSub();
  if (sub instanceof Response) return sub;
  return Response.json(await listCollections(sub));
}

/** Crée une collection. Idempotent si le client fournit l'`id` (file hors ligne). */
export async function POST(req: Request) {
  const sub = await requireSub();
  if (sub instanceof Response) return sub;
  const body = await parseBody(req, collectionCreateSchema);
  if (body instanceof Response) return body;

  let position = body.position;
  if (!position) {
    const [last] = await db
      .select({ position: collections.position })
      .from(collections)
      .where(eq(collections.userSub, sub))
      .orderBy(desc(collections.position))
      .limit(1);
    position = generateKeyBetween(last?.position ?? null, null);
  }
  try {
    const [row] = await db
      .insert(collections)
      .values({
        ...(body.id ? { id: body.id } : {}),
        userSub: sub,
        name: body.name,
        description: body.description ?? null,
        emoji: body.emoji ?? null,
        position,
      })
      .onConflictDoNothing({ target: collections.id })
      .returning();
    if (!row && body.id) {
      const [existing] = await db.select().from(collections).where(eq(collections.id, body.id));
      if (existing?.userSub === sub) return Response.json(existing);
      return problem(409, "Identifiant déjà pris");
    }
    return Response.json(row, { status: 201 });
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      return problem(409, "Une collection porte déjà ce nom");
    }
    throw err;
  }
}
