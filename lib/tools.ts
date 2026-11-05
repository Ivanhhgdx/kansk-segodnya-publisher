const key = { type: "string", minLength: 1, maxLength: 120, description: "Уникальный ключ операции. Сохраняйте тот же ключ при проверке/повторе; никогда не меняйте его после тайм-аута до выяснения результата." };
const parse = { type: "string", enum: ["HTML"], description: "Не передавайте для обычного текста." };
const message = { type: "integer", minimum: 1, description: "Номер поста в @kansk_segodnya." };
const media = { type: "string", maxLength: 4096, description: "Прямая внешняя HTTPS-ссылка на реальный файл либо существующий Telegram file_id. Локальные пути не поддерживаются." };
const kind = { type: "string", enum: ["photo", "video"] };
const caption = { type: "string", maxLength: 1024 };
function schema(properties: Record<string, unknown>, required: string[] = []) { return { type: "object", properties, required, additionalProperties: false }; }
const read = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const write = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const edit = { ...write, destructiveHint: true };
export const TOOLS = [
  { name: "telegram_check_connection", description: "Проверить из облака сохранённый доступ к боту и права в единственном канале @kansk_segodnya. Ничего не публикует, токен не возвращает, Mac не требуется.", inputSchema: schema({}), annotations: read },
  { name: "telegram_get_operation", description: "Проверить результат операции по ключу после тайм-аута. Не создаёт новых постов. pending/uncertain требуют выяснения результата, повтор с новым ключом запрещён.", inputSchema: schema({ operation_key: key }, ["operation_key"]), annotations: { ...read, openWorldHint: false } },
  { name: "telegram_list_operations", description: "Последние 20 общих операций, номера постов и статусы. Постоянный облачный журнал.", inputSchema: schema({}), annotations: { ...read, openWorldHint: false } },
  { name: "telegram_publish_text", description: "Опубликовать текст только в @kansk_segodnya через официального бота. Публичный инструмент: вход и ключ доступа не требуются. Дополнительные тестовые публикации для проверки подключения запрещены.", inputSchema: schema({ operation_key: key, text: { type: "string", minLength: 1, maxLength: 4096 }, parse_mode: parse, silent: { type: "boolean" } }, ["operation_key", "text"]), annotations: write },
  { name: "telegram_publish_media", description: "Опубликовать реальное фото или видео с подписью только в @kansk_segodnya. Общий доступ без авторизации; новых тестовых постов для проверки подключения не создавать. Медиа передаётся по прямой HTTPS-ссылке или file_id.", inputSchema: schema({ operation_key: key, kind, media_ref: media, caption, parse_mode: parse, silent: { type: "boolean" } }, ["operation_key", "kind", "media_ref"]), annotations: write },
  { name: "telegram_edit_text", description: "Изменить текст существующего поста @kansk_segodnya без перепубликации. Общий доступ; не использовать существующие посты для теста подключения.", inputSchema: schema({ operation_key: key, message_id: message, text: { type: "string", minLength: 1, maxLength: 4096 }, parse_mode: parse }, ["operation_key", "message_id", "text"]), annotations: edit },
  { name: "telegram_edit_caption", description: "Изменить подпись существующего фото/видео @kansk_segodnya. Передайте полный новый текст; пустая строка очищает подпись. Общий доступ без авторизации.", inputSchema: schema({ operation_key: key, message_id: message, caption, parse_mode: parse }, ["operation_key", "message_id", "caption"]), annotations: edit },
  { name: "telegram_edit_media", description: "Заменить фото/видео существующего поста @kansk_segodnya. Обязательно передать полную подпись, чтобы не потерять её. Общий доступ без авторизации.", inputSchema: schema({ operation_key: key, message_id: message, kind, media_ref: media, caption, parse_mode: parse }, ["operation_key", "message_id", "kind", "media_ref", "caption"]), annotations: edit },
];
