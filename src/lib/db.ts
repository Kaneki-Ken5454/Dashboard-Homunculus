// ── Edge function proxy for NeonDB ─────────────────────────────────────────────
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://qmcsjzvkcwxbyvwkbrty.supabase.co";
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtY3NqenZrY3d4Ynl2d2ticnR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0MzY4MTksImV4cCI6MjA4NzAxMjgxOX0.ywRhRkhNEoE8GusRr-DjrdMt6SZAeFkZi0bKyV2QwPw";
const EDGE_URL = `${SUPABASE_URL}/functions/v1/neon-query`;

async function rpc(action: string, params: Record<string, unknown> = {}): Promise<unknown> {
  const res = await fetch(EDGE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({ action, params }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Edge function error ${res.status}`);
  return data;
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
  id: number; vote_id?: string; guild_id?: string; question?: string;
  options: unknown; end_time?: string; results_posted: boolean; created_at: string;
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
export async function discoverAllGuildIds(): Promise<DiscoveredGuild[]> {
  return (await rpc("discoverGuilds")) as DiscoveredGuild[];
}

// ── Stats ──────────────────────────────────────────────────────────────────────
export async function getDashboardStats(guildId: string) {
  return (await rpc("getDashboardStats", { guildId })) as {
    memberCount: number; commandCount: number; ticketCount: number;
    auditCount: number; triggerCount: number; warnCount: number;
    autoRespCount: number; voteCount: number; topicCount: number;
  };
}

export async function getRecentActivity(guildId: string): Promise<AuditLog[]> {
  return (await rpc("getRecentActivity", { guildId })) as AuditLog[];
}

// ── Guild Settings ─────────────────────────────────────────────────────────────
export async function getGuildSetting(guildId: string): Promise<GuildSetting | null> {
  return (await rpc("getGuildSetting", { guildId })) as GuildSetting | null;
}

export async function upsertGuildSetting(guildId: string, data: Partial<GuildSetting>) {
  return rpc("upsertGuildSetting", { guildId, data });
}

// ── Members ────────────────────────────────────────────────────────────────────
export async function getMembers(guildId: string): Promise<GuildMember[]> {
  return (await rpc("getMembers", { guildId })) as GuildMember[];
}

export async function updateMemberXP(id: string, xp: number, level: number) {
  return rpc("updateMemberXP", { id, xp, level });
}

// ── Custom Commands ────────────────────────────────────────────────────────────
export async function getCustomCommands(guildId: string): Promise<CustomCommand[]> {
  return (await rpc("getCustomCommands", { guildId })) as CustomCommand[];
}

export async function createCustomCommand(d: Partial<CustomCommand>) {
  return rpc("createCustomCommand", { guildId: d.guild_id, data: d });
}

export async function updateCustomCommand(id: string, d: Partial<CustomCommand>) {
  return rpc("updateCustomCommand", { id, data: d });
}

export async function deleteCustomCommand(id: string) {
  return rpc("deleteCustomCommand", { id });
}

// ── Auto Responders ────────────────────────────────────────────────────────────
export async function getAutoResponders(guildId: string): Promise<AutoResponder[]> {
  return (await rpc("getAutoResponders", { guildId })) as AutoResponder[];
}

export async function createAutoResponder(d: Partial<AutoResponder>) {
  return rpc("createAutoResponder", { guildId: d.guild_id, data: d });
}

export async function updateAutoResponder(id: string, d: Partial<AutoResponder>) {
  return rpc("updateAutoResponder", { id, data: d });
}

export async function deleteAutoResponder(id: string) {
  return rpc("deleteAutoResponder", { id });
}

// ── Triggers ───────────────────────────────────────────────────────────────────
export async function getTriggers(guildId: string): Promise<Trigger[]> {
  return (await rpc("getTriggers", { guildId })) as Trigger[];
}

export async function createTrigger(d: Partial<Trigger> & { guild_id: string }) {
  return rpc("createTrigger", { guildId: d.guild_id, data: d });
}

export async function updateTrigger(id: number, d: Partial<Trigger>) {
  return rpc("updateTrigger", { id, data: d });
}

export async function deleteTrigger(id: number) {
  return rpc("deleteTrigger", { id });
}

// ── Tickets ────────────────────────────────────────────────────────────────────
export async function getTickets(guildId: string): Promise<Ticket[]> {
  return (await rpc("getTickets", { guildId })) as Ticket[];
}

export async function updateTicketStatus(id: string, status: string) {
  return rpc("updateTicketStatus", { id, status });
}

export async function deleteTicket(id: string) {
  return rpc("deleteTicket", { id });
}

// ── Audit Logs ─────────────────────────────────────────────────────────────────
export async function getAuditLogs(guildId: string): Promise<AuditLog[]> {
  return (await rpc("getAuditLogs", { guildId })) as AuditLog[];
}

export async function deleteAuditLog(id: string) {
  return rpc("deleteAuditLog", { id });
}

// ── Warns ──────────────────────────────────────────────────────────────────────
export async function getWarns(guildId: string): Promise<WarnEntry[]> {
  return (await rpc("getWarns", { guildId })) as WarnEntry[];
}

export async function deleteWarn(id: string) {
  return rpc("deleteWarn", { id });
}

// ── Votes ──────────────────────────────────────────────────────────────────────
export async function getVotes(guildId: string): Promise<Vote[]> {
  return (await rpc("getVotes", { guildId })) as Vote[];
}

export async function createVote(d: { guild_id: string; question: string; options: unknown }) {
  return rpc("createVote", { guildId: d.guild_id, question: d.question, options: d.options });
}

export async function deleteVote(id: number) {
  return rpc("deleteVote", { id });
}

// ── Info Topics ────────────────────────────────────────────────────────────────
export async function getInfoTopics(guildId: string): Promise<InfoTopic[]> {
  return (await rpc("getInfoTopics", { guildId })) as InfoTopic[];
}

export async function createInfoTopic(guildId: string, d: Partial<InfoTopic>) {
  return rpc("createInfoTopic", { guildId, data: d });
}

export async function updateInfoTopic(id: number, d: Partial<InfoTopic>) {
  return rpc("updateInfoTopic", { id, data: d });
}

export async function deleteInfoTopic(id: number) {
  return rpc("deleteInfoTopic", { id });
}

// ── Reaction Roles ─────────────────────────────────────────────────────────────
export async function getReactionRoles(guildId: string): Promise<ReactionRole[]> {
  return (await rpc("getReactionRoles", { guildId })) as ReactionRole[];
}

export async function deleteReactionRole(id: string) {
  return rpc("deleteReactionRole", { id });
}

// ── Button Roles ───────────────────────────────────────────────────────────────
export async function getButtonRoles(guildId: string): Promise<ButtonRole[]> {
  return (await rpc("getButtonRoles", { guildId })) as ButtonRole[];
}

export async function deleteButtonRole(id: string) {
  return rpc("deleteButtonRole", { id });
}
