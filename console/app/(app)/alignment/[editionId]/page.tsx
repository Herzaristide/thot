import type { Metadata } from "next";
import { Workbench } from "@/components/alignment/workbench";

export const metadata: Metadata = { title: "Alignement" };

export default async function Page({ params }: PageProps<"/alignment/[editionId]">) {
  return <Workbench editionId={(await params).editionId} />;
}
