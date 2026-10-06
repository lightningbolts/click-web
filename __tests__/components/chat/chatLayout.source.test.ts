import fs from "node:fs";
import path from "node:path";

const read = (rel: string) => fs.readFileSync(path.join(__dirname, "../../../", rel), "utf8");

describe("chat thread chrome (spec §7.2)", () => {
  it("is a full-bleed pane over the conversation backdrop with a centred 720px timeline", () => {
    const view = read("components/chat/ChatView.tsx");
    expect(view).toContain('data-testid="chat-panel"');
    expect(view).toContain("<ChatBackground seed={connection.id} />");
    expect(view).toContain("max-w-[720px]");
    // The old bordered card and framer transitions are gone.
    expect(view).not.toContain("CHAT_THREAD_PANEL_CLASS");
    expect(view).not.toContain("rounded-[16px]");
    expect(view).not.toContain("framer-motion");
  });

  it("uses one toaster and one dialog state instead of per-thread toasts", () => {
    const view = read("components/chat/ChatView.tsx");
    expect(view).not.toContain("actionToast");
    expect(view).toContain("state={dialog}");
    expect(view).toContain("actions.confirmNode");
  });

  it("keeps header and composer on glass with hairline edges", () => {
    expect(read("components/chat/ChatHeader.tsx")).toContain("material-glass");
    expect(read("components/chat/ChatHeader.tsx")).toContain("border-hairline");
    expect(read("components/chat/ChatComposer.tsx")).toContain("border-hairline");
  });

  it("removes the legacy layout token module", () => {
    expect(fs.existsSync(path.join(__dirname, "../../../lib/chat/layout.ts"))).toBe(false);
  });
});
