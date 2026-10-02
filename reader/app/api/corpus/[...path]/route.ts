import type { NextRequest } from "next/server";
import { corpusToken } from "@/lib/api/token";
import { env } from "@/lib/env";

/**
 * Proxy BFF vers la Corpus API : le navigateur ne voit jamais de jeton.
 * Liste blanche : lecture du catalogue et du texte, recherche. Les écritures
 * (alignements) et les routes internes (changes, anchors) ne passent pas.
 */
const GET_ALLOWED = [
  /^v1\/(meta|languages|suggest|works|persons|movements)$/,
  /^v1\/(works|persons|movements)\/[0-9a-f-]{36}$/,
  /^v1\/works\/[0-9a-f-]{36}\/alignment$/,
  /^v1\/editions\/[0-9a-f-]{36}(\/(toc|segments|position|find|epub|counterpart|parallel))?$/,
  /^v1\/editions\/[0-9a-f-]{36}\/notes\/[0-9a-f-]{36}$/,
];
const POST_ALLOWED = [/^v1\/(search|similar)$/];

const FORWARD_REQUEST = ["accept", "accept-language", "if-none-match", "range", "content-type"];
const FORWARD_RESPONSE = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "content-disposition",
  "etag",
  "cache-control",
];

async function forward(req: NextRequest, path: string[], allowed: RegExp[]) {
  const joined = path.join("/");
  if (!allowed.some((re) => re.test(joined))) {
    return Response.json(
      { type: "about:blank", title: "Introuvable", status: 404 },
      { status: 404, headers: { "content-type": "application/problem+json" } },
    );
  }

  const target = new URL(`${env().CORPUS_API_URL}/${joined}`);
  target.search = req.nextUrl.search;

  const headers = new Headers();
  for (const name of FORWARD_REQUEST) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("authorization", `Bearer ${await corpusToken(req.headers)}`);

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: req.method,
      headers,
      body: req.method === "POST" ? await req.text() : undefined,
      cache: "no-store",
      redirect: "manual",
    });
  } catch {
    return Response.json(
      { title: "Corpus API injoignable", status: 502 },
      { status: 502, headers: { "content-type": "application/problem+json" } },
    );
  }

  const out = new Headers();
  // fetch() décompresse le corps : la longueur d'origine ne vaut plus
  const decoded = upstream.headers.has("content-encoding");
  for (const name of FORWARD_RESPONSE) {
    if (decoded && name === "content-length") continue;
    const value = upstream.headers.get(name);
    if (value) out.set(name, value);
  }
  // La réponse dépend du lecteur (droits) : jamais dans un cache partagé
  if (!out.has("cache-control")) out.set("cache-control", "private, no-cache");
  out.set("vary", "cookie, accept-language");
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

type Ctx = RouteContext<"/api/corpus/[...path]">;

export async function GET(req: NextRequest, ctx: Ctx) {
  return forward(req, (await ctx.params).path, GET_ALLOWED);
}

export async function HEAD(req: NextRequest, ctx: Ctx) {
  return forward(req, (await ctx.params).path, GET_ALLOWED);
}

export async function POST(req: NextRequest, ctx: Ctx) {
  return forward(req, (await ctx.params).path, POST_ALLOWED);
}
