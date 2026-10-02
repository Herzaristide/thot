import "server-only";
import type { z } from "zod";

export function problem(status: number, title: string, detail?: string) {
  return Response.json(
    { type: "about:blank", title, status, detail },
    { status, headers: { "content-type": "application/problem+json" } },
  );
}

/** Lit et valide un corps JSON ; renvoie la donnée ou une réponse 400. */
export async function parseBody<T extends z.ZodType>(
  req: Request,
  schema: T,
): Promise<z.infer<T> | Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return problem(400, "Corps JSON invalide");
  }
  const res = schema.safeParse(raw);
  if (!res.success) return problem(400, "Requête invalide", res.error.issues[0]?.message);
  return res.data;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function noContent() {
  return new Response(null, { status: 204 });
}
