import type { Metadata } from "next";
import { Suspense } from "react";
import { JobsPage } from "@/components/jobs/jobs-page";

export const metadata: Metadata = { title: "Tâches" };

export default function Page() {
  return (
    <Suspense>
      <JobsPage />
    </Suspense>
  );
}
