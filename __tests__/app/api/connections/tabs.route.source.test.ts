import fs from "node:fs";
import path from "node:path";

describe("connection profile tabs route", () => {
  it("returns only beacons explicitly shared in the resolved chat", () => {
    const source = fs.readFileSync(
      path.join(
        __dirname,
        "../../../../app/api/connections/[connectionId]/tabs/route.ts",
      ),
      "utf8",
    );

    expect(source).toContain(".eq('chat_id', chatId)");
    expect(source).toContain(".eq('message_type', 'beacon')");
    expect(source).not.toContain("connection_encounters");
    expect(source).not.toContain("encounter-event:");
  });
});
