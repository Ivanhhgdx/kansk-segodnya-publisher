import { createHash } from "node:crypto";
import { PublisherError, type PublisherEnv } from "./contracts.ts";
export const MAX_FILE_BYTES = 50_000_000;
export type Asset = { id: string; object_key: string; filename: string; mime: string; size: number; sha256: string; created_at: string };
export type Attachment = { field: string; asset: Asset; body: ReadableStream<Uint8Array> };
export function fileName(value: string) { return value.split(/[\\/]/).at(-1)!.replace(/[\x00-\x1f\x7f"\\]/g, "_").slice(0, 180) || "file"; }
export function mimeFor(name: string, input = "") {
  if (/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(input) && input !== "application/octet-stream") return input;
  const extension = name.toLowerCase().split(".").at(-1) || "";
  return ({ jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", mp4: "video/mp4", mov: "video/quicktime", gif: "image/gif", mp3: "audio/mpeg", m4a: "audio/mp4", ogg: "audio/ogg", pdf: "application/pdf" } as Record<string, string>)[extension] || "application/octet-stream";
}
export async function saveAsset(env: PublisherEnv, body: ReadableStream<Uint8Array> | null, filename: string, mime: string, expectedSize?: number) {
  if (!env.BUCKET) throw new PublisherError("Хранилище файлов ещё не подключено.");
  if (!body || expectedSize === 0) throw new PublisherError("Файл пуст.");
  if (expectedSize !== undefined && (!Number.isSafeInteger(expectedSize) || expectedSize < 0 || expectedSize > MAX_FILE_BYTES)) throw new PublisherError("Размер файла должен быть от 1 байта до 50 МБ.");
  const id = crypto.randomUUID(), objectKey = `files/${id}`, hash = createHash("sha256"); let size = 0;
  const stream = body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({ transform(chunk, controller) {
    size += chunk.byteLength;
    if (size > MAX_FILE_BYTES) throw new PublisherError("Файл превышает 50 МБ.");
    hash.update(chunk); controller.enqueue(chunk);
  } }));
  try {
    if (expectedSize === undefined) throw new PublisherError("Передайте размер файла в Content-Length или X-File-Size.");
    if (typeof FixedLengthStream !== "undefined") {
      const fixed = new FixedLengthStream(expectedSize), abort = new AbortController();
      const pumping = stream.pipeTo(fixed.writable, { signal: abort.signal });
      pumping.catch(() => {});
      try { await Promise.all([env.BUCKET.put(objectKey, fixed.readable, { httpMetadata: { contentType: mimeFor(filename, mime) } }), pumping]); }
      finally { abort.abort(); }
    } else await env.BUCKET.put(objectKey, stream, { httpMetadata: { contentType: mimeFor(filename, mime) } });
    if (!size || expectedSize !== undefined && size !== expectedSize) throw new PublisherError("Файл получен не полностью.");
    const asset: Asset = { id, object_key: objectKey, filename: fileName(filename), mime: mimeFor(filename, mime), size, sha256: hash.digest("hex"), created_at: new Date().toISOString() };
    await env.DB.prepare("INSERT INTO assets (id, object_key, filename, mime, size, sha256, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(asset.id, asset.object_key, asset.filename, asset.mime, asset.size, asset.sha256, asset.created_at).run();
    return { file: `upload:${id}`, upload_id: id, filename: asset.filename, size: asset.size, mime: asset.mime, sha256: asset.sha256 };
  } catch (error) {
    await env.BUCKET.delete(objectKey).catch(() => {});
    if (error instanceof PublisherError) throw error;
    throw new PublisherError("Не удалось сохранить файл. Повторите загрузку файла; команда публикации не выполнялась.");
  }
}
export async function assetInfo(env: PublisherEnv, value: string): Promise<Asset> {
  const id = value.replace(/^upload:/, "");
  if (!/^[a-f0-9-]{36}$/i.test(id)) throw new PublisherError("Неверный номер загруженного файла.");
  const result = await env.DB.prepare("SELECT * FROM assets WHERE id = ?").bind(id).first<Asset>();
  if (!result) throw new PublisherError("Загруженный файл не найден. Прикрепите его заново.");
  return result;
}
export async function prepareAssets(env: PublisherEnv, params: Record<string, unknown>) {
  const attachments: { field: string; asset: Asset }[] = [], known = new Map<string, string>();
  async function walk(value: unknown): Promise<unknown> {
    if (typeof value === "string" && /^upload:/.test(value)) {
      if (known.has(value)) return `attach://${known.get(value)}`;
      const asset = await assetInfo(env, value), field = `file${attachments.length}`;
      known.set(value, field); attachments.push({ field, asset }); return `attach://${field}`;
    }
    if (Array.isArray(value)) return Promise.all(value.map(walk));
    if (value && typeof value === "object") { const result: Record<string, unknown> = {}; for (const [key, item] of Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) result[key] = await walk(item); return result; }
    return value;
  }
  const prepared = await walk(params) as Record<string, unknown>;
  // Content hashes keep the same operation stable when identical files are uploaded again.
  const fingerprintFiles = attachments.map(x => ({ field: x.field, sha256: x.asset.sha256, size: x.asset.size }));
  return { params: prepared, attachments, fingerprintFiles };
}
export async function openAttachments(env: PublisherEnv, files: { field: string; asset: Asset }[]): Promise<Attachment[]> {
  if (files.length && !env.BUCKET) throw new PublisherError("Хранилище файлов недоступно.");
  const opened: Attachment[] = [];
  for (const file of files) {
    const metadata = await env.BUCKET!.head(file.asset.object_key);
    if (!metadata || metadata.size !== file.asset.size) throw new PublisherError(`Файл «${file.asset.filename}» недоступен. Прикрепите его заново.`);
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    // Open one object at a time, including for ten-file albums.
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          if (!reader) { const object = await env.BUCKET!.get(file.asset.object_key); if (!object) throw new PublisherError("Файл недоступен."); reader = object.body.getReader(); }
          const chunk = await reader.read();
          if (chunk.done) { reader.releaseLock(); controller.close(); } else controller.enqueue(chunk.value);
        } catch (error) { controller.error(error); }
      },
      async cancel() { await reader?.cancel().catch(() => {}); }
    }, { highWaterMark: 0 });
    opened.push({ ...file, body });
  }
  return opened;
}
export function multipartBody(params: Record<string, unknown>, files: Attachment[]) {
  const boundary = `edit-${crypto.randomUUID()}`, encoder = new TextEncoder();
  const fields = Object.entries(params).filter(([,value]) => value !== undefined && value !== null).map(([name, value]) => encoder.encode(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${typeof value === "object" ? JSON.stringify(value) : String(value)}\r\n`));
  const headers = files.map(file => encoder.encode(`--${boundary}\r\nContent-Disposition: form-data; name="${file.field}"; filename="${fileName(file.asset.filename)}"\r\nContent-Type: ${file.asset.mime}\r\n\r\n`));
  const crlf = encoder.encode("\r\n"), end = encoder.encode(`--${boundary}--\r\n`);
  const length = fields.reduce((n,x) => n + x.byteLength, 0) + files.reduce((n,file,index) => n + headers[index].byteLength + file.asset.size + crlf.byteLength, 0) + end.byteLength;
  async function* chunks() {
    for (const field of fields) yield field;
    for (let i = 0; i < files.length; i++) {
      yield headers[i]; const reader = files[i].body.getReader();
      try { while (true) { const item = await reader.read(); if (item.done) break; yield item.value; } }
      finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
      yield crlf;
    }
    yield end;
  }
  const iterator = chunks();
  const stream = new ReadableStream<Uint8Array>({ async pull(controller) { try { const next = await iterator.next(); if (next.done) controller.close(); else controller.enqueue(next.value); } catch (error) { controller.error(error); } }, async cancel() { await iterator.return(); } });
  if (typeof FixedLengthStream !== "undefined") {
    const fixed = new FixedLengthStream(length), abort = new AbortController();
    const done = stream.pipeTo(fixed.writable, { signal: abort.signal }); done.catch(() => {});
    return { body: fixed.readable, contentType: `multipart/form-data; boundary=${boundary}`, done, cancel: () => abort.abort() };
  }
  return { body: stream, contentType: `multipart/form-data; boundary=${boundary}`, done: Promise.resolve(), cancel: () => {} };
}
