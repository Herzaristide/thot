import type { Metadata } from "next";
import { PersonPage } from "@/components/persons/person-page";

export const metadata: Metadata = { title: "Personne" };

export default async function Page({ params }: PageProps<"/persons/[id]">) {
  return <PersonPage id={(await params).id} />;
}
