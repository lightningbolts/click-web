"use client";

import ChatPane from "./ChatPane";
import type { PlaygroundActions, PlaygroundState } from "../types";

export default function ClicksScene({
  state,
  actions,
}: {
  state: PlaygroundState;
  actions: PlaygroundActions;
}) {
  return (
    <div
      className="h-full overflow-hidden bg-bg p-3"
      data-testid="playground-scene-clicks"
    >
      <ChatPane state={state} actions={actions} compact phone />
    </div>
  );
}
