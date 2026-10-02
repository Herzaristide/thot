import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Vérification optimiste : sans cookie de session, les pages personnelles
 * renvoient vers la connexion. La session est vérifiée pour de bon dans les
 * pages et les routes /api/me.
 */
export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) return NextResponse.next();
  const url = new URL("/login", request.url);
  url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/library/:path*", "/settings/:path*"],
};
