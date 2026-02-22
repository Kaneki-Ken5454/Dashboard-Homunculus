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
  ];
  for (const ddl of ddls) {
    try { await sql(ddl); } catch (e) { console.warn('[DDL]', e.message?.slice(0, 80)); }
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
          { key: 'warnCount',    q: `SELECT COALESCE(SUM(jsonb_array_length(warns)), 0)::int AS c FROM warns_data WHERE guild_id::text = $1` },
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
      case 'getCustomCommands': {
        const rows = await sql(
          `SELECT * FROM custom_commands WHERE guild_id = $1 ORDER BY created_at DESC`,
          [params.guildId]
        ).catch(() => []);
        return ok(res, rows);
      }

      case 'createCustomCommand': {
        const d = params.data;
        // id is BIGSERIAL - DO NOT INSERT it; updated_at has NOT NULL DEFAULT NOW()
        await sql(
          `INSERT INTO custom_commands
            (guild_id, trigger, name, description, response, response_type,
             permission_level, cooldown_seconds, is_tag, is_enabled, usage_count, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,0,NOW(),NOW())`,
          [params.guildId, d.trigger, d.name ?? null, d.description ?? null,
           d.response, d.response_type ?? 'text', d.permission_level ?? 'everyone',
           d.cooldown_seconds ?? 0, d.is_tag ?? false]
        );
        return ok(res, { success: true });
      }

      case 'updateCustomCommand': {
        const d = params.data;
        await sql(
          `UPDATE custom_commands SET
             trigger=$1, name=$2, description=$3, response=$4,
             permission_level=$5, cooldown_seconds=$6, is_enabled=$7, is_tag=$8, updated_at=now()
           WHERE id=$9`,
          [d.trigger, d.name ?? null, d.description ?? null, d.response,
           d.permission_level ?? 'everyone', d.cooldown_seconds ?? 0,
           d.is_enabled ?? true, d.is_tag ?? false, params.id]
        );
        return ok(res, { success: true });
      }

      case 'deleteCustomCommand': {
        await sql(`DELETE FROM custom_commands WHERE id=$1`, [params.id]);
        return ok(res, { success: true });
      }

      // ── Auto Responders ──
      case 'getAutoResponders': {
        const rows = await sql(
          `SELECT * FROM auto_responders WHERE guild_id = $1 ORDER BY created_at DESC`,
          [params.guildId]
        ).catch(() => []);
        return ok(res, rows);
      }

      case 'createAutoResponder': {
        const d = params.data;
        await sql(
          `INSERT INTO auto_responders
            (id, guild_id, trigger_text, match_type, response, response_type, is_enabled, trigger_count, created_by)
           VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,true,0,'dashboard')`,
          [params.guildId, d.trigger_text, d.match_type ?? 'contains', d.response, d.response_type ?? 'text']
        );
        return ok(res, { success: true });
      }

      case 'updateAutoResponder': {
        const d = params.data;
        await sql(
          `UPDATE auto_responders SET
             trigger_text=$1, match_type=$2, response=$3, is_enabled=$4, updated_at=now()
           WHERE id=$5`,
          [d.trigger_text, d.match_type ?? 'contains', d.response, d.is_enabled ?? true, params.id]
        );
        return ok(res, { success: true });
      }

      case 'deleteAutoResponder': {
        await sql(`DELETE FROM auto_responders WHERE id=$1`, [params.id]);
        return ok(res, { success: true });
      }

      // ── Triggers ──
      case 'getTriggers': {
        const rows = await sql(
          `SELECT * FROM triggers WHERE guild_id::text = $1 ORDER BY created_at DESC`,
          [params.guildId]
        ).catch(() => []);
        return ok(res, rows);
      }

      case 'createTrigger': {
        const d = params.data;
        await sql(
          `INSERT INTO triggers (guild_id, trigger_text, response, match_type, enabled, use_count)
           VALUES ($1,$2,$3,$4,true,0)`,
          [params.guildId, d.trigger_text, d.response, d.match_type ?? 'contains']
        );
        return ok(res, { success: true });
      }

      case 'updateTrigger': {
        const d = params.data;
        await sql(
          `UPDATE triggers SET trigger_text=$1, response=$2, match_type=$3, enabled=$4, updated_at=now() WHERE id=$5`,
          [d.trigger_text, d.response, d.match_type ?? 'contains', d.enabled ?? true, params.id]
        );
        return ok(res, { success: true });
      }

      case 'deleteTrigger': {
        await sql(`DELETE FROM triggers WHERE id=$1`, [params.id]);
        return ok(res, { success: true });
      }

      // ── Tickets ──
      case 'getTickets': {
        const rows = await sql(
          `SELECT * FROM tickets WHERE guild_id = $1 ORDER BY opened_at DESC LIMIT 200`,
          [params.guildId]
        ).catch(() => []);
        return ok(res, rows);
      }

      case 'updateTicketStatus': {
        const closedAt = params.status === 'closed' ? new Date().toISOString() : null;
        await sql(`UPDATE tickets SET status=$1, closed_at=$2 WHERE id=$3`, [params.status, closedAt, params.id]);
        return ok(res, { success: true });
      }

      case 'deleteTicket': {
        await sql(`DELETE FROM tickets WHERE id=$1`, [params.id]);
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
        await sql(`DELETE FROM audit_logs WHERE id=$1`, [params.id]);
        return ok(res, { success: true });
      }

      // ── Warns ──
      case 'getWarns': {
        const rawRows = await sql(
          `SELECT * FROM warns_data WHERE guild_id::text = $1`,
          [params.guildId]
        ).catch(() => []);
        const flat = [];
        for (const row of rawRows) {
          const warns = Array.isArray(row.warns) ? row.warns : [];
          for (const w of warns) {
            flat.push({
              id: `${row.id}-${w.timestamp || Math.random()}`,
              guild_id: String(row.guild_id),
              user_id: row.user_id,
              moderator_id: w.moderator_id ? String(w.moderator_id) : w.moderator || '—',
              reason: w.reason || null,
              severity: w.severity || 'low',
              created_at: w.timestamp || row.created_at || new Date().toISOString(),
            });
          }
        }
        flat.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        return ok(res, flat);
      }

      case 'deleteWarn': {
        await sql(`DELETE FROM warns_data WHERE id=$1`, [params.id]);
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
          `INSERT INTO votes (vote_id, guild_id, question, options, results_posted, channel_id,
                              start_time, end_time, anonymous, created_at)
           VALUES (gen_random_uuid()::text, $1, $2, $3::jsonb, false, $4,
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
        // id is BIGSERIAL - DO NOT INSERT it, let Postgres auto-generate
        await sql(
          `INSERT INTO info_topics
            (guild_id, section, subcategory, topic_id, name, embed_title, embed_description, embed_color, emoji)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [params.guildId, d.section ?? 'common', d.subcategory ?? 'General',
           d.topic_id || (d.name || '').toLowerCase().replace(/\s+/g, '_'),
           d.name, d.embed_title ?? null, d.embed_description ?? null,
           d.embed_color ?? '#5865F2', d.emoji ?? '📄']
        );
        return ok(res, { success: true });
      }

      case 'updateInfoTopic': {
        const d = params.data;
        await sql(
          `UPDATE info_topics SET
             section=$1, subcategory=$2, name=$3, embed_title=$4,
             embed_description=$5, embed_color=$6, emoji=$7, updated_at=now()
           WHERE id=$8::bigint`,
          [d.section ?? 'common', d.subcategory ?? 'General', d.name,
           d.embed_title ?? null, d.embed_description ?? null,
           d.embed_color ?? '#5865F2', d.emoji ?? '📄', params.id]
        );
        return ok(res, { success: true });
      }

      case 'deleteInfoTopic': {
        await sql(`DELETE FROM info_topics WHERE id=$1::bigint`, [params.id]);
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
              id: `warndata-${row.id}-${w.timestamp || Math.random()}`,
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