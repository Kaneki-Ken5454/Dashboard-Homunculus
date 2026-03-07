// ═══════════════════════════════════════════════════════════════════════════════
// server/auth_discord.js  —  Discord OAuth 2.0 handler (standalone router)
// ═══════════════════════════════════════════════════════════════════════════════
//
// HOW TO USE
// ──────────
// In server/index.js, replace the inline Discord auth block with:
//
//   import discordAuth from './auth_discord.js';
//   app.use(discordAuth(sql, siteOrigin));
//
// REQUIRED ENV VARS (set in Vercel → Environment Variables, or .env)
// ─────────────────────────────────────────────────────────────────────
//   DISCORD_CLIENT_ID       — from discord.com/developers/applications → OAuth2
//   DISCORD_CLIENT_SECRET   — from the same page (click "Reset Secret" to get it)
//   ADMIN_DISCORD_IDS       — comma-separated Discord user IDs for admin access
//                             e.g.  ADMIN_DISCORD_IDS=123456789012345678
//
// ┌─────────────────────────────────────────────────────────────────────────┐
// │  REDIRECT URI — add this EXACT URL in the Discord Developer Portal       │
// │                                                                           │
// │  Discord Developer Portal → Your App → OAuth2 → Redirects → Add Redirect│
// │                                                                           │
// │  https://<your-vercel-domain>/api/auth/discord/callback                  │
// │                                                                           │
// │  Examples:                                                                │
// │    https://homunculus-dashboard.vercel.app/api/auth/discord/callback      │
// │    https://your-custom-domain.com/api/auth/discord/callback               │
// │                                                                           │
// │  ⚠️  The URL must match EXACTLY — no trailing slash, correct protocol.   │
// │  💡  Visit /api/auth/test on your deployed site to see the computed URL.  │
// └─────────────────────────────────────────────────────────────────────────┘
//
// AUTH FLOW
// ─────────
//  GET  /api/auth/discord              → redirects user to Discord OAuth page
//  GET  /api/auth/discord/callback     → exchanges code, creates DB session
//  GET  /api/auth/me?token=<tok>       → validates session, returns user info
//  POST /api/auth/logout               → deletes session token
//  GET  /api/auth/sessions             → admin: list active sessions
//  DEL  /api/auth/sessions/:id         → admin: revoke a session
//
// ═══════════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import cors from 'cors';

const authCors = cors({ origin: '*', methods: ['GET', 'POST', 'OPTIONS'] });

const DISCORD_CLIENT_ID     = process.env.DISCORD_CLIENT_ID     || '';
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || '';

// Comma-separated Discord user IDs that get full admin access.
// Anyone NOT in this list can still log in but will only see Battle Tools (non-admin).
const ADMIN_DISCORD_IDS = (process.env.ADMIN_DISCORD_IDS || '')
  .split(',').map(s => s.trim()).filter(Boolean);

// ── Session table migrations (idempotent) ─────────────────────────────────────
const SESSION_MIGRATIONS = [
  `ALTER TABLE client_sessions ADD COLUMN IF NOT EXISTS is_admin       BOOLEAN    DEFAULT FALSE`,
  `ALTER TABLE client_sessions ADD COLUMN IF NOT EXISTS guilds_json    JSONB      DEFAULT '[]'`,
  `ALTER TABLE client_sessions ADD COLUMN IF NOT EXISTS access_token   TEXT`,
  `ALTER TABLE client_sessions ADD COLUMN IF NOT EXISTS refresh_token  TEXT`,
  `ALTER TABLE client_sessions ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ`,
];

async function runSessionMigrations(sql) {
  for (const m of SESSION_MIGRATIONS) {
    try { await sql(m); } catch { /* column already exists */ }
  }
}

// ── Router factory — receives the shared `sql` client and `siteOrigin` fn ────
export default function discordAuthRouter(sql, siteOrigin) {
  const router = Router();

  // ── GET /api/auth/discord — initiate OAuth flow ────────────────────────────
  router.get('/api/auth/discord', (req, res) => {
    if (!DISCORD_CLIENT_ID) {
      return res.status(500).send(
        'DISCORD_CLIENT_ID not configured. ' +
        'Add it in Vercel → Environment Variables (or .env for local dev).'
      );
    }

    const returnTo    = String(req.query.return_to || siteOrigin(req));
    const callbackUrl = `${siteOrigin(req)}/api/auth/discord/callback`;
    const state       = Buffer.from(JSON.stringify({ returnTo })).toString('base64url');

    const params = new URLSearchParams({
      client_id:     DISCORD_CLIENT_ID,
      redirect_uri:  callbackUrl,
      response_type: 'code',
      scope:         'identify guilds',
      state,
      prompt:        'consent', // always show the auth screen on first visit
    });

    res.redirect(`https://discord.com/oauth2/authorize?${params}`);
  });

  // ── GET /api/auth/discord/callback — exchange code, upsert session ─────────
  router.get('/api/auth/discord/callback', async (req, res) => {
    await runSessionMigrations(sql).catch(() => {});

    const { code, state, error } = req.query;
    let returnTo = siteOrigin(req);
    try {
      const parsed = JSON.parse(Buffer.from(String(state || ''), 'base64url').toString('utf8'));
      if (parsed.returnTo) returnTo = parsed.returnTo;
    } catch { /* malformed state — use default */ }

    if (error) {
      return res.redirect(`${returnTo}?auth_error=${encodeURIComponent(String(error))}`);
    }
    if (!code) {
      return res.status(400).send('Missing OAuth code from Discord.');
    }

    const callbackUrl = `${siteOrigin(req)}/api/auth/discord/callback`;

    try {
      // 1. Exchange code → tokens
      const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id:     DISCORD_CLIENT_ID,
          client_secret: DISCORD_CLIENT_SECRET,
          grant_type:    'authorization_code',
          code:          String(code),
          redirect_uri:  callbackUrl,
        }),
      });
      const tokenData = await tokenRes.json();

      if (!tokenData.access_token) {
        console.error('[Discord OAuth] Token exchange failed:', JSON.stringify(tokenData));
        return res.status(400).send(
          'Discord token exchange failed. Ensure DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET ' +
          'are set correctly, and that the Redirect URI is registered in the Discord Developer Portal.'
        );
      }

      const accessToken  = tokenData.access_token;
      const refreshToken = tokenData.refresh_token || null;
      const tokenExpires = new Date(Date.now() + (tokenData.expires_in || 604800) * 1000);

      // 2. Fetch authenticated Discord user
      const userRes     = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const discordUser = await userRes.json();

      if (!discordUser.id) {
        return res.status(400).send('Could not retrieve Discord user info.');
      }

      const discordId = String(discordUser.id);
      const username  = discordUser.global_name || discordUser.username || `User_${discordId.slice(-4)}`;
      const avatarUrl = discordUser.avatar
        ? `https://cdn.discordapp.com/avatars/${discordId}/${discordUser.avatar}.png?size=128`
        : null;

      // 3. Fetch user's guilds (used for admin guild picker)
      const guildsRes = await fetch('https://discord.com/api/users/@me/guilds', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const allGuilds = guildsRes.ok ? await guildsRes.json() : [];

      // 4. Admin check — whitelist only
      const isAdmin    = ADMIN_DISCORD_IDS.includes(discordId);
      const guildsList = Array.isArray(allGuilds)
        ? allGuilds.map(g => ({ id: g.id, name: g.name || g.id, icon: g.icon || null }))
        : [];

      // 5. Create 14-day session token
      const sessionToken  = `hom_${discordId}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const firstGuildId  = guildsList[0]?.id || 'global';

      await sql(
        `INSERT INTO client_sessions
           (guild_id, discord_id, username, avatar_url, session_token, expires_at,
            is_admin, guilds_json, access_token, refresh_token, token_expires_at)
         VALUES ($1,$2,$3,$4,$5, NOW() + INTERVAL '14 days', $6,$7,$8,$9,$10)
         ON CONFLICT (session_token) DO NOTHING`,
        [firstGuildId, discordId, username, avatarUrl, sessionToken,
         isAdmin, JSON.stringify(guildsList), accessToken, refreshToken, tokenExpires.toISOString()]
      );

      console.log(`[Discord OAuth] Session created: ${username} (${discordId}) isAdmin=${isAdmin}`);

      // 6. Redirect back with session token
      res.redirect(`${returnTo}?token=${encodeURIComponent(sessionToken)}`);

    } catch (e) {
      console.error('[Discord OAuth] Callback error:', e?.message || e);
      res.status(500).send(`Internal OAuth error: ${e?.message || e}`);
    }
  });

  // ── GET /api/auth/me?token=… — validate session, return user info ──────────
  router.get('/api/auth/me', authCors, async (req, res) => {
    const { token } = req.query;
    if (!token) return res.status(400).json({ ok: false, error: 'No token provided.' });

    try {
      const rows = await sql(
        `UPDATE client_sessions SET last_seen = NOW()
         WHERE session_token = $1 AND expires_at > NOW()
         RETURNING discord_id, username, avatar_url, guild_id, is_admin, guilds_json`,
        [String(token)]
      );
      if (!rows.length) {
        return res.status(401).json({ ok: false, error: 'Session expired — please log in again.' });
      }
      const { discord_id, username, avatar_url, guild_id, is_admin, guilds_json } = rows[0];
      res.json({
        ok: true,
        discord_id,
        username,
        avatar_url,
        guild_id,
        is_admin:     !!is_admin,
        admin_guilds: Array.isArray(guilds_json) ? guilds_json : (guilds_json || []),
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ── POST /api/auth/logout — revoke session ────────────────────────────────
  router.post('/api/auth/logout', authCors, async (req, res) => {
    const { token } = req.body || {};
    if (token) {
      await sql(`DELETE FROM client_sessions WHERE session_token = $1`, [String(token)]).catch(() => {});
    }
    res.json({ ok: true });
  });

  // ── GET /api/auth/sessions — admin: list active sessions ──────────────────
  router.get('/api/auth/sessions', async (req, res) => {
    const { guild_id } = req.query;
    try {
      const rows = guild_id
        ? await sql(
            `SELECT id, discord_id, username, avatar_url, guild_id, last_seen, expires_at, created_at, is_admin
             FROM client_sessions WHERE guild_id=$1 AND expires_at > NOW()
             ORDER BY last_seen DESC`,
            [String(guild_id)]
          )
        : await sql(
            `SELECT id, discord_id, username, avatar_url, guild_id, last_seen, expires_at, created_at, is_admin
             FROM client_sessions WHERE expires_at > NOW()
             ORDER BY last_seen DESC`
          );
      res.json({ ok: true, sessions: rows });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ── DELETE /api/auth/sessions/:id — admin: revoke a specific session ───────
  router.delete('/api/auth/sessions/:id', async (req, res) => {
    try {
      await sql(`DELETE FROM client_sessions WHERE id=$1`, [req.params.id]).catch(() => {});
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  // ── Legacy aliases (backward compat with old /api/client/auth/* routes) ────
  router.get('/api/client/auth/discord', (req, res) => {
    const qs = new URLSearchParams(req.query).toString();
    res.redirect(`/api/auth/discord${qs ? '?' + qs : ''}`);
  });
  router.get('/api/client/auth/discord/callback', (req, res) => {
    const qs = new URLSearchParams(req.query).toString();
    res.redirect(`/api/auth/discord/callback${qs ? '?' + qs : ''}`);
  });
  router.get('/api/client/auth/me', authCors, (req, res) => {
    const qs = new URLSearchParams(req.query).toString();
    res.redirect(307, `/api/auth/me${qs ? '?' + qs : ''}`);
  });
  router.post('/api/client/auth/logout', authCors, async (req, res) => {
    const { token } = req.body || {};
    if (token) await sql(`DELETE FROM client_sessions WHERE session_token = $1`, [String(token)]).catch(() => {});
    res.json({ ok: true });
  });

  return router;
}
