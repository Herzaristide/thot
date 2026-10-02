import "server-only";
import { headers } from "next/headers";
import createClient, { type Middleware } from "openapi-fetch";
import { cache } from "react";
import { env } from "@/lib/env";
import type { paths } from "./schema";
import { corpusToken, serviceToken } from "./token";

function client(getToken: () => Promise<string>) {
  const c = createClient<paths>({ baseUrl: env().CORPUS_API_URL });
  const auth: Middleware = {
    async onRequest({ request }) {
      request.headers.set("authorization", `Bearer ${await getToken()}`);
      return request;
    },
  };
  c.use(auth);
  return c;
}

/**
 * Client de la Corpus API pour un Server Component : jeton du lecteur,
 * sinon de service. Un seul client (et un seul jeton) par requête.
 */
export const corpus = cache(async () => {
  const h = await headers();
  let token: Promise<string> | null = null;
  return client(() => {
    token ??= corpusToken(h);
    return token;
  });
});

/** Client de la Corpus API au nom de la liseuse elle-même (worker, cache des œuvres). */
export function corpusAsService() {
  return client(serviceToken);
}
