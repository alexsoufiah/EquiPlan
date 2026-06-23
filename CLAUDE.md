# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev      # Dev server at http://localhost:3000
npm run build    # Production build (also full type-check)
npm run start    # Run the production build
npm run lint     # ESLint
```

After changing `lib/db.ts`, or when the app behaves oddly after edits, clear the build cache:
```bash
rm -rf .next && npm run dev
```
Don't run `npm run build` while a dev server is running on the same checkout — both write `.next` and the build fails with a spurious `PageNotFoundError`. Stop the dev server first.

## Workflow

- **Deployment**: Railway auto-deploys on push to `main` (the owner pushes directly to `main`; no separate Vercel/PR step).
- **Before pushing**: `npm run build` must be green and the change should be verified on a local preview when it's observable in the browser.
- **Lint baseline is not clean**: `npm run lint` reports a standing set of `react-hooks/set-state-in-effect` errors from the load-on-mount `fetch().then(setState)` pattern, plus a few `<img>` / `prefer-const` items. The bar is "no *new* error types in the files you touched", not zero.
- `better-sqlite3` is compiled per Node ABI. Local Node may differ from the deploy target — run `npm rebuild better-sqlite3` if it fails to load locally.

## Architecture

**EquiPlan** — internal scheduling PWA for equestrian events (Pferdesport/Reitturniere). A single Next.js process serves both the React UI and the API; SQLite is the only datastore. There is no separate backend.

### Stack
- **Next.js 15** (App Router) — pinned to 15 because the deploy Node (20.5.0) doesn't satisfy Next 16's `>=20.9.0`.
- **SQLite** via `better-sqlite3` (synchronous, so route handlers read/write inline, no `await` on queries). DB at `${DB_DIR}/pferdeplan.db` (`DB_DIR` points at the Railway volume in prod).
- **JWT** sessions via `jose` in an httpOnly `session` cookie; **bcryptjs** for password hashes.
- **web-push** + Service Worker (`public/sw.js`); **Resend** for email; **DeepL** for i18n.
- **Tailwind v4** — dark mode via `.dark` on `<html>`; needs `@custom-variant dark (&:where(.dark, .dark *))` in `globals.css`.
- `next.config.ts` lists `better-sqlite3`, `bcryptjs`, `web-push` in `serverExternalPackages`.

### Frontend shape
- `app/page.tsx` is the **entire authenticated SPA** (~3800 lines, every component in one file). It is `"use client"` and renders by role/view; there's no routing inside it.
- `app/share/[token]/page.tsx` is a **separate public display board** (no auth), driven by `/api/public/[token]`.
- Both consume the same live-update channel (see Real-time).

### Authorization model (security-critical)
The session `role` is `admin | viewer | team | speaker | helper`. The non-obvious part:

- A single `role: "admin"` covers **two** privilege levels, distinguished only by `session.adminTournamentId`:
  - **super-admin** → `adminTournamentId == null` (full access),
  - **show-admin** → `adminTournamentId` set (scoped to one tournament).
- The frontend merely navigates a show-admin to their tournament — it does **not** enforce scope. **Every tournament-bound mutation must gate with `canManageTournament(session, tournamentId)` from `lib/auth.ts`** (returns false for non-admins, true for super-admin, and only the matching id for a show-admin). This guard is applied on: `tournaments/[id]`, `.../share`, `.../staff`, `schedule` (+`[id]`, +`[id]/delay`), `delays`, `contacts`, `shifts` (+`/assignments`, `/notify`), and `documents` (+`/[id]`). Add it to any new tournament-scoped endpoint; do not rely on `role === "admin"` alone.
- For **read** endpoints, Show-Admins must also be scoped: either enforce `canManageTournament` or overwrite `tournament_id` with `session.adminTournamentId` before querying (see `schedule/route.ts` GET and `shifts/route.ts` GET for the pattern).
- Global resources (helpers, teams, speakers, arenas) are intentionally shared across all admins.

### Auth flow
- `POST /api/auth` checks **email-branch first**: if `email` is present it's a **helper login** (email + password against `helpers`). Otherwise password-only, tried in order: legacy admin password → `admins` rows (show/super) → viewer password → teams → speakers (by `password_hash`).
- Cookie options live in one `COOKIE` const in `app/api/auth/route.ts` (includes `secure` in production).
- `lib/auth.ts` owns the `Session` type and `getSession()`/`verifySession()`; admin/viewer passwords are bcrypt hashes in the `settings` table (defaults `admin123`/`viewer123` seeded on first run).

### Data model
- **tournaments** → many **schedule_entries** (`tournament_id`). Entries ↔ **teams** via junction **schedule_entry_teams** (the old per-entry `team_id` was migrated into this junction).
- **speakers**, **arenas** — global, attached to entries by id.
- **Central helper roster**: **helpers** (email-unique, has account) ↔ teams via **team_members** and **team_leads** (≤3 responsibles, capped in the API). **shifts** + **shift_assignments** track work; public sign-ups land in **event_helpers** and auto-create a shift.
- **contacts** (per-tournament phone list), **arena_delays** (per tournament/day/arena; `arena_id = 0` = whole day), **custom_phases**, **change_log**, **notifications_log** (email/push audit), **admins**, **documents** (PDFs, general / per-tournament / per-entry), **settings** (passwords, VAPID keys, `api_key`).
- Tournaments carry **`share_token`** (public board) and **`staff_token`** (internal board that additionally shows the phone list). `/api/public/[token]` resolves **either**.

### DB migrations (`lib/db.ts`)
- `getDb()` lazily opens the DB, runs `initSchema()`, then sets `PRAGMA foreign_keys = ON` **after** migrations — order matters because the one-time `schedule_entries` rebuild (below) must run without cascades. New code can rely on `ON DELETE CASCADE/SET NULL` actually firing.
- Migrations are idempotent: each `ALTER TABLE ... ADD COLUMN` is guarded by a `PRAGMA table_info(...)` check.
- SQLite can't drop a `CHECK` via `ALTER`, so an old `CHECK(phase IN (...))` on `schedule_entries` is removed by rebuilding the table in a transaction (it once silently blocked `siegerehrung`/custom phases). Touch this block with care.

### Real-time + push
- Mutations call `broadcast("update", ...)` (`lib/sse.ts`); `page.tsx` and the share board subscribe to `GET /api/events` (SSE) with a 30s fallback poll + refetch on focus/visibility.
- **`GET /api/events` is intentionally auth-free** — the public share board uses it without a session cookie. Do not add a session check to GET. `POST /api/events` requires admin.
- **The share board must not reset transient view state on every refresh** — reveal animation runs once (`revealedOnceRef`) and auto-scroll only fires on navigation (`shouldScrollRef`), or the board flickers/jumps every 30s for spectators.
- `push_subscriptions` store `role/team_id/speaker_id/helper_id`. Use `sendTargetedPush({teamIds, speakerId})` / `sendPushToHelpers(ids)` for scoped delivery (admins are intentionally not notified of their own edits). Senders in `lib/push.ts` **never throw** (so an awaited push can't 500 a committed write) and only delete a subscription on HTTP **404/410**.

### Email + encrypted secrets
- `lib/email.ts` (`sendEmail`) posts to Resend, logs every attempt to `notifications_log`, and **skips gracefully without `RESEND_API_KEY`**. The sandbox sender only delivers to the account owner until a domain is verified (set `RESEND_FROM`).
- Generated helper passwords are stored **encrypted at rest** (`lib/crypto.ts`, AES-256-GCM, key derived from `JWT_SECRET`/`HELPER_PW_SECRET`). The admin "reveal" endpoint decrypts on demand. `decryptSecret` passes through legacy plaintext unchanged, so no data migration is needed — but the key must stay stable or previously-encrypted values become unreadable.

### Icon & motion systems
- **No emojis in the UI.** `lib/icons.tsx` exports one `<Icon name="..." size={} />` family (hand-authored stroke SVGs, Lucide-grammar, `currentColor`). Add new glyphs there; the few remaining `lucide-react` imports in the header share the same grammar.
- Motion lives in `app/globals.css` as `eq-*` classes (`eq-fade-up`, `eq-sheet`, `eq-pop`, `eq-draw`, `eq-wave`, `eq-ring`, `eq-live`, …) — GPU-only (`transform`/`opacity`), exponential ease-out, with `prefers-reduced-motion` fallbacks. Press feedback is `active:scale-*` on buttons.

### i18n
- `lib/i18n.tsx` (`useLang`) is a DOM translator: it walks text nodes and translates via `/api/translate` (DeepL), caching each phrase in the `translations` table. Mark brand/proper nouns with `data-no-translate`.

### Third-party import
- `POST /api/import` (header `x-api-key`, key in `settings.api_key`) upserts schedule entries by `pruefungs_id`; accepts a single object or array, `team_name`/`team_names`, resolves arena/team by name. Phase is restricted to `aufbau|wettkampf|abbau|pause` (not custom phases).

## Critical patterns

**Tournament scope** — gate every tournament-bound write with `canManageTournament(session, id)` (see Authorization model). Frontend gating is not security.

**Helper login** — helpers authenticate with **email + password**; all other roles are password-only. `/api/auth` branches on the presence of `email`.

**Date arithmetic** — never use `toISOString()` for local date math (UTC shift). Use the split-and-rebuild helper:
```js
function addDays(date, n) {
  const [y, m, d] = date.split("-").map(Number);
  const nd = new Date(y, m - 1, d + n);            // local time, no UTC
  return `${nd.getFullYear()}-${String(nd.getMonth()+1).padStart(2,"0")}-${String(nd.getDate()).padStart(2,"0")}`;
}
```

**Stale closures in effects** — `activeTournament` is mirrored to `activeTournamentRef` so date-change effects read the current tournament without listing it as a dependency. The share board uses the same ref pattern for `selectedDate`/`selectedArena`.

**Rules of Hooks** — `useTheme()` / `useLang()` must be called at the very top of `App()` before any state/effects or early returns.

**Dark mode inputs** — always set explicit colors: `bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100`. `<option>` elements can't hold an `<Icon>` — drop the glyph from select options.

**Onboarding** — completion stored in `localStorage` as `equiplan-onboarded-v1-<role>`.

## Security patterns

**Error responses** — never expose `e.message` or `String(e)` in API responses. Use a generic string and log the detail server-side:
```ts
} catch (e) {
  console.error("[route name]", e);
  return NextResponse.json({ error: "Speichern fehlgeschlagen" }, { status: 400 });
}
```

**HTML in emails** — `lib/email.ts` exports `escapeHtml` (private) and uses it on all interpolated values. Any new email template must escape user-controlled strings before HTML interpolation. `app/api/contact/route.ts` has its own copy for the same reason.

**Auth rate limiting** — `POST /api/auth` has an in-memory rate limiter (10 failed attempts / 15 min per IP). It resets on process restart. `recordFailure(ip)` must be called before every `401` response; successes do not reset the counter.

## Environment variables
`JWT_SECRET` (sessions + helper-password encryption key — **required in production**, throws on startup if missing; keep stable or encrypted helper passwords become unreadable), `DB_DIR` (Railway volume path), `RESEND_API_KEY` / `RESEND_FROM`, `DEEPL_API_KEY`, `APP_URL`, and optional `HELPER_PW_SECRET` (overrides the encryption key source).
