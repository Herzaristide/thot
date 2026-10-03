import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OverviewPage } from "@/components/overview/overview";
import { viewer } from "@/lib/api/server";

export const metadata: Metadata = { title: "Vue d'ensemble" };

export default async function Page() {
  // Un relecteur n'a accès qu'à l'atelier d'alignement
  if (!(await viewer()).roles.includes("corpus:admin")) redirect("/alignment");
  return <OverviewPage />;
}
