import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageTitle } from "@/components/section";
import { SettingsForm } from "@/components/settings/settings-form";
import { corpus } from "@/lib/api/server";
import { getSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Réglages" };

export default async function SettingsPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/settings");
  const api = await corpus();
  const languages = (await api.GET("/v1/languages")).data ?? [];
  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle title="Réglages" />
      <SettingsForm
        languages={languages.map((l) => l.language)}
        user={{ name: session.user.name, email: session.user.email }}
      />
    </div>
  );
}
