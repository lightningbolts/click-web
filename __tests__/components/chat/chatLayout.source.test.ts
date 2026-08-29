import fs from "node:fs";
import path from "node:path";

describe("chat panel chrome", () => {
  it("uses one bordered rounded panel instead of floating header/composer cards", () => {
    const view = fs.readFileSync(
      path.join(__dirname, "../../../components/chat/ChatView.tsx"),
      "utf8",
    );
    expect(view).toContain("CHAT_PANEL_CLASS");
    expect(view).toContain('data-testid="chat-panel"');
    expect(view).not.toContain("CHAT_TRANSCRIPT_MAX_CLASS");
    expect(view).not.toContain("max-w-none");
    expect(view).not.toContain("max-w-xl");
    expect(view).not.toContain("w-[calc(100%-2rem)]");

    const header = fs.readFileSync(
      path.join(__dirname, "../../../components/chat/ChatHeader.tsx"),
      "utf8",
    );
    expect(header).toContain("border-b border-border-hard");
    expect(header).not.toContain("w-[calc(100%-2rem)]");
    expect(header).not.toContain("rounded-[16px] border border-border-hard");

    const composer = fs.readFileSync(
      path.join(__dirname, "../../../components/chat/ChatComposer.tsx"),
      "utf8",
    );
    expect(composer).toContain("border-t border-border-hard");
    expect(composer).not.toContain("w-[calc(100%-2rem)]");

    const list = fs.readFileSync(
      path.join(__dirname, "../../../components/dashboard/ChatTabSection.tsx"),
      "utf8",
    );
    expect(list).toContain("CHAT_PANEL_CLASS");
    expect(list).not.toContain("pr-16");
    expect(list).not.toContain("absolute right-4 top-1/2");

    const token = fs.readFileSync(
      path.join(__dirname, "../../../lib/chat/layout.ts"),
      "utf8",
    );
    expect(token).toContain("CHAT_PANEL_CLASS");
    expect(token).toContain("rounded-[16px]");
    expect(token).toContain("border-border-hard");
    expect(token).not.toMatch(/max-w-none/);
    expect(token).not.toMatch(/max-w-xl/);
  });
});
