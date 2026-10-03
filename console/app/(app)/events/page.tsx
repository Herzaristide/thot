import type { Metadata } from "next";
import { EventsPage } from "@/components/history/events-page";

export const metadata: Metadata = { title: "Historique" };

export default function Page() {
  return <EventsPage />;
}
