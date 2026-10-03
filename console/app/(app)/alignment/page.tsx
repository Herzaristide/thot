import type { Metadata } from "next";
import { AlignmentList } from "@/components/alignment/alignment-list";

export const metadata: Metadata = { title: "Atelier d'alignement" };

export default function Page() {
  return <AlignmentList />;
}
