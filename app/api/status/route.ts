import { env } from "cloudflare:workers";
import { Publisher, PUBLIC_CALLER, safeError, type PublisherEnv } from "../../../lib/telegram";
import { API_HEADERS, options } from "../../../lib/http";
export const dynamic = "force-dynamic";
export const OPTIONS = options;
export async function GET() {
  try { return Response.json(await new Publisher(env as unknown as PublisherEnv).status(PUBLIC_CALLER), { headers: API_HEADERS }); }
  catch (error) { return Response.json({ error: safeError(error) }, { status: 500, headers: API_HEADERS }); }
}
