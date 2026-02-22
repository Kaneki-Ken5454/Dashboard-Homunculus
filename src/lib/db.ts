// All DB calls go through the Express API server at /api/query.
// This avoids CORS issues — the browser never contacts NeonDB directly.

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

// ── Core API call ─────────────────────────────────────────────────────────────
async function apiCall<T = unknown>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch('/api/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, params }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API error (${res.status}): ${text}`);
  }
  const data = await res.json() as { success: boolean; data?: T; error?: string };
  if (!data.success) throw new Error(data.error ?? 'Unknown API error');
  return data.data as T;
}

// ── Test connection ────────────────────────────────────────────────────────────
// Hits the server health endpoint — no direct Neon call from the browser.
export async function testConnection(_url: string): Promise<void> {
  const res = await fetch('/api/health');
  if (!res.ok) throw new Error(`Server unreachable (${res.status}). Make sure the Express server is running: node server/index.js`);
  const json = await res.json() as { ok?: boolean };
  if (!json.ok) throw new Error('API server returned unhealthy status');
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
  return apiCall<DiscoveredGuild[]>('discoverGuilds');
}

// ── Stats ──────────────────────────────────────────────────────────────────────
export async function getDashboardStats(guildId: string) {
  return apiCall<{ memberCount: number; commandCount: number; ticketCount: number; auditCount: number; triggerCount: number; warnCount: number; autoRespCount: number; voteCount: number; topicCount: number }>('getDashboardStats', { guildId });
}
export async function getRecentActivity(guildId: string): Promise<AuditLog[]> {
  return apiCall<AuditLog[]>('getRecentActivity', { guildId });
}

// ── Guild Settings ─────────────────────────────────────────────────────────────
export async function getGuildSetting(guildId: string): Promise<GuildSetting | null> {
  return apiCall<GuildSetting | null>('getGuildSetting', { guildId });
}
export async function upsertGuildSetting(guildId: string, data: Partial<GuildSetting>) {
  return apiCall('upsertGuildSetting', { guildId, data });
}

// ── Members ────────────────────────────────────────────────────────────────────
export async function getMembers(guildId: string): Promise<GuildMember[]> {
  return apiCall<GuildMember[]>('getMembers', { guildId });
}
export async function updateMemberXP(id: string, xp: number, level: number) {
  return apiCall('updateMemberXP', { id, xp, level });
}

// ── Custom Commands ────────────────────────────────────────────────────────────
export async function getCustomCommands(guildId: string): Promise<CustomCommand[]> {
  return apiCall<CustomCommand[]>('getCustomCommands', { guildId });
}
export async function createCustomCommand(d: Partial<CustomCommand>) {
  return apiCall('createCustomCommand', { guildId: d.guild_id, data: d });
}
export async function updateCustomCommand(id: string, d: Partial<CustomCommand>) {
  return apiCall('updateCustomCommand', { id, data: d });
}
export async function deleteCustomCommand(id: string) {
  return apiCall('deleteCustomCommand', { id });
}

// ── Auto Responders ────────────────────────────────────────────────────────────
export async function getAutoResponders(guildId: string): Promise<AutoResponder[]> {
  return apiCall<AutoResponder[]>('getAutoResponders', { guildId });
}
export async function createAutoResponder(d: Partial<AutoResponder>) {
  return apiCall('createAutoResponder', { guildId: d.guild_id, data: d });
}
export async function updateAutoResponder(id: string, d: Partial<AutoResponder>) {
  return apiCall('updateAutoResponder', { id, data: d });
}
export async function deleteAutoResponder(id: string) {
  return apiCall('deleteAutoResponder', { id });
}

// ── Triggers ───────────────────────────────────────────────────────────────────
export async function getTriggers(guildId: string): Promise<Trigger[]> {
  return apiCall<Trigger[]>('getTriggers', { guildId });
}
export async function createTrigger(d: Partial<Trigger> & { guild_id: string }) {
  return apiCall('createTrigger', { guildId: d.guild_id, data: d });
}
export async function updateTrigger(id: number, d: Partial<Trigger>) {
  return apiCall('updateTrigger', { id, data: d });
}
export async function deleteTrigger(id: number) {
  return apiCall('deleteTrigger', { id });
}

// ── Tickets ────────────────────────────────────────────────────────────────────
export async function getTickets(guildId: string): Promise<Ticket[]> {
  return apiCall<Ticket[]>('getTickets', { guildId });
}
export async function updateTicketStatus(id: string, status: string) {
  return apiCall('updateTicketStatus', { id, status });
}
export async function deleteTicket(id: string) {
  return apiCall('deleteTicket', { id });
}

// ── Audit Logs ─────────────────────────────────────────────────────────────────
export async function getAuditLogs(guildId: string): Promise<AuditLog[]> {
  return apiCall<AuditLog[]>('getAuditLogs', { guildId });
}
export async function deleteAuditLog(id: string) {
  return apiCall('deleteAuditLog', { id });
}

// ── Warns ──────────────────────────────────────────────────────────────────────
export async function getWarns(guildId: string): Promise<WarnEntry[]> {
  return apiCall<WarnEntry[]>('getWarns', { guildId });
}
export async function deleteWarn(id: string) {
  return apiCall('deleteWarn', { id });
}

// ── Votes ──────────────────────────────────────────────────────────────────────
export async function getVotes(guildId: string): Promise<Vote[]> {
  return apiCall<Vote[]>('getVotes', { guildId });
}
export async function createVote(d: { guild_id: string; question: string; options: unknown; channel_id?: string }) {
  return apiCall('createVote', { guildId: d.guild_id, question: d.question, options: d.options, channelId: d.channel_id });
}
export async function deleteVote(id: number) {
  return apiCall('deleteVote', { id });
}

// ── Info Topics ────────────────────────────────────────────────────────────────
export async function getInfoTopics(guildId: string): Promise<InfoTopic[]> {
  return apiCall<InfoTopic[]>('getInfoTopics', { guildId });
}
export async function createInfoTopic(guildId: string, d: Partial<InfoTopic>) {
  return apiCall('createInfoTopic', { guildId, data: d });
}
export async function updateInfoTopic(id: number, d: Partial<InfoTopic>) {
  return apiCall('updateInfoTopic', { id, data: d });
}
export async function deleteInfoTopic(id: number) {
  return apiCall('deleteInfoTopic', { id });
}

// ── Reaction / Button Roles ────────────────────────────────────────────────────
export async function getReactionRoles(guildId: string): Promise<ReactionRole[]> {
  return apiCall<ReactionRole[]>('getReactionRoles', { guildId });
}
export async function deleteReactionRole(id: string) {
  return apiCall('deleteReactionRole', { id });
}
export async function getButtonRoles(guildId: string): Promise<ButtonRole[]> {
  return apiCall<ButtonRole[]>('getButtonRoles', { guildId });
}
export async function deleteButtonRole(id: string) {
  return apiCall('deleteButtonRole', { id });
}
