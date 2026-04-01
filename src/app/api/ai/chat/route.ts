import { NextRequest, NextResponse } from "next/server";

// Allow up to 5 minutes for AI responses
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const res = await fetch("http://127.0.0.1:8787/api/ai/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Forward cookies for session auth (not needed for AI chat but keep for consistency)
        ...(req.headers.get("cookie") ? { cookie: req.headers.get("cookie")! } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(280_000), // 280s
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `AI proxy error: ${msg}` }, { status: 502 });
  }
}
