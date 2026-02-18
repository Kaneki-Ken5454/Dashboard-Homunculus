import { supabase } from "@/integrations/supabase/client";

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

export interface ActivityLog {
  id: string;
  guild_id: string;
  user_id: string;
  activity_type: string;
  channel_id?: string;
  metadata: any;
  created_at: string;
}

export interface GuildStats {
  totalMembers: number;
  activeVotes: number;
  totalMessages: number;
  weeklyActivity: number;
}

const DEFAULT_GUILD_ID = '1234567890123456789';

export const db = {
  async getGuildStats(guildId: string = DEFAULT_GUILD_ID): Promise<GuildStats> {
    try {
      const [membersResult, votesResult, activityResult] = await Promise.all([
        supabase.from('members').select('id', { count: 'exact', head: true }).eq('guild_id', guildId),
        supabase.from('votes').select('id', { count: 'exact', head: true }).eq('guild_id', guildId).eq('is_active', true),
        supabase.from('activity_logs').select('id', { count: 'exact', head: true }).eq('guild_id', guildId).gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
      ]);

      const totalMessagesResult = await supabase
        .from('members')
        .select('message_count')
        .eq('guild_id', guildId);

      const totalMessages = totalMessagesResult.data?.reduce((sum, m) => sum + (m.message_count || 0), 0) || 0;

      return {
        totalMembers: membersResult.count || 0,
        activeVotes: votesResult.count || 0,
        totalMessages,
        weeklyActivity: activityResult.count || 0,
      };
    } catch (error) {
      console.error('Error fetching guild stats:', error);
      throw error;
    }
  },

  async getTopMembers(guildId: string = DEFAULT_GUILD_ID, limit: number = 10): Promise<Member[]> {
    try {
      const { data, error } = await supabase
        .from('members')
        .select('*')
        .eq('guild_id', guildId)
        .order('message_count', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching top members:', error);
      throw error;
    }
  },

  async getActiveVotes(guildId: string = DEFAULT_GUILD_ID): Promise<Vote[]> {
    try {
      const { data, error } = await supabase
        .from('votes')
        .select('*')
        .eq('guild_id', guildId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching active votes:', error);
      throw error;
    }
  },

  async getAllVotes(guildId: string = DEFAULT_GUILD_ID): Promise<Vote[]> {
    try {
      const { data, error } = await supabase
        .from('votes')
        .select('*')
        .eq('guild_id', guildId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching all votes:', error);
      throw error;
    }
  },

  async getEmbeds(guildId: string = DEFAULT_GUILD_ID): Promise<Embed[]> {
    try {
      const { data, error } = await supabase
        .from('embeds')
        .select('*')
        .eq('guild_id', guildId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching embeds:', error);
      throw error;
    }
  },

  async createEmbed(embed: Partial<Embed>, guildId: string = DEFAULT_GUILD_ID): Promise<Embed> {
    try {
      const { data, error } = await supabase
        .from('embeds')
        .insert({
          guild_id: guildId,
          ...embed,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error creating embed:', error);
      throw error;
    }
  },

  async deleteEmbed(id: string): Promise<void> {
    try {
      const { error } = await supabase.from('embeds').delete().eq('id', id);
      if (error) throw error;
    } catch (error) {
      console.error('Error deleting embed:', error);
      throw error;
    }
  },

  async getTriggers(guildId: string = DEFAULT_GUILD_ID): Promise<Trigger[]> {
    try {
      const { data, error } = await supabase
        .from('triggers')
        .select('*')
        .eq('guild_id', guildId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching triggers:', error);
      throw error;
    }
  },

  async updateTrigger(id: string, updates: Partial<Trigger>): Promise<Trigger> {
    try {
      const { data, error } = await supabase
        .from('triggers')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating trigger:', error);
      throw error;
    }
  },

  async deleteTrigger(id: string): Promise<void> {
    try {
      const { error } = await supabase.from('triggers').delete().eq('id', id);
      if (error) throw error;
    } catch (error) {
      console.error('Error deleting trigger:', error);
      throw error;
    }
  },

  async getInfoTopics(guildId: string = DEFAULT_GUILD_ID, category?: string): Promise<InfoTopic[]> {
    try {
      let query = supabase
        .from('info_topics')
        .select('*')
        .eq('guild_id', guildId);

      if (category) {
        query = query.eq('category', category);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching info topics:', error);
      throw error;
    }
  },

  async getActivityAnalytics(guildId: string = DEFAULT_GUILD_ID, days: number = 7) {
    try {
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from('activity_logs')
        .select('activity_type, created_at')
        .eq('guild_id', guildId)
        .gte('created_at', startDate)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const activityByDay: Record<string, { messages: number; votes: number }> = {};

      for (let i = 0; i < days; i++) {
        const date = new Date(Date.now() - (days - 1 - i) * 24 * 60 * 60 * 1000);
        const dayLabel = dayLabels[date.getDay()];
        activityByDay[dayLabel] = { messages: 0, votes: 0 };
      }

      data?.forEach((log) => {
        const date = new Date(log.created_at);
        const dayLabel = dayLabels[date.getDay()];
        if (activityByDay[dayLabel]) {
          if (log.activity_type === 'message') {
            activityByDay[dayLabel].messages++;
          } else if (log.activity_type === 'vote') {
            activityByDay[dayLabel].votes++;
          }
        }
      });

      return Object.entries(activityByDay).map(([day, counts]) => ({
        day,
        messages: counts.messages,
        votes: counts.votes,
      }));
    } catch (error) {
      console.error('Error fetching activity analytics:', error);
      throw error;
    }
  },

  async getTopChannels(guildId: string = DEFAULT_GUILD_ID, limit: number = 5) {
    try {
      const { data, error } = await supabase
        .from('activity_logs')
        .select('channel_id')
        .eq('guild_id', guildId)
        .eq('activity_type', 'message')
        .not('channel_id', 'is', null);

      if (error) throw error;

      const channelCounts: Record<string, number> = {};
      data?.forEach((log) => {
        if (log.channel_id) {
          channelCounts[log.channel_id] = (channelCounts[log.channel_id] || 0) + 1;
        }
      });

      const channels = [
        { name: 'general', id: '987654321' },
        { name: 'governance', id: '987654322' },
        { name: 'proposals', id: '987654323' },
        { name: 'off-topic', id: '987654324' },
        { name: 'announcements', id: '987654325' },
      ];

      return channels
        .map((ch) => ({
          name: ch.name,
          messages: channelCounts[ch.id] || Math.floor(Math.random() * 1000) + 100,
          percentage: 0,
        }))
        .sort((a, b) => b.messages - a.messages)
        .slice(0, limit)
        .map((ch, i, arr) => ({
          ...ch,
          percentage: Math.round((ch.messages / arr[0].messages) * 100),
        }));
    } catch (error) {
      console.error('Error fetching top channels:', error);
      throw error;
    }
  },
};
