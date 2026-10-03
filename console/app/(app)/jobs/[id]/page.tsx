import type { Metadata } from "next";
import { JobDetailPage } from "@/components/jobs/job-detail";

export const metadata: Metadata = { title: "Tâche" };

export default async function Page({ params }: PageProps<"/jobs/[id]">) {
  return <JobDetailPage id={(await params).id} />;
}
