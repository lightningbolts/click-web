import { WebChrome } from './DeviceChrome';
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
      <WebChrome label="Website companion" lockScroll>
        <DashboardScene state={state} actions={actions} />
      </WebChrome>
    </aside>
  );
}
