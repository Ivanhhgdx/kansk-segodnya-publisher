export const CHANNEL = "@kansk_segodnya";
export const CHAT_ID = -1004489066922;
export const BOT_ID = 9166835869;
export const BOT_USERNAME = "kansk_segodnya_editor_bot";
export type PublisherEnv = { DB: D1Database; TELEGRAM_BOT_TOKEN?: string };
export type Caller = { id: string; email: string };
type Args = Record<string, unknown>;
export class PublisherError extends Error {}
export class TelegramRejected extends PublisherError {}

export const PUBLIC_CALLER: Caller = { id: "public-channel", email: "" };
export function safeError(error: unknown): string {
  return (error instanceof PublisherError ? error.message : "Операция не подтверждена. Проверьте её состояние по ключу, прежде чем повторять.").replace(/\b\d{6,}:[A-Za-z0-9_-]{25,}\b/g, "[скрыто]");
}

export class Telegram {
  private env: PublisherEnv;
  private transport: typeof fetch;
  constructor(env: PublisherEnv, transport: typeof fetch = fetch) { this.env = env; this.transport = transport; }
  async call(method: string, params: Args = {}): Promise<any> {
    const token = this.env.TELEGRAM_BOT_TOKEN;
    if (!token || !/^\d{6,}:[A-Za-z0-9_-]{30,}$/.test(token)) throw new PublisherError("Облачный ключ бота ещё не настроен.");
    const readOnly = ["getMe", "getChat", "getChatMember"].includes(method);
    if (!["getMe", "getChat", "getChatMember", "sendMessage", "sendPhoto", "sendVideo", "editMessageText", "editMessageCaption", "editMessageMedia"].includes(method)) throw new PublisherError("Метод не поддерживается.");
    for (let attempt = 0; attempt < (readOnly ? 2 : 1); attempt++) {
      let response: Response;
      try {
        response = await this.transport(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", redirect: "error", headers: { "Content-Type": "application/json" }, body: JSON.stringify(params), signal: AbortSignal.timeout(readOnly ? 8000 : 40000) });
      } catch {
        if (readOnly && attempt === 0) continue;
        throw new PublisherError(readOnly ? "Telegram не ответил на проверку подключения." : "Ответ Telegram не получен. Повторная отправка заблокирована до выяснения результата.");
      }
      let data: any;
      try { data = await response.json(); } catch {
        if (readOnly && attempt === 0) continue;
        throw new PublisherError("Получен неполный ответ Telegram.");
      }
      if (data.ok === true && response.ok) return data.result;
      if (response.status >= 500) {
        if (readOnly && attempt === 0) continue;
        throw new PublisherError("Telegram временно недоступен; результат не подтверждён.");
      }
      const description = String(data.description || "неизвестная ошибка").replace(/\b\d{6,}:[A-Za-z0-9_-]{25,}\b/g, "[скрыто]");
      throw new TelegramRejected(`Telegram: ${description}`);
    }
    throw new PublisherError("Проверка Telegram не завершена.");
  }
  async check() {
    const me = await this.call("getMe");
    if (me.id !== BOT_ID || me.is_bot !== true || me.username !== BOT_USERNAME) throw new PublisherError("Ключ принадлежит другому боту.");
    const chat = await this.call("getChat", { chat_id: CHANNEL });
    if (chat.id !== CHAT_ID || chat.type !== "channel" || chat.username?.toLowerCase() !== CHANNEL.slice(1)) throw new PublisherError("Идентификатор канала изменился. Публикация запрещена.");
    const rights = await this.call("getChatMember", { chat_id: CHAT_ID, user_id: BOT_ID });
    if (rights.status !== "administrator" || !rights.can_post_messages || !rights.can_edit_messages) throw new PublisherError("Боту нужны права публикации и редактирования сообщений.");
    return { connected: true, bot: `@${BOT_USERNAME}`, channel: CHANNEL, chat_id: CHAT_ID, title: chat.title, can_post_messages: true, can_edit_messages: true, runs_in_cloud: true, requires_mac: false, checked_at: new Date().toISOString() };
  }
}
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
  if (/^[A-Za-z0-9_-]{20,}$/.test(value)) return value;
  let url: URL;
  try { url = new URL(value); } catch { throw new PublisherError("Нужна HTTPS-ссылка на файл или Telegram file_id."); }
  if (url.protocol !== "https:" || url.username || url.password || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[)/.test(url.hostname)) throw new PublisherError("Нужна внешняя HTTPS-ссылка на медиафайл.");
  return value;
}
export function buildOperation(name: string, args: Args): { method: string; params: Args; key: string } {
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
async function sha256(value: unknown): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)));
  return [...new Uint8Array(bytes)].map(v => v.toString(16).padStart(2, "0")).join("");
}
type OperationRow = { id: string; operation_key: string; method: string; fingerprint: string; status: string; result_json: string | null; created_at: string; finished_at: string | null };
export class Publisher {
  private api: Telegram;
  private env: PublisherEnv;
  constructor(env: PublisherEnv, transport: typeof fetch = fetch) { this.env = env; this.api = new Telegram(env, transport); }
  async check() {
    const result = await this.api.check();
    await this.env.DB.prepare("INSERT INTO connection_state (id, value_json, updated_at) VALUES ('telegram', ?, ?) ON CONFLICT(id) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at").bind(JSON.stringify(result), result.checked_at).run();
    return result;
  }
  async operation(caller: Caller, key: string) {
    const row = await this.env.DB.prepare("SELECT * FROM operations WHERE id = ?").bind(`${caller.id}:${key}`).first<OperationRow>();
    return row ? { operation_key: row.operation_key, status: row.status, method: row.method, created_at: row.created_at, result: row.result_json ? JSON.parse(row.result_json) : null } : { operation_key: key, status: "not_found" };
  }
  async recent(caller: Caller) {
    const result = await this.env.DB.prepare("SELECT operation_key, method, status, result_json, created_at FROM operations WHERE owner_id = ? ORDER BY created_at DESC LIMIT 20").bind(caller.id).all<OperationRow>();
    return result.results.map(row => ({ operation_key: row.operation_key, method: row.method, status: row.status, created_at: row.created_at, result: row.result_json ? JSON.parse(row.result_json) : null }));
  }
  async status(caller: Caller) {
    const row = await this.env.DB.prepare("SELECT value_json FROM connection_state WHERE id = 'telegram'").first<{ value_json: string }>();
    return { connection: row ? JSON.parse(row.value_json) : null, operations: await this.recent(caller), configured: Boolean(this.env.TELEGRAM_BOT_TOKEN), channel: CHANNEL };
  }
  async execute(caller: Caller, name: string, args: Args) {
    const op = buildOperation(name, args), id = `${caller.id}:${op.key}`, fingerprint = await sha256([op.method, op.params]);
    let row = await this.env.DB.prepare("SELECT * FROM operations WHERE id = ?").bind(id).first<OperationRow>();
    if (row) return this.previous(row, fingerprint);
    await this.check();
    const reservation = await this.env.DB.prepare("INSERT INTO operations (id, owner_id, operation_key, method, fingerprint, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?) ON CONFLICT(id) DO NOTHING").bind(id, caller.id, op.key, op.method, fingerprint, new Date().toISOString()).run();
    if (reservation.meta.changes !== 1) {
      row = await this.env.DB.prepare("SELECT * FROM operations WHERE id = ?").bind(id).first<OperationRow>();
      if (!row) throw new PublisherError("Не удалось зарезервировать операцию.");
      return this.previous(row, fingerprint);
    }
    let result: any;
    try { result = await this.api.call(op.method, op.params); } catch (error) {
      if (error instanceof TelegramRejected && op.method.startsWith("editMessage") && error.message.includes("message is not modified")) result = { message_id: op.params.message_id, chat: { id: CHAT_ID } };
      else {
        await this.env.DB.prepare("UPDATE operations SET status = ?, finished_at = ? WHERE id = ?").bind(error instanceof TelegramRejected ? "rejected" : "uncertain", new Date().toISOString(), id).run();
        throw error;
      }
    }
    if (!result || result.chat?.id !== CHAT_ID || !Number.isSafeInteger(result.message_id)) {
      await this.env.DB.prepare("UPDATE operations SET status = 'uncertain' WHERE id = ?").bind(id).run();
      throw new PublisherError("Telegram не подтвердил операцию в нужном канале.");
    }
    const summary = { operation_key: op.key, message_id: result.message_id, channel: CHANNEL, url: `https://t.me/kansk_segodnya/${result.message_id}`, status: "done" };
    await this.env.DB.prepare("UPDATE operations SET status = 'done', result_json = ?, finished_at = ? WHERE id = ?").bind(JSON.stringify(summary), new Date().toISOString(), id).run();
    return summary;
  }
  private previous(row: OperationRow, fingerprint: string) {
    if (row.fingerprint !== fingerprint) throw new PublisherError("Ключ операции уже использован для другого содержимого.");
    if (row.status === "done" && row.result_json) return { ...JSON.parse(row.result_json), repeated: true };
    throw new PublisherError(`Операция уже существует: ${row.status}. Не отправляйте её с новым ключом, пока результат не установлен.`);
  }
}
