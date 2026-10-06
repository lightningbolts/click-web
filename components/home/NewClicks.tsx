import { Avatar } from '@/components/ds/Avatar';
import { Button } from '@/components/ds/Button';
import { ListGroup, ListRow } from '@/components/ds/ListGroup';
import { SectionHeader } from '@/components/ds/SectionHeader';
import type { HomeSayHi } from '@/lib/home/types';
import { threadHref } from '@/lib/shell/appNav';
import { TimeLeft } from './OpportunityCard';

/** ③ New Clicks still inside their say-hi window (shown when there's more than one). */
export function NewClicks({ items, nowMs }: { items: HomeSayHi[]; nowMs: number }) {
  return (
    <section aria-labelledby="home-new-clicks">
      <SectionHeader id="home-new-clicks" title="New Clicks" href="/clicks?filter=new" />
      <ListGroup>
        {items.slice(0, 3).map((c) => (
          <ListRow
            key={c.connectionId}
            leading={<Avatar seed={c.person.id} name={c.person.name} src={c.person.avatarUrl} size={40} />}
            title={`Say hi to ${c.person.name.split(/\s+/)[0]}`}
            subtitle={<TimeLeft deadlineMs={c.deadlineMs} nowMs={nowMs} />}
            trailing={
              <Button href={threadHref(c.connectionId)} variant="tinted" size="sm">
                Say hi
              </Button>
            }
          />
        ))}
      </ListGroup>
    </section>
  );
}
