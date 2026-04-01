const faviconSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FF8C00" />
      <stop offset="100%" stop-color="#FFA500" />
    </linearGradient>
  </defs>
  <rect width="64" height="64" rx="16" fill="url(#bg)" />
  <circle cx="32" cy="34" r="18" fill="#FFD700" />
  <ellipse cx="32" cy="34" rx="14" ry="14" fill="#FFA500" />
  <path d="M30 14 Q32 6 34 14" fill="none" stroke="#228B22" stroke-width="3" stroke-linecap="round" />
  <ellipse cx="36" cy="16" rx="5" ry="3" fill="#32CD32" transform="rotate(-30 36 16)" />
  <text x="32" y="42" text-anchor="middle" fill="white" font-size="14" font-weight="800" font-family="sans-serif">聚</text>
</svg>
`.trim();

export function GET() {
  return new Response(faviconSvg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
