import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300; // 5 minutes
export const dynamic = "force-dynamic";

const BACKEND = "http://127.0.0.1:8787";

async function handler(req: NextRequest) {
  const url = new URL(req.url);
  // /api/proxy/grid/generate → /api/grid/generate
  const backendPath = url.pathname.replace("/api/proxy", "/api");
  const target = `${BACKEND}${backendPath}${url.search}`;

  const headers: Record<string, string> = {
    "Content-Type": req.headers.get("content-type") || "application/json",
  };
  // Forward cookies for auth
  const cookie = req.headers.get("cookie");
  if (cookie) headers["Cookie"] = cookie;

  const body = req.method !== "GET" && req.method !== "HEAD" ? await req.arrayBuffer() : undefined;

  try {
    const resp = await fetch(target, {
      method: req.method,
      headers,
      body: body ? Buffer.from(body) : undefined,
    });

    const data = await resp.arrayBuffer();
    const respHeaders = new Headers();
    resp.headers.forEach((v, k) => {
      if (k.toLowerCase() !== "transfer-encoding") respHeaders.set(k, v);
    });
    // Forward Set-Cookie
    const setCookie = resp.headers.get("set-cookie");
    if (setCookie) respHeaders.set("set-cookie", setCookie);

    return new NextResponse(Buffer.from(data), {
      status: resp.status,
      headers: respHeaders,
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Backend unreachable: ${err}` },
      { status: 502 }
    );
  }
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
