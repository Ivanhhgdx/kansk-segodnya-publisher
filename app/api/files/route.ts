import { env } from "cloudflare:workers";
import { assetInfo, saveAsset } from "../../../lib/assets.ts";
import { API_HEADERS, options } from "../../../lib/http.ts";
import { PublisherError, safeError, type PublisherEnv } from "../../../lib/contracts.ts";
export const dynamic = "force-dynamic";
export const OPTIONS = options;
export async function POST(request: Request) {
  try {
    const filename = decodeURIComponent(request.headers.get("X-File-Name") || new URL(request.url).searchParams.get("name") || "file");
    const length = request.headers.get("X-File-Size") ?? request.headers.get("Content-Length");
    const result = await saveAsset(env as unknown as PublisherEnv, request.body, filename, request.headers.get("Content-Type") || "", length === null ? undefined : Number(length));
    return Response.json({ ok: true, result }, { headers: API_HEADERS });
  } catch (error) { return Response.json({ ok: false, error: error instanceof PublisherError ? safeError(error) : "Ошибка загрузки файла." }, { status: 400, headers: API_HEADERS }); }
}
export async function GET(request: Request) {
  try {
    const settings = env as unknown as PublisherEnv, id = new URL(request.url).searchParams.get("id");
    if (id) { const file = await assetInfo(settings, id); return Response.json({ ok: true, result: { file: `upload:${file.id}`, filename: file.filename, size: file.size, mime: file.mime, sha256: file.sha256 } }, { headers: API_HEADERS }); }
    const files = await settings.DB.prepare("SELECT id, filename, mime, size, created_at FROM assets ORDER BY created_at DESC LIMIT 100").all();
    return Response.json({ ok: true, result: { files: files.results } }, { headers: API_HEADERS });
  } catch (error) { return Response.json({ ok: false, error: safeError(error) }, { status: 400, headers: API_HEADERS }); }
}
