import "server-only";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, schema } from "@/lib/db";

/**
 * Jeton d'accès Keycloak de l'admin connecté (rafraîchi par Better Auth),
 * présenté à la Corpus API. Null sans session valide : la console n'a pas de
 * compte de service, tout appel se fait au nom d'une personne (traçabilité).
 */
export async function userToken(reqHeaders: Headers): Promise<string | null> {
  try {
    const session = await auth.api.getSession({ headers: reqHeaders });
    if (!session) return null;
    const [account] = await db
      .select({ id: schema.account.id })
      .from(schema.account)
      .where(
        and(eq(schema.account.userId, session.user.id), eq(schema.account.providerId, "keycloak")),
      );
    if (!account) return null;
    const res = await auth.api.getAccessToken({
      body: { accountId: account.id },
      headers: reqHeaders,
    });
    return res?.accessToken ?? null;
  } catch {
    return null;
  }
}

export type Role = "corpus:read" | "corpus:review" | "corpus:admin";

/**
 * Rôles corpus:* lus dans le jeton (pour l'affichage seulement : la Corpus
 * API vérifie la signature et les rôles à chaque appel).
 */
export function rolesOf(token: string | null): Role[] {
  if (!token) return [];
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    const roles = new Set<string>([
      ...(payload.realm_access?.roles ?? []),
      ...(payload.resource_access?.["corpus-api"]?.roles ?? []),
    ]);
    return (["corpus:read", "corpus:review", "corpus:admin"] as const).filter((r) => roles.has(r));
  } catch {
    return [];
  }
}
