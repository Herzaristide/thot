import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Vérification optimiste : sans cookie de session, toute page renvoie vers la
 * connexion. La session et les rôles sont vérifiés pour de bon côté serveur.
 */
export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) return NextResponse.next();
  const url = new URL("/login", request.url);
  url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!login|api/|_next|favicon|icon|apple-icon).*)"],
};
