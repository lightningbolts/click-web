import EnterpriseCtas from "@/components/enterprise/EnterpriseCtas";
import EnterprisePlaygroundLazy from "@/components/enterprise/EnterprisePlaygroundLazy";

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
    <div className="flex-1">
      <section className="container-page pb-16 pt-12 md:pb-24 md:pt-16">
        <p className="type-meta mb-6 text-center font-semibold text-fg-secondary">Click for Business</p>
        <h1
          id="enterprise-heading"
          data-testid="enterprise-heading"
          className="type-display mx-auto mb-6 max-w-4xl text-balance text-center text-fg"
        >
          Did people actually meet, or did they just show up?
        </h1>
        <p className="type-reading mx-auto mb-10 max-w-2xl text-center text-fg-secondary">
          Put your Place on Click for free: a pin on the map, a Place page, check-ins and events. Add Insights per Place to see
          which events created repeat hellos and which nights actually mixed people. The walkthrough below uses sample data.
        </p>
        <EnterpriseCtas />
      </section>

      <section className="bg-surface py-16 md:py-24">
        <div className="container-page">
          <h2 className="type-title-1 mb-3 text-center text-fg">Try a night at a Place</h2>
          <p className="type-body mx-auto mb-10 max-w-2xl text-center text-fg-secondary">
            Same kind of walkthrough as the consumer homepage, for the people running the building.
          </p>
          <EnterprisePlaygroundLazy />
        </div>
      </section>

      <section className="container-page py-16 md:py-24">
        <h2 className="type-title-1 mb-8 text-center text-fg">Who it’s for</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {AUDIENCES.map((item) => (
            <div key={item.title} className="rounded-lg bg-surface p-6 dark:shadow-[inset_0_0_0_1px_var(--hairline)]">
              <h3 className="type-headline text-fg">{item.title}</h3>
              <p className="type-body mt-2 text-fg-secondary">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="py-16 md:py-24">
        <div className="container-page text-center">
          <h2 className="type-title-1 text-fg">Ready for a real night?</h2>
          <p className="type-body mx-auto mt-4 max-w-xl text-fg-secondary">
            Setting up your Place is free and takes a few minutes. Click reviews it, then you print your check-in QR and go live.
          </p>
          <div className="mt-8">
            <EnterpriseCtas />
          </div>
        </div>
      </section>
    </div>
  );
}
