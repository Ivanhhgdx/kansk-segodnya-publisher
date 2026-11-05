import { env } from "cloudflare:workers";
import { Telegram } from "../../../lib/telegram.ts";
import { assetInfo, fileName } from "../../../lib/assets.ts";
import { API_HEADERS, options } from "../../../lib/http.ts";
import { PublisherError, safeError, type PublisherEnv } from "../../../lib/contracts.ts";
export const dynamic = "force-dynamic";
export const OPTIONS = options;
export async function GET(request: Request) {
  try {
    const settings = env as unknown as PublisherEnv, url = new URL(request.url), upload = url.searchParams.get("upload_id");
    if (upload) {
      const file = await assetInfo(settings, upload), object = await settings.BUCKET?.get(file.object_key);
      if (!object) throw new PublisherError("Файл не найден.");
      return new Response(object.body, { headers: { ...API_HEADERS, "Content-Type": file.mime, "Content-Length": String(file.size), "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}` } });
    }
    const fileId = url.searchParams.get("file_id"); if (!fileId) throw new PublisherError("Укажите upload_id или file_id.");
    const file = await new Telegram(settings).call("getFile", { file_id: fileId });
    if (!file.file_path || !/^[A-Za-z0-9_./-]+$/.test(file.file_path) || file.file_path.includes("..")) throw new PublisherError("Telegram не вернул путь файла.");
    const response = await fetch(`https://api.telegram.org/file/bot${settings.TELEGRAM_BOT_TOKEN}/${file.file_path}`, { redirect: "manual", signal: AbortSignal.timeout(120000) });
    if (!response.ok) { await response.body?.cancel(); throw new PublisherError("Telegram не отдал файл."); }
    return new Response(response.body, { headers: { ...API_HEADERS, "Content-Type": response.headers.get("Content-Type") || "application/octet-stream", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName(file.file_path))}` } });
  } catch (error) { return Response.json({ ok: false, error: safeError(error) }, { status: 400, headers: API_HEADERS }); }
}
