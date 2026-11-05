import { CHANNEL, CHAT_ID, BOT_ID, BOT_USERNAME, CHANNEL_CALLER, PublisherError, TelegramRejected, safeError, type PublisherEnv, type Caller } from "./contracts.ts";
import { getMethod, nativeOperation } from "./methods.ts";
import { buildLegacyOperation } from "./operations.ts";
import { prepareAssets, openAttachments, multipartBody, type Attachment } from "./assets.ts";
export { CHANNEL, CHAT_ID, BOT_ID, BOT_USERNAME, PublisherError, TelegramRejected, safeError, type PublisherEnv, type Caller };
export const PUBLIC_CALLER = CHANNEL_CALLER;
type Args = Record<string, unknown>;
function redact(value: unknown, token: string): any { return JSON.parse(JSON.stringify(value).split(token).join("[скрыто]")); }
export class Telegram {
  private env: PublisherEnv;
  private transport: typeof fetch;
  constructor(env: PublisherEnv, transport: typeof fetch = fetch) { this.env = env; this.transport = transport; }
  async call(method: string, params: Args = {}, files: Attachment[] = []): Promise<any> {
    const token = this.env.TELEGRAM_BOT_TOKEN;
    if (!token || !/^\d{6,}:[A-Za-z0-9_-]{30,}$/.test(token)) throw new PublisherError("Ключ бота ещё не настроен.");
    const readOnly = getMethod(method).readOnly, attempts = readOnly && !files.length ? 2 : 1;
    for (let attempt = 0; attempt < attempts; attempt++) {
      let response: Response;
      const upload = files.length ? multipartBody(params, files) : null;
      try {
        response = await this.transport(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", redirect: "manual", headers: { "Content-Type": upload?.contentType || "application/json" }, body: upload?.body || JSON.stringify(params), signal: AbortSignal.timeout(readOnly ? 45000 : 180000), ...(upload ? { duplex: "half" } : {}) } as RequestInit);
        if (upload) { if (response.ok) await upload.done; else upload.cancel(); }
      } catch {
        upload?.cancel();
        if (readOnly && attempt + 1 < attempts) continue;
        throw new PublisherError(readOnly ? "Telegram не ответил на запрос." : "Ответ Telegram не получен. Сначала проверьте операцию по её ключу.");
      }
      if (response.status >= 300 && response.status < 400) { await response.body?.cancel(); throw new PublisherError("Telegram вернул неожиданный переход. Запрос на другой адрес не отправлен."); }
      let data: any;
      try { data = await response.json(); } catch { if (readOnly && attempt + 1 < attempts) continue; throw new PublisherError("Получен неполный ответ Telegram."); }
      if (data.ok === true && response.ok) return redact(data.result, token);
      if (response.status >= 500) { if (readOnly && attempt + 1 < attempts) continue; throw new PublisherError("Telegram временно недоступен; результат не подтверждён."); }
      const description = safeError(new PublisherError(String(data.description || "неизвестная ошибка").split(token).join("[скрыто]")));
      throw new TelegramRejected(`Telegram: ${description}`);
    }
    throw new PublisherError("Запрос Telegram не завершён.");
  }
  async check() {
    const me = await this.call("getMe");
    if (me.id !== BOT_ID || me.is_bot !== true || me.username !== BOT_USERNAME) throw new PublisherError("Ключ принадлежит другому боту.");
    const chat = await this.call("getChat", { chat_id: CHANNEL });
    if (chat.id !== CHAT_ID || chat.type !== "channel" || chat.username?.toLowerCase() !== CHANNEL.slice(1)) throw new PublisherError("Идентификатор канала изменился.");
    const rights = await this.call("getChatMember", { chat_id: CHAT_ID, user_id: BOT_ID });
    if (rights.status !== "administrator" || !rights.can_post_messages || !rights.can_edit_messages) throw new PublisherError("Боту нужны права публикации и редактирования.");
    const capabilities = Object.fromEntries(Object.entries(rights).filter(([key]) => key.startsWith("can_")));
    return { connected: true, bot: `@${BOT_USERNAME}`, channel: CHANNEL, chat_id: CHAT_ID, title: chat.title, can_post_messages: true, can_edit_messages: true, rights: capabilities, checked_at: new Date().toISOString() };
  }
}
export function buildOperation(name: string, args: Args) {
  if (name === "telegram_api") return nativeOperation(String(args.method || ""), args.params ?? {}, args.operation_key);
  return { ...buildLegacyOperation(name, args), readOnly: false };
}
function canonical(value: any): any {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
async function sha256(value: unknown, stable = false) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(stable ? canonical(value) : value)));
  return [...new Uint8Array(bytes)].map(v => v.toString(16).padStart(2, "0")).join("");
}
type OperationRow = { id: string; operation_key: string; method: string; fingerprint: string; status: string; result_json: string | null; created_at: string; finished_at: string | null };
export class Publisher {
  private api: Telegram;
  private env: PublisherEnv;
  constructor(env: PublisherEnv, transport: typeof fetch = fetch) { this.env = env; this.api = new Telegram(env, transport); }
  async check() {
    const result = await this.api.check();
    await this.env.DB.prepare("INSERT INTO connection_state (id, value_json, updated_at) VALUES ('telegram', ?, ?) ON CONFLICT(id) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at").bind(JSON.stringify(result), result.checked_at).run(); return result;
  }
  async operation(caller: Caller, key: string) {
    const row = await this.env.DB.prepare("SELECT * FROM operations WHERE id = ?").bind(`${caller.id}:${key}`).first<OperationRow>();
    return row ? { operation_key: row.operation_key, status: row.status, method: row.method, created_at: row.created_at, result: row.result_json ? JSON.parse(row.result_json) : null } : { operation_key: key, status: "not_found" };
  }
  async recent(caller: Caller, limit = 20, before = "9999") {
    const result = await this.env.DB.prepare("SELECT operation_key, method, status, result_json, created_at FROM operations WHERE owner_id = ? AND created_at < ? ORDER BY created_at DESC LIMIT ?").bind(caller.id, before, Math.min(100, Math.max(1, limit))).all<OperationRow>();
    return result.results.map(row => ({ operation_key: row.operation_key, method: row.method, status: row.status, created_at: row.created_at, result: row.result_json ? JSON.parse(row.result_json) : null }));
  }
  async status(caller: Caller) {
    const row = await this.env.DB.prepare("SELECT value_json FROM connection_state WHERE id = 'telegram'").first<{ value_json: string }>();
    return { connection: row ? JSON.parse(row.value_json) : null, operations: await this.recent(caller), channel: CHANNEL };
  }
  async execute(caller: Caller, name: string, args: Args) {
    const op = buildOperation(name, args);
    const prepared = await prepareAssets(this.env, op.params);
    if (op.readOnly) return { data: await this.api.call(op.method, prepared.params, await openAttachments(this.env, prepared.attachments)) };
    const id = `${caller.id}:${op.key}`;
    const content = prepared.attachments.length ? [op.method, prepared.params, prepared.fingerprintFiles] : [op.method, op.params];
    const fingerprint = await sha256(content, true), fingerprints = [fingerprint];
    if (!prepared.attachments.length) fingerprints.push(await sha256([op.method, op.params]));
    let row = await this.env.DB.prepare("SELECT * FROM operations WHERE id = ?").bind(id).first<OperationRow>();
    if (row) return this.previous(row, fingerprints);
    const photoFields = op.method === "sendPhoto" ? [prepared.params.photo] : op.method === "sendMediaGroup" || op.method === "editMessageMedia" ? (Array.isArray(prepared.params.media) ? prepared.params.media : [prepared.params.media]).filter((m: any) => m?.type === "photo").map((m: any) => m.media) : [];
    for (const ref of photoFields) { const file = prepared.attachments.find(x => `attach://${x.field}` === ref); if (file && file.asset.size > 10_000_000) throw new PublisherError("Фото превышает 10 МБ. Отправьте его как документ."); }
    await this.check();
    // Resolve objects before reserving, so missing local uploads never become uncertain Telegram actions.
    const files = await openAttachments(this.env, prepared.attachments);
    const reservation = await this.env.DB.prepare("INSERT INTO operations (id, owner_id, operation_key, method, fingerprint, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?) ON CONFLICT(id) DO NOTHING").bind(id, caller.id, op.key, op.method, fingerprint, new Date().toISOString()).run();
    if (reservation.meta.changes !== 1) {
      await Promise.all(files.map(file => file.body.cancel().catch(() => {})));
      row = await this.env.DB.prepare("SELECT * FROM operations WHERE id = ?").bind(id).first<OperationRow>();
      if (!row) throw new PublisherError("Не удалось зарезервировать операцию."); return this.previous(row, fingerprints);
    }
    let result: any;
    try { result = await this.api.call(op.method, prepared.params, files); }
    catch (error) {
      if (error instanceof TelegramRejected && op.method.startsWith("editMessage") && error.message.includes("message is not modified")) result = { message_id: op.params.message_id, chat: { id: CHAT_ID } };
      else { await this.env.DB.prepare("UPDATE operations SET status = ?, finished_at = ? WHERE id = ?").bind(error instanceof TelegramRejected ? "rejected" : "uncertain", new Date().toISOString(), id).run(); throw error; }
    }
    const messages = (Array.isArray(result) ? result : [result]).filter(item => item && Number.isSafeInteger(item.message_id));
    if (result === undefined || result === null || messages.some(item => item.chat && item.chat.id !== CHAT_ID)) {
      await this.env.DB.prepare("UPDATE operations SET status = 'uncertain' WHERE id = ?").bind(id).run(); throw new PublisherError("Telegram не подтвердил результат команды.");
    }
    const links = messages.map(message => ({ message_id: message.message_id, url: `https://t.me/kansk_segodnya/${message.message_id}` }));
    const summary = { operation_key: op.key, channel: CHANNEL, method: op.method, status: "done", ...(links[0] || {}), ...(links.length > 1 ? { messages: links } : {}), data: result };
    await this.env.DB.prepare("UPDATE operations SET status = 'done', result_json = ?, finished_at = ? WHERE id = ?").bind(JSON.stringify(summary), new Date().toISOString(), id).run(); return summary;
  }
  private previous(row: OperationRow, fingerprints: string[]) {
    if (!fingerprints.includes(row.fingerprint)) throw new PublisherError("Ключ уже использован для другого содержимого.");
    if (row.status === "done" && row.result_json) return { ...JSON.parse(row.result_json), repeated: true };
    throw new PublisherError(`Состояние операции: ${row.status}. Сначала выясните результат; не создавайте новый ключ для повторной отправки.`);
  }
}
