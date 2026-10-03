import type { Metadata } from "next";
import { UploadPage } from "@/components/upload/upload-page";

export const metadata: Metadata = { title: "Déposer" };

export default function Page() {
  return <UploadPage />;
}
