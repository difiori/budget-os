import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function LancarLoading() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-8 lg:px-10">
      <div className="flex flex-col gap-2 pb-6 pt-6 lg:pt-10">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-10">
        <div className="flex flex-col gap-6">
          <Card variant="raised" className="flex flex-col gap-3 p-6">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-12 w-40" />
          </Card>
          <Skeleton className="h-8 w-64 rounded-sm" />
          <Skeleton className="h-8 w-48 rounded-sm" />
          <Skeleton className="h-24 w-full" />
        </div>
        <Card className="h-64" />
      </div>
    </main>
  );
}
