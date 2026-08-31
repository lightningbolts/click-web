import { messagesForProfileConnection } from "@/lib/userProfile/profileChatContext";

describe("profile chat context", () => {
  const messages = [{ id: "testing-beacon" }];

  it("does not reuse the open chat's messages for another profile", () => {
    expect(messagesForProfileConnection(messages, "connection-b", "connection-a")).toEqual([]);
  });

  it("uses decrypted messages only for the matching open connection", () => {
    expect(messagesForProfileConnection(messages, "connection-a", "connection-a")).toEqual(
      messages,
    );
  });
});
