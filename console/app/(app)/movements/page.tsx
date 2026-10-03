import type { Metadata } from "next";
import { MovementsPage } from "@/components/persons/movements-page";

export const metadata: Metadata = { title: "Courants" };

export default function Page() {
  return <MovementsPage />;
}
