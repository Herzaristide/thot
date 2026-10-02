import { requireSub } from "@/lib/me";
import { listFavorites } from "@/lib/reader-data";

export async function GET() {
  const sub = await requireSub();
  if (sub instanceof Response) return sub;
  return Response.json(await listFavorites(sub));
}
