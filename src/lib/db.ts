// Pure fetch() → Neon HTTP API. Zero npm packages needed.
// Neon exposes: POST https://<host>/sql/v1   { query, params }

// ── URL storage ────────────────────────────────────────────────────────────────
export function setDatabaseUrl(url: string) {
  try { localStorage.setItem('NEON_DB_URL', url); } catch {}
}
export function getDatabaseUrl(): string {
  const fromEnv = import.meta.env.VITE_DATABASE_URL as string | undefined;
  if (fromEnv?.startsWith('postgresql')) return fromEnv;
  try {
    const stored = localStorage.getItem('NEON_DB_URL') || '';
    if (stored.startsWith('postgresql')) return stored;
  } catch {}
  return '';
}
export function isConfigured(): boolean { return getDatabaseUrl().length > 0; }

// ── Parse conn string → host + password ───────────────────────────────────────
function parseConn(url: string): { host: string; password: string } {
  // postgresql://user:password@host/db?params
  const s = url.replace(/^postgres(?:ql)?:\/\//, '');
  const at = s.lastIndexOf('@');
  if (at === -1) throw new Error('Invalid connection string (missing @)');
  const creds = s.slice(0, at);
  const afterAt = s.slice(at + 1);
  const colon = creds.indexOf(':');
  const password = colon === -1 ? '' : decodeURIComponent(creds.slice(colon + 1));
  const host = afterAt.split('/')[0].split('?')[0];
  if (!host) throw new Error('Invalid connection string (no host)');
  return { host, password };
}

// ── Core query ────────────────────────────────────────────────────────────────
export async function testConnection(url: string): Promise<void> {
  const { host, password } = parseConn(url);
  const res = await fetch(`https://${host}/sql/v1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${password}` },
    body: JSON.stringify({ query: 'SELECT 1', params: [] }),
  });
  if (!res.ok) throw new Error(`Connection failed (${res.status}): ${await res.text().catch(() => res.statusText)}`);
}

async function q(sql: string, params: unknown[] = []): Promise<unknown[]> {
  const url = getDatabaseUrl();
  if (!url) throw new Error('No database URL configured.');
  const { host, password } = parseConn(url);
  const res = await fetch(`https://${host}/sql/v1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${password}` },
    body: JSON.stringify({ query: sql, params }),
  });
  if (!res.ok) throw new Error(`Query error (${res.status}): ${await res.text().catch(() => res.statusText)}`);
  const data = await res.json() as { rows?: unknown[]; message?: string };
  if (data.message) throw new Error(data.message);
  return data.rows ?? [];
}

// ── Types ──────────────────────────────────────────────────────────────────────
export interface GuildSetting { id: string; guild_id: string; prefix: string; use_slash_commands: boolean; moderation_enabled: boolean; levelling_enabled: boolean; fun_enabled: boolean; tickets_enabled: boolean; custom_commands_enabled: boolean; auto_responders_enabled: boolean; global_cooldown: number; created_at: string; updated_at: string; }
export interface GuildMember { id: string; guild_id: string; user_id: string; username: string; discriminator?: string; avatar_url?: string; message_count: number; level: number; xp: number; joined_at: string; last_active: string; }
export interface CustomCommand { id: string; guild_id: string; name?: string; trigger: string; description?: string; response: string; response_type: string; permission_level: string; cooldown_seconds: number; is_tag: boolean; is_enabled: boolean; usage_count: number; created_by: string; created_at: string; updated_at: string; }
export interface AutoResponder { id: string; guild_id: string; trigger_text: string; match_type: string; response: string; response_type: string; is_enabled: boolean; trigger_count: number; created_by: string; created_at: string; updated_at: string; }
export interface Trigger { id: number; guild_id: string; trigger_text: string; response: string; match_type: string; enabled: boolean; use_count: number; created_at: string; updated_at: string; }
export interface Ticket { id: string; guild_id: string; panel_id: string; channel_id: string; user_id: string; title: string; username: string; priority: string; category: string; messages_count: number; assigned_to?: string; status: string; opened_at: string; closed_at?: string; }
export interface AuditLog { id: string; guild_id: string; action_type: string; user_id?: string; moderator_id?: string; bot_action: boolean; reason?: string; metadata?: unknown; created_at: string; }
export interface WarnEntry { id: string; guild_id: string; user_id: string; moderator_id: string; reason?: string; severity: string; created_at: string; }
export interface Vote { id: number; vote_id?: string; guild_id?: string; question?: string; options: unknown; end_time?: string; results_posted: boolean; created_at: string; channel_id?: string; }
export interface InfoTopic { id: number; guild_id: string; section: string; subcategory?: string; topic_id: string; name: string; embed_title?: string; embed_description?: string; emoji?: string; embed_color?: string; image?: string; thumbnail?: string; footer?: string; views: number; created_at: string; updated_at: string; }
export interface ReactionRole { id: string; guild_id: string; message_id: string; channel_id: string; emoji: string; role_id: string; role_name?: string; is_reaction: boolean; created_at: string; }
export interface ButtonRole { id: string; guild_id: string; message_id: string; channel_id: string; button_id: string; role_id: string; button_style: string; button_label?: string; button_emoji?: string; created_at: string; }
export interface DiscoveredGuild { guild_id: string; source: string; count: number; }

// ── Guild Discovery ────────────────────────────────────────────────────────────
export async function discoverAllGuildIds(): Promise<DiscoveredGuild[]> {
  const tables = ['guild_settings','custom_commands','auto_responders','tickets','audit_logs','guild_members','reaction_roles','button_roles','info_topics','votes','triggers','warns_data','mod_actions'];
  const results: DiscoveredGuild[] = [];
  for (const table of tables) {
    try { results.push(...(await q(`SELECT guild_id::text, '${table}' AS source, COUNT(*)::int AS count FROM ${table} WHERE guild_id IS NOT NULL GROUP BY guild_id`) as DiscoveredGuild[])); }
    catch { /* table may not exist */ }
  }
  const map = new Map<string, DiscoveredGuild>();
  for (const r of results) { if (map.has(r.guild_id)) map.get(r.guild_id)!.count += r.count; else map.set(r.guild_id, { ...r }); }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

// ── Stats ──────────────────────────────────────────────────────────────────────
export async function getDashboardStats(guildId: string) {
  const qs = [
    { key: 'memberCount',   sql: `SELECT COUNT(*)::int AS c FROM guild_members   WHERE guild_id=$1`, p: [guildId] },
    { key: 'commandCount',  sql: `SELECT COUNT(*)::int AS c FROM custom_commands WHERE guild_id=$1`, p: [guildId] },
    { key: 'ticketCount',   sql: `SELECT COUNT(*)::int AS c FROM tickets         WHERE guild_id=$1`, p: [guildId] },
    { key: 'auditCount',    sql: `SELECT COUNT(*)::int AS c FROM audit_logs      WHERE guild_id=$1`, p: [guildId] },
    { key: 'triggerCount',  sql: `SELECT COUNT(*)::int AS c FROM triggers        WHERE guild_id=$1::bigint`, p: [guildId] },
    { key: 'autoRespCount', sql: `SELECT COUNT(*)::int AS c FROM auto_responders WHERE guild_id=$1`, p: [guildId] },
    { key: 'voteCount',     sql: `SELECT COUNT(*)::int AS c FROM votes           WHERE guild_id=$1::bigint`, p: [guildId] },
    { key: 'topicCount',    sql: `SELECT COUNT(*)::int AS c FROM info_topics     WHERE guild_id=$1::bigint`, p: [guildId] },
    { key: 'warnCount',     sql: `SELECT COALESCE(SUM(jsonb_array_length(warns)),0)::int AS c FROM warns_data WHERE guild_id::text=$1`, p: [guildId] },
  ];
  const stats: Record<string, number> = {};
  for (const { key, sql, p } of qs) { try { stats[key] = ((await q(sql, p))[0] as { c: number })?.c ?? 0; } catch { stats[key] = 0; } }
  return stats as { memberCount: number; commandCount: number; ticketCount: number; auditCount: number; triggerCount: number; warnCount: number; autoRespCount: number; voteCount: number; topicCount: number; };
}
export async function getRecentActivity(guildId: string): Promise<AuditLog[]> { try { return await q(`SELECT * FROM audit_logs WHERE guild_id=$1 ORDER BY created_at DESC LIMIT 10`, [guildId]) as AuditLog[]; } catch { return []; } }

// ── Guild Settings ─────────────────────────────────────────────────────────────
export async function getGuildSetting(guildId: string): Promise<GuildSetting | null> { try { return (await q(`SELECT * FROM guild_settings WHERE guild_id=$1 LIMIT 1`, [guildId]))[0] as GuildSetting ?? null; } catch { return null; } }
export async function upsertGuildSetting(guildId: string, data: Partial<GuildSetting>) {
  await q(`INSERT INTO guild_settings(guild_id,prefix,use_slash_commands,moderation_enabled,levelling_enabled,fun_enabled,tickets_enabled,custom_commands_enabled,auto_responders_enabled,global_cooldown) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(guild_id) DO UPDATE SET prefix=$2,use_slash_commands=$3,moderation_enabled=$4,levelling_enabled=$5,fun_enabled=$6,tickets_enabled=$7,custom_commands_enabled=$8,auto_responders_enabled=$9,global_cooldown=$10,updated_at=now()`,
    [guildId, data.prefix??'!', data.use_slash_commands??true, data.moderation_enabled??true, data.levelling_enabled??true, data.fun_enabled??true, data.tickets_enabled??true, data.custom_commands_enabled??true, data.auto_responders_enabled??true, data.global_cooldown??1000]);
}

// ── Members ────────────────────────────────────────────────────────────────────
export async function getMembers(guildId: string): Promise<GuildMember[]> { try { return await q(`SELECT * FROM guild_members WHERE guild_id=$1 ORDER BY xp DESC LIMIT 200`, [guildId]) as GuildMember[]; } catch { return []; } }
export async function updateMemberXP(id: string, xp: number, level: number) { await q(`UPDATE guild_members SET xp=$1,level=$2 WHERE id=$3`, [xp, level, id]); }

// ── Custom Commands ────────────────────────────────────────────────────────────
export async function getCustomCommands(guildId: string): Promise<CustomCommand[]> { try { return await q(`SELECT * FROM custom_commands WHERE guild_id=$1 ORDER BY created_at DESC`, [guildId]) as CustomCommand[]; } catch { return []; } }
export async function createCustomCommand(d: Partial<CustomCommand>) { await q(`INSERT INTO custom_commands(guild_id,trigger,name,description,response,response_type,permission_level,cooldown_seconds,is_tag,is_enabled,usage_count,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,true,0,'dashboard')`, [d.guild_id,d.trigger,d.name??null,d.description??null,d.response,d.response_type??'text',d.permission_level??'everyone',d.cooldown_seconds??0,d.is_tag??false]); }
export async function updateCustomCommand(id: string, d: Partial<CustomCommand>) { await q(`UPDATE custom_commands SET trigger=$1,name=$2,description=$3,response=$4,permission_level=$5,cooldown_seconds=$6,is_enabled=$7,is_tag=$8,updated_at=now() WHERE id=$9`, [d.trigger,d.name??null,d.description??null,d.response,d.permission_level??'everyone',d.cooldown_seconds??0,d.is_enabled??true,d.is_tag??false,id]); }
export async function deleteCustomCommand(id: string) { await q(`DELETE FROM custom_commands WHERE id=$1`, [id]); }

// ── Auto Responders ────────────────────────────────────────────────────────────
export async function getAutoResponders(guildId: string): Promise<AutoResponder[]> { try { return await q(`SELECT * FROM auto_responders WHERE guild_id=$1 ORDER BY created_at DESC`, [guildId]) as AutoResponder[]; } catch { return []; } }
export async function createAutoResponder(d: Partial<AutoResponder>) { await q(`INSERT INTO auto_responders(guild_id,trigger_text,match_type,response,response_type,is_enabled,trigger_count,created_by) VALUES($1,$2,$3,$4,$5,true,0,'dashboard')`, [d.guild_id,d.trigger_text,d.match_type??'contains',d.response,d.response_type??'text']); }
export async function updateAutoResponder(id: string, d: Partial<AutoResponder>) { await q(`UPDATE auto_responders SET trigger_text=$1,match_type=$2,response=$3,is_enabled=$4,updated_at=now() WHERE id=$5`, [d.trigger_text,d.match_type??'contains',d.response,d.is_enabled??true,id]); }
export async function deleteAutoResponder(id: string) { await q(`DELETE FROM auto_responders WHERE id=$1`, [id]); }

// ── Triggers ───────────────────────────────────────────────────────────────────
export async function getTriggers(guildId: string): Promise<Trigger[]> { try { return await q(`SELECT * FROM triggers WHERE guild_id=$1::bigint ORDER BY created_at DESC`, [guildId]) as Trigger[]; } catch { return []; } }
export async function createTrigger(d: Partial<Trigger> & { guild_id: string }) { await q(`INSERT INTO triggers(guild_id,trigger_text,response,match_type,enabled,use_count) VALUES($1::bigint,$2,$3,$4,true,0)`, [d.guild_id,d.trigger_text,d.response,d.match_type??'contains']); }
export async function updateTrigger(id: number, d: Partial<Trigger>) { await q(`UPDATE triggers SET trigger_text=$1,response=$2,match_type=$3,enabled=$4,updated_at=now() WHERE id=$5`, [d.trigger_text,d.response,d.match_type??'contains',d.enabled??true,id]); }
export async function deleteTrigger(id: number) { await q(`DELETE FROM triggers WHERE id=$1`, [id]); }

// ── Tickets ────────────────────────────────────────────────────────────────────
export async function getTickets(guildId: string): Promise<Ticket[]> { try { return await q(`SELECT * FROM tickets WHERE guild_id=$1 ORDER BY opened_at DESC LIMIT 200`, [guildId]) as Ticket[]; } catch { return []; } }
export async function updateTicketStatus(id: string, status: string) { await q(`UPDATE tickets SET status=$1,closed_at=$2 WHERE id=$3`, [status, status==='closed'?new Date().toISOString():null, id]); }
export async function deleteTicket(id: string) { await q(`DELETE FROM tickets WHERE id=$1`, [id]); }

// ── Audit Logs ─────────────────────────────────────────────────────────────────
export async function getAuditLogs(guildId: string): Promise<AuditLog[]> { try { return await q(`SELECT * FROM audit_logs WHERE guild_id=$1 ORDER BY created_at DESC LIMIT 200`, [guildId]) as AuditLog[]; } catch { return []; } }
export async function deleteAuditLog(id: string) { await q(`DELETE FROM audit_logs WHERE id=$1`, [id]); }

// ── Warns ──────────────────────────────────────────────────────────────────────
export async function getWarns(guildId: string): Promise<WarnEntry[]> {
  try {
    const rows = await q(`SELECT * FROM warns_data WHERE guild_id::text=$1`, [guildId]) as Record<string,unknown>[];
    const flat: WarnEntry[] = [];
    for (const row of rows) {
      for (const w of (Array.isArray(row.warns) ? row.warns as Record<string,unknown>[] : [])) {
        flat.push({ id:`${row.id}-${w.timestamp||Math.random()}`, guild_id:String(row.guild_id), user_id:row.user_id as string, moderator_id:w.moderator_id?String(w.moderator_id):(w.moderator as string)||'—', reason:(w.reason as string)||null!, severity:(w.severity as string)||'low', created_at:(w.timestamp as string)||(row.created_at as string)||new Date().toISOString() });
      }
    }
    return flat.sort((a,b)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime());
  } catch { return []; }
}
export async function deleteWarn(id: string) { await q(`DELETE FROM warns_data WHERE id=$1`, [id]); }

// ── Votes ──────────────────────────────────────────────────────────────────────
export async function getVotes(guildId: string): Promise<Vote[]> { try { return await q(`SELECT * FROM votes WHERE guild_id=$1::bigint ORDER BY created_at DESC`, [guildId]) as Vote[]; } catch { return []; } }
export async function createVote(d:{guild_id:string;question:string;options:unknown;channel_id?:string}) { await q(`INSERT INTO votes(guild_id,question,options,results_posted,channel_id) VALUES($1::bigint,$2,$3,false,$4)`, [d.guild_id,d.question,JSON.stringify(d.options??[]),d.channel_id||null]); }
export async function deleteVote(id: number) { await q(`DELETE FROM votes WHERE id=$1`, [id]); }

// ── Info Topics ────────────────────────────────────────────────────────────────
export async function getInfoTopics(guildId: string): Promise<InfoTopic[]> { try { return await q(`SELECT * FROM info_topics WHERE guild_id=$1::bigint ORDER BY section,subcategory,name`, [guildId]) as InfoTopic[]; } catch { return []; } }
export async function createInfoTopic(guildId: string, d: Partial<InfoTopic>) { await q(`INSERT INTO info_topics(guild_id,section,subcategory,topic_id,name,embed_title,embed_description,embed_color,emoji) VALUES($1::bigint,$2,$3,$4,$5,$6,$7,$8,$9)`, [guildId,d.section??'common',d.subcategory??'General',d.topic_id||(d.name||'').toLowerCase().replace(/\s+/g,'_'),d.name,d.embed_title??null,d.embed_description??null,d.embed_color??'#5865F2',d.emoji??'📄']); }
export async function updateInfoTopic(id: number, d: Partial<InfoTopic>) { await q(`UPDATE info_topics SET section=$1,subcategory=$2,name=$3,embed_title=$4,embed_description=$5,embed_color=$6,emoji=$7,updated_at=now() WHERE id=$8`, [d.section??'common',d.subcategory??'General',d.name,d.embed_title??null,d.embed_description??null,d.embed_color??'#5865F2',d.emoji??'📄',id]); }
export async function deleteInfoTopic(id: number) { await q(`DELETE FROM info_topics WHERE id=$1`, [id]); }

// ── Reaction / Button Roles ────────────────────────────────────────────────────
export async function getReactionRoles(guildId: string): Promise<ReactionRole[]> { try { return await q(`SELECT * FROM reaction_roles WHERE guild_id=$1 ORDER BY created_at DESC`, [guildId]) as ReactionRole[]; } catch { return []; } }
export async function deleteReactionRole(id: string) { await q(`DELETE FROM reaction_roles WHERE id=$1`, [id]); }
export async function getButtonRoles(guildId: string): Promise<ButtonRole[]> { try { return await q(`SELECT * FROM button_roles WHERE guild_id=$1 ORDER BY created_at DESC`, [guildId]) as ButtonRole[]; } catch { return []; } }
export async function deleteButtonRole(id: string) { await q(`DELETE FROM button_roles WHERE id=$1`, [id]); }
