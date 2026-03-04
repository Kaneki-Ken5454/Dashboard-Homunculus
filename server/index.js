import express from 'express';
import cors from 'cors';
import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Load .env manually (no dotenv dependency) ─────────────────────────────────
try {
  const envPath = resolve(__dirname, '../.env');
  const lines = readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
} catch {
  // .env not present — rely on real environment variables
}

const DATABASE_URL = process.env.NEON_DATABASE_URL || process.env.VITE_DATABASE_URL || process.env.DATABASE_URL;
// Don't crash at module load — let individual requests fail with a clear error.
// On Vercel, env vars are available at request time, not necessarily at import time.
const sql = DATABASE_URL
  ? neon(DATABASE_URL)
  : new Proxy({}, { get: () => () => { throw new Error('No database URL configured. Set NEON_DATABASE_URL in Vercel environment variables.'); } });
if (!DATABASE_URL) {
  console.error('⚠️  No database URL found. Set NEON_DATABASE_URL in Vercel project settings.');
}

// ── Auto-create missing tables on startup ─────────────────────────────────────
async function ensureTables() {
  const ddls = [
    `CREATE TABLE IF NOT EXISTS guild_settings (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT UNIQUE NOT NULL,
      prefix TEXT DEFAULT '!',
      use_slash_commands BOOLEAN DEFAULT TRUE,
      moderation_enabled BOOLEAN DEFAULT TRUE,
      levelling_enabled BOOLEAN DEFAULT TRUE,
      fun_enabled BOOLEAN DEFAULT TRUE,
      tickets_enabled BOOLEAN DEFAULT TRUE,
      custom_commands_enabled BOOLEAN DEFAULT TRUE,
      auto_responders_enabled BOOLEAN DEFAULT TRUE,
      global_cooldown INTEGER DEFAULT 1000,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS guild_members (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL DEFAULT '',
      discriminator TEXT DEFAULT '0',
      avatar_url TEXT,
      message_count INTEGER DEFAULT 0,
      level INTEGER DEFAULT 0,
      xp INTEGER DEFAULT 0,
      joined_at TIMESTAMPTZ DEFAULT NOW(),
      last_active TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (guild_id, user_id)
    )`,
    `CREATE TABLE IF NOT EXISTS auto_responders (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT NOT NULL,
      trigger_text TEXT NOT NULL,
      match_type TEXT NOT NULL DEFAULT 'contains',
      response TEXT NOT NULL,
      response_type TEXT NOT NULL DEFAULT 'text',
      is_enabled BOOLEAN DEFAULT TRUE,
      trigger_count INTEGER DEFAULT 0,
      created_by TEXT DEFAULT 'dashboard',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS reaction_roles (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      emoji TEXT NOT NULL,
      role_id TEXT NOT NULL,
      role_name TEXT,
      is_reaction BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS button_roles (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      button_id TEXT,
      role_id TEXT NOT NULL,
      button_style TEXT DEFAULT 'PRIMARY',
      button_label TEXT DEFAULT 'Get Role',
      button_emoji TEXT,
      custom_id TEXT,
      bot_synced BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT NOT NULL,
      panel_id TEXT,
      channel_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL DEFAULT '',
      title TEXT,
      priority TEXT DEFAULT 'medium',
      category TEXT DEFAULT 'general',
      messages_count INTEGER DEFAULT 0,
      assigned_to TEXT,
      status TEXT DEFAULT 'open',
      opened_at TIMESTAMPTZ DEFAULT NOW(),
      closed_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT NOT NULL,
      action_type TEXT NOT NULL,
      user_id TEXT,
      moderator_id TEXT,
      bot_action BOOLEAN DEFAULT FALSE,
      reason TEXT,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS warns_data (
      id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      warns JSONB DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (guild_id, user_id)
    )`,
    // blacklist — one row per guild; guild_id TEXT matches all other tables.
    // The bot previously created this with guild_id BIGINT; the migration below
    // converts existing rows so queries from both bot and dashboard always match.
    `CREATE TABLE IF NOT EXISTS blacklist_data (
      id BIGSERIAL PRIMARY KEY,
      guild_id TEXT UNIQUE NOT NULL,
      words JSONB DEFAULT '[]',
      violations JSONB DEFAULT '{}'
    )`,
  ];
  for (const ddl of ddls) {
    try { await sql(ddl); } catch (e) { console.warn('[DDL]', e.message?.slice(0, 80)); }
  }
  // Idempotent column migrations for existing tables
  const migrations = [
    `ALTER TABLE reaction_roles ADD COLUMN IF NOT EXISTS bot_synced BOOLEAN DEFAULT TRUE`,
    `ALTER TABLE button_roles   ADD COLUMN IF NOT EXISTS bot_synced BOOLEAN DEFAULT TRUE`,
    `ALTER TABLE button_roles   ADD COLUMN IF NOT EXISTS custom_id  TEXT`,
    `ALTER TABLE custom_commands ADD COLUMN IF NOT EXISTS created_by TEXT DEFAULT 'dashboard'`,
    `ALTER TABLE votes          ADD COLUMN IF NOT EXISTS results_announced BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE votes          ADD COLUMN IF NOT EXISTS start_time TIMESTAMPTZ`,
    `ALTER TABLE auto_responders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`,
    `UPDATE auto_responders SET updated_at = created_at WHERE updated_at IS NULL`,
    `ALTER TABLE info_topics ADD COLUMN IF NOT EXISTS subcategory_emoji TEXT`,
    // Fix unique constraint: include subcategory so the same topic_id can exist in different subcategories
    `ALTER TABLE info_topics DROP CONSTRAINT IF EXISTS info_topics_guild_id_section_topic_id_key`,
    `ALTER TABLE info_topics ADD CONSTRAINT info_topics_guild_section_sub_topic_key UNIQUE (guild_id, section, subcategory, topic_id) NOT DEFERRABLE INITIALLY IMMEDIATE`,
    // Draft mode: topics with is_published=false are hidden from the bot
    `ALTER TABLE info_topics ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT true`,
    // Version history for topics
    `CREATE TABLE IF NOT EXISTS info_topic_history (
       id          BIGSERIAL PRIMARY KEY,
       topic_db_id BIGINT NOT NULL,
       guild_id    TEXT NOT NULL,
       topic_id    TEXT NOT NULL,
       changed_by  TEXT DEFAULT 'dashboard',
       snapshot    JSONB NOT NULL,
       created_at  TIMESTAMPTZ DEFAULT NOW()
     )`,
    `CREATE INDEX IF NOT EXISTS idx_info_topic_history ON info_topic_history(topic_db_id, created_at DESC)`,
    // Audit log for info system edits
    `CREATE TABLE IF NOT EXISTS info_audit_log (
       id         BIGSERIAL PRIMARY KEY,
       guild_id   TEXT NOT NULL,
       action     TEXT NOT NULL,
       topic_id   TEXT,
       topic_name TEXT,
       changed_by TEXT DEFAULT 'dashboard',
       details    JSONB DEFAULT '{}',
       created_at TIMESTAMPTZ DEFAULT NOW()
     )`,
    `CREATE INDEX IF NOT EXISTS idx_info_audit_log ON info_audit_log(guild_id, created_at DESC)`,
    `ALTER TABLE triggers ADD COLUMN IF NOT EXISTS response_type TEXT DEFAULT 'text'`,
    `ALTER TABLE triggers ADD COLUMN IF NOT EXISTS cooldown_seconds INTEGER DEFAULT 0`,
    `ALTER TABLE triggers ADD COLUMN IF NOT EXISTS permission_level TEXT DEFAULT 'everyone'`,
    `ALTER TABLE triggers ADD COLUMN IF NOT EXISTS channel_id TEXT`,
    `ALTER TABLE triggers ADD COLUMN IF NOT EXISTS delete_message BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE triggers ADD COLUMN IF NOT EXISTS embed_title TEXT`,
    `ALTER TABLE triggers ADD COLUMN IF NOT EXISTS embed_color TEXT DEFAULT '#5865F2'`,
    // Ensure violations column exists on blacklist_data (may be missing on older bot installs)
    `ALTER TABLE blacklist_data ADD COLUMN IF NOT EXISTS violations JSONB DEFAULT '{}'`,
    // Raid boss entries managed from dashboard
    `CREATE TABLE IF NOT EXISTS raid_bosses (
      id          BIGSERIAL PRIMARY KEY,
      guild_id    TEXT NOT NULL,
      pokemon_key TEXT NOT NULL,
      display_name TEXT NOT NULL DEFAULT '',
      types       JSONB DEFAULT '[]',
      notes       TEXT DEFAULT '',
      counters    JSONB DEFAULT '[]',
      is_active   BOOLEAN DEFAULT TRUE,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      updated_at  TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(guild_id, pokemon_key)
    )`,
    // Migrate guild_id BIGINT → TEXT for blacklist_data.
    // Plain ALTER with USING works if column is BIGINT; if already TEXT Postgres errors
    // and the catch below silently ignores it — so this is safe either way.
    `ALTER TABLE blacklist_data ALTER COLUMN guild_id TYPE TEXT USING guild_id::text`,
  ];
  for (const m of migrations) {
    try { await sql(m); } catch (e) { /* column already exists or table missing */ }
  }
  console.log('✅  Tables verified/created');
}
// Lazy init — runs once per serverless instance, not at import time
let _tablesReady = false;
let _tablesPromise = null;
async function ensureTablesOnce() {
  if (_tablesReady) return;
  if (!_tablesPromise) _tablesPromise = ensureTables().then(() => { _tablesReady = true; }).catch(console.error);
  await _tablesPromise;
}



// ── Helpers ───────────────────────────────────────────────────────────────────
function ok(res, data) {
  res.json({ success: true, data });
}

function err(res, message, status = 400) {
  console.error(`[API ${status}] ${message}`);
  res.status(status).json({ success: false, error: message });
}

async function safeQuery(res, fn) {
  try {
    const data = await fn();
    ok(res, data);
  } catch (e) {
    err(res, e.message, 500);
  }
}

// ── App ───────────────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

// ── Serve built frontend in production ────────────────────────────────────────
const distPath = resolve(__dirname, '../dist');
try {
  app.use(express.static(distPath));
} catch {}

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// ── Guild Discovery ───────────────────────────────────────────────────────────
app.post('/api/query', async (req, res) => {
  const { action, params = {} } = req.body;
  if (!action) return err(res, 'Missing action');

  // Ensure all tables exist before handling any query
  await ensureTablesOnce().catch(() => {});

  try {
    switch (action) {

      case 'discoverGuilds': {
        // Scan ALL tables — both bot-native and dashboard-compat names
        const tables = [
          'guild_settings', 'guild_config',   // settings
          'custom_commands',                   // commands
          'auto_responders', 'triggers',       // triggers/responders
          'tickets', '"Ticket"', '"TicketPanel"', // tickets (both Prisma + flat)
          'audit_logs', 'mod_actions',         // moderation
          'guild_members', 'messages',         // members/activity
          'reaction_roles', 'button_roles',    // roles
          'info_topics',                       // info
          'votes',                             // votes
          'warns_data', 'warn_data',           // warnings
          'blacklist_data',                    // blacklist
        ];
        const results = [];
        for (const table of tables) {
          try {
            // Prisma-quoted tables use "guildId" column, others use guild_id
            const isPrisma = table.startsWith('"');
            const colExpr = isPrisma ? `"guildId"::text` : `guild_id::text`;
            const rows = await sql(
              `SELECT ${colExpr} AS guild_id, '${table.replace(/"/g,'')}' AS source, COUNT(*)::int AS count
               FROM ${table} WHERE ${isPrisma ? '"guildId"' : 'guild_id'} IS NOT NULL GROUP BY ${colExpr}`
            );
            results.push(...rows);
          } catch { /* table may not exist */ }
        }
        // Deduplicate — sum counts per guild_id, keep first source
        const map = new Map();
        for (const r of results) {
          if (map.has(r.guild_id)) {
            map.get(r.guild_id).count += r.count;
          } else {
            map.set(r.guild_id, { ...r });
          }
        }
        return ok(res, [...map.values()].sort((a, b) => b.count - a.count));
      }

      // ── Stats ──
      case 'getDashboardStats': {
        const { guildId } = params;
        const queries = [
          { key: 'memberCount',  q: `SELECT COUNT(*)::int AS c FROM guild_members   WHERE guild_id = $1` },
          { key: 'commandCount', q: `SELECT COUNT(*)::int AS c FROM custom_commands WHERE guild_id = $1` },
          { key: 'ticketCount',  q: `SELECT COUNT(*)::int AS c FROM tickets         WHERE guild_id = $1` },
          { key: 'auditCount',   q: `SELECT COUNT(*)::int AS c FROM audit_logs      WHERE guild_id = $1` },
          { key: 'triggerCount', q: `SELECT COUNT(*)::int AS c FROM triggers        WHERE guild_id::text = $1` },
          { key: 'autoRespCount',q: `SELECT COUNT(*)::int AS c FROM auto_responders WHERE guild_id = $1` },
          { key: 'voteCount',    q: `SELECT COUNT(*)::int AS c FROM votes           WHERE guild_id::text = $1` },
          { key: 'topicCount',   q: `SELECT COUNT(*)::int AS c FROM info_topics     WHERE guild_id::text = $1` },
          // Count warns from bot's per-row table + entries packed in warns_data JSONB arrays
          { key: 'warnCount', q: `SELECT (
              COALESCE((SELECT COUNT(*)::int FROM warn_data WHERE guild_id = $1), 0)
              + COALESCE((SELECT SUM(jsonb_array_length(warns))::int FROM warns_data WHERE guild_id = $1), 0)
            ) AS c` },
          // Sum all per-user violation counts stored in blacklist_data.violations JSONB object
          { key: 'violationCount', q: `SELECT COALESCE((
              SELECT SUM(val::int)
              FROM blacklist_data,
                   jsonb_each_text(COALESCE(violations, '{}')) kv(key, val)
              WHERE guild_id = $1
            ), 0)::int AS c` },
        ];
        const stats = {};
        for (const { key, q } of queries) {
          try {
            const rows = await sql(q, [guildId]);
            stats[key] = rows[0]?.c ?? 0;
          } catch { stats[key] = 0; }
        }
        return ok(res, stats);
      }

      case 'getRecentActivity': {
        const rows = await sql(
          `SELECT * FROM audit_logs WHERE guild_id = $1 ORDER BY created_at DESC LIMIT 10`,
          [params.guildId]
        ).catch(() => []);
        return ok(res, rows);
      }

      // ── Guild Settings ──
      case 'getGuildSetting': {
        const rows = await sql(
          `SELECT * FROM guild_settings WHERE guild_id = $1 LIMIT 1`,
          [params.guildId]
        ).catch(() => []);
        return ok(res, rows[0] ?? null);
      }

      case 'upsertGuildSetting': {
        const d = params.data;
        await sql(
          `INSERT INTO guild_settings
            (id, guild_id, prefix, use_slash_commands, moderation_enabled, levelling_enabled,
             fun_enabled, tickets_enabled, custom_commands_enabled, auto_responders_enabled,
             global_cooldown, created_at, updated_at)
           VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now(), now())
           ON CONFLICT (guild_id) DO UPDATE SET
             prefix=$2, use_slash_commands=$3, moderation_enabled=$4, levelling_enabled=$5,
             fun_enabled=$6, tickets_enabled=$7, custom_commands_enabled=$8,
             auto_responders_enabled=$9, global_cooldown=$10, updated_at=now()`,
          [params.guildId, d.prefix ?? '!', d.use_slash_commands ?? true,
           d.moderation_enabled ?? true, d.levelling_enabled ?? true,
           d.fun_enabled ?? true, d.tickets_enabled ?? true,
           d.custom_commands_enabled ?? true, d.auto_responders_enabled ?? true,
           d.global_cooldown ?? 1000]
        );
        return ok(res, { success: true });
      }

      // ── Members ──
      case 'getMembers': {
        const rows = await sql(
          `SELECT * FROM guild_members WHERE guild_id = $1 ORDER BY xp DESC LIMIT 200`,
          [params.guildId]
        ).catch(() => []);
        return ok(res, rows);
      }

      case 'updateMemberXP': {
        await sql(`UPDATE guild_members SET xp=$1, level=$2 WHERE id=$3`, [params.xp, params.level, params.id]);
        return ok(res, { success: true });
      }

      // ── Custom Commands ──
      case 'getCustomCommands':
        // Custom commands removed — redirect to triggers
        return ok(res, []);

      case 'createCustomCommand':
      case 'updateCustomCommand':
      case 'deleteCustomCommand':
        return ok(res, { success: true, message: 'Custom commands removed — use Triggers instead' });

      case 'getAutoResponders':
        // Auto responders removed — redirect to triggers
        return ok(res, []);

      case 'createAutoResponder':
      case 'updateAutoResponder':
      case 'deleteAutoResponder':
        return ok(res, { success: true, message: 'Auto responders removed — use Triggers instead' });

      case 'getTriggers': {
        const rows = await sql(
          `SELECT id, guild_id, trigger_text, response, match_type, enabled,
                  use_count, response_type, cooldown_seconds, permission_level,
                  channel_id, delete_message, embed_title, embed_color, created_at
           FROM triggers WHERE guild_id::text = $1 ORDER BY created_at DESC`,
          [params.guildId]
        ).catch(() => []);
        return ok(res, rows);
      }

      case 'createTrigger': {
        const d = params.data;
        await sql(
          `INSERT INTO triggers
            (guild_id, trigger_text, response, match_type, enabled, use_count,
             response_type, cooldown_seconds, permission_level, channel_id,
             delete_message, embed_title, embed_color)
           VALUES ($1,$2,$3,$4,true,0,$5,$6,$7,$8,$9,$10,$11)`,
          [
            params.guildId, d.trigger_text, d.response,
            d.match_type ?? 'contains',
            d.response_type ?? 'text',
            d.cooldown_seconds ?? 0,
            d.permission_level ?? 'everyone',
            d.channel_id ?? null,
            d.delete_message ?? false,
            d.embed_title ?? null,
            d.embed_color ?? '#5865F2',
          ]
        );
        return ok(res, { success: true });
      }

      case 'updateTrigger': {
        // Fetch existing row first so partial updates (e.g. toggle enabled) don't null required fields
        const existing = await sql(`SELECT * FROM triggers WHERE id=$1`, [params.id]).then(r => r[0] ?? {});
        const d = { ...existing, ...params.data };
        await sql(
          `UPDATE triggers SET
             trigger_text=$1, response=$2, match_type=$3, enabled=$4,
             response_type=$5, cooldown_seconds=$6, permission_level=$7,
             channel_id=$8, delete_message=$9, embed_title=$10, embed_color=$11
           WHERE id=$12`,
          [
            d.trigger_text, d.response, d.match_type ?? 'contains', d.enabled ?? true,
            d.response_type ?? 'text', d.cooldown_seconds ?? 0,
            d.permission_level ?? 'everyone', d.channel_id ?? null,
            d.delete_message ?? false, d.embed_title ?? null,
            d.embed_color ?? '#5865F2',
            params.id,
          ]
        );
        return ok(res, { success: true });
      }

      case 'deleteTrigger': {
        await sql(`DELETE FROM triggers WHERE id=$1`, [params.id]);
        return ok(res, { success: true });
      }

      case 'getLeaderboard': {
        const limit = Math.min(params.limit ?? 10, 50);
        const rows = await sql(
          `SELECT user_id, username, message_count, last_active
           FROM guild_members
           WHERE guild_id = $1 AND message_count > 0
           ORDER BY message_count DESC LIMIT $2`,
          [params.guildId, limit]
        ).catch(() => []);
        return ok(res, rows);
      }


      case 'getActivityStats': {
        const [activeAll, active7d, active24h, totalMsgs] = await Promise.all([
          sql(`SELECT COUNT(*)::int AS cnt FROM guild_members WHERE guild_id=$1 AND message_count > 0`, [params.guildId]).then(r => r[0]?.cnt ?? 0),
          sql(`SELECT COUNT(*)::int AS cnt FROM guild_members WHERE guild_id=$1 AND last_active >= NOW() - INTERVAL '7 days'`, [params.guildId]).then(r => r[0]?.cnt ?? 0),
          sql(`SELECT COUNT(*)::int AS cnt FROM guild_members WHERE guild_id=$1 AND last_active >= NOW() - INTERVAL '24 hours'`, [params.guildId]).then(r => r[0]?.cnt ?? 0),
          sql(`SELECT COALESCE(SUM(message_count),0)::int AS tot FROM guild_members WHERE guild_id=$1`, [params.guildId]).then(r => r[0]?.tot ?? 0),
        ]);
        return ok(res, { activeAll, active7d, active24h, totalMsgs });
      }


// ─────────────────────────────────────────────────────────────────────────────
// RAID BOSS MANAGEMENT (dashboard → query endpoint)
// ─────────────────────────────────────────────────────────────────────────────

      case 'getRaidBosses': {
        const rows = await sql(
          `SELECT * FROM raid_bosses WHERE guild_id=$1 ORDER BY is_active DESC, display_name ASC`,
          [params.guildId]
        ).catch(() => []);
        // Ensure JSONB fields are parsed objects (not strings) for all drivers
        const parsed = rows.map(r => ({
          ...r,
          counters: typeof r.counters === 'string' ? JSON.parse(r.counters || '[]') : (r.counters || []),
          types:    typeof r.types    === 'string' ? JSON.parse(r.types    || '[]') : (r.types    || []),
        }));
        return ok(res, parsed);
      }

      case 'upsertRaidBoss': {
        const d = params.data;
        const pkey = (d.pokemon_key||d.display_name||'').toLowerCase().replace(/[\s\-\']/g,'');
        const rows = await sql(
          `INSERT INTO raid_bosses (guild_id, pokemon_key, display_name, types, notes, counters, is_active)
           VALUES ($1,$2,$3,$4::jsonb,$5,$6::jsonb,$7)
           ON CONFLICT (guild_id, pokemon_key) DO UPDATE SET
             display_name=$3, types=$4::jsonb, notes=$5, counters=$6::jsonb,
             is_active=$7, updated_at=NOW()
           RETURNING id`,
          [params.guildId, pkey, d.display_name||pkey, JSON.stringify(d.types||[]),
           d.notes||'', JSON.stringify(d.counters||[]), d.is_active!==false]
        ).catch(() => []);
        return ok(res, { success:true, id: rows[0]?.id });
      }

      case 'deleteRaidBoss': {
        await sql(`DELETE FROM raid_bosses WHERE id=$1 AND guild_id=$2`, [params.id, params.guildId]).catch(()=>{});
        return ok(res, { success:true });
      }

      case 'setRaidBossActive': {
        await sql(`UPDATE raid_bosses SET is_active=$1, updated_at=NOW() WHERE id=$2 AND guild_id=$3`,
          [params.active, params.id, params.guildId]).catch(()=>{});
        return ok(res, { success:true });
      }

      // ── Blacklist ──
      case 'getBlacklist': {
        const blRows = await sql(`SELECT words, violations FROM blacklist_data WHERE guild_id=$1`, [params.guildId]).catch(() => []);
        if (!blRows.length) return ok(res, { words: [], violations: {} });
        const blRow = blRows[0];
        const words = Array.isArray(blRow.words) ? blRow.words : JSON.parse(blRow.words || '[]');
        const violations = typeof blRow.violations === 'string' ? JSON.parse(blRow.violations || '{}') : (blRow.violations || {});
        return ok(res, { words, violations });
      }

      case 'addBlacklistWord': {
        await sql(`INSERT INTO blacklist_data (guild_id, words) VALUES ($1, '[]'::jsonb) ON CONFLICT (guild_id) DO NOTHING`, [params.guildId]);
        await sql(`UPDATE blacklist_data SET words = CASE WHEN words @> $2::jsonb THEN words ELSE words || $2::jsonb END WHERE guild_id=$1`, [params.guildId, JSON.stringify([params.word.toLowerCase().trim()])]);
        return ok(res, { ok: true });
      }

      case 'removeBlacklistWord': {
        await sql(`UPDATE blacklist_data SET words = COALESCE((SELECT jsonb_agg(w) FROM jsonb_array_elements_text(words) w WHERE lower(w) != lower($2)), '[]'::jsonb) WHERE guild_id=$1`, [params.guildId, params.word]);
        return ok(res, { ok: true });
      }

      case 'clearUserViolations': {
        await sql(`UPDATE blacklist_data SET violations = violations - $1 WHERE guild_id=$2`, [params.userId, params.guildId]).catch(() => {});
        return ok(res, { ok: true });
      }

      case 'clearAllViolations': {
        await sql(`UPDATE blacklist_data SET violations = '{}' WHERE guild_id=$1`, [params.guildId]).catch(() => {});
        return ok(res, { ok: true });
      }

      // ── Tickets ──
      case 'getTickets': {
        // The bot uses Prisma's "Ticket" table (camelCase columns).
        // We query it and normalise columns to snake_case for the dashboard.
        let rows = [];
        // Try Prisma "Ticket" first (bot's primary table)
        try {
          const prismaRows = await sql(
            `SELECT id, "guildId" AS guild_id, "panelId" AS panel_id,
                    "channelId" AS channel_id, "userId" AS user_id,
                    username, title, priority, status,
                    COALESCE("messagesCount",0) AS messages_count,
                    COALESCE("assignedTo",'') AS assigned_to,
                    '' AS category,
                    "openedAt" AS opened_at, "closedAt" AS closed_at
             FROM "Ticket" WHERE "guildId" = $1
             ORDER BY "openedAt" DESC LIMIT 200`,
            [params.guildId]
          );
          rows = prismaRows;
        } catch {}
        // Also check flat tickets table (dashboard-created)
        try {
          const flatRows = await sql(
            `SELECT id::text, guild_id, COALESCE(panel_id,'') AS panel_id,
                    channel_id, user_id, COALESCE(username,'') AS username,
                    COALESCE(title,'Ticket') AS title,
                    COALESCE(priority,'medium') AS priority, status,
                    0 AS messages_count, '' AS assigned_to,
                    COALESCE(category,'') AS category,
                    opened_at, closed_at
             FROM tickets WHERE guild_id = $1
             ORDER BY opened_at DESC LIMIT 200`,
            [params.guildId]
          );
          rows = [...rows, ...flatRows];
        } catch {}
        // Deduplicate by channel_id
        const seen = new Set();
        rows = rows.filter(r => {
          const key = r.channel_id || r.id;
          if (seen.has(key)) return false;
          seen.add(key); return true;
        });
        rows.sort((a, b) => new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime());
        return ok(res, rows);
      }

      case 'updateTicketStatus': {
        const closedAt = params.status === 'closed' ? new Date().toISOString() : null;
        // Try Prisma table first, then flat table
        let updated = false;
        try {
          await sql(`UPDATE "Ticket" SET status=$1, "closedAt"=$2, "updatedAt"=NOW() WHERE id=$3`,
            [params.status, closedAt, params.id]);
          updated = true;
        } catch {}
        if (!updated) {
          try { await sql(`UPDATE tickets SET status=$1, closed_at=$2 WHERE id=$3`, [params.status, closedAt, params.id]); } catch {}
        }
        return ok(res, { success: true });
      }

      case 'deleteTicket': {
        try { await sql(`DELETE FROM "Ticket" WHERE id=$1`, [params.id]); } catch {}
        try { await sql(`DELETE FROM tickets WHERE id=$1`, [params.id]); } catch {}
        return ok(res, { success: true });
      }

      // ── Audit Logs ──
      case 'getAuditLogs': {
        const rows = await sql(
          `SELECT * FROM audit_logs WHERE guild_id = $1 ORDER BY created_at DESC LIMIT 200`,
          [params.guildId]
        ).catch(() => []);
        return ok(res, rows);
      }

      case 'deleteAuditLog': {
        // Try audit_logs first (UUID text id), then mod_actions (bigint id)
        const deleted = await sql(`DELETE FROM audit_logs WHERE id=$1 RETURNING id`, [params.id]).catch(() => []);
        if (!deleted.length) {
          await sql(`DELETE FROM mod_actions WHERE id=$1::bigint`, [params.id]).catch(() => {});
        }
        return ok(res, { success: true });
      }

      // ── Warns ──
      case 'getWarns': {
        // Also query warn_data (bot's native per-row table) for completeness
        const nativeRows = await sql(
          `SELECT id, guild_id, user_id, moderator_id, reason, severity, created_at FROM warn_data WHERE guild_id = $1 ORDER BY created_at DESC`,
          [params.guildId]
        ).catch(() => []);

        const rawRows = await sql(
          `SELECT * FROM warns_data WHERE guild_id::text = $1`,
          [params.guildId]
        ).catch(() => []);

        const flat = [];

        // Native warn_data rows — id is the real row UUID, prefix "wn::" so deleteWarn knows the table
        for (const r of nativeRows) {
          flat.push({
            id: `wn::${r.id}`,
            guild_id: String(r.guild_id),
            user_id: String(r.user_id),
            moderator_id: r.moderator_id ? String(r.moderator_id) : '—',
            reason: r.reason || null,
            severity: r.severity || 'medium',
            created_at: r.created_at || new Date().toISOString(),
          });
        }

        // warns_data JSONB rows — compound ID "wd::ROWID::TIMESTAMP" so deleteWarn can strip the entry
        const seenNative = new Set(nativeRows.map(r => String(r.user_id)));
        for (const row of rawRows) {
          const warns = Array.isArray(row.warns) ? row.warns : [];
          for (const w of warns) {
            const ts = w.timestamp || '';
            flat.push({
              id: `wd::${row.id}::${ts}`,
              guild_id: String(row.guild_id),
              user_id: String(row.user_id),
              moderator_id: w.moderator_id ? String(w.moderator_id) : '—',
              reason: w.reason || null,
              severity: w.severity || 'medium',
              created_at: ts || row.created_at || new Date().toISOString(),
            });
          }
        }

        flat.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        return ok(res, flat);
      }

      case 'deleteWarn': {
        const id = String(params.id);
        if (id.startsWith('wn::')) {
          // warn_data native row — simple delete by UUID
          const rowId = id.slice(4);
          await sql(`DELETE FROM warn_data WHERE id=$1`, [rowId]);
        } else if (id.startsWith('wd::')) {
          // warns_data JSONB row — remove the specific entry by timestamp
          const parts = id.split('::');   // ['wd', rowId, timestamp]
          const rowId = parts[1];
          const ts    = parts[2] || '';
          // Remove the warn entry whose timestamp matches; update or delete the row if empty
          const rows = await sql(`SELECT id, warns FROM warns_data WHERE id=$1`, [rowId]).catch(() => []);
          if (rows.length) {
            let warns = Array.isArray(rows[0].warns) ? rows[0].warns : [];
            warns = warns.filter(w => (w.timestamp || '') !== ts);
            if (warns.length === 0) {
              await sql(`DELETE FROM warns_data WHERE id=$1`, [rowId]);
            } else {
              await sql(`UPDATE warns_data SET warns=$1::jsonb, updated_at=now() WHERE id=$2`, [JSON.stringify(warns), rowId]);
            }
          }
        } else {
          // Fallback: try both tables
          await sql(`DELETE FROM warn_data WHERE id=$1`, [id]).catch(() => {});
          await sql(`DELETE FROM warns_data WHERE id=$1`, [id]).catch(() => {});
        }
        return ok(res, { success: true });
      }

      // ── Votes ──
      case 'getVotes': {
        const rows = await sql(
          `SELECT * FROM votes WHERE guild_id::text = $1 ORDER BY created_at DESC`,
          [params.guildId]
        ).catch(() => []);
        return ok(res, rows);
      }

      case 'createVote': {
        if (params.channelId && !/^\d{17,19}$/.test(params.channelId)) {
          return err(res, 'Invalid channel ID — must be 17–19 digits');
        }
        const durationMins = parseInt(params.durationMinutes) || 1440;
        await sql(
          `INSERT INTO votes (vote_id, guild_id, question, options, results_posted, results_announced, channel_id,
                              start_time, end_time, anonymous, created_at)
           VALUES (gen_random_uuid()::text, $1, $2, $3::jsonb, false, false, $4,
                   now(), now() + ($5 || ' minutes')::interval, $6, now())
           ON CONFLICT DO NOTHING`,
          [params.guildId, params.question, JSON.stringify(params.options ?? []),
           params.channelId || null, String(durationMins), params.anonymous ?? false]
        );
        return ok(res, { success: true });
      }


      case 'getVoteVoters': {
        // Returns voter breakdown for dashboard (non-anonymous view)
        const rows = await sql(
          `SELECT vc.user_id, vc.option, vc.timestamp,
                  COALESCE(gm.username, vc.user_id::text) AS username
           FROM votes_cast vc
           LEFT JOIN guild_members gm ON gm.user_id = vc.user_id::text AND gm.guild_id = $1
           WHERE vc.vote_id = $2
           ORDER BY vc.timestamp ASC`,
          [params.guildId, params.voteId]
        ).catch(() => []);
        return ok(res, rows);
      }

      case 'getVoteResults': {
        const rows = await sql(
          `SELECT option, COUNT(*)::int AS count, SUM(weight) AS total_weight
           FROM votes_cast WHERE vote_id=$1
           GROUP BY option ORDER BY count DESC`,
          [params.voteId]
        ).catch(() => []);
        return ok(res, rows);
      }

      case 'deleteVote': {
        await sql(`DELETE FROM votes WHERE vote_id=$1`, [params.id]);
        return ok(res, { success: true });
      }

      // ── Info Topics ──
      case 'getInfoTopics': {
        const rows = await sql(
          `SELECT * FROM info_topics WHERE guild_id::text = $1 ORDER BY section, subcategory, name`,
          [params.guildId]
        ).catch(() => []);
        return ok(res, rows);
      }

      case 'createInfoTopic': {
        const d = params.data;
        const topicId = d.topic_id || (d.name || '').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'').slice(0,80);
        const isPublished = d.is_published !== false;
        const rows = await sql(
          `INSERT INTO info_topics
            (guild_id, section, subcategory, topic_id, name, embed_title, embed_description,
             embed_color, emoji, category_emoji_id, image, thumbnail, is_published)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
           ON CONFLICT (guild_id, section, subcategory, topic_id) DO UPDATE SET
             name=$5, embed_title=$6, embed_description=$7,
             embed_color=$8, emoji=$9, category_emoji_id=$10,
             image=$11, thumbnail=$12, is_published=$13, updated_at=now()
           RETURNING id, topic_id, name`,
          [params.guildId, d.section||'general', d.subcategory||'General', topicId, d.name,
           d.embed_title||null, d.embed_description||null, d.embed_color||'#5865F2', d.emoji||'📄',
           d.category_emoji_id||null, d.image||null, d.thumbnail||null, isPublished]
        );
        if (rows.length) {
          await sql(
            `INSERT INTO info_audit_log (guild_id, action, topic_id, topic_name, changed_by, details) VALUES ($1,'create',$2,$3,'dashboard',$4::jsonb)`,
            [params.guildId, rows[0].topic_id, rows[0].name, JSON.stringify({ section: d.section, subcategory: d.subcategory, draft: !isPublished })]
          ).catch(() => {});
        }
        return ok(res, { success: true, id: rows[0]?.id });
      }

      case 'updateInfoTopic': {
        const d = params.data;
        const existing = await sql(`SELECT * FROM info_topics WHERE id=$1::bigint`, [params.id]).catch(() => []);
        if (existing.length) {
          await sql(
            `INSERT INTO info_topic_history (topic_db_id, guild_id, topic_id, changed_by, snapshot) VALUES ($1,$2,$3,'dashboard',$4::jsonb)`,
            [existing[0].id, existing[0].guild_id, existing[0].topic_id, JSON.stringify(existing[0])]
          ).catch(() => {});
          await sql(
            `INSERT INTO info_audit_log (guild_id, action, topic_id, topic_name, changed_by, details) VALUES ($1,'edit',$2,$3,'dashboard',$4::jsonb)`,
            [existing[0].guild_id, existing[0].topic_id, d.name||existing[0].name, JSON.stringify({ fields: Object.keys(d) })]
          ).catch(() => {});
        }
        await sql(
          `UPDATE info_topics SET section=$1, subcategory=$2, name=$3, embed_title=$4, embed_description=$5, embed_color=$6, emoji=$7, category_emoji_id=$8, image=$9, thumbnail=$10, updated_at=now() WHERE id=$11::bigint`,
          [d.section||'general', d.subcategory||'General', d.name,
           d.embed_title||null, d.embed_description||null, d.embed_color||'#5865F2', d.emoji||'📄',
           d.category_emoji_id||null, d.image||null, d.thumbnail||null, params.id]
        );
        return ok(res, { success: true });
      }

      case 'deleteInfoTopic': {
        const row = await sql(`SELECT guild_id, topic_id, name FROM info_topics WHERE id=$1::bigint`, [params.id]).catch(() => []);
        await sql(`DELETE FROM info_topics WHERE id=$1::bigint`, [params.id]);
        if (row.length) {
          await sql(`INSERT INTO info_audit_log (guild_id, action, topic_id, topic_name, changed_by) VALUES ($1,'delete',$2,$3,'dashboard')`,
            [row[0].guild_id, row[0].topic_id, row[0].name]).catch(() => {});
        }
        return ok(res, { success: true });
      }

      case 'setTopicPublished': {
        const row = await sql(`UPDATE info_topics SET is_published=$1, updated_at=now() WHERE id=$2::bigint RETURNING guild_id, topic_id, name`, [params.is_published, params.id]).catch(() => []);
        if (row.length) {
          await sql(`INSERT INTO info_audit_log (guild_id, action, topic_id, topic_name, changed_by) VALUES ($1,$2,$3,$4,'dashboard')`,
            [row[0].guild_id, params.is_published ? 'publish' : 'unpublish', row[0].topic_id, row[0].name]).catch(() => {});
        }
        return ok(res, { success: true });
      }

      case 'getTopicHistory': {
        const rows = await sql(
          `SELECT id, changed_by, snapshot, created_at FROM info_topic_history WHERE topic_db_id=$1::bigint ORDER BY created_at DESC LIMIT 20`,
          [params.topicId]
        ).catch(() => []);
        return ok(res, rows);
      }

      case 'restoreTopicVersion': {
        const rows = await sql(`SELECT snapshot FROM info_topic_history WHERE id=$1::bigint`, [params.historyId]).catch(() => []);
        if (!rows.length) return ok(res, { success: false, error: 'Version not found' });
        const snap = rows[0].snapshot;
        const cur = await sql(`SELECT * FROM info_topics WHERE id=$1::bigint`, [params.topicDbId]).catch(() => []);
        if (cur.length) {
          await sql(`INSERT INTO info_topic_history (topic_db_id, guild_id, topic_id, changed_by, snapshot) VALUES ($1,$2,$3,'dashboard-restore',$4::jsonb)`,
            [cur[0].id, cur[0].guild_id, cur[0].topic_id, JSON.stringify(cur[0])]).catch(() => {});
        }
        await sql(
          `UPDATE info_topics SET name=$1, embed_title=$2, embed_description=$3, embed_color=$4, emoji=$5, image=$6, thumbnail=$7, footer=$8, section=$9, subcategory=$10, updated_at=now() WHERE id=$11::bigint`,
          [snap.name, snap.embed_title, snap.embed_description, snap.embed_color, snap.emoji, snap.image, snap.thumbnail, snap.footer, snap.section, snap.subcategory, params.topicDbId]
        );
        return ok(res, { success: true });
      }

      case 'getInfoAuditLog': {
        const rows = await sql(`SELECT * FROM info_audit_log WHERE guild_id=$1 ORDER BY created_at DESC LIMIT 100`, [params.guildId]).catch(() => []);
        return ok(res, rows);
      }

      case 'exportInfoTopics': {
        const rows = await sql(
          `SELECT section, subcategory, subcategory_emoji, topic_id, name, embed_title, embed_description, embed_color, emoji, category_emoji_id, image, thumbnail, footer, is_published FROM info_topics WHERE guild_id::text=$1 ORDER BY section, subcategory, name`,
          [params.guildId]
        ).catch(() => []);
        return ok(res, { topics: rows, exported_at: new Date().toISOString(), guild_id: params.guildId });
      }

      case 'importInfoTopics': {
        const { topics, mode } = params;
        if (mode === 'replace') await sql(`DELETE FROM info_topics WHERE guild_id::text=$1`, [params.guildId]).catch(() => {});
        let imported = 0, skipped = 0;
        for (const t of (topics || [])) {
          try {
            await sql(
              `INSERT INTO info_topics (guild_id, section, subcategory, subcategory_emoji, topic_id, name, embed_title, embed_description, embed_color, emoji, category_emoji_id, image, thumbnail, footer, is_published)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
               ON CONFLICT (guild_id, section, subcategory, topic_id) DO UPDATE SET name=EXCLUDED.name, embed_title=EXCLUDED.embed_title, embed_description=EXCLUDED.embed_description, embed_color=EXCLUDED.embed_color, emoji=EXCLUDED.emoji, image=EXCLUDED.image, thumbnail=EXCLUDED.thumbnail, footer=EXCLUDED.footer, is_published=EXCLUDED.is_published, updated_at=now()`,
              [params.guildId, t.section||'general', t.subcategory||'General', t.subcategory_emoji||null, t.topic_id, t.name, t.embed_title||null, t.embed_description||null, t.embed_color||'#5865F2', t.emoji||'📄', t.category_emoji_id||null, t.image||null, t.thumbnail||null, t.footer||null, t.is_published !== false]
            );
            imported++;
          } catch { skipped++; }
        }
        await sql(`INSERT INTO info_audit_log (guild_id, action, changed_by, details) VALUES ($1,'import','dashboard',$2::jsonb)`,
          [params.guildId, JSON.stringify({ imported, skipped, mode })]).catch(() => {});
        return ok(res, { success: true, imported, skipped });
      }


      case 'updateInfoSection': {
        // Rename a top-level section and optionally set its category_emoji_id
        const { guildId, oldSection, newSection, categoryEmojiId } = params;
        await sql(
          `UPDATE info_topics SET section=$1, category_emoji_id=$2, updated_at=now()
           WHERE guild_id::text=$3 AND section=$4`,
          [newSection, categoryEmojiId ?? null, guildId, oldSection]
        );
        return ok(res, { success: true });
      }

      case 'updateInfoSubcategory': {
        // Rename a subcategory and optionally set its emoji
        const { guildId, section, oldSub, newSub, subcategoryEmoji } = params;
        await sql(
          `UPDATE info_topics SET subcategory=$1, subcategory_emoji=$2, updated_at=now()
           WHERE guild_id::text=$3 AND section=$4 AND subcategory=$5`,
          [newSub, subcategoryEmoji ?? null, guildId, section, oldSub]
        );
        return ok(res, { success: true });
      }

      case 'setSubcategoryEmoji': {
        // Set (or clear) the subcategory_emoji for every topic in a given section+subcategory
        const { guildId, section, subcategory, emoji } = params;
        await sql(
          `UPDATE info_topics SET subcategory_emoji=$1, updated_at=now()
           WHERE guild_id::text=$2 AND section=$3 AND subcategory=$4`,
          [emoji || null, guildId, section, subcategory]
        );
        return ok(res, { success: true });
      }

      case 'setCategoryEmojiId': {
        // Set (or clear) category_emoji_id for every topic in a section
        const { guildId, section, categoryEmojiId } = params;
        await sql(
          `UPDATE info_topics SET category_emoji_id=$1, updated_at=now()
           WHERE guild_id::text=$2 AND section=$3`,
          [categoryEmojiId || null, guildId, section]
        );
        return ok(res, { success: true });
      }

      // ── Reaction Roles ──
      case 'getReactionRoles': {
        const rows = await sql(
          `SELECT * FROM reaction_roles WHERE guild_id = $1 ORDER BY created_at DESC`,
          [params.guildId]
        ).catch(() => []);
        return ok(res, rows);
      }

      case 'deleteReactionRole': {
        await sql(`DELETE FROM reaction_roles WHERE id=$1`, [params.id]);
        return ok(res, { success: true });
      }

      // ── Button Roles ──

      case 'getTicketPanelPingRoles': {
        const rows = await sql(
          `SELECT id, "guildId" AS guild_id, name, "notificationRoles", "supportRoles" FROM "TicketPanel" WHERE "guildId"=$1`,
          [params.guildId]
        ).catch(() => []);
        return ok(res, rows);
      }

      case 'updateTicketPanelPingRoles': {
        // Update which roles get pinged when a ticket opens
        await sql(
          `UPDATE "TicketPanel" SET "notificationRoles"=$1::jsonb, "updatedAt"=NOW() WHERE id=$2`,
          [JSON.stringify(params.notificationRoles ?? []), params.panelId]
        );
        return ok(res, { success: true });
      }

      case 'deleteTicketPanel': {
        // Nullify panelId on child tickets first (FK is ON DELETE SET NULL, but be explicit)
        await sql(`UPDATE "Ticket" SET "panelId"=NULL WHERE "panelId"=$1`, [params.panelId]);
        await sql(`DELETE FROM "TicketPanel" WHERE id=$1 AND "guildId"=$2`, [params.panelId, params.guildId]);
        return ok(res, { success: true });
      }

      case 'getButtonRoles': {
        const rows = await sql(
          `SELECT * FROM button_roles WHERE guild_id = $1 ORDER BY created_at DESC`,
          [params.guildId]
        ).catch(() => []);
        return ok(res, rows);
      }

      case 'deleteButtonRole': {
        await sql(`DELETE FROM button_roles WHERE id=$1`, [params.id]);
        return ok(res, { success: true });
      }

      case 'markReactionRoleSynced': {
        await sql(`UPDATE reaction_roles SET bot_synced=TRUE WHERE id=$1`, [params.id]);
        return ok(res, { success: true });
      }

      case 'markButtonRoleSynced': {
        await sql(`UPDATE button_roles SET bot_synced=TRUE WHERE id=$1`, [params.id]);
        return ok(res, { success: true });
      }


      // ── Reaction Roles CRUD ──
      case 'createReactionRole': {
        const d = params.data;
        if (!d.message_id || !d.channel_id || !d.emoji || !d.role_id) {
          return err(res, 'message_id, channel_id, emoji, and role_id are required');
        }
        // After saving, the bot polls and adds the reaction to the message automatically
        await sql(
          `INSERT INTO reaction_roles (id, guild_id, message_id, channel_id, emoji, role_id, role_name, is_reaction, created_at, bot_synced)
           VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,TRUE,now(),FALSE)
           ON CONFLICT DO NOTHING`,
          [params.guildId, String(d.message_id), String(d.channel_id), d.emoji, String(d.role_id), d.role_name ?? null]
        );
        return ok(res, { success: true });
      }

      case 'updateReactionRole': {
        const d = params.data;
        await sql(
          `UPDATE reaction_roles SET emoji=$1, role_id=$2, role_name=$3 WHERE id=$4`,
          [d.emoji, d.role_id, d.role_name ?? null, params.id]
        );
        return ok(res, { success: true });
      }

      // ── Button Roles CRUD ──
      case 'createButtonRole': {
        const d = params.data;
        if (!d.channel_id || !d.role_id) {
          return err(res, 'channel_id and role_id are required');
        }
        const brId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
        // bot_synced=FALSE means the bot will detect this and send the button message to channel_id
        await sql(
          `INSERT INTO button_roles (id, guild_id, message_id, channel_id, button_id, role_id,
             button_style, button_label, button_emoji, custom_id, created_at, bot_synced)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now(),FALSE)`,
          [brId, params.guildId, '', String(d.channel_id),
           brId, String(d.role_id), d.button_style ?? 'PRIMARY',
           d.button_label ?? 'Get Role', d.button_emoji ?? null,
           `btnrole_${brId}`]
        );
        return ok(res, { success: true });
      }

      case 'updateButtonRole': {
        const d = params.data;
        await sql(
          `UPDATE button_roles SET role_id=$1, button_style=$2, button_label=$3, button_emoji=$4 WHERE id=$5`,
          [d.role_id, d.button_style ?? 'PRIMARY', d.button_label ?? 'Get Role', d.button_emoji ?? null, params.id]
        );
        return ok(res, { success: true });
      }

      // ── Moderation ──
      case 'getModerationLogs': {
        // Query both mod_actions and audit_logs for completeness
        const rows = await sql(
          `SELECT id::text, guild_id::text, action_type, mod_id::text AS moderator_id, target_id::text AS user_id,
                  reason, timestamp AS created_at, FALSE AS bot_action, '{}'::jsonb AS metadata
           FROM mod_actions WHERE guild_id::text = $1
           UNION ALL
           SELECT id, guild_id, action_type, moderator_id, user_id,
                  reason, created_at, bot_action, metadata
           FROM audit_logs WHERE guild_id = $1
           ORDER BY created_at DESC LIMIT 200`,
          [params.guildId]
        ).catch(() => []);
        return ok(res, rows);
      }

      // ── Fixed Tickets (also query Prisma "Ticket" table) ──
      case 'getAllTickets': {
        const ticketsA = await sql(
          `SELECT id, guild_id::text AS guild_id, NULL AS panel_id, "channelId" AS channel_id,
                  "userId" AS user_id, "username", "title", "priority",
                  'general' AS category, "messagesCount" AS messages_count,
                  "assignedTo" AS assigned_to, "status",
                  "openedAt" AS opened_at, "closedAt" AS closed_at
           FROM "Ticket" WHERE "guildId" = $1 ORDER BY "openedAt" DESC LIMIT 200`,
          [params.guildId]
        ).catch(() => []);
        const ticketsB = await sql(
          `SELECT * FROM tickets WHERE guild_id = $1 ORDER BY opened_at DESC LIMIT 200`,
          [params.guildId]
        ).catch(() => []);
        return ok(res, [...ticketsA, ...ticketsB]);
      }

      // ── Warns — also query warn_data (bot's table) ──
      case 'getAllWarns': {
        // From warn_data (bot native format, per-warning rows)
        const nativeWarns = await sql(
          `SELECT id, guild_id, user_id, moderator_id, reason, severity, created_at
           FROM warn_data WHERE guild_id = $1 ORDER BY created_at DESC`,
          [params.guildId]
        ).catch(() => []);
        // From warns_data (dashboard sync format)
        const rawRows = await sql(
          `SELECT * FROM warns_data WHERE guild_id = $1`,
          [params.guildId]
        ).catch(() => []);
        const dashWarns = [];
        for (const row of rawRows) {
          const warns = Array.isArray(row.warns) ? row.warns : [];
          for (const w of warns) {
            dashWarns.push({
              id: `wd::${row.id}::${w.timestamp || ""}`,   // parsed by deleteWarn
              guild_id: String(row.guild_id),
              user_id: row.user_id,
              moderator_id: w.moderator_id ? String(w.moderator_id) : '—',
              reason: w.reason || null,
              severity: 'medium',
              created_at: w.timestamp || row.created_at || new Date().toISOString(),
            });
          }
        }
        const combined = [...nativeWarns, ...dashWarns];
        combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        return ok(res, combined);
      }

      default:
        return err(res, `Unknown action: ${action}`);
    }
  } catch (e) {
    console.error('[Unhandled]', e?.stack || e); return err(res, e.message, 500);
  }
});

// ── Fallback: serve index.html for SPA routes in production ──────────────────
app.get('*', (_req, res) => {
  try {
    res.sendFile(resolve(distPath, 'index.html'));
  } catch {
    res.status(404).send('Not found');
  }
});

// ═══════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════════
// BOSSINFO — Competitive Pokémon analysis (self-contained, DB-backed)
// All computation happens server-side from data cached in bossinfo_showdown_cache
// No bot process needed. Data auto-refreshes from Showdown CDN if cache is stale.
// ══════════════════════════════════════════════════════════════════════════════

// ── In-memory Showdown cache ──────────────────────────────────────────────────
let _sdReady = false;
let _sdLoading = false;
const _sd = {};   // pokedex, moves, typechart, formats_data
const _CDN = 'https://play.pokemonshowdown.com/data';
const _CDN_URLS = {
  pokedex:      `${_CDN}/pokedex.json`,
  moves:        `${_CDN}/moves.json`,
  typechart:    `${_CDN}/typechart.json`,
  formats_data: `${_CDN}/formats-data.json`,
};
// learnsets is ~12 MB — fetched only when needed
let _learnsets = null;
let _learnsetsFetched = false;

async function _sdLoad() {
  if (_sdReady || _sdLoading) return;
  _sdLoading = true;
  const needed = [];
  for (const key of Object.keys(_CDN_URLS)) {
    try {
      const rows = await sql`SELECT data, fetched_at FROM bossinfo_showdown_cache WHERE cache_key=${key}`;
      if (rows.length && rows[0].data) {
        const ageHours = (Date.now() - new Date(rows[0].fetched_at).getTime()) / 3600000;
        if (ageHours < 24) { _sd[key] = rows[0].data; continue; }
      }
    } catch (_) {}
    needed.push(key);
  }
  if (needed.length) {
    console.log(`BossInfo: fetching ${needed.length} file(s) from Showdown CDN…`);
    for (const key of needed) {
      try {
        const res = await fetch(_CDN_URLS[key]);
        const data = await res.json();
        _sd[key] = data;
        await sql`INSERT INTO bossinfo_showdown_cache(cache_key,data,fetched_at) VALUES(${key},${JSON.stringify(data)}::jsonb,NOW()) ON CONFLICT(cache_key) DO UPDATE SET data=${JSON.stringify(data)}::jsonb,fetched_at=NOW()`;
        console.log(`  ok ${key}: ${Object.keys(data).length} entries`);
      } catch (e) { console.error(`  failed ${key}:`, e.message); }
    }
  }
  _sdReady = Object.keys(_CDN_URLS).every(k => k in _sd);
  _sdLoading = false;
  if (_sdReady) console.log('BossInfo: Showdown data ready.');
}

async function _getLearnsets() {
  if (_learnsets) return _learnsets;
  try {
    const rows = await sql`SELECT data, fetched_at FROM bossinfo_showdown_cache WHERE cache_key='learnsets'`;
    if (rows.length && rows[0].data) {
      const ageHours = (Date.now() - new Date(rows[0].fetched_at).getTime()) / 3600000;
      if (ageHours < 24) { _learnsets = rows[0].data; return _learnsets; }
    }
  } catch (_) {}
  try {
    const res = await fetch(`${_CDN}/learnsets.json`);
    _learnsets = await res.json();
    await sql`INSERT INTO bossinfo_showdown_cache(cache_key,data,fetched_at) VALUES('learnsets',${JSON.stringify(_learnsets)}::jsonb,NOW()) ON CONFLICT(cache_key) DO UPDATE SET data=${JSON.stringify(_learnsets)}::jsonb,fetched_at=NOW()`;
    console.log('BossInfo: learnsets cached to DB.');
  } catch (e) { console.error('BossInfo: learnsets fetch failed:', e.message); }
  return _learnsets;
}

// Kick off data load on server start
_sdLoad().catch(() => {});

// ── Analysis helpers (pure JS, mirrors showdown_data.py) ─────────────────────
function _key(n) { return (n||'').toLowerCase().replace(/[\s\-'.]/g,''); }

const _DMG_CODE = {0:1,1:2,2:0.5,3:0};
const _Z_TABLE  = [[55,100],[65,120],[75,140],[85,160],[95,175],[100,180],[110,185],[125,190]];
function _zPower(bp) {
  for (const [t,p] of _Z_TABLE) if (bp <= t) return p;
  return 195;
}

function _calcStat(base, ev=0, iv=31, isHp=false, nature=1) {
  if (isHp) return Math.floor((2*base+iv+Math.floor(ev/4))*100/100)+110;
  return Math.floor((Math.floor((2*base+iv+Math.floor(ev/4))*100/100)+5)*nature);
}

function _typeEff(atkType, defTypes) {
  const tc = _sd.typechart || {};
  let m = 1;
  for (const dt of defTypes) {
    const code = (tc[dt]?.damageTaken || {})[atkType] ?? 0;
    m *= _DMG_CODE[code] ?? 1;
  }
  return m;
}

function _weaknessChart(defTypes, ability='') {
  const tc = _sd.typechart || {};
  const out = {quad:[],double:[],half:[],quarter:[],immune:[]};
  const levitate = (ability||'').toLowerCase().includes('levitate');
  for (const atk of Object.keys(tc)) {
    if (levitate && atk === 'Ground') { out.immune.push(atk); continue; }
    const m = _typeEff(atk, defTypes);
    if (m === 0) out.immune.push(atk);
    else if (m === 0.25) out.quarter.push(atk);
    else if (m === 0.5) out.half.push(atk);
    else if (m === 2) out.double.push(atk);
    else if (m === 4) out.quad.push(atk);
  }
  return out;
}

function _detectRole(stats) {
  const {hp=0,atk=0,def=0,spa=0,spd=0,spe=0} = stats;
  const bulk = hp+def+spd;
  if (bulk>=340 && atk<90 && spa<90) return 'Defensive Wall';
  if (spe>=100 && atk>=110 && atk>=spa) return 'Physical Sweeper';
  if (spe>=100 && spa>=110 && spa>atk)  return 'Special Sweeper';
  if (Math.abs(atk-spa)<=20 && Math.max(atk,spa)>=100) return 'Mixed Attacker';
  if (spe>=100 && bulk>=270) return 'Offensive Pivot';
  if (bulk>=300) return 'Bulky Attacker';
  return 'All-Rounder';
}

function _rankMoves(poke, topN=5) {
  const mv = _sd.moves || {};
  const ls = poke._learnset || {};
  const types = poke.types || [];
  const stats = poke.baseStats || {};
  const preferSp = (stats.spa||0) >= (stats.atk||0);
  const atkVal = _calcStat(stats.atk||70, 252);
  const spaVal = _calcStat(stats.spa||70, 252);
  const scored = [];
  for (const [mk, sources] of Object.entries(ls)) {
    if (!sources.some(s => s.startsWith('9') || s.startsWith('8'))) continue;
    const m = mv[mk];
    if (!m) continue;
    const cat = m.category;
    if (cat === 'Status') continue;
    const bp = m.basePower || 0;
    if (!bp) continue;
    const acc = m.accuracy;
    if (acc !== true && typeof acc === 'number' && acc < 70) continue;
    const mt = m.type || 'Normal';
    const stab = types.includes(mt) ? 1.5 : 1;
    const sv   = cat === 'Special' ? spaVal : atkVal;
    const bias = ((preferSp && cat==='Special')||(!preferSp && cat==='Physical')) ? 1.1 : 1;
    scored.push({
      name: m.name || mk, type: mt, category: cat, base_power: bp,
      accuracy: acc === true ? 'always' : acc,
      stab: stab>1, score: bp*stab*sv*bias, z_power: _zPower(bp),
    });
  }
  scored.sort((a,b) => b.score-a.score);
  return scored.slice(0,topN);
}

async function _fullAnalysis(pokemonName) {
  if (!_sdReady) await _sdLoad();
  const pd = _sd.pokedex || {};
  const poke = pd[_key(pokemonName)];
  if (!poke) return null;
  const types    = poke.types || [];
  const stats    = poke.baseStats || {};
  const abilities= Object.values(poke.abilities || {});
  const fmt      = (_sd.formats_data||{})[_key(pokemonName)] || {};
  // Attach learnset for move ranking
  const ls = await _getLearnsets();
  const learnset = ls ? (ls[_key(pokemonName)]?.learnset || {}) : {};
  poke._learnset = learnset;
  const topMoves = _rankMoves(poke);
  // Level-up moves
  const mvdb = _sd.moves || {};
  const levelMoves = [];
  for (const [mk, sources] of Object.entries(learnset)) {
    let level = null;
    for (let gen=9; gen>=1; gen--) {
      for (const s of sources) {
        if (s.startsWith(`${gen}L`)) { try { level=parseInt(s.slice(2)); break; } catch(_){} }
      }
      if (level !== null) break;
    }
    if (level === null) continue;
    const m = mvdb[mk];
    if (!m) continue;
    levelMoves.push({level, name:m.name||mk, type:m.type||'Normal', category:m.category||'Status',
      base_power:m.basePower||0, accuracy: m.accuracy===true?'always':m.accuracy});
  }
  levelMoves.sort((a,b) => a.level-b.level);
  return {
    name: poke.name || pokemonName,
    types, stats,
    bst: Object.values(stats).reduce((s,v)=>s+v,0),
    abilities,
    tier: fmt.tier || 'Untiered',
    role: _detectRole(stats),
    weaknesses: _weaknessChart(types, abilities[0]||''),
    level_moves: levelMoves.slice(0,30),
    top_moves: topMoves,
    atk_stat: _calcStat(stats.atk||0, 252),
    spa_stat: _calcStat(stats.spa||0, 252),
    hp_stat:  _calcStat(stats.hp||0, 0, 31, true),
    spe_stat: _calcStat(stats.spe||0),
  };
}

function _calcDamage(atkName, defName, moveName, zmove=false) {
  const pd = _sd.pokedex||{}, mv = _sd.moves||{};
  const atk = pd[_key(atkName)]; if (!atk) return {error:`Unknown: ${atkName}`};
  const def = pd[_key(defName)]; if (!def) return {error:`Unknown: ${defName}`};
  const move = mv[_key(moveName)]; if (!move) return {error:`Unknown move: ${moveName}`};
  let bp = move.basePower||0;
  if (!bp) return {error:`${move.name||moveName} is a status move`};
  if (zmove) bp = _zPower(bp);
  const cat  = move.category||'Physical';
  const mtyp = move.type||'Normal';
  const as   = atk.baseStats||{}, ds = def.baseStats||{};
  const atkV = cat==='Physical' ? _calcStat(as.atk||70,252) : _calcStat(as.spa||70,252);
  const defV = cat==='Physical' ? _calcStat(ds.def||70)     : _calcStat(ds.spd||70);
  const base = Math.floor(Math.floor(Math.floor(2*100/5+2)*bp*atkV/defV)/50)+2;
  const stab = (atk.types||[]).includes(mtyp) ? 1.5 : 1;
  const eff  = _typeEff(mtyp, def.types||[]);
  if (eff===0) return {error:null,immune:true,min_pct:0,max_pct:0,min_dmg:0,max_dmg:0,effectiveness:0,stab:stab>1,ohko:false,two_hko:false,hits_to_ko:[0,0],category:cat,move_type:mtyp,attacker_speed:_calcStat(as.spe||50),defender_speed:_calcStat(ds.spe||50),is_z:zmove};
  const afterStab = stab>1 ? Math.floor(base*3/2) : base;
  const after     = Math.floor(afterStab*eff);
  const minD = Math.floor(after*85/100), maxD = after;
  const defHp = _calcStat(ds.hp||70,0,31,true);
  const minP  = defHp ? +((minD/defHp*100).toFixed(1)) : 0;
  const maxP  = defHp ? +((maxD/defHp*100).toFixed(1)) : 0;
  return {error:null,immune:false,min_pct:minP,max_pct:maxP,min_dmg:minD,max_dmg:maxD,defender_hp:defHp,effectiveness:eff,stab:stab>1,ohko:minP>=100,two_hko:minP>=50,hits_to_ko:[maxD?Math.ceil(defHp/maxD):99,minD?Math.ceil(defHp/minD):99],category:cat,move_type:mtyp,is_z:zmove,attacker_speed:_calcStat(as.spe||50),defender_speed:_calcStat(ds.spe||50)};
}

function _bestMoveForPoke(pokeName) {
  const pd = _sd.pokedex||{}, mv = _sd.moves||{};
  const poke = pd[_key(pokeName)]; if (!poke) return null;
  const ls = poke._learnset || {};
  const types = poke.types||[], stats = poke.baseStats||{};
  const preferSp = (stats.spa||0) >= (stats.atk||0);
  const atkVal = _calcStat(stats.atk||70,252), spaVal = _calcStat(stats.spa||70,252);
  let best = null, bestScore = -1;
  for (const [mk, sources] of Object.entries(ls)) {
    if (!sources.some(s=>s.startsWith('9')||s.startsWith('8'))) continue;
    const m = mv[mk]; if (!m) continue;
    const cat = m.category; if (cat==='Status') continue;
    const bp = m.basePower||0; if (!bp) continue;
    const mt = m.type||'Normal';
    const stab = types.includes(mt)?1.5:1;
    const sv = cat==='Special'?spaVal:atkVal;
    const score = bp*stab*sv;
    if (score > bestScore) { bestScore=score; best={key:mk,...m}; }
  }
  return best;
}

async function _counterVerdict(atkName, defName) {
  if (!_sdReady) await _sdLoad();
  const pd = _sd.pokedex||{};
  const atkPoke = pd[_key(atkName)]; if (!atkPoke) return {error:`Unknown: ${atkName}`};
  const defPoke = pd[_key(defName)]; if (!defPoke) return {error:`Unknown: ${defName}`};
  const ls = await _getLearnsets();
  atkPoke._learnset = ls?.[_key(atkName)]?.learnset||{};
  defPoke._learnset = ls?.[_key(defName)]?.learnset||{};
  const atkBest = _bestMoveForPoke(atkName);
  const defBest = _bestMoveForPoke(defName);
  if (!atkBest) return {error:`No usable moves for ${atkName}`};
  if (!defBest) return {error:`No usable moves for ${defName}`};
  const atkR = _calcDamage(atkName, defName, atkBest.name||atkBest.key);
  const defR = _calcDamage(defName, atkName, defBest.name||defBest.key);
  if (atkR.error||defR.error) return {error:atkR.error||defR.error};
  const as = atkPoke.baseStats||{}, ds = defPoke.baseStats||{};
  const atkSpe = _calcStat(as.spe||50), defSpe = _calcStat(ds.spe||50);
  const faster = atkSpe>defSpe?'attacker':defSpe>atkSpe?'defender':'tie';
  const s1 = atkR.max_pct<100, s2 = atkR.max_pct<50, dd = defR.max_pct;
  let verdict, desc;
  if (s2 && dd>=60 && (faster==='defender'||s1)) { verdict='Strong Counter'; desc=`${defName} survives 2 hits and deals ${dd.toFixed(1)}% back.`; }
  else if (s1 && dd>=40)  { verdict='Soft Check';  desc=`${defName} survives 1 hit and deals ${dd.toFixed(1)}% back.`; }
  else if (!s1 && dd>=80) { verdict='Speed Check'; desc=`${defName} gets OHKO'd but deals ${dd.toFixed(1)}% if faster.`; }
  else                    { verdict='Bad Matchup'; desc=`${defName} takes ${atkR.max_pct.toFixed(1)}% and deals only ${dd.toFixed(1)}% back.`; }
  return {error:null,verdict,verdict_desc:desc,faster,attacker_speed:atkSpe,defender_speed:defSpe,atk_move:atkBest.name||atkBest.key,atk_min_pct:atkR.min_pct,atk_max_pct:atkR.max_pct,def_move:defBest.name||defBest.key,def_min_pct:defR.min_pct,def_max_pct:defR.max_pct,def_survives_1:s1,def_survives_2:s2,attacker:atkName,defender:defName};
}

// ── BossInfo API routes ───────────────────────────────────────────────────────

// GET /api/bossinfo/search?q=garc
app.get('/api/bossinfo/search', async (req, res) => {
  try {
    if (!_sdReady) await _sdLoad();
    const q = (req.query.q||'').toLowerCase().replace(/[\s\-.]/g,'');
    const pd = _sd.pokedex||{};
    const results = [];
    for (const [k,v] of Object.entries(pd)) {
      if (!q || k.includes(q) || _key(v.name||'').includes(q)) {
        results.push(v.name||k);
        if (results.length >= 25) break;
      }
    }
    res.json({results});
  } catch(e) { res.status(500).json({error:e.message}); }
});

// GET /api/bossinfo/analyze?pokemon=X[&tera=Y]
app.get('/api/bossinfo/analyze', async (req, res) => {
  const {pokemon, tera} = req.query;
  if (!pokemon) return res.status(400).json({error:'pokemon required'});
  try {
    const data = await _fullAnalysis(pokemon);
    if (!data) return res.status(404).json({error:`${pokemon} not found in Showdown data`});
    if (tera) {
      const valid = ['Normal','Fire','Water','Grass','Electric','Ice','Fighting','Poison','Ground','Flying','Psychic','Bug','Rock','Ghost','Dragon','Dark','Steel','Fairy'];
      const tt = valid.find(t=>t.toLowerCase()===tera.toLowerCase());
      if (tt) { data.tera_weaknesses = _weaknessChart([tt],''); data.tera_type = tt; }
    }
    res.json(data);
  } catch(e) { res.status(500).json({error:e.message}); }
});

// GET /api/bossinfo/weakness?pokemon=X[&tera=Y]
app.get('/api/bossinfo/weakness', async (req, res) => {
  const {pokemon, tera} = req.query;
  if (!pokemon) return res.status(400).json({error:'pokemon required'});
  try {
    if (!_sdReady) await _sdLoad();
    const data = await _fullAnalysis(pokemon);
    if (!data) return res.status(404).json({error:`${pokemon} not found. Check the spelling.`});
    const result = { name: data.name, types: data.types, abilities: data.abilities, weaknesses: data.weaknesses };
    if (tera) {
      const valid = ['Normal','Fire','Water','Grass','Electric','Ice','Fighting','Poison',
        'Ground','Flying','Psychic','Bug','Rock','Ghost','Dragon','Dark','Steel','Fairy'];
      const tt = valid.find(t => t.toLowerCase() === tera.toLowerCase());
      if (tt) { result.tera_type = tt; result.weaknesses = _weaknessChart([tt], data.abilities[0]||''); }
    }
    res.json(result);
  } catch(e) { res.status(500).json({error: e.message}); }
});

// GET /api/bossinfo/damage?attacker=X&defender=Y&move=Z[&zmove=true]
app.get('/api/bossinfo/damage', async (req, res) => {
  const {attacker,defender,move,zmove} = req.query;
  if (!attacker||!defender||!move) return res.status(400).json({error:'attacker, defender, move required'});
  try {
    if (!_sdReady) await _sdLoad();
    const result = _calcDamage(attacker, defender, move, zmove==='true');
    // Save to DB
    if (!result.error && req.query.guild_id) {
      sql`INSERT INTO bossinfo_saved_calcs(guild_id,calc_type,label,data,created_by) VALUES(${req.query.guild_id},'damage',${`${attacker} vs ${defender} | ${move}`},${JSON.stringify({attacker,defender,move,zmove:zmove==='true',result})}::jsonb,'dashboard')`.catch(()=>{});
    }
    res.json(result);
  } catch(e) { res.status(500).json({error:e.message}); }
});

// GET /api/bossinfo/counter?attacker=X&defender=Y
app.get('/api/bossinfo/counter', async (req, res) => {
  const {attacker,defender} = req.query;
  if (!attacker||!defender) return res.status(400).json({error:'attacker and defender required'});
  try {
    const result = await _counterVerdict(attacker, defender);
    if (!result.error && req.query.guild_id) {
      sql`INSERT INTO bossinfo_saved_calcs(guild_id,calc_type,label,data,created_by) VALUES(${req.query.guild_id},'counter',${`${attacker} vs ${defender}`},${JSON.stringify(result)}::jsonb,'dashboard')`.catch(()=>{});
    }
    res.json(result);
  } catch(e) { res.status(500).json({error:e.message}); }
});

// GET /api/bossinfo/bestcounters?pokemon=X
app.get('/api/bossinfo/bestcounters', async (req, res) => {
  const {pokemon} = req.query;
  if (!pokemon) return res.status(400).json({error:'pokemon required'});
  try {
    if (!_sdReady) await _sdLoad();
    const pd = _sd.pokedex||{}, fd = _sd.formats_data||{};
    const META = new Set(['OU','UU','RU','(OU)','(UU)']);
    const ls = await _getLearnsets();
    const pool = Object.keys(pd).filter(k => META.has((fd[k]||{}).tier||''));
    const results = [];
    for (const ckey of pool) {
      const cname = pd[ckey].name||ckey;
      if (_key(cname)===_key(pokemon)) continue;
      pd[ckey]._learnset = ls?.[ckey]?.learnset||{};
      const poke = pd[_key(pokemon)]; if (poke && ls) poke._learnset = ls[_key(pokemon)]?.learnset||{};
      try {
        const r = await _counterVerdict(pokemon, cname);
        if (r.error) continue;
        if (['Strong Counter','Soft Check','Speed Check'].includes(r.verdict)) {
          const score = r.def_max_pct*0.4+(50-r.atk_max_pct)*0.6+(r.verdict==='Strong Counter'?10:0);
          results.push({...r,score,candidate:cname});
        }
      } catch(_){}
    }
    results.sort((a,b)=>b.score-a.score);
    res.json({pokemon,counters:results.slice(0,3)});
  } catch(e) { res.status(500).json({error:e.message}); }
});

// GET /api/bossinfo/raidbosses?guild_id=X — for bot to fetch raid boss list
app.get('/api/bossinfo/raidbosses', async (req, res) => {
  const { guild_id, pokemon_key } = req.query;
  if (!guild_id) return res.status(400).json({ error: 'guild_id required' });
  try {
    const parseRow = r => ({
      ...r,
      counters: typeof r.counters === 'string' ? JSON.parse(r.counters || '[]') : (r.counters || []),
      types:    typeof r.types    === 'string' ? JSON.parse(r.types    || '[]') : (r.types    || []),
    });
    if (pokemon_key) {
      const pkey = pokemon_key.toLowerCase().replace(/[\s\-']/g, '');
      const rows = await sql`SELECT * FROM raid_bosses WHERE guild_id=${guild_id} AND pokemon_key=${pkey} AND is_active=TRUE LIMIT 1`;
      return res.json(rows[0] ? parseRow(rows[0]) : null);
    }
    const rows = await sql`SELECT * FROM raid_bosses WHERE guild_id=${guild_id} AND is_active=TRUE ORDER BY display_name ASC`;
    res.json({ bosses: rows.map(parseRow) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// BossInfo DB endpoints (saved calcs, popular, EV sets)
app.get('/api/bossinfo/db/popular', async (req,res) => {
  const {guild_id}=req.query;
  if (!guild_id) return res.status(400).json({error:'guild_id required'});
  try {
    const rows = await sql`SELECT pokemon_key, COUNT(*)::int AS cnt FROM bossinfo_log WHERE guild_id=${guild_id} GROUP BY pokemon_key ORDER BY cnt DESC LIMIT 10`;
    res.json({popular:rows});
  } catch(e){res.status(500).json({error:e.message});}
});
app.get('/api/bossinfo/db/calcs', async (req,res) => {
  const {guild_id,calc_type}=req.query;
  if (!guild_id) return res.status(400).json({error:'guild_id required'});
  try {
    const rows = calc_type
      ? await sql`SELECT id,guild_id,calc_type,label,data,created_by,created_at FROM bossinfo_saved_calcs WHERE guild_id=${guild_id} AND calc_type=${calc_type} ORDER BY created_at DESC LIMIT 50`
      : await sql`SELECT id,guild_id,calc_type,label,data,created_by,created_at FROM bossinfo_saved_calcs WHERE guild_id=${guild_id} ORDER BY created_at DESC LIMIT 50`;
    res.json({calcs:rows});
  } catch(e){res.status(500).json({error:e.message});}
});
app.post('/api/bossinfo/db/calcs', async (req,res) => {
  const {guild_id,calc_type,label,data}=req.body;
  if (!guild_id||!calc_type||!data) return res.status(400).json({error:'guild_id, calc_type, data required'});
  try {
    await sql`INSERT INTO bossinfo_saved_calcs(guild_id,calc_type,label,data,created_by) VALUES(${guild_id},${calc_type},${label||null},${JSON.stringify(data)}::jsonb,'dashboard')`;
    res.json({ok:true});
  } catch(e){res.status(500).json({error:e.message});}
});
app.delete('/api/bossinfo/db/calcs/:id', async (req,res) => {
  const {guild_id}=req.query; const id=parseInt(req.params.id);
  if (!guild_id||!id) return res.status(400).json({error:'guild_id and id required'});
  try { await sql`DELETE FROM bossinfo_saved_calcs WHERE id=${id} AND guild_id=${guild_id}`; res.json({ok:true}); }
  catch(e){res.status(500).json({error:e.message});}
});


// Export the app for Vercel (serverless) usage.
// When running locally (node server/index.js), start the HTTP server normally.
export default app;

if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`✅  API server running on http://localhost:${PORT}`);
    console.log(`   NeonDB: ${DATABASE_URL.replace(/:([^:@]+)@/, ':***@')}`);
  });
}