import { env } from "cloudflare:workers";
import { Publisher, requireOwner, safeError, type PublisherEnv } from "../../../lib/telegram";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const settings = env as unknown as PublisherEnv, caller = requireOwner(request, settings);
    return Response.json(await new Publisher(settings).status(caller), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: safeError(error) }, { status: 403, headers: { "Cache-Control": "no-store" } }); }
}
