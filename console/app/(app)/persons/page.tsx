import type { Metadata } from "next";
import { PersonsPage } from "@/components/persons/persons-page";

export const metadata: Metadata = { title: "Personnes" };

export default function Page() {
  return <PersonsPage />;
}
