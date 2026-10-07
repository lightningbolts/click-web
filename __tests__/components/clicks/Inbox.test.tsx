import { render, screen } from '@testing-library/react';
import { Inbox } from '@/components/clicks/Inbox';
import { TooltipProvider } from '@/components/ds/Tooltip';

const noop = () => {};

function renderInbox({ loaded, query = '' }: { loaded: boolean; query?: string }) {
  return render(
    <TooltipProvider>
      <Inbox
        viewerId="me"
        filter="active"
        onFilterChange={noop}
        rows={[]}
        loaded={loaded}
        unreadByFilter={{}}
        core={[]}
        rowState={() => ({
          href: '/clicks/c/x',
          selected: false,
          online: false,
          core: false,
          muted: false,
          archived: false,
          blocked: false,
          groupCreator: false,
          sayHiDeadline: null,
        })}
        nowMs={0}
        actions={{} as never}
        onlineUserIds={new Set()}
        onNewGroup={noop}
        search={{ query, setQuery: noop, busy: false, hits: [] }}
        onOpenSearchHit={noop}
        hubs={null}
      />
    </TooltipProvider>,
  );
}

describe('Clicks inbox first load (spec §7.2)', () => {
  it('shows placeholder rows, not "No connections yet", until the first load finishes', () => {
    renderInbox({ loaded: false });
    expect(screen.getByLabelText('Loading conversations')).toBeInTheDocument();
    expect(screen.queryByText('No connections yet')).not.toBeInTheDocument();
  });

  it('never claims a search has no matches before the rows exist', () => {
    renderInbox({ loaded: false, query: 'ada' });
    expect(screen.getByLabelText('Loading conversations')).toBeInTheDocument();
    expect(screen.queryByText('No one matches that search.')).not.toBeInTheDocument();
  });

  it('shows the empty state once loaded with no rows', () => {
    renderInbox({ loaded: true });
    expect(screen.getByText('No connections yet')).toBeInTheDocument();
    expect(screen.queryByLabelText('Loading conversations')).not.toBeInTheDocument();
  });
});
