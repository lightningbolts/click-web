import { Store } from 'lucide-react';
import { Button } from '@/components/ds/Button';
import { EmptyState } from '@/components/ds/EmptyState';

export default function NotManagerPage() {
  return (
    <div className="container-content py-16">
      <EmptyState
        icon={Store}
        title="You don’t manage this Place"
        body="Ask its owner to add you, or open one of your own Places."
        action={
          <Button variant="secondary" href="/business/places">
            Your Places
          </Button>
        }
      />
    </div>
  );
}
