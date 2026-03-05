// Telegram target parser

/** Parse a Telegram target: chatId with optional threadId */
export function parseTelegramTarget(raw: string): { chatId: string; threadId?: string } {
  // Format: "chatId" or "chatId:threadId"
  const parts = raw.split(":");
  return {
    chatId: parts[0],
    threadId: parts[1] || undefined,
  };
}

/** Normalize a Telegram target string */
export function normalizeTelegramTarget(raw: string): string {
  const { chatId, threadId } = parseTelegramTarget(raw);
  return threadId ? `${chatId}:${threadId}` : chatId;
}
