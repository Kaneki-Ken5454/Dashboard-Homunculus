// ═══════════════════════════════════════════════════════════════════════════════
// ADD THESE TWO CASES to the switch(action) block in server/index.js
// Place them alongside the existing 'getLeaderboard' and 'getActivityStats' cases
// ═══════════════════════════════════════════════════════════════════════════════

      // ── VC Leaderboard ──────────────────────────────────────────────────────
      case 'getVCLeaderboard': {
        const limit = Math.min(params.limit ?? 25, 50);
        const rows = await sql(
          `SELECT user_id, username, avatar_url,
                  total_seconds, session_count,
                  last_active, last_left
           FROM vc_activity
           WHERE guild_id = $1 AND total_seconds > 0
           ORDER BY total_seconds DESC LIMIT $2`,
          [params.guildId, limit]
        ).catch(() => []);
        // Ensure total_seconds is a plain number (not BigInt from some drivers)
        const normalized = rows.map(r => ({
          ...r,
          total_seconds: Number(r.total_seconds ?? 0),
          session_count: Number(r.session_count ?? 0),
        }));
        return ok(res, normalized);
      }

      // ── VC Server Stats ──────────────────────────────────────────────────────
      case 'getVCStats': {
        const gid = params.guildId;
        const [membersRow, totalRow, active24hRow, active7dRow] = await Promise.all([
          sql(`SELECT COUNT(*)::int AS c FROM vc_activity WHERE guild_id = $1`, [gid])
            .then(r => r[0]?.c ?? 0).catch(() => 0),
          sql(`SELECT COALESCE(SUM(total_seconds), 0)::bigint AS t FROM vc_activity WHERE guild_id = $1`, [gid])
            .then(r => r[0]?.t ?? 0).catch(() => 0),
          sql(`SELECT COUNT(*)::int AS c FROM vc_activity WHERE guild_id = $1 AND last_active >= NOW() - INTERVAL '24 hours'`, [gid])
            .then(r => r[0]?.c ?? 0).catch(() => 0),
          sql(`SELECT COUNT(*)::int AS c FROM vc_activity WHERE guild_id = $1 AND last_active >= NOW() - INTERVAL '7 days'`, [gid])
            .then(r => r[0]?.c ?? 0).catch(() => 0),
        ]);
        return ok(res, {
          members:   Number(membersRow),
          totalSecs: Number(totalRow),
          active24h: Number(active24hRow),
          active7d:  Number(active7dRow),
        });
      }

// ═══════════════════════════════════════════════════════════════════════════════
// HOW TO WIRE UP auth_discord.js (optional refactor)
// ═══════════════════════════════════════════════════════════════════════════════
//
// At the TOP of server/index.js, add:
//
//   import discordAuth from './auth_discord.js';
//
// Then, somewhere AFTER app and siteOrigin are defined, replace the existing
// inline Discord OAuth block with a single line:
//
//   app.use(discordAuth(sql, siteOrigin));
//
// The auth_discord.js module registers these routes automatically:
//   GET  /api/auth/discord
//   GET  /api/auth/discord/callback
//   GET  /api/auth/me
//   POST /api/auth/logout
//   GET  /api/auth/sessions
//   DEL  /api/auth/sessions/:id
//   + legacy /api/client/auth/* aliases
//
// ═══════════════════════════════════════════════════════════════════════════════
