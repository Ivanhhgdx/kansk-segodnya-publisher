import { env } from "cloudflare:workers";
import { Publisher, safeError, type PublisherEnv } from "../../../lib/telegram";
import { API_HEADERS, options } from "../../../lib/http";
export const dynamic = "force-dynamic";
export const OPTIONS = options;
export async function POST() {
  try { return Response.json(await new Publisher(env as unknown as PublisherEnv).check(), { headers: API_HEADERS }); }
  catch (error) { return Response.json({ error: safeError(error) }, { status: 400, headers: API_HEADERS }); }
}
