import { env } from "cloudflare:workers";
import { Publisher, PublisherError, requireOwner, safeError, type PublisherEnv } from "../../lib/telegram";
import { TOOLS } from "../../lib/tools";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let rpc: any;
  try {
    const raw = await request.text();
    if (raw.length > 100000) return Response.json({ error: "Request too large" }, { status: 413 });
    rpc = JSON.parse(raw);
  } catch { return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 }); }
  const result = (value: unknown) => Response.json({ jsonrpc: "2.0", id: rpc.id ?? null, result: value }, { headers: { "Cache-Control": "no-store" } });
  if (rpc.method === "server/discover") return result({ supportedVersions: ["2026-07-28"], capabilities: { tools: {} } });
  if (rpc.method === "initialize") return result({ protocolVersion: "2026-07-28", capabilities: { tools: {} }, serverInfo: { name: "edit-kansk-publisher", version: "1.0.0" } });
  if (rpc.method === "notifications/initialized") return new Response(null, { status: 202 });
  if (rpc.method === "ping") return result({});
  if (rpc.method === "tools/list") return result({ tools: TOOLS });
  if (rpc.method !== "tools/call") return Response.json({ jsonrpc: "2.0", id: rpc.id ?? null, error: { code: -32601, message: "Method not found" } });
  try {
    const settings = env as unknown as PublisherEnv, caller = requireOwner(request, settings);
    const name = rpc.params?.name, args = rpc.params?.arguments ?? {};
    const tool = TOOLS.find(t => t.name === name);
    if (!tool) throw new PublisherError("Неизвестный инструмент.");
    if (!args || typeof args !== "object" || Array.isArray(args) || Object.keys(args).some(k => !Object.hasOwn(tool.inputSchema.properties, k))) throw new PublisherError("Недопустимые параметры инструмента.");
    const publisher = new Publisher(settings);
    let output: unknown;
    if (name === "telegram_check_connection") output = await publisher.check();
    else if (name === "telegram_list_operations") output = { operations: await publisher.recent(caller) };
    else if (name === "telegram_get_operation") {
      if (typeof args.operation_key !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(args.operation_key)) throw new PublisherError("Неверный ключ операции.");
      output = await publisher.operation(caller, args.operation_key);
    } else output = await publisher.execute(caller, name, args);
    return result({ content: [{ type: "text", text: JSON.stringify(output) }], structuredContent: output, isError: false });
  } catch (error) {
    return result({ content: [{ type: "text", text: safeError(error) }], isError: true });
  }
}
