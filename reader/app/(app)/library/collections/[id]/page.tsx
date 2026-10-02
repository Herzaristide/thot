import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CollectionEditor } from "@/components/library/collection-editor";
import { getUserSub } from "@/lib/auth";
import { UUID_RE } from "@/lib/http";
import { getCollection } from "@/lib/reader-data";

type Props = PageProps<"/library/collections/[id]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const sub = await getUserSub();
  const { id } = await params;
  const col = sub && UUID_RE.test(id) ? await getCollection(sub, id) : null;
  return { title: col?.name ?? "Collection" };
}

export default async function CollectionPage({ params }: Props) {
  const { id } = await params;
  const sub = await getUserSub();
  if (!sub) redirect(`/login?next=/library/collections/${id}`);
  if (!UUID_RE.test(id)) notFound();
  const col = await getCollection(sub, id);
  if (!col) notFound();
  return (
    <div className="mx-auto max-w-4xl">
      <CollectionEditor
        collection={{
          id: col.id,
          name: col.name,
          description: col.description,
          emoji: col.emoji,
          items: col.items.map((i) => ({
            id: i.workId,
            position: i.position,
            note: i.note,
            work: i.work,
          })),
        }}
      />
    </div>
  );
}
