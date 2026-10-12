import EnterpriseCtas from "@/components/enterprise/EnterpriseCtas";
import EnterprisePlaygroundLazy from "@/components/enterprise/EnterprisePlaygroundLazy";
import { PageHeader } from "@/components/marketing/PageHeader";

/** Going live is a real sequence, so it's numbered. */
const STEPS = [
  { title: "Set up your Place", body: "Name, address and photos. Free, and it takes a few minutes." },
  { title: "Click reviews it", body: "We check the Place is real before it shows on the map." },
  { title: "Print your check-in QR", body: "Put it by the door. Visitors scan it to check in and see who’s there." },
  { title: "Add Insights when you want them", body: "Per Place, whenever you’re ready to see what happens inside." },
] as const;

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

const card = "rounded-lg bg-surface p-6 dark:shadow-[inset_0_0_0_1px_var(--hairline)]";

export default function EnterprisePage() {
  return (
    <div className="container-page flex-1 pb-24">
      <PageHeader
        id="enterprise-heading"
        title="Did people actually meet, or did they just show up?"
        lead="Put your Place on Click for free: a pin on the map, a Place page, check-ins and events. Add Insights to see which events created repeat hellos and which nights actually mixed people."
      >
        <EnterpriseCtas />
      </PageHeader>

      <section aria-labelledby="insights-demo-heading">
        <h2 id="insights-demo-heading" className="type-title-1 text-fg">
          Insights for a sample Place
        </h2>
        <p className="type-reading mt-3 max-w-[62ch] text-fg-secondary">
          This is the Insights tab a Place manager sees, running on sample data. Counts are aggregated, and no one’s identity
          ever reaches it.
        </p>
        <div className="mt-8">
          <EnterprisePlaygroundLazy />
        </div>
      </section>

      <section aria-labelledby="steps-heading" className="mt-20 md:mt-28">
        <h2 id="steps-heading" className="type-title-1 text-fg">
          Going live
        </h2>
        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => (
            <li key={step.title} className={card}>
              <span
                aria-hidden
                className="type-headline tabular flex size-8 items-center justify-center rounded-full bg-selection text-accent"
              >
                {i + 1}
              </span>
              <h3 className="type-headline mt-4 text-fg">{step.title}</h3>
              <p className="type-body mt-1 text-fg-secondary">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="audiences-heading" className="mt-20 md:mt-28">
        <h2 id="audiences-heading" className="type-title-1 text-fg">
          Who it’s for
        </h2>
        <ul className="mt-8 grid gap-4 md:grid-cols-3">
          {AUDIENCES.map((item) => (
            <li key={item.title} className={card}>
              <h3 className="type-headline text-fg">{item.title}</h3>
              <p className="type-body mt-2 text-fg-secondary">{item.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section
        aria-labelledby="cta-heading"
        className={`${card} mt-20 flex flex-col gap-6 md:mt-28 md:flex-row md:items-center md:justify-between md:p-10`}
      >
        <div className="max-w-[52ch]">
          <h2 id="cta-heading" className="type-title-2 text-fg">
            Set up your Place for free
          </h2>
          <p className="type-body mt-2 text-fg-secondary">
            Insights is a paid add-on per Place. Talk to us if you want a walkthrough with your own numbers first.
          </p>
        </div>
        <EnterpriseCtas />
      </section>
    </div>
  );
}
