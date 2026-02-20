const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const LOCAL_API_BASE = (import.meta.env.VITE_DISCORD_BOT_API_URL || 'http://localhost:5000').replace(/\/$/, '');

function hasPlaceholder(value?: string): boolean {
  if (!value) return true;
  return value.includes('your_project_id') || value.includes('your_anon_key');
}

const useSupabaseEdge = Boolean(SUPABASE_URL && SUPABASE_KEY && !hasPlaceholder(SUPABASE_URL) && !hasPlaceholder(SUPABASE_KEY));

export interface Member {
  id: string;
  guild_id: string;
  user_id: string;
  username: string;
  discriminator: string;
  avatar_url?: string;
  joined_at: string;
  last_active: string;
  message_count: number;
  vote_count: number;
  role_ids: string[];
}

export interface Vote {
  id: string;
  guild_id: string;
  question: string;
  description?: string;
  options: { text: string; votes: number }[];
  created_by: string;
  channel_id?: string;
  message_id?: string;
  start_time: string;
  end_time: string;
  is_active: boolean;
  total_votes: number;
  created_at: string;
}

export interface Embed {
  id: string;
  guild_id: string;
  name: string;
  title?: string;
  description?: string;
  color: string;
  footer?: string;
  thumbnail_url?: string;
  image_url?: string;
  fields?: any[];
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Trigger {
  id: string;
  guild_id: string;
  trigger_text: string;
  response: string;
  match_type: 'exact' | 'contains' | 'starts_with' | 'ends_with' | 'regex';
  is_enabled: boolean;
  trigger_count: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface InfoTopic {
  id: string;
  guild_id: string;
  category: 'common' | 'general' | 'staff';
  title: string;
  content: string;
  section: string;
  view_count: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface TicketItem {
  id: string;
  guild_id: string;
  title: string;
  user_id: string;
  username: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  category: string;
  claimed_by?: string;
  messages_count: number;
  created_at: string;
  updated_at: string;
}

export interface AuditLogEntry {
  id: string;
  guild_id: string;
  action: string;
  username: string;
  user_id?: string;
  details: string;
  severity: 'info' | 'warning' | 'error' | 'success';
  created_at: string;
}

export interface GuildSettings {
  id: string;
  guild_id: string;
  prefix: string;
  slash_commands_enabled: boolean;
  modules: Record<string, boolean>;
  cooldown_seconds: number;
  ratelimit_per_minute: number;
  created_at: string;
  updated_at: string;
}

export interface ReactionRole {
  id: string;
  guild_id: string;
  message_id: string;
  channel_id: string;
  emoji: string;
  role_id: string;
  role_name: string;
  type: 'reaction' | 'button';
  created_by: string;
  created_at: string;
}

export interface CustomCommand {
  id: string;
  guild_id: string;
  name: string;
  description?: string;
  response: string;
  permission_level: string;
  is_enabled: boolean;
  cooldown_seconds: number;
  use_count: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface TicketPanel {
  id: string;
  guild_id: string;
  name: string;
  channel_id: string;
  category_id?: string;
  message: string;
  button_label: string;
  button_color: string;
  created_by: string;
  created_at: string;
}

export interface GuildStats {
  totalMembers: number;
  activeVotes: number;
  totalMessages: number;
  weeklyActivity: number;
}

async function neonQuery<T = any>(action: string, params?: any): Promise<T> {
  const url = useSupabaseEdge
    ? `${SUPABASE_URL}/functions/v1/neon-query`
    : `${LOCAL_API_BASE}/api/neon-query`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (useSupabaseEdge) {
    headers.apikey = SUPABASE_KEY;
    headers.Authorization = `Bearer ${SUPABASE_KEY}`;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action, params }),
  });
  const data = await res.json();
  if (!res.ok || data?.error) throw new Error(data?.error || 'Edge function error');
  return data?.data as T;
}

const DEFAULT_GUILD_ID = '1234567890123456789';

export const db = {
  async inspectSchema() {
    return neonQuery('inspectSchema');
  },

  async getGuildStats(guildId: string = DEFAULT_GUILD_ID): Promise<GuildStats> {
    return neonQuery('getGuildStats', { guildId });
  },

  async getTopMembers(guildId: string = DEFAULT_GUILD_ID, limit = 10): Promise<Member[]> {
    return neonQuery('getTopMembers', { guildId, limit });
  },

  async getActiveVotes(guildId: string = DEFAULT_GUILD_ID): Promise<Vote[]> {
    return neonQuery('getActiveVotes', { guildId });
  },

  async getAllVotes(guildId: string = DEFAULT_GUILD_ID): Promise<Vote[]> {
    return neonQuery('getAllVotes', { guildId });
  },

  async getEmbeds(guildId: string = DEFAULT_GUILD_ID): Promise<Embed[]> {
    return neonQuery('getEmbeds', { guildId });
  },

  async createEmbed(embed: Partial<Embed>, guildId: string = DEFAULT_GUILD_ID): Promise<Embed> {
    return neonQuery('createEmbed', { embed, guildId });
  },

  async deleteEmbed(id: string): Promise<void> {
    await neonQuery('deleteEmbed', { id });
  },

  async getTriggers(guildId: string = DEFAULT_GUILD_ID): Promise<Trigger[]> {
    return neonQuery('getTriggers', { guildId });
  },

  async createTrigger(trigger: Partial<Trigger>, guildId: string = DEFAULT_GUILD_ID): Promise<Trigger> {
    return neonQuery('createTrigger', { trigger, guildId });
  },

  async updateTrigger(id: string, updates: Partial<Trigger>): Promise<Trigger> {
    return neonQuery('updateTrigger', { id, updates });
  },

  async deleteTrigger(id: string): Promise<void> {
    await neonQuery('deleteTrigger', { id });
  },

  async getInfoTopics(guildId: string = DEFAULT_GUILD_ID, category?: string): Promise<InfoTopic[]> {
    return neonQuery('getInfoTopics', { guildId, category });
  },

  async getActivityAnalytics(guildId: string = DEFAULT_GUILD_ID, days = 7) {
    const raw = await neonQuery<any[]>('getActivityAnalytics', { guildId, days });
    const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const activityByDay: Record<string, { messages: number; votes: number }> = {};
    for (let i = 0; i < days; i++) {
      const date = new Date(Date.now() - (days - 1 - i) * 86400000);
      activityByDay[dayLabels[date.getDay()]] = { messages: 0, votes: 0 };
    }
    raw?.forEach((log: any) => {
      const dayLabel = dayLabels[new Date(log.created_at).getDay()];
      if (activityByDay[dayLabel]) {
        if (log.activity_type === 'message') activityByDay[dayLabel].messages++;
        else if (log.activity_type === 'vote') activityByDay[dayLabel].votes++;
      }
    });
    return Object.entries(activityByDay).map(([day, counts]) => ({ day, ...counts }));
  },

  async getTopChannels(guildId: string = DEFAULT_GUILD_ID, limit = 5) {
    const raw = await neonQuery<any[]>('getTopChannels', { guildId, limit });
    if (!raw || raw.length === 0) return [];
    const maxMessages = raw[0]?.message_count || 1;
    return raw.map((ch: any) => ({
      name: ch.channel_id,
      messages: ch.message_count,
      percentage: Math.round((ch.message_count / maxMessages) * 100),
    }));
  },

  async getTickets(guildId: string = DEFAULT_GUILD_ID, status?: string, priority?: string): Promise<TicketItem[]> {
    return neonQuery('getTickets', { guildId, status, priority });
  },

  async claimTicket(id: string, userId: string): Promise<TicketItem> {
    return neonQuery('claimTicket', { id, userId });
  },

  async closeTicket(id: string): Promise<TicketItem> {
    return neonQuery('closeTicket', { id });
  },

  async getAuditLogs(guildId: string = DEFAULT_GUILD_ID, severity?: string, search?: string, limit = 50): Promise<AuditLogEntry[]> {
    return neonQuery('getAuditLogs', { guildId, severity, search, limit });
  },

  async getBotSettings(guildId: string = DEFAULT_GUILD_ID): Promise<GuildSettings | null> {
    return neonQuery('getBotSettings', { guildId });
  },

  async updateBotSettings(settings: Partial<GuildSettings>, guildId: string = DEFAULT_GUILD_ID): Promise<GuildSettings> {
    return neonQuery('updateBotSettings', { settings, guildId });
  },

  async getReactionRoles(guildId: string = DEFAULT_GUILD_ID): Promise<ReactionRole[]> {
    return neonQuery('getReactionRoles', { guildId });
  },

  async createReactionRole(role: Partial<ReactionRole>, guildId: string = DEFAULT_GUILD_ID): Promise<ReactionRole> {
    return neonQuery('createReactionRole', { role, guildId });
  },

  async deleteReactionRole(id: string): Promise<void> {
    await neonQuery('deleteReactionRole', { id });
  },

  async getCustomCommands(guildId: string = DEFAULT_GUILD_ID): Promise<CustomCommand[]> {
    return neonQuery('getCustomCommands', { guildId });
  },

  async createCustomCommand(command: Partial<CustomCommand>, guildId: string = DEFAULT_GUILD_ID): Promise<CustomCommand> {
    return neonQuery('createCustomCommand', { command, guildId });
  },

  async updateCustomCommand(id: string, updates: Partial<CustomCommand>): Promise<CustomCommand> {
    return neonQuery('updateCustomCommand', { id, updates });
  },

  async deleteCustomCommand(id: string): Promise<void> {
    await neonQuery('deleteCustomCommand', { id });
  },

  async getTicketPanels(guildId: string = DEFAULT_GUILD_ID): Promise<TicketPanel[]> {
    return neonQuery('getTicketPanels', { guildId });
  },

  async createTicketPanel(panel: Partial<TicketPanel>, guildId: string = DEFAULT_GUILD_ID): Promise<TicketPanel> {
    return neonQuery('createTicketPanel', { panel, guildId });
  },

  async deleteTicketPanel(id: string): Promise<void> {
    await neonQuery('deleteTicketPanel', { id });
  },
};
