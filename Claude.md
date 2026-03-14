# CLAUDE.md — Homunculus Dashboard

> **Read this before making any change.** Update the Change Log at the bottom whenever you modify a file.

---

## 1. Project Overview

A full-stack Discord server management dashboard for the **Homunculus** bot.

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite |
| Styling | Inline CSS with CSS variables (no Tailwind) |
| Backend / API | Node.js + Express (`server/index.js`) |
| Database | NeonDB (PostgreSQL) via `@neondatabase/serverless` |
| Auth | Discord OAuth2 (`server/auth_discord.js`) |
| Hosting | Vercel (frontend + serverless API) |

---

## 2. Folder Structure

```
Dashboard/
├── index.html
├── vite.config.ts
├── package.json
├── vercel.json
│
├── server/
│   ├── index.js          ← ALL API logic (122 case handlers, DDL, migrations)
│   ├── auth_discord.js   ← Discord OAuth2 flow
│   └── vc_query_cases.js ← Voice channel query helpers
│
├── api/
│   └── index.js          ← Vercel serverless entry (imports server/index.js)
│
└── src/
    ├── main.tsx
    ├── App.tsx            ← Router, guild selector, sidebar nav
    ├── index.css          ← CSS variables, global styles, .btn classes
    │
    ├── components/
    │   ├── Modal.tsx      ← Centered overlay, scrollable body, ESC to close
    │   ├── Badge.tsx      ← Small coloured label chips
    │   ├── ErrorBoundary.tsx
    │   └── Setup.tsx      ← First-run guild setup wizard
    │
    ├── lib/
    │   ├── db.ts          ← All apiCall() wrappers (front-end ↔ server/index.js)
    │   ├── engine_pokemon.ts / engine_pokemon.tsx  ← Damage formula, type chart
    │   ├── mc_engine.ts   ← Monte Carlo simulation
    │   ├── auto_finder.ts ← Counter auto-finder
    │   ├── raid_types.ts  ← Raid tier constants
    │   └── pokemon_components.tsx / lib/pokemon_components.tsx ← Shared Pokémon UI
    │
    └── pages/
        ├── Overview.tsx         ← Server stats summary
        ├── Members.tsx          ← Member list, notes, XP editor
        ├── Activity.tsx         ← Message/VC leaderboards
        ├── Roles.tsx            ← Reaction roles + button roles (multi-button)
        ├── Tickets.tsx          ← Ticket list + per-panel role/category config
        ├── ModMail.tsx          ← ModMail inbox + config
        ├── Moderation.tsx       ← Warn logs, ban/unban
        ├── ModerationBlacklist.tsx  ← Word blacklist manager
        ├── Triggers.tsx         ← Auto-responders / keyword triggers
        ├── Announcements.tsx    ← Scheduled announcements
        ├── Events.tsx           ← Event scheduler
        ├── Votes.tsx            ← Vote / poll system
        ├── InfoTopics.tsx       ← /info topic editor (CRUD + history + audit)
        ├── Settings.tsx         ← Log channels, bot settings
        ├── ClientTools.tsx      ← Command usage stats, visitor analytics
        ├── BossInfo.tsx         ← Raid boss database editor
        ├── DamageCalcTool.tsx   ← Damage calculator
        ├── CounterCalcTool.tsx  ← Counter team builder
        ├── WeaknessLookupTool.tsx
        ├── RolesTicketsVotes.tsx ← Combined tab page
        ├── Blacklist.tsx
        └── Help.tsx
```

---

## 3. API Architecture (`server/index.js`)

All frontend calls go through a single POST endpoint `/api/bot` with the shape:
```json
{ "action": "caseName", "guildId": "...", ...params }
```

The server dispatches on `action` via a large `switch` statement.

### Key rules
- **All DDL runs at startup** — `CREATE TABLE IF NOT EXISTS` + idempotent `ALTER TABLE ADD COLUMN IF NOT EXISTS` migrations at the top of `initDB()`.
- **New tables/columns always get a migration entry** — never just add to the CREATE TABLE block.
- **NeonDB driver** — use the `sql` tagged-template helper, not raw `pg`. Parameterised as `$1, $2…`.
- **Returning data** — wrap in `ok(res, data)`. Errors use `err(res, message)`.

### Adding a new API action
1. Add DDL migration for any new columns to the `migrations` array in `initDB()`.
2. Add a `case 'yourActionName':` block in the switch.
3. Add the corresponding `apiCall<ReturnType>('yourActionName', params)` wrapper in `src/lib/db.ts`.

---

## 4. Frontend Conventions

### CSS variables (defined in `src/index.css`)
```css
--bg           /* page background */
--surface      /* card/panel background */
--elevated     /* input/elevated element bg */
--border       /* border colour */
--text         /* primary text */
--text-muted   /* secondary text */
--text-faint   /* placeholder / disabled text */
--primary      /* indigo #6366f1 */
--primary-subtle /* faint indigo bg for highlights */
--danger       /* red */
--danger-subtle
```

### Shared button classes (`.btn`, `.btn-primary`, `.btn-ghost`, `.btn-danger`, `.btn-sm`)
Defined in `src/index.css`. Always use these for action buttons.

### Modal component
`src/components/Modal.tsx` — **always use this for dialogs**, never an inline `position:fixed` div.
- Props: `title`, `onClose`, `children`, `width` (px number or string, default 560)
- The body is scrollable; the header is sticky.
- Blocks body scroll while open; closes on ESC or backdrop click.
- `zIndex: 200` — above all other fixed elements.

### Form fields pattern
All form pages define a `Field` (or `F`) wrapper component at **module scope** (never inside another component), which renders a label + hint + child input. This prevents remounting on state changes.

### Data fetching
- All data fetching happens in a `load()` function called from `useEffect`.
- Loading state uses a spinner div. Error state uses a red banner with an `×` dismiss button.
- Success toasts use a green banner that auto-dismisses after 4 seconds.

---

## 5. Key Page Details

### Roles.tsx — Reaction Roles & Button Roles
- **Reaction roles**: One form captures Channel ID + Message ID + N emoji→role pairs. All pairs are submitted as separate DB rows pointing at the same message.
- **Button roles**: One form captures Channel ID + optional message text + up to 5 button configs. All buttons share a `group_id` UUID so the bot sends them in a single Discord message.
- The bot polls `button_roles` and `reaction_roles` rows where `bot_synced = FALSE` every 30 seconds and sends/reacts automatically.

### Tickets.tsx — Ticket System
Each panel has three independently-configurable settings:
- **Support Roles** — roles that get channel read+send access (saved to `TicketPanel.supportRoles` JSONB).
- **Ping on Open** — roles pinged when a ticket opens. Only `ADMIN_ROLE_IDS` from `.env` are pinged by default. Mod roles are NOT pinged unless explicitly added here (saved to `TicketPanel.notificationRoles`).
- **Ticket Category** — Discord category ID where ticket channels are created (saved to `TicketPanel.categoryChannelId`). Leave blank to auto-create.

### InfoTopics.tsx — Info System
- Full CRUD for `/info` topics, organized by section → subcategory.
- Version history and audit log tabs.
- Import/export via JSON.
- The Create/Edit modal uses `<Modal width={680}>` — the textarea is capped at `maxHeight: 220` and the preview block at `maxHeight: 260` to keep Save button always visible.

### ClientTools.tsx — Command Usage
- Top Users query groups by `user_id` only (with `MAX(username)`) so a user who changed their display name doesn't appear twice.
- Each row shows display name + Discord user ID in monospace below it.

---

## 6. Database Tables (key ones)

| Table | Purpose |
|-------|---------|
| `reaction_roles` | Emoji→role mappings. `bot_synced` flag. `group_id` unused here. |
| `button_roles` | Button→role mappings. `group_id` + `group_position` for multi-button messages. `message_text` for embed description. |
| `"TicketPanel"` | Ticket panels. `supportRoles`, `notificationRoles`, `categoryChannelId` JSONB/text columns. |
| `"Ticket"` | Individual tickets. Links to `TicketPanel` via `panelId`. |
| `modmail_threads` | ModMail threads. `status`: `open` / `closed`. |
| `modmail_messages` | Individual messages in a thread. `author_is_staff`, `delivered` flags. |
| `info_topics` | Info embed data. `section`, `subcategory`, `is_published`, `views`. |
| `info_topic_history` | Versioned snapshots of info topics. |
| `command_usage_log` | Every bot command invocation. `user_id`, `username`, `command`, `used_at`. |

---

## 7. discord.py Bug Workaround

The production bot runs discord.py **≥ 2.3.2**. There is a known bug in some pip releases where `ThreadMember` events cause an `AttributeError: 'FakeClientPresence' object has no attribute 'hidden_activities'`.

**Fix**: Upgrade discord.py to the latest git HEAD or pin to `discord.py==2.4.0` once released. Alternatively, patch `discord/state.py` line ~1013:
```python
# Before:
self.hidden_activities = presence.hidden_activities
# After:
self.hidden_activities = getattr(presence, 'hidden_activities', set())
```
This only affects servers with active thread member updates and is purely a library bug.

---

## 8. Change Log

| Date | File | Change |
|------|------|--------|
| 2025-03 | `src/components/Modal.tsx` | Fixed dialog clipping — centered flex, `100dvh`, sticky header, scrollable body |
| 2025-03 | `src/pages/Roles.tsx` | Multi emoji→role pairs on one message; multi-button messages via `group_id` |
| 2025-03 | `src/pages/Tickets.tsx` | Per-panel Support Roles, Ping Roles, Ticket Category config cards |
| 2025-03 | `server/index.js` | Added `updateTicketPanelSupportRoles`, `updateTicketPanelCategory` API cases |
| 2025-03 | `server/index.js` | `createButtonRole` saves `group_id`, `group_position`, `message_text` |
| 2025-03 | `server/index.js` | `topUsers` query groups by `user_id` only (`MAX(username)`) |
| 2025-03 | `server/index.js` | Migrations: `button_roles.group_id/group_position/message_text`, `TicketPanel.categoryChannelId/notificationRoles` |
| 2025-03 | `src/pages/ClientTools.tsx` | Top Users shows Discord user_id under display name |
| 2025-03 | `src/pages/InfoTopics.tsx` | Textarea `maxHeight:220`, preview `maxHeight:260`, action row `flexWrap` |