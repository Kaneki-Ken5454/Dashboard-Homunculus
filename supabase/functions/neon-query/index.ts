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

async function tableExists(sql: any, tableName: string): Promise<boolean> {
  const res = await sql`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ${tableName})`;
  return res[0]?.exists || false;
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

        // ============ GUILD STATS (computed from existing tables) ============
        case "getGuildStats": {
          const guildId = params?.guildId || "1234567890123456789";
          const gid = BigInt(guildId);
          
          // Count unique users from messages
          const usersResult = await sql`SELECT COUNT(DISTINCT user_id)::int as count FROM messages WHERE guild_id = ${gid}`;
          // Count active votes (end_time > now)
          const votesResult = await sql`SELECT COUNT(*)::int as count FROM votes WHERE guild_id = ${gid} AND end_time > NOW()`;
          // Total messages
          const msgsResult = await sql`SELECT COUNT(*)::int as count FROM messages WHERE guild_id = ${gid}`;
          // Weekly activity (messages in last 7 days)
          const weeklyResult = await sql`SELECT COUNT(*)::int as count FROM messages WHERE guild_id = ${gid} AND timestamp >= NOW() - INTERVAL '7 days'`;
          
          result = {
            totalMembers: usersResult[0]?.count || 0,
            activeVotes: votesResult[0]?.count || 0,
            totalMessages: msgsResult[0]?.count || 0,
            weeklyActivity: weeklyResult[0]?.count || 0,
          };
          break;
        }

        // ============ TOP MEMBERS (from trust_scores + messages) ============
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
              ts.activity_score,
              ts.reputation_score,
              ts.total_contributions,
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

        // ============ EMBEDS (uses embed_data jsonb) ============
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

        // ============ TRIGGERS (column is 'enabled' not 'is_enabled') ============
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
          if (category) {
            result = await sql`
              SELECT id, guild_id::text as guild_id, section as category,
                name as title, embed_description as content, subcategory as section,
                views as view_count, 'bot' as created_by, created_at, updated_at
              FROM info_topics WHERE guild_id = ${gid} AND section = ${category}
              ORDER BY created_at DESC
            `;
          } else {
            result = await sql`
              SELECT id, guild_id::text as guild_id, section as category,
                name as title, embed_description as content, subcategory as section,
                views as view_count, 'bot' as created_by, created_at, updated_at
              FROM info_topics WHERE guild_id = ${gid}
              ORDER BY created_at DESC
            `;
          }
          result = (result as any[]).map((r: any) => ({ ...r, id: String(r.id), content: r.content || '' }));
          break;
        }

        // ============ ACTIVITY ANALYTICS (from messages table) ============
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

        // ============ TOP CHANNELS (from messages) ============
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

        // ============ AUDIT LOG (from mod_actions) ============
        case "getAuditLogs": {
          const { guildId = "1234567890123456789", severity, search, limit = 50 } = params || {};
          const gid = BigInt(guildId);
          let query;
          if (search) {
            const searchPattern = "%" + search + "%";
            query = await sql`
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
            query = await sql`
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
          result = query;
          if (severity && severity !== 'all') {
            result = (result as any[]).filter((r: any) => r.severity === severity);
          }
          result = (result as any[]).map((r: any) => ({ ...r, id: String(r.id) }));
          break;
        }

        // ============ BOT SETTINGS (from guild_config) ============
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

        // ============ TABLES THAT DON'T EXIST YET - Return empty ============
        case "getTickets":
        case "getReactionRoles":
        case "getCustomCommands":
        case "getTicketPanels": {
          result = [];
          break;
        }

        case "claimTicket":
        case "closeTicket":
        case "createReactionRole":
        case "deleteReactionRole":
        case "createCustomCommand":
        case "updateCustomCommand":
        case "deleteCustomCommand":
        case "createTicketPanel":
        case "deleteTicketPanel": {
          result = { success: false, message: "Table not yet created in NeonDB" };
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
