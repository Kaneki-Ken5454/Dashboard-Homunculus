import postgres from "npm:postgres@3.4.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function getDb() {
  const url = Deno.env.get("NEON_DATABASE_URL");
  if (!url) throw new Error("NEON_DATABASE_URL not configured");
  return postgres(url, { ssl: "require", max: 1 });
}

async function ensureTables(sql: any) {
  // Create missing tables if they don't exist
  await sql`
    CREATE TABLE IF NOT EXISTS tickets (
      id BIGSERIAL PRIMARY KEY,
      guild_id BIGINT NOT NULL,
      title TEXT NOT NULL,
      user_id TEXT NOT NULL,
      username TEXT NOT NULL DEFAULT 'Unknown',
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
      priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
      category TEXT NOT NULL DEFAULT 'general',
      claimed_by TEXT,
      messages_count INT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS reaction_roles (
      id BIGSERIAL PRIMARY KEY,
      guild_id BIGINT NOT NULL,
      message_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      emoji TEXT NOT NULL,
      role_id TEXT NOT NULL,
      role_name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'reaction' CHECK (type IN ('reaction','button')),
      created_by TEXT DEFAULT 'dashboard',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS custom_commands (
      id BIGSERIAL PRIMARY KEY,
      guild_id BIGINT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      response TEXT NOT NULL,
      permission_level TEXT NOT NULL DEFAULT 'everyone',
      is_enabled BOOLEAN DEFAULT TRUE,
      cooldown_seconds INT DEFAULT 3,
      use_count INT DEFAULT 0,
      created_by TEXT DEFAULT 'dashboard',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(guild_id, name)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS ticket_panels (
      id BIGSERIAL PRIMARY KEY,
      guild_id BIGINT NOT NULL,
      name TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      category_id TEXT,
      message TEXT NOT NULL,
      button_label TEXT NOT NULL DEFAULT 'Open Ticket',
      button_color TEXT NOT NULL DEFAULT 'primary',
      created_by TEXT DEFAULT 'dashboard',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, params } = await req.json();
    const sql = getDb();
    let result: unknown;

    try {
      switch (action) {
        case "inspectSchema": {
          result = await sql`
            SELECT table_name, column_name, data_type, is_nullable, column_default
            FROM information_schema.columns WHERE table_schema = 'public'
            ORDER BY table_name, ordinal_position
          `;
          break;
        }

        case "ensureTables": {
          await ensureTables(sql);
          result = { success: true };
          break;
        }

        // ============ GUILD STATS ============
        case "getGuildStats": {
          const guildId = params?.guildId || "1234567890123456789";
          const gid = BigInt(guildId);
          const usersResult = await sql`SELECT COUNT(DISTINCT user_id)::int as count FROM messages WHERE guild_id = ${gid}`;
          const votesResult = await sql`SELECT COUNT(*)::int as count FROM votes WHERE guild_id = ${gid} AND end_time > NOW()`;
          const msgsResult = await sql`SELECT COUNT(*)::int as count FROM messages WHERE guild_id = ${gid}`;
          const weeklyResult = await sql`SELECT COUNT(*)::int as count FROM messages WHERE guild_id = ${gid} AND timestamp >= NOW() - INTERVAL '7 days'`;
          result = {
            totalMembers: usersResult[0]?.count || 0,
            activeVotes: votesResult[0]?.count || 0,
            totalMessages: msgsResult[0]?.count || 0,
            weeklyActivity: weeklyResult[0]?.count || 0,
          };
          break;
        }

        // ============ TOP MEMBERS ============
        case "getTopMembers": {
          const { guildId = "1234567890123456789", limit = 10 } = params || {};
          const gid = BigInt(guildId);
          result = await sql`
            SELECT 
              ts.user_id::text as id,
              ts.guild_id::text as guild_id,
              ts.user_id::text as user_id,
              'User#' || ts.user_id::text as username,
              '0000' as discriminator,
              NULL as avatar_url,
              ts.last_updated as joined_at,
              ts.last_updated as last_active,
              COALESCE((SELECT COUNT(*)::int FROM messages m WHERE m.user_id = ts.user_id AND m.guild_id = ts.guild_id), 0) as message_count,
              COALESCE(ts.helpful_votes, 0) as vote_count,
              ARRAY[]::text[] as role_ids
            FROM trust_scores ts
            WHERE ts.guild_id = ${gid}
            ORDER BY ts.total_contributions DESC, ts.activity_score DESC
            LIMIT ${limit}
          `;
          break;
        }

        // ============ VOTES ============
        case "getActiveVotes": {
          const guildId = params?.guildId || "1234567890123456789";
          const gid = BigInt(guildId);
          const rows = await sql`
            SELECT id, vote_id, guild_id::text as guild_id, question, options, channel_id::text as channel_id,
              start_time, end_time, results_posted, created_at,
              (end_time > NOW()) as is_active
            FROM votes WHERE guild_id = ${gid} AND end_time > NOW()
            ORDER BY created_at DESC
          `;
          result = rows.map((r: any) => ({
            ...r,
            total_votes: 0,
            is_active: true,
            options: typeof r.options === 'string' ? JSON.parse(r.options) : r.options,
          }));
          break;
        }

        case "getAllVotes": {
          const guildId = params?.guildId || "1234567890123456789";
          const gid = BigInt(guildId);
          const rows = await sql`
            SELECT id, vote_id, guild_id::text as guild_id, question, options, channel_id::text as channel_id,
              start_time, end_time, results_posted, created_at
            FROM votes WHERE guild_id = ${gid}
            ORDER BY created_at DESC
          `;
          result = rows.map((r: any) => ({
            ...r,
            is_active: r.end_time && new Date(r.end_time) > new Date(),
            total_votes: 0,
            options: typeof r.options === 'string' ? JSON.parse(r.options) : r.options,
          }));
          break;
        }

        // ============ EMBEDS ============
        case "getEmbeds": {
          const guildId = params?.guildId || "1234567890123456789";
          const gid = BigInt(guildId);
          const rows = await sql`
            SELECT id, guild_id::text as guild_id, name, embed_data, created_at, updated_at
            FROM embeds WHERE guild_id = ${gid}
            ORDER BY created_at DESC
          `;
          result = rows.map((r: any) => {
            const data = typeof r.embed_data === 'string' ? JSON.parse(r.embed_data) : (r.embed_data || {});
            return {
              id: String(r.id),
              guild_id: r.guild_id,
              name: r.name,
              title: data.title || r.name,
              description: data.description || '',
              color: data.color || '#6366f1',
              footer: data.footer?.text || data.footer || '',
              thumbnail_url: data.thumbnail?.url || null,
              image_url: data.image?.url || null,
              fields: data.fields || [],
              created_by: 'bot',
              created_at: r.created_at,
              updated_at: r.updated_at,
            };
          });
          break;
        }

        case "createEmbed": {
          const { embed, guildId = "1234567890123456789" } = params || {};
          const gid = BigInt(guildId);
          const embedData = {
            title: embed.title,
            description: embed.description,
            color: embed.color,
            footer: embed.footer ? { text: embed.footer } : undefined,
            fields: embed.fields || [],
          };
          const rows = await sql`
            INSERT INTO embeds (guild_id, name, embed_data)
            VALUES (${gid}, ${embed.name}, ${JSON.stringify(embedData)})
            RETURNING *
          `;
          const r = rows[0];
          result = {
            id: String(r.id),
            guild_id: String(r.guild_id),
            name: r.name,
            title: embed.title,
            description: embed.description,
            color: embed.color,
            footer: embed.footer,
            created_at: r.created_at,
            updated_at: r.updated_at,
          };
          break;
        }

        case "deleteEmbed": {
          await sql`DELETE FROM embeds WHERE id = ${Number(params.id)}`;
          result = { success: true };
          break;
        }

        // ============ TRIGGERS ============
        case "getTriggers": {
          const guildId = params?.guildId || "1234567890123456789";
          const gid = BigInt(guildId);
          const rows = await sql`
            SELECT id, guild_id::text as guild_id, trigger_text, response, match_type,
              enabled as is_enabled, use_count as trigger_count,
              'bot' as created_by, created_at, updated_at
            FROM triggers WHERE guild_id = ${gid}
            ORDER BY created_at DESC
          `;
          result = rows.map((r: any) => ({ ...r, id: String(r.id) }));
          break;
        }

        case "createTrigger": {
          const { trigger, guildId = "1234567890123456789" } = params || {};
          const gid = BigInt(guildId);
          const rows = await sql`
            INSERT INTO triggers (guild_id, trigger_text, response, match_type, enabled)
            VALUES (${gid}, ${trigger.trigger_text}, ${trigger.response}, ${trigger.match_type || "contains"}, ${trigger.is_enabled !== false})
            RETURNING *, enabled as is_enabled, use_count as trigger_count
          `;
          result = { ...rows[0], id: String(rows[0].id), created_by: 'dashboard' };
          break;
        }

        case "updateTrigger": {
          const { id, updates } = params || {};
          if (updates.is_enabled !== undefined) {
            const rows = await sql`
              UPDATE triggers SET enabled = ${updates.is_enabled}, updated_at = NOW()
              WHERE id = ${Number(id)} RETURNING *, enabled as is_enabled, use_count as trigger_count
            `;
            result = rows[0] ? { ...rows[0], id: String(rows[0].id) } : null;
          } else {
            const rows = await sql`
              UPDATE triggers SET
                trigger_text = COALESCE(${updates.trigger_text || null}, trigger_text),
                response = COALESCE(${updates.response || null}, response),
                match_type = COALESCE(${updates.match_type || null}, match_type),
                updated_at = NOW()
              WHERE id = ${Number(id)} RETURNING *, enabled as is_enabled, use_count as trigger_count
            `;
            result = rows[0] ? { ...rows[0], id: String(rows[0].id) } : null;
          }
          break;
        }

        case "deleteTrigger": {
          await sql`DELETE FROM triggers WHERE id = ${Number(params.id)}`;
          result = { success: true };
          break;
        }

        // ============ INFO TOPICS ============
        case "getInfoTopics": {
          const { guildId = "1234567890123456789", category } = params || {};
          const gid = BigInt(guildId);
          let rows;
          if (category) {
            rows = await sql`
              SELECT id, guild_id::text as guild_id, section as category,
                name as title, embed_description as content, subcategory as section,
                views as view_count, 'bot' as created_by, created_at, updated_at
              FROM info_topics WHERE guild_id = ${gid} AND section = ${category}
              ORDER BY created_at DESC
            `;
          } else {
            rows = await sql`
              SELECT id, guild_id::text as guild_id, section as category,
                name as title, embed_description as content, subcategory as section,
                views as view_count, 'bot' as created_by, created_at, updated_at
              FROM info_topics WHERE guild_id = ${gid}
              ORDER BY created_at DESC
            `;
          }
          result = rows.map((r: any) => ({ ...r, id: String(r.id), content: r.content || '' }));
          break;
        }

        // ============ ACTIVITY ANALYTICS ============
        case "getActivityAnalytics": {
          const { guildId = "1234567890123456789", days = 7 } = params || {};
          const gid = BigInt(guildId);
          result = await sql`
            SELECT 'message' as activity_type, timestamp as created_at
            FROM messages
            WHERE guild_id = ${gid} AND timestamp >= NOW() - make_interval(days => ${days})
            ORDER BY timestamp ASC
          `;
          break;
        }

        // ============ TOP CHANNELS ============
        case "getTopChannels": {
          const { guildId = "1234567890123456789", limit = 5 } = params || {};
          const gid = BigInt(guildId);
          result = await sql`
            SELECT channel_id::text as channel_id, COUNT(*)::int as message_count
            FROM messages
            WHERE guild_id = ${gid} AND channel_id IS NOT NULL
            GROUP BY channel_id
            ORDER BY message_count DESC
            LIMIT ${limit}
          `;
          break;
        }

        // ============ AUDIT LOG ============
        case "getAuditLogs": {
          const { guildId = "1234567890123456789", severity, search, limit = 50 } = params || {};
          const gid = BigInt(guildId);
          let rows;
          if (search) {
            const searchPattern = "%" + search + "%";
            rows = await sql`
              SELECT id, guild_id::text as guild_id, action_type as action,
                mod_id::text as username, mod_id::text as user_id,
                COALESCE(reason, '') as details,
                CASE 
                  WHEN action_type IN ('ban', 'kick') THEN 'error'
                  WHEN action_type IN ('warn', 'mute') THEN 'warning'
                  WHEN action_type IN ('unban', 'unmute') THEN 'success'
                  ELSE 'info'
                END as severity,
                timestamp as created_at
              FROM mod_actions WHERE guild_id = ${gid}
              AND (action_type ILIKE ${searchPattern} OR reason ILIKE ${searchPattern} OR mod_id::text ILIKE ${searchPattern})
              ORDER BY timestamp DESC LIMIT ${limit}
            `;
          } else {
            rows = await sql`
              SELECT id, guild_id::text as guild_id, action_type as action,
                mod_id::text as username, mod_id::text as user_id,
                COALESCE(reason, '') as details,
                CASE 
                  WHEN action_type IN ('ban', 'kick') THEN 'error'
                  WHEN action_type IN ('warn', 'mute') THEN 'warning'
                  WHEN action_type IN ('unban', 'unmute') THEN 'success'
                  ELSE 'info'
                END as severity,
                timestamp as created_at
              FROM mod_actions WHERE guild_id = ${gid}
              ORDER BY timestamp DESC LIMIT ${limit}
            `;
          }
          let mapped = rows.map((r: any) => ({ ...r, id: String(r.id) }));
          if (severity && severity !== 'all') {
            mapped = mapped.filter((r: any) => r.severity === severity);
          }
          result = mapped;
          break;
        }

        // ============ BOT SETTINGS ============
        case "getBotSettings": {
          const guildId = params?.guildId || "1234567890123456789";
          const gid = BigInt(guildId);
          const rows = await sql`SELECT * FROM guild_config WHERE guild_id = ${gid}`;
          if (rows[0]) {
            const r = rows[0];
            result = {
              id: r.guild_id?.toString(),
              guild_id: r.guild_id?.toString(),
              prefix: "!",
              slash_commands_enabled: true,
              modules: r.modules_enabled ? (typeof r.modules_enabled === 'string' ? (() => { try { return JSON.parse(r.modules_enabled); } catch { return {}; } })() : r.modules_enabled) : {},
              cooldown_seconds: 3,
              ratelimit_per_minute: 20,
              conflict_threshold: r.conflict_threshold,
              min_account_age_days: r.min_account_age_days,
              min_join_age_days: r.min_join_age_days,
              mod_alerts_channel: r.mod_alerts_channel?.toString(),
              rule_updates_channel: r.rule_updates_channel?.toString(),
              weekly_reports_channel: r.weekly_reports_channel?.toString(),
            };
          } else {
            result = null;
          }
          break;
        }

        case "updateBotSettings": {
          const { guildId = "1234567890123456789", settings } = params || {};
          const gid = BigInt(guildId);
          const modulesStr = JSON.stringify(settings.modules || {});
          const rows = await sql`
            INSERT INTO guild_config (guild_id, modules_enabled, conflict_threshold, min_account_age_days, min_join_age_days)
            VALUES (${gid}, ${modulesStr}, ${settings.conflict_threshold || 50}, ${settings.min_account_age_days || 7}, ${settings.min_join_age_days || 1})
            ON CONFLICT (guild_id) DO UPDATE SET
              modules_enabled = EXCLUDED.modules_enabled,
              conflict_threshold = EXCLUDED.conflict_threshold,
              min_account_age_days = EXCLUDED.min_account_age_days,
              min_join_age_days = EXCLUDED.min_join_age_days
            RETURNING *
          `;
          result = rows[0] ? { ...rows[0], guild_id: rows[0].guild_id?.toString(), prefix: settings.prefix || "!", slash_commands_enabled: true } : null;
          break;
        }

        // ============ TICKETS ============
        case "getTickets": {
          await ensureTables(sql);
          const { guildId = "1234567890123456789", status, priority } = params || {};
          const gid = BigInt(guildId);
          let rows;
          if (status && priority) {
            rows = await sql`SELECT * FROM tickets WHERE guild_id = ${gid} AND status = ${status} AND priority = ${priority} ORDER BY created_at DESC`;
          } else if (status) {
            rows = await sql`SELECT * FROM tickets WHERE guild_id = ${gid} AND status = ${status} ORDER BY created_at DESC`;
          } else if (priority) {
            rows = await sql`SELECT * FROM tickets WHERE guild_id = ${gid} AND priority = ${priority} ORDER BY created_at DESC`;
          } else {
            rows = await sql`SELECT * FROM tickets WHERE guild_id = ${gid} ORDER BY created_at DESC`;
          }
          result = rows.map((r: any) => ({ ...r, id: String(r.id), guild_id: String(r.guild_id) }));
          break;
        }

        case "claimTicket": {
          await ensureTables(sql);
          const { id, userId } = params || {};
          const rows = await sql`
            UPDATE tickets SET status = 'in_progress', claimed_by = ${userId}, updated_at = NOW()
            WHERE id = ${Number(id)} RETURNING *
          `;
          result = rows[0] ? { ...rows[0], id: String(rows[0].id), guild_id: String(rows[0].guild_id) } : null;
          break;
        }

        case "closeTicket": {
          await ensureTables(sql);
          const { id } = params || {};
          const rows = await sql`
            UPDATE tickets SET status = 'closed', updated_at = NOW()
            WHERE id = ${Number(id)} RETURNING *
          `;
          result = rows[0] ? { ...rows[0], id: String(rows[0].id), guild_id: String(rows[0].guild_id) } : null;
          break;
        }

        case "createTicket": {
          await ensureTables(sql);
          const { ticket, guildId = "1234567890123456789" } = params || {};
          const gid = BigInt(guildId);
          const rows = await sql`
            INSERT INTO tickets (guild_id, title, user_id, username, status, priority, category)
            VALUES (${gid}, ${ticket.title}, ${ticket.user_id || 'dashboard'}, ${ticket.username || 'Dashboard User'}, ${ticket.status || 'open'}, ${ticket.priority || 'medium'}, ${ticket.category || 'general'})
            RETURNING *
          `;
          result = { ...rows[0], id: String(rows[0].id), guild_id: String(rows[0].guild_id) };
          break;
        }

        // ============ REACTION ROLES ============
        case "getReactionRoles": {
          await ensureTables(sql);
          const guildId = params?.guildId || "1234567890123456789";
          const gid = BigInt(guildId);
          const rows = await sql`SELECT * FROM reaction_roles WHERE guild_id = ${gid} ORDER BY created_at DESC`;
          result = rows.map((r: any) => ({ ...r, id: String(r.id), guild_id: String(r.guild_id) }));
          break;
        }

        case "createReactionRole": {
          await ensureTables(sql);
          const { role, guildId = "1234567890123456789" } = params || {};
          const gid = BigInt(guildId);
          const rows = await sql`
            INSERT INTO reaction_roles (guild_id, message_id, channel_id, emoji, role_id, role_name, type, created_by)
            VALUES (${gid}, ${role.message_id}, ${role.channel_id}, ${role.emoji}, ${role.role_id}, ${role.role_name}, ${role.type || 'reaction'}, ${role.created_by || 'dashboard'})
            RETURNING *
          `;
          result = { ...rows[0], id: String(rows[0].id), guild_id: String(rows[0].guild_id) };
          break;
        }

        case "deleteReactionRole": {
          await ensureTables(sql);
          await sql`DELETE FROM reaction_roles WHERE id = ${Number(params.id)}`;
          result = { success: true };
          break;
        }

        // ============ CUSTOM COMMANDS ============
        case "getCustomCommands": {
          await ensureTables(sql);
          const guildId = params?.guildId || "1234567890123456789";
          const gid = BigInt(guildId);
          const rows = await sql`SELECT * FROM custom_commands WHERE guild_id = ${gid} ORDER BY created_at DESC`;
          result = rows.map((r: any) => ({ ...r, id: String(r.id), guild_id: String(r.guild_id) }));
          break;
        }

        case "createCustomCommand": {
          await ensureTables(sql);
          const { command, guildId = "1234567890123456789" } = params || {};
          const gid = BigInt(guildId);
          const rows = await sql`
            INSERT INTO custom_commands (guild_id, name, description, response, permission_level, is_enabled, cooldown_seconds, created_by)
            VALUES (${gid}, ${command.name}, ${command.description || null}, ${command.response}, ${command.permission_level || 'everyone'}, ${command.is_enabled !== false}, ${command.cooldown_seconds || 3}, ${command.created_by || 'dashboard'})
            RETURNING *
          `;
          result = { ...rows[0], id: String(rows[0].id), guild_id: String(rows[0].guild_id) };
          break;
        }

        case "updateCustomCommand": {
          await ensureTables(sql);
          const { id, updates } = params || {};
          const rows = await sql`
            UPDATE custom_commands SET
              name = COALESCE(${updates.name || null}, name),
              description = COALESCE(${updates.description || null}, description),
              response = COALESCE(${updates.response || null}, response),
              permission_level = COALESCE(${updates.permission_level || null}, permission_level),
              is_enabled = COALESCE(${updates.is_enabled ?? null}, is_enabled),
              cooldown_seconds = COALESCE(${updates.cooldown_seconds ?? null}, cooldown_seconds),
              updated_at = NOW()
            WHERE id = ${Number(id)} RETURNING *
          `;
          result = rows[0] ? { ...rows[0], id: String(rows[0].id), guild_id: String(rows[0].guild_id) } : null;
          break;
        }

        case "deleteCustomCommand": {
          await ensureTables(sql);
          await sql`DELETE FROM custom_commands WHERE id = ${Number(params.id)}`;
          result = { success: true };
          break;
        }

        // ============ TICKET PANELS ============
        case "getTicketPanels": {
          await ensureTables(sql);
          const guildId = params?.guildId || "1234567890123456789";
          const gid = BigInt(guildId);
          const rows = await sql`SELECT * FROM ticket_panels WHERE guild_id = ${gid} ORDER BY created_at DESC`;
          result = rows.map((r: any) => ({ ...r, id: String(r.id), guild_id: String(r.guild_id) }));
          break;
        }

        case "createTicketPanel": {
          await ensureTables(sql);
          const { panel, guildId = "1234567890123456789" } = params || {};
          const gid = BigInt(guildId);
          const rows = await sql`
            INSERT INTO ticket_panels (guild_id, name, channel_id, category_id, message, button_label, button_color, created_by)
            VALUES (${gid}, ${panel.name}, ${panel.channel_id}, ${panel.category_id || null}, ${panel.message}, ${panel.button_label || 'Open Ticket'}, ${panel.button_color || 'primary'}, ${panel.created_by || 'dashboard'})
            RETURNING *
          `;
          result = { ...rows[0], id: String(rows[0].id), guild_id: String(rows[0].guild_id) };
          break;
        }

        case "deleteTicketPanel": {
          await ensureTables(sql);
          await sql`DELETE FROM ticket_panels WHERE id = ${Number(params.id)}`;
          result = { success: true };
          break;
        }

        default:
          return new Response(
            JSON.stringify({ error: `Unknown action: ${action}` }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
      }
    } finally {
      await sql.end();
    }

    return new Response(JSON.stringify({ data: result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Edge function error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
