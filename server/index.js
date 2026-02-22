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

const DATABASE_URL = process.env.NEON_DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌  NEON_DATABASE_URL is not set. Copy .env.example to .env and add your connection string.');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

// ── Helpers ───────────────────────────────────────────────────────────────────
function ok(res, data) {
  res.json({ success: true, data });
}

function err(res, message, status = 400) {
  console.error(`API error: ${message}`);
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

  try {
    switch (action) {

      case 'discoverGuilds': {
        const tables = [
          'guild_settings', 'custom_commands', 'auto_responders', 'tickets',
          'audit_logs', 'guild_members', 'reaction_roles', 'button_roles',
          'info_topics', 'votes', 'triggers', 'warns_data', 'mod_actions',
        ];
        const results = [];
        for (const table of tables) {
          try {
            const rows = await sql(
              `SELECT guild_id::text, '${table}' AS source, COUNT(*)::int AS count
               FROM ${table} WHERE guild_id IS NOT NULL GROUP BY guild_id`
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
          { key: 'triggerCount', q: `SELECT COUNT(*)::int AS c FROM triggers        WHERE guild_id = $1::bigint` },
          { key: 'autoRespCount',q: `SELECT COUNT(*)::int AS c FROM auto_responders WHERE guild_id = $1` },
          { key: 'voteCount',    q: `SELECT COUNT(*)::int AS c FROM votes           WHERE guild_id = $1::bigint` },
          { key: 'topicCount',   q: `SELECT COUNT(*)::int AS c FROM info_topics     WHERE guild_id = $1::bigint` },
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
            (guild_id, prefix, use_slash_commands, moderation_enabled, levelling_enabled,
             fun_enabled, tickets_enabled, custom_commands_enabled, auto_responders_enabled, global_cooldown)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
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
        await sql(
          `INSERT INTO custom_commands
            (guild_id, trigger, name, description, response, response_type,
             permission_level, cooldown_seconds, is_tag, is_enabled, usage_count, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,0,'dashboard')`,
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
            (guild_id, trigger_text, match_type, response, response_type, is_enabled, trigger_count, created_by)
           VALUES ($1,$2,$3,$4,$5,true,0,'dashboard')`,
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
          `SELECT * FROM triggers WHERE guild_id = $1::bigint ORDER BY created_at DESC`,
          [params.guildId]
        ).catch(() => []);
        return ok(res, rows);
      }

      case 'createTrigger': {
        const d = params.data;
        await sql(
          `INSERT INTO triggers (guild_id, trigger_text, response, match_type, enabled, use_count)
           VALUES ($1::bigint,$2,$3,$4,true,0)`,
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
          `SELECT * FROM votes WHERE guild_id = $1::bigint ORDER BY created_at DESC`,
          [params.guildId]
        ).catch(() => []);
        return ok(res, rows);
      }

      case 'createVote': {
        if (params.channelId && !/^\d{17,19}$/.test(params.channelId)) {
          return err(res, 'Invalid channel ID — must be 17–19 digits');
        }
        await sql(
          `INSERT INTO votes (guild_id, question, options, results_posted, channel_id)
           VALUES ($1::bigint,$2,$3,false,$4)`,
          [params.guildId, params.question, JSON.stringify(params.options ?? []), params.channelId || null]
        );
        return ok(res, { success: true });
      }

      case 'deleteVote': {
        await sql(`DELETE FROM votes WHERE id=$1`, [params.id]);
        return ok(res, { success: true });
      }

      // ── Info Topics ──
      case 'getInfoTopics': {
        const rows = await sql(
          `SELECT * FROM info_topics WHERE guild_id = $1::bigint ORDER BY section, subcategory, name`,
          [params.guildId]
        ).catch(() => []);
        return ok(res, rows);
      }

      case 'createInfoTopic': {
        const d = params.data;
        await sql(
          `INSERT INTO info_topics
            (guild_id, section, subcategory, topic_id, name, embed_title, embed_description, embed_color, emoji)
           VALUES ($1::bigint,$2,$3,$4,$5,$6,$7,$8,$9)`,
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
           WHERE id=$8`,
          [d.section ?? 'common', d.subcategory ?? 'General', d.name,
           d.embed_title ?? null, d.embed_description ?? null,
           d.embed_color ?? '#5865F2', d.emoji ?? '📄', params.id]
        );
        return ok(res, { success: true });
      }

      case 'deleteInfoTopic': {
        await sql(`DELETE FROM info_topics WHERE id=$1`, [params.id]);
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

      default:
        return err(res, `Unknown action: ${action}`);
    }
  } catch (e) {
    return err(res, e.message, 500);
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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅  API server running on http://localhost:${PORT}`);
  console.log(`   NeonDB: ${DATABASE_URL.replace(/:([^:@]+)@/, ':***@')}`);
});
