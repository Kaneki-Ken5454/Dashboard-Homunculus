import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/database';
import type { Embed, Trigger } from '@/lib/database';

const DEFAULT_GUILD_ID = '1234567890123456789';

export function useGuildStats(guildId: string = DEFAULT_GUILD_ID) {
  return useQuery({
    queryKey: ['guild-stats', guildId],
    queryFn: () => db.getGuildStats(guildId),
    staleTime: 30000,
  });
}

export function useTopMembers(guildId: string = DEFAULT_GUILD_ID, limit: number = 10) {
  return useQuery({
    queryKey: ['top-members', guildId, limit],
    queryFn: () => db.getTopMembers(guildId, limit),
    staleTime: 60000,
  });
}

export function useActiveVotes(guildId: string = DEFAULT_GUILD_ID) {
  return useQuery({
    queryKey: ['active-votes', guildId],
    queryFn: () => db.getActiveVotes(guildId),
    staleTime: 30000,
  });
}

export function useAllVotes(guildId: string = DEFAULT_GUILD_ID) {
  return useQuery({
    queryKey: ['all-votes', guildId],
    queryFn: () => db.getAllVotes(guildId),
    staleTime: 30000,
  });
}

export function useEmbeds(guildId: string = DEFAULT_GUILD_ID) {
  return useQuery({
    queryKey: ['embeds', guildId],
    queryFn: () => db.getEmbeds(guildId),
    staleTime: 60000,
  });
}

export function useCreateEmbed(guildId: string = DEFAULT_GUILD_ID) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (embed: Partial<Embed>) => db.createEmbed(embed, guildId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['embeds', guildId] });
    },
  });
}

export function useDeleteEmbed(guildId: string = DEFAULT_GUILD_ID) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (embedId: string) => db.deleteEmbed(embedId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['embeds', guildId] });
    },
  });
}

export function useTriggers(guildId: string = DEFAULT_GUILD_ID) {
  return useQuery({
    queryKey: ['triggers', guildId],
    queryFn: () => db.getTriggers(guildId),
    staleTime: 60000,
  });
}

export function useUpdateTrigger(guildId: string = DEFAULT_GUILD_ID) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Trigger> }) =>
      db.updateTrigger(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['triggers', guildId] });
    },
  });
}

export function useDeleteTrigger(guildId: string = DEFAULT_GUILD_ID) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (triggerId: string) => db.deleteTrigger(triggerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['triggers', guildId] });
    },
  });
}

export function useInfoTopics(guildId: string = DEFAULT_GUILD_ID, category?: string) {
  return useQuery({
    queryKey: ['info-topics', guildId, category],
    queryFn: () => db.getInfoTopics(guildId, category),
    staleTime: 60000,
  });
}

export function useActivityAnalytics(guildId: string = DEFAULT_GUILD_ID, days: number = 7) {
  return useQuery({
    queryKey: ['activity-analytics', guildId, days],
    queryFn: () => db.getActivityAnalytics(guildId, days),
    staleTime: 60000,
  });
}

export function useTopChannels(guildId: string = DEFAULT_GUILD_ID, limit: number = 5) {
  return useQuery({
    queryKey: ['top-channels', guildId, limit],
    queryFn: () => db.getTopChannels(guildId, limit),
    staleTime: 60000,
  });
}
