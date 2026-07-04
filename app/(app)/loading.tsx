import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function PainelLoading() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-8 lg:px-10">
      <div className="flex flex-wrap items-end justify-between gap-4 pb-6 pt-6 lg:pt-10">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-28" />
        </div>
        <Skeleton className="h-9 w-40 rounded-sm" />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card variant="raised" className="flex flex-col gap-5 p-6 lg:col-span-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-10 w-56" />
          <Skeleton className="h-4 w-40" />
          <div className="grid grid-cols-3 gap-4">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        </Card>
        <Card className="flex flex-col justify-center gap-4 p-6">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8" />
          <Skeleton className="h-8" />
        </Card>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:max-w-2xl">
        <Card className="h-32" />
        <Card className="h-32" />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card className="h-56" />
        <Card className="h-56" />
      </div>
    </main>
  );
}
