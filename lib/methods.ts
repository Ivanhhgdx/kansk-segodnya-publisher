import catalog from "./bot-api-catalog.json" with { type: "json" };
import { BOT_ID, CHANNEL, CHAT_ID, PublisherError } from "./contracts.ts";
export type Method = typeof catalog[number];
export const METHODS: Method[] = catalog;
export function getMethod(name: string) {
  const method = METHODS.find(item => item.method === name);
  if (!method) throw new PublisherError("Неизвестный метод. Список: GET /api/command.");
  return method;
}
export function nativeOperation(name: string, input: unknown, key?: unknown) {
  const method = getMethod(name);
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new PublisherError("params должен быть объектом.");
  const params = { ...input } as Record<string, unknown>;
  if (Object.keys(params).some(field => !method.allowed.includes(field))) throw new PublisherError(`Недопустимое поле для ${name}. Смотрите справочник команды.`);
  for (const field of ["inline_message_id", "business_connection_id", "guest_query_id", "direct_messages_topic_id"]) if (params[field] !== undefined) throw new PublisherError(`Поле ${field} не относится к каналу ${CHANNEL}.`);
  if (method.scope === "channel" && method.allowed.includes("chat_id")) {
    if (params.chat_id !== undefined && params.chat_id !== CHAT_ID && params.chat_id !== CHANNEL && params.chat_id !== String(CHAT_ID)) throw new PublisherError(`Эта система работает с ${CHANNEL}.`);
    params.chat_id = CHAT_ID;
  }
  for (const field of ["chat_id", "from_chat_id"]) if (params[field] !== undefined) {
    if (![CHAT_ID, String(CHAT_ID), CHANNEL].includes(params[field] as any)) throw new PublisherError(`Поле ${field} должно указывать ${CHANNEL}.`);
    params[field] = CHAT_ID;
  }
  if (name === "getUserProfilePhotos") {
    if (params.user_id !== undefined && params.user_id !== BOT_ID) throw new PublisherError("Можно получить фотографии подключённого бота.");
    params.user_id = BOT_ID;
  }
  if (params.scope && typeof params.scope === "object") {
    const scope = { ...params.scope as Record<string, unknown> };
    if (scope.chat_id !== undefined && ![CHAT_ID, String(CHAT_ID), CHANNEL].includes(scope.chat_id as any)) throw new PublisherError("Scope относится к другому чату.");
    if (scope.chat_id !== undefined) scope.chat_id = CHAT_ID;
    params.scope = scope;
  }
  for (const field of method.required) if (params[field] === undefined || params[field] === null) throw new PublisherError(`Для ${name} нужно поле ${field}.`);
  for (const field of ["message_id", "user_id"]) if (params[field] !== undefined && (typeof params[field] !== "number" || !Number.isSafeInteger(params[field]) || Number(params[field]) <= 0)) throw new PublisherError(`Поле ${field} должно быть положительным целым числом.`);
  for (const field of ["message_ids"]) if (params[field] !== undefined && (!Array.isArray(params[field]) || !params[field].length || params[field].length > 100 || params[field].some(x => !Number.isSafeInteger(x) || x <= 0))) throw new PublisherError("message_ids: от 1 до 100 номеров постов.");
  if (name === "sendMediaGroup" && (!Array.isArray(params.media) || params.media.length < 2 || params.media.length > 10)) throw new PublisherError("В альбоме должно быть от 2 до 10 файлов.");
  if (name === "getUpdates" && params.timeout !== undefined && (typeof params.timeout !== "number" || params.timeout < 0 || params.timeout > 30)) throw new PublisherError("timeout: от 0 до 30 секунд.");
  if (!method.readOnly && (typeof key !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(key))) throw new PublisherError("Нужен operation_key: уникальный ключ команды.");
  return { method: name, params, key: typeof key === "string" ? key : "", readOnly: method.readOnly };
}
