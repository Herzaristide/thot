import type { NextRequest } from "next/server";
import { requireSub } from "@/lib/me";
import { recentProgress } from "@/lib/reader-data";

export async function GET(req: NextRequest) {
  const sub = await requireSub();
  if (sub instanceof Response) return sub;
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 20) || 20, 100);
  return Response.json(await recentProgress(sub, limit));
}
