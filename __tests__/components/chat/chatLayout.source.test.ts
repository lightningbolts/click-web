import fs from "node:fs";
import path from "node:path";

describe("chat transcript width", () => {
  it("fills the shared max-w-6xl page column instead of a skinny max-w-xl or edge-to-edge max-w-none", () => {
    const files = [
      "components/chat/ChatView.tsx",
      "components/chat/ChatHeader.tsx",
      "components/chat/ChatComposer.tsx",
      "components/chat/ChatSharedInterestsBanner.tsx",
    ];
    for (const rel of files) {
      const src = fs.readFileSync(path.join(__dirname, "../../../", rel), "utf8");
      expect(src).toContain("CHAT_TRANSCRIPT_MAX_CLASS");
      expect(src).not.toContain("max-w-5xl");
      expect(src).not.toContain("max-w-xl");
    }
    const token = fs.readFileSync(
      path.join(__dirname, "../../../lib/chat/layout.ts"),
      "utf8",
    );
    expect(token).toContain("PAGE_COLUMN_MAX_CLASS");
    expect(token).not.toMatch(/CHAT_TRANSCRIPT_MAX_CLASS = ["']max-w-none['"]/);
    expect(token).not.toMatch(/CHAT_TRANSCRIPT_MAX_CLASS = ["']max-w-xl['"]/);
    const column = fs.readFileSync(
      path.join(__dirname, "../../../lib/shell/pageColumn.ts"),
      "utf8",
    );
    expect(column).toMatch(/PAGE_COLUMN_MAX_CLASS = ["']max-w-6xl["']/);
  });
});
