'use client';

import { MapPin } from 'lucide-react';
import PlaygroundMap from '../PlaygroundMapLazy';
import type { PlaygroundActions, PlaygroundState } from '../types';

export default function MapScene({
  state,
  actions,
}: {
  state: PlaygroundState;
  actions?: PlaygroundActions;
}) {
  return (
    <div data-testid="playground-scene-map" className="flex h-full min-h-0 flex-col">
      <div className="mb-3 flex shrink-0 items-center gap-3">
        <div className="rounded-xl bg-action/20 p-2">
          <MapPin className="h-5 w-5 text-accent" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-fg">Click Map</h3>
          <p className="text-sm text-fg-secondary">Where your memories were made</p>
        </div>
      </div>
      <div className="min-h-0 flex-1"><PlaygroundMap state={state} actions={actions} fill /></div>
    </div>
  );
}
