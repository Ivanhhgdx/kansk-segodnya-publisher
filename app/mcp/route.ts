import { env } from "cloudflare:workers";
import { safeError, type PublisherEnv } from "../../lib/telegram";
import { dispatchTool } from "../../lib/dispatch";
import { API_HEADERS, options, readJson } from "../../lib/http";
import { TOOLS } from "../../lib/tools";
export const dynamic = "force-dynamic";
export const OPTIONS = options;
export async function POST(request: Request) {
  let rpc: any;
  try { rpc = await readJson(request); if (!rpc || typeof rpc !== "object" || Array.isArray(rpc)) throw new Error(); }
  catch { return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400, headers: API_HEADERS }); }
  const result = (value: unknown) => Response.json({ jsonrpc: "2.0", id: rpc.id ?? null, result: value }, { headers: API_HEADERS });
  if (rpc.method === "server/discover") return result({ supportedVersions: ["2026-07-28"], capabilities: { tools: {} } });
  if (rpc.method === "initialize") return result({ protocolVersion: "2026-07-28", capabilities: { tools: {} }, serverInfo: { name: "edit-kansk-publisher", version: "2.0.0" } });
  if (rpc.method === "notifications/initialized") return new Response(null, { status: 202, headers: API_HEADERS });
  if (rpc.method === "ping") return result({});
  if (rpc.method === "tools/list") return result({ tools: TOOLS });
  if (rpc.method !== "tools/call") return Response.json({ jsonrpc: "2.0", id: rpc.id ?? null, error: { code: -32601, message: "Method not found" } }, { headers: API_HEADERS });
  try {
    const output = await dispatchTool(env as unknown as PublisherEnv, rpc.params?.name, rpc.params?.arguments ?? {});
    return result({ content: [{ type: "text", text: JSON.stringify(output) }], structuredContent: output, isError: false });
  } catch (error) { return result({ content: [{ type: "text", text: safeError(error) }], isError: true }); }
}
