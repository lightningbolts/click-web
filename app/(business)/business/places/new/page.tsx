'use client';

import { useRouter } from 'next/navigation';
import { PushedPage } from '@/components/app-shell/ShellContext';
import { NewPlaceForm } from '@/components/business/NewPlaceForm';

/** Add a Place (spec §9.2). Signed-in only (middleware); free. */
export default function NewPlacePage() {
  const router = useRouter();
  return (
    <div className="container-content pb-16 pt-6 md:pt-10">
      <PushedPage title="New Place" backHref="/business/places" hideTabBar />
      <h1 className="type-title-1 text-fg">Add a Place</h1>
      <p className="type-body mb-8 mt-1 max-w-[56ch] text-fg-secondary">
        Cafés, bars, venues, gyms, offices, campus spaces: any physical spot people visit. You get a pin on the map, a Place page,
        check-ins, a live Pulse and a home for your events. Free.
      </p>
      <NewPlaceForm onCreated={(place) => router.push(`/business/places/${place.id}`)} />
    </div>
  );
}
