export const CHANNEL = "@kansk_segodnya";
export const CHAT_ID = -1004489066922;
export const BOT_ID = 9166835869;
export const BOT_USERNAME = "kansk_segodnya_editor_bot";
export type PublisherEnv = { DB: D1Database; BUCKET?: R2Bucket; TELEGRAM_BOT_TOKEN?: string };
export type Caller = { id: string; email: string };
export const CHANNEL_CALLER: Caller = { id: "public-channel", email: "" };
export class PublisherError extends Error {}
export class TelegramRejected extends PublisherError {}
export function safeError(error: unknown): string {
  return (error instanceof PublisherError ? error.message : "Ответ не подтверждён. Проверьте операцию по её ключу перед повтором.").replace(/\b\d{6,}:[A-Za-z0-9_-]{25,}\b/g, "[скрыто]");
}
