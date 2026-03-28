# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Seedance Studio** — a local video generation workbench that proxies the Seedance 2.0 video API through Zhonglian MAAS. It manages the full workflow: prompt authoring, task creation, polling, auto-download of MP4s, and a local library for preview/playback.

## Architecture

Two-layer system with dual frontends:

- **Python backend** (`server.py`, port 8787): Threaded HTTP server using stdlib only. Acts as reverse proxy to upstream `zlhub.xiaowaiyou.cn`, handles CORS, serves static files, manages local storage (`storage/manifest.json` + `storage/videos/`). Config stored in `.local-secrets.json` (gitignored).
- **Legacy frontend** (root `index.html` + `app.js` + `styles.css`): Vanilla JS/HTML/CSS, served directly by the Python server.
- **Modern frontend** (`oii前端/oiioii-clone/`): Next.js 16 + React 19 + TypeScript + Tailwind CSS 4. Proxies `/api/*` and `/media/*` to localhost:8787 via `next.config.ts` rewrites.

The frontend never holds API tokens directly — all upstream requests go through the Python server.

## Commands

### Python Backend
```bash
python3 server.py          # Start on http://127.0.0.1:8787
```
Environment vars: `VIDEO_CONSOLE_HOST`, `VIDEO_CONSOLE_PORT`, `VIDEO_MODEL_API_KEY`, `CORS_ORIGIN`

### Next.js Frontend (from `oii前端/oiioii-clone/`)
```bash
npm run dev                # Dev server on http://localhost:3001
npm run build              # Production build
npm start                  # Production server
```

## Key Files

| File | Role |
|------|------|
| `server.py` | Backend: routing, API proxy, video download, storage |
| `app.js` | Legacy frontend: all client-side logic |
| `oii前端/oiioii-clone/src/lib/api.ts` | Next.js API client, shared TypeScript types, payload builders |
| `oii前端/oiioii-clone/src/app/page.tsx` | Next.js main page (client component, orchestrates all sections) |
| `oii前端/oiioii-clone/next.config.ts` | Proxy rewrites to backend, allowed image domains |
| `.local-secrets.json` | Local config: api_key, user_id, default_model, auto_save (gitignored) |
| `storage/manifest.json` | Task history and saved asset index |

## API Routes (Python Server)

- `GET /api/config` — server config
- `GET /api/history` — task history from manifest
- `GET /api/library` — saved assets
- `GET /api/tasks/{id}` — proxy upstream task status + auto-download on success
- `POST /api/tasks` — create generation task via upstream
- `POST /api/library/save` — save task video to library
- `POST /api/session/key` — update local API key/config
- `POST /api/open-storage` — open storage dir in OS file explorer
- `GET /media/videos/*` — serve local MP4 files

## Generation Modes

`text`, `first_frame`, `first_last_frame`, `image_to_video`, `video_reference`, `extend_video` — each maps to different `content` reference structures in the upstream API payload.

## Notes

- The Next.js frontend path contains Chinese characters (`oii前端/`). Use quotes when referencing in shell commands.
- The project has a `.claude/launch.json` under `oii前端/` for Claude Preview dev server config (name: `oiioii-dev`, port 3001).
- TypeScript path alias: `@/*` maps to `./src/*` in the Next.js project.
- No test framework is currently configured.


输入输出请用中文回答我
