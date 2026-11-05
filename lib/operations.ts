import { CHAT_ID, PublisherError } from "./contracts.ts";
type Args = Record<string, unknown>;
function string(args: Args, name: string, max: number, empty = false): string {
  const value = args[name];
  if (typeof value !== "string" || (!empty && !value.trim()) || value.length > max) throw new PublisherError(`Неверное поле «${name}» (до ${max} символов).`);
  return value;
}
function assertKeys(args: Args, allowed: string[]) {
  if (!args || typeof args !== "object" || Array.isArray(args) || Object.keys(args).some(k => !allowed.includes(k))) throw new PublisherError("Недопустимые параметры операции.");
}
function postId(args: Args): number {
  const value = args.message_id;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) throw new PublisherError("Неверный номер публикации.");
  return value;
}
function mediaRef(args: Args): string {
  const value = string(args, "media_ref", 4096);
  if (/^[A-Za-z0-9_-]{20,}$/.test(value) || /^upload:[a-f0-9-]{36}$/i.test(value)) return value;
  let url: URL;
  try { url = new URL(value); } catch { throw new PublisherError("Нужна HTTPS-ссылка на файл или Telegram file_id."); }
  if (url.protocol !== "https:" || url.username || url.password || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[)/.test(url.hostname)) throw new PublisherError("Нужна внешняя HTTPS-ссылка на медиафайл.");
  return value;
}
export function buildLegacyOperation(name: string, args: Args): { method: string; params: Args; key: string } {
  const params: Args = { chat_id: CHAT_ID };
  let method: string;
  const key = string(args, "operation_key", 120);
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(key)) throw new PublisherError("Неверный ключ операции: используйте латиницу, цифры, точку, двоеточие, дефис или подчёркивание.");
  if (args.parse_mode !== undefined && args.parse_mode !== "HTML") throw new PublisherError("Поддерживается только HTML или обычный текст.");
  if (args.parse_mode) params.parse_mode = "HTML";
  if (name === "telegram_publish_text") {
    assertKeys(args, ["operation_key", "text", "parse_mode", "silent"]);
    method = "sendMessage"; params.text = string(args, "text", 4096);
    if (args.silent !== undefined && typeof args.silent !== "boolean") throw new PublisherError("Поле silent должно быть логическим.");
    params.disable_notification = args.silent === true;
  } else if (name === "telegram_publish_media") {
    assertKeys(args, ["operation_key", "kind", "media_ref", "caption", "parse_mode", "silent"]);
    if (!["photo", "video"].includes(String(args.kind))) throw new PublisherError("Выберите photo или video.");
    method = args.kind === "photo" ? "sendPhoto" : "sendVideo";
    params[String(args.kind)] = mediaRef(args); params.caption = args.caption === undefined ? "" : string(args, "caption", 1024, true);
    if (args.silent !== undefined && typeof args.silent !== "boolean") throw new PublisherError("Поле silent должно быть логическим.");
    params.disable_notification = args.silent === true;
    if (args.kind === "video") params.supports_streaming = true;
  } else if (name === "telegram_edit_text") {
    assertKeys(args, ["operation_key", "message_id", "text", "parse_mode"]);
    method = "editMessageText"; params.message_id = postId(args); params.text = string(args, "text", 4096);
  } else if (name === "telegram_edit_caption") {
    assertKeys(args, ["operation_key", "message_id", "caption", "parse_mode"]);
    method = "editMessageCaption"; params.message_id = postId(args); params.caption = string(args, "caption", 1024, true);
  } else if (name === "telegram_edit_media") {
    assertKeys(args, ["operation_key", "message_id", "kind", "media_ref", "caption", "parse_mode"]);
    if (!["photo", "video"].includes(String(args.kind))) throw new PublisherError("Выберите photo или video.");
    method = "editMessageMedia"; params.message_id = postId(args);
    params.media = { type: args.kind, media: mediaRef(args), caption: string(args, "caption", 1024, true), ...(args.parse_mode ? { parse_mode: "HTML" } : {}) };
    delete params.parse_mode;
  } else throw new PublisherError("Неизвестный инструмент.");
  return { method, params, key };
}
