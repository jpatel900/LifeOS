export interface TelegramBriefInput {
  greeting: string;
  daySynthesis: string;
  firstMoveTitle: string | null;
  todayBlocks: Array<{ title: string; startLabel: string }>;
  waitingOn: Array<{ title: string; daysWaiting: number }>;
}

export interface SendTelegramBriefOptions {
  botToken: string;
  chatId: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface SendTelegramBriefResult {
  ok: boolean;
  error: string | null;
}

const TELEGRAM_SEND_MESSAGE_BASE_URL = "https://api.telegram.org/bot";
const TELEGRAM_SEND_MESSAGE_PATH = "/sendMessage";
const DEFAULT_TIMEOUT_MS = 5000;
const MAX_BLOCKS = 5;
const MAX_WAITING_ON = 4;

export function composeTelegramBrief(input: TelegramBriefInput): string {
  const lines = [input.greeting, input.daySynthesis];

  if (input.firstMoveTitle !== null) {
    lines.push(`First move: ${input.firstMoveTitle}`);
  }

  const visibleBlocks = input.todayBlocks.slice(0, MAX_BLOCKS);
  for (const block of visibleBlocks) {
    lines.push(`• ${block.startLabel} ${block.title}`);
  }

  const hiddenBlockCount = input.todayBlocks.length - visibleBlocks.length;
  if (hiddenBlockCount > 0) {
    lines.push(`+${hiddenBlockCount} more`);
  }

  if (input.waitingOn.length > 0) {
    const visibleWaitingOn = input.waitingOn.slice(0, MAX_WAITING_ON);
    for (const item of visibleWaitingOn) {
      lines.push(`Waiting on: ${item.title} (${item.daysWaiting}d)`);
    }

    const hiddenWaitingOnCount =
      input.waitingOn.length - visibleWaitingOn.length;
    if (hiddenWaitingOnCount > 0) {
      lines.push(`+${hiddenWaitingOnCount} more waiting`);
    }
  }

  return lines.join("\n");
}

export async function sendTelegramBrief(
  text: string,
  options: SendTelegramBriefOptions,
): Promise<SendTelegramBriefResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const url = `${TELEGRAM_SEND_MESSAGE_BASE_URL}${options.botToken}${TELEGRAM_SEND_MESSAGE_PATH}`;

  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: options.chatId, text }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return {
        ok: false,
        error: sanitizeTelegramError(
          `Telegram sendMessage failed with status ${response.status}`,
          options.botToken,
        ),
      };
    }

    return { ok: true, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: sanitizeTelegramError(
        `Telegram sendMessage failed: ${message}`,
        options.botToken,
      ),
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function sanitizeTelegramError(message: string, botToken: string): string {
  if (botToken.length === 0) {
    return redactTelegramBotUrls(message);
  }

  return redactTelegramBotUrls(message).split(botToken).join("[redacted]");
}

function redactTelegramBotUrls(message: string): string {
  return message.replace(
    /https:\/\/api\.telegram\.org\/bot[^\s)]+/g,
    "[redacted Telegram URL]",
  );
}
