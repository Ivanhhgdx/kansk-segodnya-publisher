import { CHAT_ID, PublisherError } from "./contracts.ts";
import { METHODS } from "./methods.ts";
export const SHORT_COMMANDS = [
  { command: "check", description: "Проверить подключение и права" },
  { command: "text", description: "Опубликовать текст", example: 'python3 edit.py text "Текст поста"' },
  { command: "photo", description: "Опубликовать фото", example: 'python3 edit.py photo photo.jpg -c "Подпись"' },
  { command: "video", description: "Опубликовать видео", example: 'python3 edit.py video video.mp4 -c "Подпись"' },
  { command: "album", description: "Опубликовать альбом", example: 'python3 edit.py album first.jpg second.jpg video.mp4 -c "Подпись"' },
  ...["document", "audio", "voice", "animation", "video_note", "sticker"].map(command => ({ command, description: { document: "Отправить файл", audio: "Опубликовать аудио", voice: "Отправить голосовое сообщение", animation: "Опубликовать GIF/анимацию", video_note: "Опубликовать видеосообщение", sticker: "Отправить стикер" }[command] })),
  { command: "edit", description: "Изменить текст поста", example: 'python3 edit.py edit 123 "Новый текст"' },
  { command: "caption", description: "Изменить подпись", example: 'python3 edit.py caption 123 "Новая подпись"' },
  { command: "replace", description: "Заменить вложение", example: 'python3 edit.py replace 123 new.jpg -c "Полная подпись"' },
  { command: "delete", description: "Удалить один или несколько постов", example: 'python3 edit.py delete 123 124' },
  { command: "pin", description: "Закрепить пост" }, { command: "unpin", description: "Открепить пост" }, { command: "unpin_all", description: "Открепить все посты" },
  { command: "copy", description: "Копировать пост внутри канала" }, { command: "forward", description: "Переслать пост внутри канала" },
  { command: "poll", description: "Создать опрос" }, { command: "stop_poll", description: "Остановить опрос" }, { command: "buttons", description: "Изменить кнопки поста" }, { command: "reaction", description: "Установить реакцию" },
  { command: "history", description: "Журнал отправленных команд" }, { command: "operation", description: "Проверить результат по ключу" },
  { command: "bot", description: "Сведения о боте" }, { command: "channel", description: "Сведения о канале" },
  { command: "commands", description: "Список команд бота" }, { command: "set_commands", description: "Задать команды бота" },
  { command: "call", description: "Вызвать любой метод из каталога", example: 'python3 edit.py call getMyDescription --params "{}"' },
];
export function normalizeCommand(body: any) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new PublisherError("Нужен объект команды.");
  const allowed = ["command", "action", "arguments", "method", "params", "key", "operation_key", "id", "message_id", "ids", "file", "media_ref", "files", "media", "kind", "caption", "text", "silent", "parse_mode", "reply_markup", "question", "options", "buttons", "reaction", "emoji", "commands", "limit", "before"];
  if (Object.keys(body).some(field => !allowed.includes(field))) throw new PublisherError("Неизвестное поле команды. Дополнительные параметры Telegram передаются в params.");
  if (body.files !== undefined && !Array.isArray(body.files)) throw new PublisherError("files должен быть массивом.");
  if (body.options !== undefined && !Array.isArray(body.options)) throw new PublisherError("options должен быть массивом.");
  if (body.action) return { name: body.action, args: body.arguments ?? {} };
  const command = body.command;
  if (command === "check") return { name: "telegram_check_connection", args: {} };
  if (command === "history") return { name: "telegram_list_operations", args: { ...(body.limit !== undefined ? { limit: body.limit } : {}), ...(body.before ? { before: body.before } : {}) } };
  if (command === "operation") return { name: "telegram_get_operation", args: { operation_key: body.key ?? body.operation_key } };
  let method = "", params: Record<string, any> = { ...(body.params ?? {}) };
  if (!body.params || typeof body.params === "object" && !Array.isArray(body.params)) {} else throw new PublisherError("params должен быть объектом.");
  const id = body.id ?? body.message_id;
  const mediaFields: Record<string, string> = { photo: "sendPhoto", video: "sendVideo", document: "sendDocument", audio: "sendAudio", voice: "sendVoice", animation: "sendAnimation", video_note: "sendVideoNote", sticker: "sendSticker" };
  if (command === "call") method = body.method;
  else if (METHODS.some(item => item.method === command)) method = command;
  else if (command === "text") { method = "sendMessage"; params.text = body.text; }
  else if (mediaFields[command]) { method = mediaFields[command]; params[command] = body.file ?? body.media_ref; if (body.caption !== undefined) params.caption = body.caption; if (command === "video" && params.supports_streaming === undefined) params.supports_streaming = true; }
  else if (command === "album") {
    method = "sendMediaGroup";
    params.media = body.media ?? (body.files ?? []).map((item: any, index: number) => ({ type: item.type || "photo", media: item.file ?? item.media, ...(index === 0 && body.caption !== undefined ? { caption: body.caption } : {}), ...(item.caption !== undefined ? { caption: item.caption } : {}), ...(body.parse_mode ? { parse_mode: body.parse_mode } : {}) }));
  } else if (command === "edit") { method = "editMessageText"; params.message_id = id; params.text = body.text; }
  else if (command === "caption") { method = "editMessageCaption"; params.message_id = id; params.caption = body.caption ?? body.text ?? ""; }
  else if (command === "replace") { method = "editMessageMedia"; params.message_id = id; params.media = body.media ?? { type: body.kind || "photo", media: body.file ?? body.media_ref, caption: body.caption ?? "", ...(body.parse_mode ? { parse_mode: body.parse_mode } : {}) }; }
  else if (command === "delete") { method = Array.isArray(body.ids) ? "deleteMessages" : "deleteMessage"; if (Array.isArray(body.ids)) params.message_ids = body.ids; else params.message_id = id; }
  else if (command === "pin" || command === "unpin") { method = command === "pin" ? "pinChatMessage" : "unpinChatMessage"; if (id !== undefined) params.message_id = id; }
  else if (command === "unpin_all") method = "unpinAllChatMessages";
  else if (command === "copy" || command === "forward") { method = command === "copy" ? "copyMessage" : "forwardMessage"; params.from_chat_id = CHAT_ID; params.message_id = id; }
  else if (command === "poll") { method = "sendPoll"; params.question = body.question; params.options = (body.options ?? []).map((option: any) => typeof option === "string" ? { text: option } : option); }
  else if (command === "stop_poll") { method = "stopPoll"; params.message_id = id; }
  else if (command === "buttons") { method = "editMessageReplyMarkup"; params.message_id = id; params.reply_markup = body.reply_markup ?? { inline_keyboard: body.buttons ?? [] }; }
  else if (command === "reaction") { method = "setMessageReaction"; params.message_id = id; params.reaction = body.reaction ?? (body.emoji ? [{ type: "emoji", emoji: body.emoji }] : []); }
  else if (command === "bot") method = "getMe";
  else if (command === "channel") method = "getChat";
  else if (command === "commands") method = "getMyCommands";
  else if (command === "set_commands") { method = "setMyCommands"; params.commands = body.commands; }
  else throw new PublisherError("Неизвестная команда. Смотрите /api/command или edit.py help.");
  if (body.parse_mode && !["sendMediaGroup", "editMessageMedia"].includes(method)) params.parse_mode = body.parse_mode;
  if (body.silent !== undefined) params.disable_notification = body.silent;
  if (body.reply_markup !== undefined) params.reply_markup = body.reply_markup;
  if (body.params) params = { ...params, ...body.params };
  return { name: "telegram_api", args: { method, params, ...(body.key || body.operation_key ? { operation_key: body.key ?? body.operation_key } : {}) } };
}
