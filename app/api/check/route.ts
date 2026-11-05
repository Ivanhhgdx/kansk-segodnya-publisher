import { env } from "cloudflare:workers";
import { Publisher, requireOwner, safeError, type PublisherEnv } from "../../../lib/telegram";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const settings = env as unknown as PublisherEnv;
    requireOwner(request, settings);
    return Response.json(await new Publisher(settings).check(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: safeError(error) }, { status: 400, headers: { "Cache-Control": "no-store" } }); }
}
