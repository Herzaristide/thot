import type { Metadata } from "next";
import { ReviewPage } from "@/components/alignment/review";

export const metadata: Metadata = { title: "Vérification" };

export default function Page() {
  return <ReviewPage />;
}
