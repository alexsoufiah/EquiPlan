# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev      # Start dev server at http://localhost:3000
npm run build    # Production build
npm run start    # Run production build
npm run lint     # ESLint
```

After changing `lib/db.ts` or when the app behaves unexpectedly after code changes:
```bash
rm -rf .next && npm run dev
```

## Architecture

**EquiPlan** — internal scheduling app for equestrian events (Pferdesport/Reitturniere).

### Stack
- **Next.js 15** (App Router) — pinned to 15 because Node 20.5.0 doesn't satisfy Next 16's `>=20.9.0` requirement
- **SQLite** via `better-sqlite3` (synchronous) — DB file at `data/pferdeplan.db`
- **JWT** sessions via `jose` in httpOnly cookies (`session`)
- **bcryptjs** for password hashing
- **web-push** + Service Worker (`public/sw.js`) for push notifications
- **Tailwind CSS v4** — dark mode uses `.dark` class on `<html>`, requires `@custom-variant dark (&:where(.dark, .dark *))` in `globals.css`

### Key files
| File | Purpose |
|------|---------|
| `lib/db.ts` | SQLite setup, all table definitions, migrations, seed data |
| `lib/auth.ts` | JWT session type, token create/verify, password utils |
| `lib/theme.tsx` | `ThemeProvider` + `useTheme()` hook — persists to `localStorage` as `"equiplan-theme"` |
| `lib/push.ts` | VAPID key auto-generation, broadcast push to all subscriptions |
| `app/page.tsx` | Entire frontend SPA (~1400 lines, all components in one file) |
| `app/share/[token]/page.tsx` | Public animated display board (no auth required) |
| `next.config.ts` | `serverExternalPackages` for `better-sqlite3`, `bcryptjs`, `web-push` |

### Data model
- **tournaments** → many **schedule_entries** (via `tournament_id`)
- **schedule_entries** ↔ **teams** via junction table `schedule_entry_teams` (many-to-many)
- **speakers** — named individuals with `color`, `role`, `password_hash`
- **settings** table — stores `admin_password`, `viewer_password`, VAPID keys, API key
- **share_token** column on tournaments — 16-byte hex; enables public `/share/[token]` page

### Auth roles
`admin | viewer | team | speaker` — all use a single password field at `/api/auth` (POST). The endpoint checks admin → viewer → teams (by password_hash) → speakers (by password_hash) in order.

Team and speaker sessions carry extra JWT claims (`teamId/teamName` or `speakerId/speakerName/speakerColor`). These are used in `app/page.tsx` to highlight the logged-in entity's entries.

### Critical patterns

**Date arithmetic** — never use `toISOString()` for local date math (UTC offset shifts dates). Always use:
```js
function addDays(date: string, n: number) {
  const [y, m, d] = date.split("-").map(Number);
  const nd = new Date(y, m - 1, d + n);
  return `${nd.getFullYear()}-${String(nd.getMonth()+1).padStart(2,"0")}-${String(nd.getDate()).padStart(2,"0")}`;
}
```

**Stale closures in useEffect** — `activeTournament` state is mirrored to `activeTournamentRef = useRef()` so date-change effects can read the current tournament without being in the dependency array.

**Rules of Hooks** — `useTheme()` must be called at the very top of `App()` before any `useState`/`useEffect` or early returns.

**Dark mode inputs** — always include explicit background/text classes:
```
bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
```

**Third-party import** — `POST /api/import` upserts by `pruefungs_id`, authenticated via `x-api-key` header. Accepts `team_name` (single) or `team_names` (array).

**Onboarding state** — stored in localStorage under key `"equiplan-onboarded-v1"` per role.
