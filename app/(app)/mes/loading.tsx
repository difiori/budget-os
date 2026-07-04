import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function MesLoading() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-8 lg:px-10">
      <div className="flex flex-wrap items-end justify-between gap-4 pb-6 pt-6 lg:pt-10">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-9 w-40 rounded-sm" />
      </div>
      <div className="mb-6 flex gap-1.5">
        <Skeleton className="h-8 w-16 rounded-sm" />
        <Skeleton className="h-8 w-16 rounded-sm" />
      </div>
      <Card variant="raised" className="p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      </Card>
      <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card className="h-56" />
        <Card className="h-56" />
      </div>
    </main>
  );
}
