import type { Metadata } from 'next';
import { PushedPage } from '@/components/app-shell/ShellContext';
import { MyPlacesList } from '@/components/me/MyPlacesList';

export const metadata: Metadata = { title: 'Places · Click' };

export default function MyPlacesPage() {
  return (
    <div className="container-content pb-16 pt-6 md:pt-10">
      <PushedPage title="Places" backHref="/me" />
      <h1 className="type-title-1 mb-6 text-fg">Places</h1>
      <MyPlacesList />
    </div>
  );
}
