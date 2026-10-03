import type { Metadata } from "next";
import { IndexesPage } from "@/components/indexes/indexes-page";

export const metadata: Metadata = { title: "Index et cohérence" };

export default function Page() {
  return <IndexesPage />;
}
