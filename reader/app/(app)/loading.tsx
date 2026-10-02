import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl" role="status" aria-busy="true" aria-label="Chargement">
      <Skeleton className="mb-3 h-9 w-64" />
      <Skeleton className="mb-10 h-5 w-96 max-w-full" />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-4 sm:grid-cols-[repeat(auto-fill,minmax(10rem,1fr))]">
        {Array.from({ length: 10 }, (_, i) => (
          <Skeleton key={i} className="aspect-[2/3] w-full" />
        ))}
      </div>
    </div>
  );
}
