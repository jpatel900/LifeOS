import { describe, expect, it, vi } from "vitest";

import {
  composeTelegramBrief,
  sendTelegramBrief,
  type TelegramBriefInput,
} from "./telegram";

const fullInput: TelegramBriefInput = {
  greeting: "Good morning.",
  daySynthesis: "Two focus blocks and one loose thread.",
  firstMoveTitle: "Draft the launch note",
  todayBlocks: [
    { title: "Write", startLabel: "09:00" },
    { title: "Review", startLabel: "11:00" },
  ],
  waitingOn: [{ title: "Design feedback", daysWaiting: 3 }],
};

describe("composeTelegramBrief", () => {
  it("is deterministic for the same input", () => {
    expect(composeTelegramBrief(fullInput)).toBe(
      composeTelegramBrief(fullInput),
    );
  });

  it("returns greeting and synthesis for an empty day", () => {
    expect(
      composeTelegramBrief({
        greeting: "Good morning.",
        daySynthesis: "No blocks today.",
        firstMoveTitle: null,
        todayBlocks: [],
        waitingOn: [],
      }),
    ).toBe("Good morning.\nNo blocks today.");
  });

  it("caps blocks at five and adds an overflow line", () => {
    const message = composeTelegramBrief({
      ...fullInput,
      todayBlocks: [
        { title: "One", startLabel: "09:00" },
        { title: "Two", startLabel: "10:00" },
        { title: "Three", startLabel: "11:00" },
        { title: "Four", startLabel: "12:00" },
        { title: "Five", startLabel: "13:00" },
        { title: "Six", startLabel: "14:00" },
      ],
      waitingOn: [],
    });

    expect(message).toContain("• 13:00 Five");
    expect(message).not.toContain("Six");
    expect(message).toContain("+1 more");
  });

  it("omits an empty waiting-on section and caps populated waiting-on items", () => {
    const withoutWaiting = composeTelegramBrief({
      ...fullInput,
      waitingOn: [],
    });
    expect(withoutWaiting).not.toContain("Waiting on:");

    const withOverflow = composeTelegramBrief({
      ...fullInput,
      waitingOn: [
        { title: "One", daysWaiting: 1 },
        { title: "Two", daysWaiting: 2 },
        { title: "Three", daysWaiting: 3 },
        { title: "Four", daysWaiting: 4 },
        { title: "Five", daysWaiting: 5 },
      ],
    });

    expect(withOverflow).toContain("Waiting on: Four (4d)");
    expect(withOverflow).not.toContain("Waiting on: Five");
    expect(withOverflow).toContain("+1 more waiting");
  });
});

describe("sendTelegramBrief", () => {
  it("posts the expected Telegram path and payload", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));

    await expect(
      sendTelegramBrief("Brief text", {
        botToken: "token-123",
        chatId: "chat-456",
        fetchImpl,
      }),
    ).resolves.toEqual({ ok: true, error: null });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as Parameters<
      typeof fetch
    >;
    expect(url).toBe("https://api.telegram.org/bottoken-123/sendMessage");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(
      JSON.stringify({ chat_id: "chat-456", text: "Brief text" }),
    );
  });

  it("returns ok false for a non-200 response", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 500 }));

    await expect(
      sendTelegramBrief("Brief text", {
        botToken: "token-123",
        chatId: "chat-456",
        fetchImpl,
      }),
    ).resolves.toEqual({
      ok: false,
      error: "Telegram sendMessage failed with status 500",
    });
  });

  it("returns ok false when fetch rejects and does not throw", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    });

    await expect(
      sendTelegramBrief("Brief text", {
        botToken: "token-123",
        chatId: "chat-456",
        fetchImpl,
      }),
    ).resolves.toEqual({
      ok: false,
      error: "Telegram sendMessage failed: network down",
    });
  });

  it("returns ok false when the request times out and does not throw", async () => {
    const fetchImpl = vi.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new Error("aborted by test")),
          );
        }),
    );

    await expect(
      sendTelegramBrief("Brief text", {
        botToken: "token-123",
        chatId: "chat-456",
        fetchImpl,
        timeoutMs: 1,
      }),
    ).resolves.toEqual({
      ok: false,
      error: "Telegram sendMessage failed: aborted by test",
    });
  });

  it("never includes the bot token in returned error strings", async () => {
    const botToken = "secret-token";
    const fetchImpl = vi.fn(async () => {
      throw new Error(
        `failed https://api.telegram.org/bot${botToken}/sendMessage`,
      );
    });

    const result = await sendTelegramBrief("Brief text", {
      botToken,
      chatId: "chat-456",
      fetchImpl,
    });

    expect(result.ok).toBe(false);
    expect(result.error).not.toContain(botToken);
    expect(result.error).toContain("[redacted Telegram URL]");
  });
});
