import "server-only";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { parsePreferences } from "@/lib/prefs/schema";
import type { Viewer } from "@/lib/viewer";

/** Lecteur connecté et ses préférences, pour le premier rendu. */
export async function loadViewer() {
  const session = await getSession();
  if (!session) return { viewer: null, prefs: null };
  const viewer: Viewer = {
    sub: session.user.sub,
    name: session.user.name,
    email: session.user.email,
  };
  const [row] = await db
    .select()
    .from(schema.preferences)
    .where(eq(schema.preferences.userSub, viewer.sub));
  const prefs = row
    ? { data: parsePreferences(row.data), updatedAt: row.updatedAt.toISOString() }
    : null;
  return { viewer, prefs };
}

/** `sub` du lecteur, ou une réponse 401 pour les routes /api/me. */
export async function requireSub(): Promise<string | Response> {
  const session = await getSession();
  if (!session) {
    return Response.json(
      { title: "Connexion requise", status: 401 },
      { status: 401, headers: { "content-type": "application/problem+json" } },
    );
  }
  return session.user.sub;
}
