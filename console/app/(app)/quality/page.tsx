import type { Metadata } from "next";
import { Suspense } from "react";
import { QualityPage } from "@/components/quality/quality-page";

export const metadata: Metadata = { title: "Qualité" };

export default function Page() {
  return (
    <Suspense>
      <QualityPage />
    </Suspense>
  );
}
