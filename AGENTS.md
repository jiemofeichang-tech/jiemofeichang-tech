# Repository Guidelines

## Project Structure & Module Organization
This repository combines a Python backend with a Next.js frontend.

- Root Python services: `server.py`, `script_engine.py`, `character_factory.py`, `storyboard_generator.py`, `video_composer.py`
- Frontend app: `src/` (`app/`, `components/`, `lib/`, `types/`)
- Static assets: `public/`
- Tests: `tests/` (`test_*.py` for backend/unit tests, `*.mjs` for Playwright-style functional checks)
- Runtime data: `storage/` and `.local-secrets.json`
- Design and API notes: `docs/`
- Legacy reference UI: `Backend/old-frontend/`

Do not edit generated or runtime-only folders such as `.next/`, `storage/`, or log files unless the task explicitly requires it.

## Build, Test, and Development Commands
- `python server.py` — start the backend on `127.0.0.1:8787`
- `npm run dev` — start the Next.js frontend on `localhost:3001`
- `npm run build` — run the frontend production build and TypeScript checks
- `python -m unittest discover -s tests -v` — run backend/unit test coverage
- `node tests/functional_test.mjs` — run browser-based functional checks against a live app

Run backend and frontend together for local development; the frontend expects the Python API to be available.

## Startup Troubleshooting Notes
If the task is to start the repo or diagnose boot failures, read `docs/启动问题记录-20260329.md` first. It records the confirmed 2026-03-29 fixes, including invalid task ID handling and the Windows requirement to use `npm.cmd` for background frontend startup.

## Coding Style & Naming Conventions
- Python: 4-space indentation, `snake_case` for functions/files, small focused helpers
- TypeScript/React: 2-space indentation is the existing style, `PascalCase` for components, `camelCase` for functions/hooks
- Test files use `test_*.py`; React pages follow Next.js conventions under `src/app/**/page.tsx`

No dedicated formatter or linter is configured. Use `npm run build` and unit tests as the main correctness gates.

## Testing Guidelines
Prefer targeted unit tests for backend behavior and regression coverage for API routes. Add new tests next to related files in `tests/`.

Examples:
- `python -m unittest tests.test_task_routes -v`
- `python -m unittest tests.test_pipeline_routes -v`

When changing UI behavior, add or update a Playwright script in `tests/*.mjs` if the flow is user-visible.

## Commit & Pull Request Guidelines
The existing history uses Conventional Commit prefixes, for example: `feat: AI漫剧生成工作流 Phase 1 MVP`.

Use short imperative subjects such as:
- `fix: avoid upstream lookup for invalid task ids`
- `test: add regression coverage for task routes`

PRs should include:
- a brief summary of behavior changes
- test/build commands run
- screenshots for visible UI changes
- any config or migration notes (`.local-secrets.json`, MySQL, upstream API requirements)

## Security & Configuration Tips
Keep secrets in `.local-secrets.json`; never commit real API keys or database credentials. Verify local MySQL and upstream network access before debugging application logic.

## 语言规则

所有回答必须全部使用中文。
