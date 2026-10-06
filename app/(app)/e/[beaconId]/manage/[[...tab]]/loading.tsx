import { Skeleton } from "@/components/ds/Skeleton";

/** Tab content placeholder; the header and tabs stay put in the layout. */
export default function ManageTabLoading() {
  return (
    <div className="flex flex-col gap-8" aria-busy="true" aria-label="Loading">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} rounded="lg" className="h-[84px]" />
        ))}
      </div>
      <div className="grid gap-8 min-[900px]:grid-cols-2">
        <Skeleton rounded="lg" className="h-44" />
        <Skeleton rounded="lg" className="h-44" />
      </div>
    </div>
  );
}
