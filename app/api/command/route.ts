import { env } from "cloudflare:workers";
import { dispatchTool } from "../../../lib/dispatch";
import { API_HEADERS, options, readJson } from "../../../lib/http";
import { PublisherError, safeError, CHANNEL, type PublisherEnv } from "../../../lib/telegram";
import { TOOLS } from "../../../lib/tools";
export const dynamic = "force-dynamic";
export const OPTIONS = options;
export function GET() {
  return Response.json({
    name: "Канск Сегодня — публичная система публикации", authentication: "none", channel: CHANNEL,
    endpoint: "https://edit-kansk-publisher.ivanfomin2003.chatgpt.site/api/command", method: "POST",
    content_type: "application/json", request: { action: "telegram_check_connection", arguments: {} },
    tools: TOOLS,
    rules: ["Подключение работает в облаке; Mac и плагин не нужны.", "Любой посетитель может публиковать и редактировать.", "Для публикаций и правок обязателен постоянный operation_key.", "После тайм-аута сначала telegram_get_operation с прежним ключом. pending/uncertain запрещают повтор до выяснения результата.", "Медиа: прямая HTTPS-ссылка или Telegram file_id; локальные файлы и альбомы не поддерживаются.", "При проверке подключения не создавать тестовые посты и не менять существующие посты."],
  }, { headers: API_HEADERS });
}
export async function POST(request: Request) {
  let body: any;
  try { body = await readJson(request); }
  catch (error) { return Response.json({ ok: false, error: (error as Error).message }, { status: 400, headers: API_HEADERS }); }
  try {
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(k => !["action", "arguments"].includes(k))) throw new PublisherError("Ожидаются action и arguments.");
    const result = await dispatchTool(env as unknown as PublisherEnv, body.action, body.arguments ?? {});
    return Response.json({ ok: true, result }, { headers: API_HEADERS });
  } catch (error) { return Response.json({ ok: false, error: safeError(error) }, { status: error instanceof PublisherError ? 400 : 500, headers: API_HEADERS }); }
}
