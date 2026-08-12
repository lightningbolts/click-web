import DashboardScene from './scenes/DashboardScene';
import type { PlaygroundActions, PlaygroundState } from './types';

export default function CompanionPanel({
  state,
  actions,
}: {
  state: PlaygroundState;
  actions: PlaygroundActions;
}) {
  return (
    <aside className="hidden min-w-0 flex-1 flex-col lg:flex" aria-label="Web companion preview">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
        Website companion
      </p>
      <div className="min-h-[560px] flex-1 overflow-auto rounded-[16px] border border-border-hard bg-background">
        <DashboardScene state={state} actions={actions} />
      </div>
    </aside>
  );
}
