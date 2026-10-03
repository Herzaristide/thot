import type { Metadata } from "next";
import { TrashPage } from "@/components/history/trash-page";

export const metadata: Metadata = { title: "Corbeille" };

export default function Page() {
  return <TrashPage />;
}
