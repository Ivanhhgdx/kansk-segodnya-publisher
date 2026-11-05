import { env } from "cloudflare:workers";
import { dispatchTool } from "../../../lib/dispatch.ts";
import { normalizeCommand, SHORT_COMMANDS } from "../../../lib/commands.ts";
import { METHODS } from "../../../lib/methods.ts";
import { API_HEADERS, options, readJson } from "../../../lib/http.ts";
import { PublisherError, safeError, CHANNEL, type PublisherEnv } from "../../../lib/contracts.ts";
export const dynamic = "force-dynamic";
export const OPTIONS = options;
export function GET() {
  return Response.json({
    name: "Канск Сегодня — команды", version: "4", channel: CHANNEL,
    endpoint: "https://edit-kansk-publisher.ivanfomin2003.chatgpt.site/api/command", method: "POST",
    guide: "https://ivanhhgdx.github.io/kansk-segodnya-publisher/agent.md",
    client: "https://ivanhhgdx.github.io/kansk-segodnya-publisher/edit.py",
    examples: [{ command: "check" }, { command: "text", text: "Текст поста", key: "news-001" }, { command: "delete", id: 123, key: "delete-123" }, { command: "call", method: "getMyCommands", params: {} }],
    commands: SHORT_COMMANDS, methods: METHODS,
    files: { direct: "POST /api/upload: multipart/form-data с полями command, key, caption и file (обычный файл)", staged: "POST /api/files: байты файла; X-File-Name, X-File-Size, Content-Type. Полученный file передать команде.", examples: ['python3 edit.py photo /path/image.jpg -c "Подпись"', 'python3 edit.py video /path/clip.mp4 -c "Подпись"', 'python3 edit.py album a.jpg b.jpg clip.mp4'], max_photo_bytes: 10000000, max_file_bytes: 50000000, album_count: [2, 10] },
    results: "Возвращаются status, operation_key, номер и ссылка поста, полный результат Telegram в data. Для альбомов — messages.",
    retries: "Сохраняйте operation_key. После потери ответа проверьте command=operation с тем же key. pending/uncertain не повторять новым ключом до выяснения результата.",
    history: "history показывает команды этой системы. Метода чтения всей старой истории канала в Bot API нет.",
    limits: "Доступность отдельных методов зависит от прав бота и правил Telegram. Удаление обычно возможно до 48 часов. getUpdates и webhook взаимоисключающие; offset подтверждает обработку обновлений.",
  }, { headers: API_HEADERS });
}
export async function POST(request: Request) {
  let body: any;
  try { body = await readJson(request); }
  catch (error) { return Response.json({ ok: false, error: (error as Error).message }, { status: 400, headers: API_HEADERS }); }
  try {
    if (body && !body.key && !body.operation_key && request.headers.has("Idempotency-Key")) body.key = request.headers.get("Idempotency-Key");
    const operation = normalizeCommand(body);
    const result = await dispatchTool(env as unknown as PublisherEnv, operation.name, operation.args);
    return Response.json({ ok: true, result }, { headers: API_HEADERS });
  } catch (error) { return Response.json({ ok: false, error: safeError(error) }, { status: error instanceof PublisherError ? 400 : 500, headers: API_HEADERS }); }
}
