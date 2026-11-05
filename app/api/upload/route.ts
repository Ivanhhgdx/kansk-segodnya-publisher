import { env } from "cloudflare:workers";
import { API_HEADERS, options } from "../../../lib/http.ts";
import { saveAsset } from "../../../lib/assets.ts";
import { normalizeCommand } from "../../../lib/commands.ts";
import { dispatchTool } from "../../../lib/dispatch.ts";
import { PublisherError, safeError, type PublisherEnv } from "../../../lib/contracts.ts";
export const dynamic = "force-dynamic";
export const OPTIONS = options;
export async function POST(request: Request) {
  try {
    if (!request.headers.get("Content-Type")?.startsWith("multipart/form-data")) throw new PublisherError("Прикрепите файлы как multipart/form-data.");
    if (!request.body) throw new PublisherError("Пустой запрос.");
    let size = 0;
    const limited = request.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({ transform(chunk, controller) { size += chunk.byteLength; if (size > 60_000_000) throw new PublisherError("За один запрос можно загрузить до 50 МБ файлов. Большие альбомы загружайте через /api/files."); controller.enqueue(chunk); } }));
    const form = await new Request(request.url, { method: "POST", headers: request.headers, body: limited, duplex: "half" } as RequestInit).formData();
    const attached: Record<string, string> = {};
    const body: Record<string, any> = {}, files: { type: string; file: string }[] = [];
    const settings = env as unknown as PublisherEnv;
    for (const [name, value] of form.entries()) {
      if (typeof value === "string") { if (["params", "media", "ids", "reply_markup"].includes(name)) { try { body[name] = JSON.parse(value); } catch { throw new PublisherError(`Неверный JSON в поле ${name}.`); } } else if (name === "id" || name === "message_id") body[name] = Number(value); else if (name === "silent") body[name] = value === "true"; else body[name] = value; }
      else {
        if (files.length >= 10) throw new PublisherError("Не более 10 файлов.");
        const saved = await saveAsset(settings, value.stream(), value.name, value.type, value.size);
        files.push({ type: value.type.startsWith("video/") || /\.(mp4|mov)$/i.test(value.name) ? "video" : value.type.startsWith("audio/") ? "audio" : /\.(jpe?g|png|webp)$/i.test(value.name) || value.type.startsWith("image/") ? "photo" : "document", file: saved.file });
        attached[name] ??= saved.file; attached[`file${files.length - 1}`] = saved.file;
      }
    }
    if (!files.length) throw new PublisherError("Прикрепите хотя бы один файл.");
    if (!body.command) body.command = files.length > 1 ? "album" : files[0].type;
    if (body.command === "upload") return Response.json({ ok: true, result: { files } }, { headers: API_HEADERS });
    if (files.length > 1 && body.command !== "album" && body.command !== "call") throw new PublisherError("Для нескольких файлов выберите album.");
    body.file ??= files[0].file; body.files = files;
    function refs(value: any): any { if (typeof value === "string" && value.startsWith("attach://")) { const file = attached[value.slice(9)]; if (!file) throw new PublisherError("Не найдено вложение: " + value); return file; } if (Array.isArray(value)) return value.map(refs); if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k,v]) => [k,refs(v)])); return value; }
    if (body.params) body.params = refs(body.params);
    if (body.media) body.media = refs(body.media);
    if (!body.key && !body.operation_key) body.key = request.headers.get("Idempotency-Key");
    const operation = normalizeCommand(body);
    return Response.json({ ok: true, result: await dispatchTool(settings, operation.name, operation.args) }, { headers: API_HEADERS });
  } catch (error) { return Response.json({ ok: false, error: safeError(error) }, { status: 400, headers: API_HEADERS }); }
}
