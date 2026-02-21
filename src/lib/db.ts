import { neon } from '@neondatabase/serverless';

let _sql: ReturnType<typeof neon> | null = null;

export function getSql() {
  if (!_sql) {
    const url = import.meta.env.VITE_DATABASE_URL;
    if (!url) throw new Error('VITE_DATABASE_URL not set');
    _sql = neon(url);
  }
  return _sql;
}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface GuildSetting {
  id: string; guild_id: string; prefix: string;
  use_slash_commands: boolean; moderation_enabled: boolean;
  levelling_enabled: boolean; fun_enabled: boolean;
  tickets_enabled: boolean; custom_commands_enabled: boolean;
  auto_responders_enabled: boolean; global_cooldown: number;
  created_at: string; updated_at: string;
}

export interface GuildMember {
  id: string; guild_id: string; user_id: string; username: string;
  discriminator?: string; avatar_url?: string; message_count: number;
  level: number; xp: number; joined_at: string; last_active: string;
}

export interface CustomCommand {
  id: string; guild_id: string; name?: string; trigger: string;
  description?: string; response: string; response_type: string;
  permission_level: string; cooldown_seconds: number; is_tag: boolean;
  is_enabled: boolean; usage_count: number; created_by: string;
  created_at: string; updated_at: string;
}

export interface AutoResponder {
  id: string; guild_id: string; trigger_text: string; match_type: string;
  response: string; response_type: string; is_enabled: boolean;
  trigger_count: number; created_by: string; created_at: string; updated_at: string;
}

export interface Trigger {
  id: number; guild_id: string; trigger_text: string; response: string;
  match_type: string; enabled: boolean; use_count: number;
  created_at: string; updated_at: string;
}

export interface Ticket {
  id: string; guild_id: string; panel_id: string; channel_id: string;
  user_id: string; title: string; username: string; priority: string;
  category: string; messages_count: number; assigned_to?: string;
  status: string; opened_at: string; closed_at?: string;
}

export interface AuditLog {
  id: string; guild_id: string; action_type: string; user_id?: string;
  moderator_id?: string; bot_action: boolean; reason?: string;
  metadata?: unknown; created_at: string;
}

export interface WarnEntry {
  id: string; guild_id: string; user_id: string; moderator_id: string;
  reason?: string; severity: string; created_at: string;
}

export interface Vote {
  id: number; vote_id?: string; guild_id?: string; channel_id?: string;
  question?: string; options: unknown; end_time?: string;
  anonymous?: boolean; results_posted: boolean; created_at: string;
}

export interface Embed {
  id: number; guild_id: string; name: string;
  embed_data: Record<string, unknown>;
  created_at: string; updated_at: string;
}

export interface InfoTopic {
  id: number; guild_id: string; section: string; subcategory?: string;
  topic_id: string; name: string; embed_title?: string;
  embed_description?: string; emoji?: string; embed_color?: string;
  image?: string; thumbnail?: string; footer?: string;
  views: number; created_at: string; updated_at: string;
}

export interface ReactionRole {
  id: string; guild_id: string; message_id: string; channel_id: string;
  emoji: string; role_id: string; role_name?: string;
  is_reaction: boolean; created_at: string;
}

export interface ButtonRole {
  id: string; guild_id: string; message_id: string; channel_id: string;
  button_id: string; role_id: string; button_style: string;
  button_label?: string; button_emoji?: string; created_at: string;
}

export interface DiscoveredGuild {
  guild_id: string;
  source: string;
  count: number;
}

// ── Guild Discovery ────────────────────────────────────────────────────────────
// Neon's driver requires hardcoded table names in tagged templates — no dynamic
// identifier interpolation. Each table gets its own explicit query.
export async function discoverAllGuildIds(): Promise<DiscoveredGuild[]> {
  const sql = getSql();

  type Row = { guild_id: string; source: string; count: string };

  // Each query is a fully static tagged template (table name hardcoded)
  const results = await Promise.all([
    sql`SELECT guild_id::text, 'guild_settings'  AS source, COUNT(*)::text AS count FROM guild_settings  WHERE guild_id IS NOT NULL GROUP BY guild_id`.catch((): Row[] => []),
    sql`SELECT guild_id::text, 'custom_commands' AS source, COUNT(*)::text AS count FROM custom_commands WHERE guild_id IS NOT NULL GROUP BY guild_id`.catch((): Row[] => []),
    sql`SELECT guild_id::text, 'auto_responders' AS source, COUNT(*)::text AS count FROM auto_responders WHERE guild_id IS NOT NULL GROUP BY guild_id`.catch((): Row[] => []),
    sql`SELECT guild_id::text, 'tickets'         AS source, COUNT(*)::text AS count FROM tickets         WHERE guild_id IS NOT NULL GROUP BY guild_id`.catch((): Row[] => []),
    sql`SELECT guild_id::text, 'audit_logs'      AS source, COUNT(*)::text AS count FROM audit_logs      WHERE guild_id IS NOT NULL GROUP BY guild_id`.catch((): Row[] => []),
    sql`SELECT guild_id::text, 'guild_members'   AS source, COUNT(*)::text AS count FROM guild_members   WHERE guild_id IS NOT NULL GROUP BY guild_id`.catch((): Row[] => []),
    sql`SELECT guild_id::text, 'reaction_roles'  AS source, COUNT(*)::text AS count FROM reaction_roles  WHERE guild_id IS NOT NULL GROUP BY guild_id`.catch((): Row[] => []),
    sql`SELECT guild_id::text, 'button_roles'    AS source, COUNT(*)::text AS count FROM button_roles    WHERE guild_id IS NOT NULL GROUP BY guild_id`.catch((): Row[] => []),
    sql`SELECT guild_id::text, 'info_topics'     AS source, COUNT(*)::text AS count FROM info_topics     WHERE guild_id IS NOT NULL GROUP BY guild_id`.catch((): Row[] => []),
    sql`SELECT guild_id::text, 'votes'           AS source, COUNT(*)::text AS count FROM votes           WHERE guild_id IS NOT NULL GROUP BY guild_id`.catch((): Row[] => []),
    sql`SELECT guild_id::text, 'triggers'        AS source, COUNT(*)::text AS count FROM triggers        WHERE guild_id IS NOT NULL GROUP BY guild_id`.catch((): Row[] => []),
    sql`SELECT guild_id::text, 'warns_data'      AS source, COUNT(*)::text AS count FROM warns_data      WHERE guild_id IS NOT NULL GROUP BY guild_id`.catch((): Row[] => []),
    sql`SELECT guild_id::text, 'mod_actions'     AS source, COUNT(*)::text AS count FROM mod_actions     WHERE guild_id IS NOT NULL GROUP BY guild_id`.catch((): Row[] => []),
  ]);

  const flat = results.flat() as Row[];

  // Deduplicate across tables — merge counts, keep highest-count source label
  const map = new Map<string, DiscoveredGuild>();
  for (const row of flat) {
    const existing = map.get(row.guild_id);
    if (existing) {
      existing.count += Number(row.count);
    } else {
      map.set(row.guild_id, {
        guild_id: row.guild_id,
        source: row.source,
        count: Number(row.count),
      });
    }
  }

  return [...map.values()].sort((a, b) => b.count - a.count);
}

// ── Stats ──────────────────────────────────────────────────────────────────────
export async function getDashboardStats(guildId: string) {
  const sql = getSql();
  // TEXT tables use direct string, BIGINT tables cast to bigint
  const [members, commands, tickets, auditLogs, triggers, warns, autoResp, votes, topics, embeds] =
    await Promise.all([
      sql`SELECT COUNT(*) as c FROM guild_members   WHERE guild_id = ${guildId}`.catch(() => [{ c: 0 }]),
      sql`SELECT COUNT(*) as c FROM custom_commands  WHERE guild_id = ${guildId}`.catch(() => [{ c: 0 }]),
      sql`SELECT COUNT(*) as c FROM tickets           WHERE guild_id = ${guildId}`.catch(() => [{ c: 0 }]),
      sql`SELECT COUNT(*) as c FROM audit_logs        WHERE guild_id = ${guildId}`.catch(() => [{ c: 0 }]),
      sql`SELECT COUNT(*) as c FROM triggers          WHERE guild_id = ${guildId}::bigint`.catch(() => [{ c: 0 }]),
      sql`SELECT COUNT(*) as c FROM warn_data         WHERE guild_id = ${guildId}`.catch(() => [{ c: 0 }]),
      sql`SELECT COUNT(*) as c FROM auto_responders   WHERE guild_id = ${guildId}`.catch(() => [{ c: 0 }]),
      sql`SELECT COUNT(*) as c FROM votes             WHERE guild_id = ${guildId}::bigint`.catch(() => [{ c: 0 }]),
      sql`SELECT COUNT(*) as c FROM info_topics       WHERE guild_id = ${guildId}::bigint`.catch(() => [{ c: 0 }]),
      sql`SELECT COUNT(*) as c FROM embeds            WHERE guild_id = ${guildId}::bigint`.catch(() => [{ c: 0 }]),
    ]);
  const n = (r: unknown[]) => Number((r[0] as Record<string, unknown>)?.c ?? 0);
  return {
    memberCount: n(members), commandCount: n(commands), ticketCount: n(tickets),
    auditCount: n(auditLogs), triggerCount: n(triggers), warnCount: n(warns),
    autoRespCount: n(autoResp), voteCount: n(votes), topicCount: n(topics),
    embedCount: n(embeds),
  };
}

export async function getRecentActivity(guildId: string): Promise<AuditLog[]> {
  const sql = getSql();
  return (await sql`
    SELECT * FROM audit_logs WHERE guild_id = ${guildId}
    ORDER BY created_at DESC LIMIT 10
  `.catch(() => [])) as AuditLog[];
}

// ── Guild Settings ─────────────────────────────────────────────────────────────
export async function getGuilds(): Promise<GuildSetting[]> {
  const sql = getSql();
  return (await sql`SELECT * FROM guild_settings ORDER BY created_at DESC`.catch(() => [])) as GuildSetting[];
}

export async function getGuildSetting(guildId: string): Promise<GuildSetting | null> {
  const sql = getSql();
  const rows = (await sql`SELECT * FROM guild_settings WHERE guild_id = ${guildId} LIMIT 1`.catch(() => [])) as GuildSetting[];
  return rows[0] ?? null;
}

export async function upsertGuildSetting(guildId: string, d: Partial<GuildSetting>) {
  const sql = getSql();
  return sql`
    INSERT INTO guild_settings (guild_id, prefix, use_slash_commands, moderation_enabled,
      levelling_enabled, fun_enabled, tickets_enabled, custom_commands_enabled,
      auto_responders_enabled, global_cooldown)
    VALUES (${guildId}, ${d.prefix ?? '!'}, ${d.use_slash_commands ?? true},
      ${d.moderation_enabled ?? true}, ${d.levelling_enabled ?? true},
      ${d.fun_enabled ?? true}, ${d.tickets_enabled ?? true},
      ${d.custom_commands_enabled ?? true}, ${d.auto_responders_enabled ?? true},
      ${d.global_cooldown ?? 1000})
    ON CONFLICT (guild_id) DO UPDATE SET
      prefix = EXCLUDED.prefix,
      use_slash_commands = EXCLUDED.use_slash_commands,
      moderation_enabled = EXCLUDED.moderation_enabled,
      levelling_enabled = EXCLUDED.levelling_enabled,
      fun_enabled = EXCLUDED.fun_enabled,
      tickets_enabled = EXCLUDED.tickets_enabled,
      custom_commands_enabled = EXCLUDED.custom_commands_enabled,
      auto_responders_enabled = EXCLUDED.auto_responders_enabled,
      global_cooldown = EXCLUDED.global_cooldown,
      updated_at = now()
  `;
}

// ── Members ────────────────────────────────────────────────────────────────────
export async function getMembers(guildId: string): Promise<GuildMember[]> {
  const sql = getSql();
  return (await sql`
    SELECT * FROM guild_members WHERE guild_id = ${guildId}
    ORDER BY xp DESC LIMIT 200
  `.catch(() => [])) as GuildMember[];
}

export async function updateMemberXP(id: string, xp: number, level: number) {
  const sql = getSql();
  return sql`UPDATE guild_members SET xp = ${xp}, level = ${level} WHERE id = ${id}`;
}

// ── Custom Commands ────────────────────────────────────────────────────────────
export async function getCustomCommands(guildId: string): Promise<CustomCommand[]> {
  const sql = getSql();
  return (await sql`
    SELECT * FROM custom_commands WHERE guild_id = ${guildId} ORDER BY created_at DESC
  `.catch(() => [])) as CustomCommand[];
}

export async function createCustomCommand(d: Partial<CustomCommand>) {
  const sql = getSql();
  return sql`
    INSERT INTO custom_commands
      (guild_id, trigger, name, description, response, response_type, permission_level, cooldown_seconds, is_tag, is_enabled, usage_count, created_by)
    VALUES
      (${d.guild_id}, ${d.trigger}, ${d.name ?? null}, ${d.description ?? null},
       ${d.response}, ${d.response_type ?? 'text'}, ${d.permission_level ?? 'everyone'},
       ${d.cooldown_seconds ?? 0}, ${d.is_tag ?? false}, true, 0, ${'dashboard'})
  `;
}

export async function updateCustomCommand(id: string, d: Partial<CustomCommand>) {
  const sql = getSql();
  return sql`
    UPDATE custom_commands SET
      trigger = ${d.trigger}, name = ${d.name ?? null}, description = ${d.description ?? null},
      response = ${d.response}, permission_level = ${d.permission_level ?? 'everyone'},
      cooldown_seconds = ${d.cooldown_seconds ?? 0}, is_enabled = ${d.is_enabled ?? true},
      is_tag = ${d.is_tag ?? false}, updated_at = now()
    WHERE id = ${id}
  `;
}

export async function deleteCustomCommand(id: string) {
  const sql = getSql();
  return sql`DELETE FROM custom_commands WHERE id = ${id}`;
}

// ── Auto Responders ────────────────────────────────────────────────────────────
export async function getAutoResponders(guildId: string): Promise<AutoResponder[]> {
  const sql = getSql();
  return (await sql`
    SELECT * FROM auto_responders WHERE guild_id = ${guildId} ORDER BY created_at DESC
  `.catch(() => [])) as AutoResponder[];
}

export async function createAutoResponder(d: Partial<AutoResponder>) {
  const sql = getSql();
  return sql`
    INSERT INTO auto_responders
      (guild_id, trigger_text, match_type, response, response_type, is_enabled, trigger_count, created_by)
    VALUES
      (${d.guild_id}, ${d.trigger_text}, ${d.match_type ?? 'contains'}, ${d.response},
       ${d.response_type ?? 'text'}, true, 0, ${'dashboard'})
  `;
}

export async function updateAutoResponder(id: string, d: Partial<AutoResponder>) {
  const sql = getSql();
  return sql`
    UPDATE auto_responders SET
      trigger_text = ${d.trigger_text}, match_type = ${d.match_type ?? 'contains'},
      response = ${d.response}, is_enabled = ${d.is_enabled ?? true}, updated_at = now()
    WHERE id = ${id}
  `;
}

export async function deleteAutoResponder(id: string) {
  const sql = getSql();
  return sql`DELETE FROM auto_responders WHERE id = ${id}`;
}

// ── Triggers (BIGINT guild_id) ─────────────────────────────────────────────────
export async function getTriggers(guildId: string): Promise<Trigger[]> {
  const sql = getSql();
  return (await sql`
    SELECT * FROM triggers WHERE guild_id = ${guildId}::bigint ORDER BY created_at DESC
  `.catch(() => [])) as Trigger[];
}

export async function createTrigger(d: Partial<Trigger> & { guild_id: string }) {
  const sql = getSql();
  return sql`
    INSERT INTO triggers (guild_id, trigger_text, response, match_type, enabled, use_count)
    VALUES (${d.guild_id}::bigint, ${d.trigger_text}, ${d.response}, ${d.match_type ?? 'contains'}, true, 0)
  `;
}

export async function updateTrigger(id: number, d: Partial<Trigger>) {
  const sql = getSql();
  return sql`
    UPDATE triggers SET
      trigger_text = ${d.trigger_text}, response = ${d.response},
      match_type = ${d.match_type ?? 'contains'}, enabled = ${d.enabled ?? true}, updated_at = now()
    WHERE id = ${id}
  `;
}

export async function deleteTrigger(id: number) {
  const sql = getSql();
  return sql`DELETE FROM triggers WHERE id = ${id}`;
}

// ── Tickets ───��────────────────────────────────────────────────────────────────
export async function getTickets(guildId: string): Promise<Ticket[]> {
  const sql = getSql();
  return (await sql`
    SELECT * FROM tickets WHERE guild_id = ${guildId} ORDER BY opened_at DESC LIMIT 200
  `.catch(() => [])) as Ticket[];
}

export async function updateTicketStatus(id: string, status: string) {
  const sql = getSql();
  return sql`
    UPDATE tickets SET
      status = ${status},
      closed_at = ${status === 'closed' ? new Date().toISOString() : null}
    WHERE id = ${id}
  `;
}

export async function deleteTicket(id: string) {
  const sql = getSql();
  return sql`DELETE FROM tickets WHERE id = ${id}`;
}

// ── Audit Logs ─────────────────────────────────────────────────────────────────
export async function getAuditLogs(guildId: string): Promise<AuditLog[]> {
  const sql = getSql();
  return (await sql`
    SELECT * FROM audit_logs WHERE guild_id = ${guildId}
    ORDER BY created_at DESC LIMIT 200
  `.catch(() => [])) as AuditLog[];
}

export async function deleteAuditLog(id: string) {
  const sql = getSql();
  return sql`DELETE FROM audit_logs WHERE id = ${id}`;
}

// ── Warns ──────────────────────────────────────────────────────────────────────
export async function getWarns(guildId: string): Promise<WarnEntry[]> {
  const sql = getSql();
  return (await sql`
    SELECT * FROM warn_data WHERE guild_id = ${guildId} ORDER BY created_at DESC
  `.catch(() => [])) as WarnEntry[];
}

export async function deleteWarn(id: string) {
  const sql = getSql();
  return sql`DELETE FROM warn_data WHERE id = ${id}`;
}

// ── Votes (BIGINT guild_id) ────────────────────────────────────────────────────
export async function getVotes(guildId: string): Promise<Vote[]> {
  const sql = getSql();
  return (await sql`
    SELECT * FROM votes WHERE guild_id = ${guildId}::bigint ORDER BY created_at DESC
  `.catch(() => [])) as Vote[];
}

export async function createVote(d: { guild_id: string; question: string; options: unknown; channel_id?: string; anonymous?: boolean }) {
  const sql = getSql();
  const channelId = d.channel_id ? Number(d.channel_id) : null;
  return sql`
    INSERT INTO votes (guild_id, channel_id, question, options, anonymous, results_posted)
    VALUES (${d.guild_id}::bigint, ${channelId}, ${d.question}, ${JSON.stringify(d.options ?? [])}, ${d.anonymous ?? false}, false)
  `;
}

export async function deleteVote(id: number) {
  const sql = getSql();
  return sql`DELETE FROM votes WHERE id = ${id}`;
}

// ── Embeds (BIGINT guild_id) ───────────────────────────────────────────────────
export async function getEmbeds(guildId: string): Promise<Embed[]> {
  const sql = getSql();
  return (await sql`
    SELECT * FROM embeds WHERE guild_id = ${guildId}::bigint ORDER BY created_at DESC
  `.catch(() => [])) as Embed[];
}

export async function createEmbed(d: { guild_id: string; name: string; embed_data: Record<string, unknown> }) {
  const sql = getSql();
  return sql`
    INSERT INTO embeds (guild_id, name, embed_data)
    VALUES (${d.guild_id}::bigint, ${d.name}, ${JSON.stringify(d.embed_data)})
  `;
}

export async function updateEmbed(id: number, d: { name: string; embed_data: Record<string, unknown> }) {
  const sql = getSql();
  return sql`
    UPDATE embeds SET name = ${d.name}, embed_data = ${JSON.stringify(d.embed_data)}, updated_at = now()
    WHERE id = ${id}
  `;
}

export async function deleteEmbed(id: number) {
  const sql = getSql();
  return sql`DELETE FROM embeds WHERE id = ${id}`;
}

// ── Info Topics (BIGINT guild_id) ──────────────────────────────────────────────
export async function getInfoTopics(guildId: string): Promise<InfoTopic[]> {
  const sql = getSql();
  return (await sql`
    SELECT * FROM info_topics WHERE guild_id = ${guildId}::bigint ORDER BY section, subcategory, name
  `.catch(() => [])) as InfoTopic[];
}

export async function createInfoTopic(guildId: string, d: Partial<InfoTopic>) {
  const sql = getSql();
  return sql`
    INSERT INTO info_topics
      (guild_id, section, subcategory, topic_id, name, embed_title, embed_description, embed_color, emoji)
    VALUES
      (${guildId}::bigint, ${d.section ?? 'common'}, ${d.subcategory ?? 'General'},
       ${d.topic_id ?? d.name?.toLowerCase().replace(/\s+/g, '_')},
       ${d.name}, ${d.embed_title ?? null}, ${d.embed_description ?? null},
       ${d.embed_color ?? '#5865F2'}, ${d.emoji ?? '📄'})
  `;
}

export async function updateInfoTopic(id: number, d: Partial<InfoTopic>) {
  const sql = getSql();
  return sql`
    UPDATE info_topics SET
      section = ${d.section ?? 'common'}, subcategory = ${d.subcategory ?? 'General'},
      name = ${d.name}, embed_title = ${d.embed_title ?? null},
      embed_description = ${d.embed_description ?? null},
      embed_color = ${d.embed_color ?? '#5865F2'}, emoji = ${d.emoji ?? '📄'},
      updated_at = now()
    WHERE id = ${id}
  `;
}

export async function deleteInfoTopic(id: number) {
  const sql = getSql();
  return sql`DELETE FROM info_topics WHERE id = ${id}`;
}

// ── Reaction Roles ─────────────────────────────────────────────────────────────
export async function getReactionRoles(guildId: string): Promise<ReactionRole[]> {
  const sql = getSql();
  return (await sql`
    SELECT * FROM reaction_roles WHERE guild_id = ${guildId} ORDER BY created_at DESC
  `.catch(() => [])) as ReactionRole[];
}

export async function deleteReactionRole(id: string) {
  const sql = getSql();
  return sql`DELETE FROM reaction_roles WHERE id = ${id}`;
}

// ── Button Roles ───────────────────────────────────────────────────────────────
export async function getButtonRoles(guildId: string): Promise<ButtonRole[]> {
  const sql = getSql();
  return (await sql`
    SELECT * FROM button_roles WHERE guild_id = ${guildId} ORDER BY created_at DESC
  `.catch(() => [])) as ButtonRole[];
}

export async function deleteButtonRole(id: string) {
  const sql = getSql();
  return sql`DELETE FROM button_roles WHERE id = ${id}`;
}
