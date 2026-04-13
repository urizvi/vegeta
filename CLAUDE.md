# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev      # start dev server (Turbopack) at http://localhost:3000
npm run build    # production build
npm run start    # start production server
npm run lint     # run ESLint
```

There is no test suite configured yet.

## Architecture

This is a **Next.js 16** app using the **App Router** with **React 19** and **TypeScript**. Styling is done with **Tailwind CSS v4** (PostCSS plugin via `@tailwindcss/postcss`).

- `app/` — App Router root. `layout.tsx` is the root layout (sets Geist fonts, global CSS). `page.tsx` is the `/` route.
- `app/globals.css` — global styles, Tailwind base imports.
- `next.config.ts` — Next.js config; `turbopack.root` is explicitly set to the project directory to avoid workspace-root detection warnings from a parent-level lockfile.
- Path alias `@/*` maps to the repo root (e.g. `@/app/...`, `@/components/...`).
- `public/` — static assets served at `/`.

When adding new routes, create a directory under `app/` with a `page.tsx`. Shared UI should go in a `components/` directory at the repo root (not yet created).
