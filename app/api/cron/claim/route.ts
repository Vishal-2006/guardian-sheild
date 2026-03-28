import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(request: Request): boolean {
  const configured = process.env.CRON_SECRET;
  if (!configured) {
    return true;
  }

  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${configured}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized cron request." }, { status: 401 });
  }

  try {
    const { createClaimBotRunner, readClaimBotConfig } = await import("@/lib/claim-bot/run-once.mjs");
    const config = readClaimBotConfig();
    const { runOnce } = createClaimBotRunner(config);
    const result = await runOnce();

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown cron error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

