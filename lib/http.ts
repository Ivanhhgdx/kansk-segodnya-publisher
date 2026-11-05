export const API_HEADERS = {
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-File-Name, X-File-Size, Idempotency-Key",
  "X-Content-Type-Options": "nosniff",
};
export function options() { return new Response(null, { status: 204, headers: API_HEADERS }); }
export async function readJson(request: Request): Promise<any> {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) throw new Error("Ожидается Content-Type: application/json.");
  // Read incrementally to avoid allocating arbitrary request sizes.
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Пустой запрос.");
  const parts: Uint8Array[] = []; let length = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    length += value.byteLength;
    if (length > 100000) { await reader.cancel(); throw new Error("Запрос слишком большой."); }
    parts.push(value);
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new Error("Некорректный JSON."); }
}
