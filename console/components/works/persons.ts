import type { PersonRef } from "@/components/common/pickers";
import { api, unwrap } from "@/lib/api/client";

/** Identifiants des personnes, en créant celles qui n'existent pas encore. */
export async function ensurePersons(people: PersonRef[]): Promise<string[]> {
  const ids: string[] = [];
  for (const p of people) {
    if (p.id) {
      ids.push(p.id);
      continue;
    }
    const created = unwrap(await api.POST("/v1/admin/persons", { body: { display_name: p.name } }));
    ids.push(created.id);
  }
  return ids;
}
