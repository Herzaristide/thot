import type { NextRequest } from "next/server";
import { userToken } from "@/lib/api/token";
import { env } from "@/lib/env";

/**
 * Proxy BFF vers la Corpus API : le navigateur ne voit jamais de jeton.
 * La console passe toutes les routes /v1 au nom de l'admin connecté (la
 * Corpus API contrôle les rôles) ; les corps sont relayés en flux (dépôts
 * d'EPUB) et les réponses aussi (flux SSE /v1/admin/stream).
 */
const ALLOWED = /^v1\/[A-Za-z0-9_\-/.]+$/;

const FORWARD_REQUEST = ["accept", "accept-language", "if-none-match", "if-match", "content-type"];
const FORWARD_RESPONSE = [
  "content-type",
  "content-length",
  "content-disposition",
  "etag",
  "cache-control",
];

function problem(status: number, title: string) {
  return Response.json(
    { type: "about:blank", title, status },
    { status, headers: { "content-type": "application/problem+json" } },
  );
}

async function forward(req: NextRequest, path: string[]) {
  const joined = path.join("/");
  if (!ALLOWED.test(joined) || joined.includes("..")) return problem(404, "Introuvable");
  const token = await userToken(req.headers);
  if (!token) return problem(401, "Session expirée : se reconnecter");

  const target = new URL(`${env().CORPUS_API_URL}/${joined}`);
  target.search = req.nextUrl.search;
  const headers = new Headers();
  for (const name of FORWARD_REQUEST) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("authorization", `Bearer ${token}`);
  const hasBody = !["GET", "HEAD"].includes(req.method);

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers,
      body: hasBody ? req.body : undefined,
      // @ts-expect-error -- requis par undici pour un corps en flux
      duplex: hasBody ? "half" : undefined,
      cache: "no-store",
      redirect: "manual",
      signal: req.signal,
    });
  } catch {
    return problem(502, "Corpus API injoignable");
  }

  const out = new Headers();
  const decoded = upstream.headers.has("content-encoding");
  for (const name of FORWARD_RESPONSE) {
    if (decoded && name === "content-length") continue;
    const value = upstream.headers.get(name);
    if (value) out.set(name, value);
  }
  if (!out.has("cache-control")) out.set("cache-control", "private, no-store");
  if (upstream.headers.get("content-type")?.startsWith("text/event-stream")) {
    out.set("x-accel-buffering", "no");
  }
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

type Ctx = RouteContext<"/api/corpus/[...path]">;
const handler = async (req: NextRequest, ctx: Ctx) => forward(req, (await ctx.params).path);

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const PUT = handler;
export const DELETE = handler;
export const dynamic = "force-dynamic";
