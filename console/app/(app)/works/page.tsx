import type { Metadata } from "next";
import { WorksPage } from "@/components/works/works-page";

export const metadata: Metadata = { title: "Œuvres" };

export default function Page() {
  return <WorksPage />;
}
