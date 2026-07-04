import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function ConfigLoading() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pb-8 lg:px-10">
      <div className="flex flex-col gap-2 pb-6 pt-6 lg:pt-10">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-56" />
      </div>
      <div className="mb-6 flex gap-2">
        <Skeleton className="h-8 w-20 rounded-sm" />
        <Skeleton className="h-8 w-20 rounded-sm" />
        <Skeleton className="h-8 w-24 rounded-sm" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card className="h-40" />
        <Card className="h-40" />
        <Card className="h-40" />
      </div>
    </main>
  );
}
