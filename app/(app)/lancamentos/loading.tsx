import { Skeleton } from "@/components/ui/skeleton";

export default function LancamentosLoading() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-8 lg:px-10">
      <div className="flex flex-wrap items-end justify-between gap-4 pb-6 pt-6 lg:pt-10">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-9 w-40 rounded-sm" />
      </div>
      <div className="mb-5 flex flex-wrap gap-1.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-16 rounded-sm" />
        ))}
      </div>
      <div className="rounded-md border border-hairline bg-surface">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="border-b border-hairline px-3 py-3 last:border-b-0">
            <Skeleton className="h-4 w-full" />
          </div>
        ))}
      </div>
    </main>
  );
}
