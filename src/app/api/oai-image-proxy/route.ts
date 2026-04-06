import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 300;

export const config = {
  api: { bodyParser: { sizeLimit: "20mb" } },
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { oaiBase, oaiModel, oaiKey, prompt, referenceImages } = body;

    if (!oaiBase || !oaiModel || !oaiKey) {
      return NextResponse.json({ error: "OAI 中转未配置" }, { status: 400 });
    }

    // Build OAI chat message
    let content: unknown;
    if (referenceImages && referenceImages.length > 0) {
      const parts: unknown[] = [];
      for (const ref of referenceImages) {
        const mime = ref.mimeType || "image/png";
        parts.push({
          type: "image_url",
          image_url: { url: `data:${mime};base64,${ref.data}` },
        });
      }
      parts.push({
        type: "text",
        text: `CRITICAL: Follow the reference images above exactly. Same character, face, hairstyle, clothing, art style. Generate: ${prompt}`,
      });
      content = parts;
    } else {
      content = prompt;
    }

    const payload = {
      model: oaiModel,
      messages: [{ role: "user", content }],
    };

    const { Agent, fetch: undiciFetch } = await import("undici");
    const agent = new Agent({ connect: { timeout: 280_000 } });

    const res = await undiciFetch(`${oaiBase}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${oaiKey}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(280_000),
      dispatcher: agent,
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json(
        { error: `OAI API error ${res.status}: ${errText.substring(0, 200)}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    const msgContent = data.choices?.[0]?.message?.content;

    // Extract base64 image from response
    const images: { bytesBase64Encoded: string; mimeType: string }[] = [];

    if (Array.isArray(msgContent)) {
      for (const item of msgContent) {
        if (item.type === "image_url") {
          const url = item.image_url?.url || "";
          if (url.startsWith("data:")) {
            const mimeEnd = url.indexOf(";");
            const mime = url.substring(5, mimeEnd);
            const b64 = url.split(",")[1];
            images.push({ bytesBase64Encoded: b64, mimeType: mime });
          }
        }
      }
    } else if (typeof msgContent === "string" && msgContent.includes("data:image")) {
      const regex = /data:(image\/[a-z]+);base64,([A-Za-z0-9+/=]+)/g;
      let match;
      while ((match = regex.exec(msgContent)) !== null) {
        images.push({ bytesBase64Encoded: match[2], mimeType: match[1] });
      }
    }

    return NextResponse.json({ images });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `OAI proxy error: ${msg}` }, { status: 502 });
  }
}
