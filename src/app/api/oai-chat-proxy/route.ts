import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

// Allow large request bodies (base64 images can be several MB)
export const config = {
  api: { bodyParser: { sizeLimit: "20mb" } },
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { baseUrl, model, apiKey, messages } = body;

    if (!baseUrl || !model || !apiKey) {
      return NextResponse.json({ error: "Missing config" }, { status: 400 });
    }

    const url = baseUrl.includes("/chat/completions")
      ? baseUrl
      : `${baseUrl.replace(/\/+$/, "")}/v1/chat/completions`;

    // Use undici to bypass system proxy (Clash global mode intercepts Node.js fetch)
    const { Agent, fetch: undiciFetch } = await import("undici");
    const agent = new Agent({ connect: { timeout: 280_000 } });

    const res = await undiciFetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages, max_tokens: 8000 }),
      signal: AbortSignal.timeout(280_000),
      dispatcher: agent,
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json(
        { error: `API error ${res.status}: ${errText.substring(0, 200)}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || "";
    return NextResponse.json({ content });
  } catch (err) {
    const msg = err instanceof Error ? `${err.message} [${err.cause ?? ""}]` : String(err);
    console.error("[oai-chat-proxy] Error:", msg);
    return NextResponse.json({ error: `Proxy error: ${msg}` }, { status: 502 });
  }
}
