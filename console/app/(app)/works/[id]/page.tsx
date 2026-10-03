import type { Metadata } from "next";
import { WorkPage } from "@/components/works/work-page";
import { env } from "@/lib/env";

export const metadata: Metadata = { title: "Œuvre" };

export default async function Page({ params }: PageProps<"/works/[id]">) {
  return <WorkPage id={(await params).id} readerUrl={env().READER_URL} />;
}
