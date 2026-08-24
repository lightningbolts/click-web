import type { Metadata } from "next";
import { FcCard, FcPageShell } from "@/components/fc";
import EnterpriseCtas from "@/components/enterprise/EnterpriseCtas";
import EnterprisePlayground from "@/components/enterprise/EnterprisePlayground";

export const metadata: Metadata = {
  title: "Click for venues and campuses",
  description:
    "See whether a night actually mixed people — which rooms went quiet, which events created repeat hellos, and whether the floor was full or just loud.",
};

const AUDIENCES = [
  {
    title: "Small shops and studios",
    body: "Keep the line moving. Let someone leave with a real next step instead of a handle they’ll never open.",
  },
  {
    title: "Venues and conferences",
    body: "See which rooms went quiet, which sets created repeat hellos, and whether the floor was full or just loud.",
  },
  {
    title: "Campuses",
    body: "Orientation, mixers, fairs: the week a lot of people meet once. Give those introductions a place to continue.",
  },
] as const;

export default function EnterprisePage() {
  return (
    <FcPageShell>
      <section className="mx-auto max-w-5xl px-6 pb-16 pt-12 md:px-12 md:pb-24 md:pt-16">
        <p className="mb-6 text-center text-sm font-semibold uppercase tracking-wider text-on-surface-variant">
          For venues, campuses, and the people who run the room
        </p>
        <h1
          id="enterprise-heading"
          data-testid="enterprise-heading"
          className="mx-auto mb-6 max-w-4xl text-center text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl"
        >
          Did people actually meet — or did they just show up?
        </h1>
        <p className="mx-auto mb-10 max-w-2xl text-center text-lg leading-relaxed text-on-surface-variant">
          Click is for operators who care about the room: which events created repeat hellos, which floors went quiet,
          and whether staffing matched the night. The walkthrough below uses sample data. It is not a live dashboard.
        </p>
        <EnterpriseCtas />
      </section>

      <section className="border-t border-border-hard bg-surface-container/40 py-16 md:py-24">
        <div className="mx-auto max-w-6xl px-6 md:px-12">
          <h2 className="mb-3 text-center text-3xl font-bold">Try a venue night</h2>
          <p className="mx-auto mb-10 max-w-2xl text-center text-on-surface-variant">
            Same kind of walkthrough as the consumer homepage, for the people running the building.
          </p>
          <EnterprisePlayground />
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-16 md:px-12 md:py-24">
        <h2 className="mb-8 text-center text-3xl font-bold">Who it’s for</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {AUDIENCES.map((item) => (
            <FcCard key={item.title} className="p-6">
              <h3 className="text-lg font-bold">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">{item.body}</p>
            </FcCard>
          ))}
        </div>
      </section>

      <section className="border-t border-border-hard px-6 py-16 md:px-12 md:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-bold">Want this for a real night?</h2>
          <p className="mt-4 text-on-surface-variant">
            Tell us about the venue or campus. We&apos;ll talk through a small pilot — one event, one building, honest
            metrics.
          </p>
          <div className="mt-8">
            <EnterpriseCtas />
          </div>
        </div>
      </section>
    </FcPageShell>
  );
}
