import type { Metadata } from "next";
import { StructurePage } from "@/components/structure/structure-page";

export const metadata: Metadata = { title: "Structure" };

export default async function Page({ params }: PageProps<"/editions/[id]/structure">) {
  return <StructurePage id={(await params).id} />;
}
