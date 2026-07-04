import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function ContaSkeleton() {
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-5 w-14 rounded-xs" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-8 w-40" />
      </div>
      <div className="grid grid-cols-2 gap-3 border-t border-hairline pt-3">
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
      </div>
    </Card>
  );
}

export default function ContasLoading() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-8 lg:px-10">
      <div className="flex flex-wrap items-end justify-between gap-4 pb-6 pt-6 lg:pt-10">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-44" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-9 w-40 rounded-sm" />
      </div>
      <div className="mb-6 flex gap-1.5">
        <Skeleton className="h-8 w-16 rounded-sm" />
        <Skeleton className="h-8 w-16 rounded-sm" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <ContaSkeleton />
        <ContaSkeleton />
      </div>
    </main>
  );
}
