// @ts-ignore
import postgres from "npm:postgres@3.4.5";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// @ts-ignore
let sql: any = null;

function getSQL() {
  if (!sql) {
    // @ts-ignore
    const url = (globalThis as any).Deno?.env.get("NEON_DATABASE_URL") || (globalThis as any).Deno.env.get("NEON_DATABASE_URL");
    if (!url) throw new Error("NEON_DATABASE_URL not configured");
    // @ts-ignore
    sql = postgres(url, { ssl: "require", max: 3 });
  }
  return sql;
}

function ok(data: unknown) {
  return new Response(JSON.stringify({ success: true, data }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(message: string, status = 400) {
  console.error(`Backend error [${status}]: ${message}`);
  return new Response(JSON.stringify({ success: false, error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// @ts-ignore
(globalThis as any).Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, params } = await req.json();
    const db = getSQL();
    const p = params || {};

    switch (action) {
      // ── Discovery ──
      case "discoverGuilds": {
        const tables = [
          "guild_settings", "custom_commands", "auto_responders", "tickets",
          "audit_logs", "guild_members", "reaction_roles", "button_roles",
          "info_topics", "votes", "triggers", "warns_data", "mod_actions",
        ];
        const results: { guild_id: string; source: string; count: number }[] = [];
        for (const table of tables) {
          try {
            const rows = await db.unsafe(
              `SELECT guild_id::text, '${table}' AS source, COUNT(*)::int AS count FROM ${table} WHERE guild_id IS NOT NULL GROUP BY guild_id`
            );
            for (const r of rows) results.push(r as any);
          } catch { /* table may not exist */ }
        }
        // deduplicate
        const map = new Map<string, { guild_id: string; source: string; count: number }>();
        for (const r of results) {
          const ex = map.get(r.guild_id);
          if (ex) ex.count += r.count;
          else map.set(r.guild_id, { ...r });
        }
        return ok([...map.values()].sort((a, b) => b.count - a.count));
      }

      // ── Stats ──
      case "getDashboardStats": {
        const gid = p.guildId;
        const queries = [
          { key: "memberCount", sql: `SELECT COUNT(*)::int AS c FROM guild_members WHERE guild_id = $1`, params: [gid] },
          { key: "commandCount", sql: `SELECT COUNT(*)::int AS c FROM custom_commands WHERE guild_id = $1`, params: [gid] },
          { key: "ticketCount", sql: `SELECT COUNT(*)::int AS c FROM tickets WHERE guild_id = $1`, params: [gid] },
          { key: "auditCount", sql: `SELECT COUNT(*)::int AS c FROM audit_logs WHERE guild_id = $1`, params: [gid] },
          { key: "triggerCount", sql: `SELECT COUNT(*)::int AS c FROM triggers WHERE guild_id = $1::bigint`, params: [gid] },
          { key: "warnCount", sql: `SELECT COALESCE(SUM(jsonb_array_length(warns)), 0)::int AS c FROM warns_data WHERE guild_id::text = $1`, params: [gid] },
          { key: "autoRespCount", sql: `SELECT COUNT(*)::int AS c FROM auto_responders WHERE guild_id = $1`, params: [gid] },
          { key: "voteCount", sql: `SELECT COUNT(*)::int AS c FROM votes WHERE guild_id = $1::bigint`, params: [gid] },
          { key: "topicCount", sql: `SELECT COUNT(*)::int AS c FROM info_topics WHERE guild_id = $1::bigint`, params: [gid] },
        ];
        const stats: Record<string, number> = {};
        for (const q of queries) {
          try {
            const rows = await db.unsafe(q.sql, q.params);
            stats[q.key] = rows[0]?.c ?? 0;
          } catch { stats[q.key] = 0; }
        }
        return ok(stats);
      }

      case "getRecentActivity": {
        const rows = await db.unsafe(
          `SELECT * FROM audit_logs WHERE guild_id = $1 ORDER BY created_at DESC LIMIT 10`,
          [p.guildId]
        ).catch(() => []);
        return ok(rows);
      }

      // ── Guild Settings ──
      case "getGuildSetting": {
        const rows = await db.unsafe(
          `SELECT * FROM guild_settings WHERE guild_id = $1 LIMIT 1`,
          [p.guildId]
        ).catch(() => []);
        return ok(rows[0] ?? null);
      }

      case "upsertGuildSetting": {
        const d = p.data;
        await db.unsafe(
          `INSERT INTO guild_settings (guild_id, prefix, use_slash_commands, moderation_enabled,
            levelling_enabled, fun_enabled, tickets_enabled, custom_commands_enabled,
            auto_responders_enabled, global_cooldown)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (guild_id) DO UPDATE SET
            prefix = EXCLUDED.prefix, use_slash_commands = EXCLUDED.use_slash_commands,
            moderation_enabled = EXCLUDED.moderation_enabled, levelling_enabled = EXCLUDED.levelling_enabled,
            fun_enabled = EXCLUDED.fun_enabled, tickets_enabled = EXCLUDED.tickets_enabled,
            custom_commands_enabled = EXCLUDED.custom_commands_enabled,
            auto_responders_enabled = EXCLUDED.auto_responders_enabled,
            global_cooldown = EXCLUDED.global_cooldown, updated_at = now()`,
          [p.guildId, d.prefix ?? "!", d.use_slash_commands ?? true, d.moderation_enabled ?? true,
           d.levelling_enabled ?? true, d.fun_enabled ?? true, d.tickets_enabled ?? true,
           d.custom_commands_enabled ?? true, d.auto_responders_enabled ?? true, d.global_cooldown ?? 1000]
        );
        return ok({ success: true });
      }

      // ── Members ──
      case "getMembers": {
        const rows = await db.unsafe(
          `SELECT * FROM guild_members WHERE guild_id = $1 ORDER BY xp DESC LIMIT 200`,
          [p.guildId]
        ).catch(() => []);
        return ok(rows);
      }

      case "updateMemberXP": {
        await db.unsafe(`UPDATE guild_members SET xp = $1, level = $2 WHERE id = $3`, [p.xp, p.level, p.id]);
        return ok({ success: true });
      }

      // ── Custom Commands ──
      case "getCustomCommands": {
        const rows = await db.unsafe(
          `SELECT * FROM custom_commands WHERE guild_id = $1 ORDER BY created_at DESC`,
          [p.guildId]
        ).catch(() => []);
        return ok(rows);
      }

      case "createCustomCommand": {
        const d = p.data;
        await db.unsafe(
          `INSERT INTO custom_commands (guild_id, trigger, name, description, response, response_type, permission_level, cooldown_seconds, is_tag, is_enabled, usage_count, created_by)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, 0, 'dashboard')`,
          [p.guildId, d.trigger, d.name ?? null, d.description ?? null, d.response, d.response_type ?? "text",
           d.permission_level ?? "everyone", d.cooldown_seconds ?? 0, d.is_tag ?? false]
        );
        return ok({ success: true });
      }

      case "updateCustomCommand": {
        const d = p.data;
        await db.unsafe(
          `UPDATE custom_commands SET trigger = $1, name = $2, description = $3, response = $4,
            permission_level = $5, cooldown_seconds = $6, is_enabled = $7, is_tag = $8, updated_at = now()
          WHERE id = $9`,
          [d.trigger, d.name ?? null, d.description ?? null, d.response,
           d.permission_level ?? "everyone", d.cooldown_seconds ?? 0, d.is_enabled ?? true, d.is_tag ?? false, p.id]
        );
        return ok({ success: true });
      }

      case "deleteCustomCommand": {
        await db.unsafe(`DELETE FROM custom_commands WHERE id = $1`, [p.id]);
        return ok({ success: true });
      }

      // ── Auto Responders ──
      case "getAutoResponders": {
        const rows = await db.unsafe(
          `SELECT * FROM auto_responders WHERE guild_id = $1 ORDER BY created_at DESC`,
          [p.guildId]
        ).catch(() => []);
        return ok(rows);
      }

      case "createAutoResponder": {
        const d = p.data;
        await db.unsafe(
          `INSERT INTO auto_responders (guild_id, trigger_text, match_type, response, response_type, is_enabled, trigger_count, created_by)
          VALUES ($1, $2, $3, $4, $5, true, 0, 'dashboard')`,
          [p.guildId, d.trigger_text, d.match_type ?? "contains", d.response, d.response_type ?? "text"]
        );
        return ok({ success: true });
      }

      case "updateAutoResponder": {
        const d = p.data;
        await db.unsafe(
          `UPDATE auto_responders SET trigger_text = $1, match_type = $2, response = $3, is_enabled = $4, updated_at = now()
          WHERE id = $5`,
          [d.trigger_text, d.match_type ?? "contains", d.response, d.is_enabled ?? true, p.id]
        );
        return ok({ success: true });
      }

      case "deleteAutoResponder": {
        await db.unsafe(`DELETE FROM auto_responders WHERE id = $1`, [p.id]);
        return ok({ success: true });
      }

      // ── Triggers ──
      case "getTriggers": {
        const rows = await db.unsafe(
          `SELECT * FROM triggers WHERE guild_id = $1::bigint ORDER BY created_at DESC`,
          [p.guildId]
        ).catch(() => []);
        return ok(rows);
      }

      case "createTrigger": {
        const d = p.data;
        await db.unsafe(
          `INSERT INTO triggers (guild_id, trigger_text, response, match_type, enabled, use_count)
          VALUES ($1::bigint, $2, $3, $4, true, 0)`,
          [p.guildId, d.trigger_text, d.response, d.match_type ?? "contains"]
        );
        return ok({ success: true });
      }

      case "updateTrigger": {
        const d = p.data;
        await db.unsafe(
          `UPDATE triggers SET trigger_text = $1, response = $2, match_type = $3, enabled = $4, updated_at = now()
          WHERE id = $5`,
          [d.trigger_text, d.response, d.match_type ?? "contains", d.enabled ?? true, p.id]
        );
        return ok({ success: true });
      }

      case "deleteTrigger": {
        await db.unsafe(`DELETE FROM triggers WHERE id = $1`, [p.id]);
        return ok({ success: true });
      }

      // ── Tickets ──
      case "getTickets": {
        const rows = await db.unsafe(
          `SELECT * FROM tickets WHERE guild_id = $1 ORDER BY opened_at DESC LIMIT 200`,
          [p.guildId]
        ).catch(() => []);
        return ok(rows);
      }

      case "updateTicketStatus": {
        const closedAt = p.status === "closed" ? new Date().toISOString() : null;
        await db.unsafe(
          `UPDATE tickets SET status = $1, closed_at = $2 WHERE id = $3`,
          [p.status, closedAt, p.id]
        );
        return ok({ success: true });
      }

      case "deleteTicket": {
        await db.unsafe(`DELETE FROM tickets WHERE id = $1`, [p.id]);
        return ok({ success: true });
      }

      // ── Audit Logs ──
      case "getAuditLogs": {
        const rows = await db.unsafe(
          `SELECT * FROM audit_logs WHERE guild_id = $1 ORDER BY created_at DESC LIMIT 200`,
          [p.guildId]
        ).catch(() => []);
        return ok(rows);
      }

      case "deleteAuditLog": {
        await db.unsafe(`DELETE FROM audit_logs WHERE id = $1`, [p.id]);
        return ok({ success: true });
      }

      // ── Warns ──
      case "getWarns": {
        // warns_data stores warns as a JSONB array per user; flatten into individual entries
        const rawRows = await db.unsafe(
          `SELECT * FROM warns_data WHERE guild_id::text = $1`,
          [p.guildId]
        ).catch(() => []);
        const flat: unknown[] = [];
        for (const row of rawRows as any[]) {
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
        flat.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        return ok(flat);
      }

      case "deleteWarn": {
        await db.unsafe(`DELETE FROM warns_data WHERE id = $1`, [p.id]);
        return ok({ success: true });
      }

      // ── Votes ──
      case "getVotes": {
        const rows = await db.unsafe(
          `SELECT * FROM votes WHERE guild_id = $1::bigint ORDER BY created_at DESC`,
          [p.guildId]
        ).catch(() => []);
        return ok(rows);
      }

      case "createVote": {
        const { channelId } = p;
        
        // Validate channel ID if provided
        if (channelId && !/^\d{17,19}$/.test(channelId)) {
          return err("Invalid channel ID format. Channel ID must be 17-19 digits.", 400);
        }
        
        await db.unsafe(
          `INSERT INTO votes (guild_id, question, options, results_posted, channel_id)
          VALUES ($1::bigint, $2, $3, false, $4)`,
          [p.guildId, p.question, JSON.stringify(p.options ?? []), channelId || null]
        );
        
        // If channel ID provided, attempt to send vote embed
        if (channelId) {
          try {
            // This would typically involve Discord API calls
            // For now, we'll just log that a vote was created with a channel
            console.log(`Vote created for guild ${p.guildId} to be sent to channel ${channelId}`);
          } catch (error) {
            console.warn('Failed to send vote to channel:', error);
            // Don't fail the entire operation, just log the error
          }
        }
        
        return ok({ success: true, channelId: channelId || null });
      }

      case "deleteVote": {
        await db.unsafe(`DELETE FROM votes WHERE id = $1`, [p.id]);
        return ok({ success: true });
      }

      // ── Info Topics ──
      case "getInfoTopics": {
        const rows = await db.unsafe(
          `SELECT * FROM info_topics WHERE guild_id = $1::bigint ORDER BY section, subcategory, name`,
          [p.guildId]
        ).catch(() => []);
        return ok(rows);
      }

      case "createInfoTopic": {
        const d = p.data;
        await db.unsafe(
          `INSERT INTO info_topics (guild_id, section, subcategory, topic_id, name, embed_title, embed_description, embed_color, emoji)
          VALUES ($1::bigint, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [p.guildId, d.section ?? "common", d.subcategory ?? "General",
           d.topic_id || (d.name || "").toLowerCase().replace(/\s+/g, "_"),
           d.name, d.embed_title ?? null, d.embed_description ?? null,
           d.embed_color ?? "#5865F2", d.emoji ?? "📄"]
        );
        return ok({ success: true });
      }

      case "updateInfoTopic": {
        const d = p.data;
        await db.unsafe(
          `UPDATE info_topics SET section = $1, subcategory = $2, name = $3,
            embed_title = $4, embed_description = $5, embed_color = $6, emoji = $7, updated_at = now()
          WHERE id = $8`,
          [d.section ?? "common", d.subcategory ?? "General", d.name,
           d.embed_title ?? null, d.embed_description ?? null,
           d.embed_color ?? "#5865F2", d.emoji ?? "📄", p.id]
        );
        return ok({ success: true });
      }

      case "deleteInfoTopic": {
        await db.unsafe(`DELETE FROM info_topics WHERE id = $1`, [p.id]);
        return ok({ success: true });
      }

      // ── Reaction Roles ──
      case "getReactionRoles": {
        const rows = await db.unsafe(
          `SELECT * FROM reaction_roles WHERE guild_id = $1 ORDER BY created_at DESC`,
          [p.guildId]
        ).catch(() => []);
        return ok(rows);
      }

      case "deleteReactionRole": {
        await db.unsafe(`DELETE FROM reaction_roles WHERE id = $1`, [p.id]);
        return ok({ success: true });
      }

      // ── Button Roles ──
      case "getButtonRoles": {
        const rows = await db.unsafe(
          `SELECT * FROM button_roles WHERE guild_id = $1 ORDER BY created_at DESC`,
          [p.guildId]
        ).catch(() => []);
        return ok(rows);
      }

      case "deleteButtonRole": {
        await db.unsafe(`DELETE FROM button_roles WHERE id = $1`, [p.id]);
        return ok({ success: true });
      }

      default:
        return err(`Unknown action: ${action}`, 400);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("neon-query error:", message);
    return err(message, 500);
  }
});
