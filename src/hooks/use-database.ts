import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/database';
import type { Embed, Trigger, CustomCommand, ReactionRole, TicketPanel } from '@/lib/database';

const DEFAULT_GUILD_ID = '1234567890123456789';

export function useGuildStats(guildId: string = DEFAULT_GUILD_ID) {
  return useQuery({
    queryKey: ['guild-stats', guildId],
    queryFn: () => db.getGuildStats(guildId),
    staleTime: 30000,
  });
}

export function useTopMembers(guildId: string = DEFAULT_GUILD_ID, limit = 10) {
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['embeds', guildId] }),
  });
}

export function useDeleteEmbed(guildId: string = DEFAULT_GUILD_ID) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (embedId: string) => db.deleteEmbed(embedId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['embeds', guildId] }),
  });
}

export function useTriggers(guildId: string = DEFAULT_GUILD_ID) {
  return useQuery({
    queryKey: ['triggers', guildId],
    queryFn: () => db.getTriggers(guildId),
    staleTime: 60000,
  });
}

export function useCreateTrigger(guildId: string = DEFAULT_GUILD_ID) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (trigger: Partial<Trigger>) => db.createTrigger(trigger, guildId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['triggers', guildId] }),
  });
}

export function useUpdateTrigger(guildId: string = DEFAULT_GUILD_ID) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Trigger> }) => db.updateTrigger(id, updates),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['triggers', guildId] }),
  });
}

export function useDeleteTrigger(guildId: string = DEFAULT_GUILD_ID) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (triggerId: string) => db.deleteTrigger(triggerId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['triggers', guildId] }),
  });
}

export function useInfoTopics(guildId: string = DEFAULT_GUILD_ID, category?: string) {
  return useQuery({
    queryKey: ['info-topics', guildId, category],
    queryFn: () => db.getInfoTopics(guildId, category),
    staleTime: 60000,
  });
}

export function useActivityAnalytics(guildId: string = DEFAULT_GUILD_ID, days = 7) {
  return useQuery({
    queryKey: ['activity-analytics', guildId, days],
    queryFn: () => db.getActivityAnalytics(guildId, days),
    staleTime: 60000,
  });
}

export function useTopChannels(guildId: string = DEFAULT_GUILD_ID, limit = 5) {
  return useQuery({
    queryKey: ['top-channels', guildId, limit],
    queryFn: () => db.getTopChannels(guildId, limit),
    staleTime: 60000,
  });
}

export function useTickets(guildId: string = DEFAULT_GUILD_ID, status?: string, priority?: string) {
  return useQuery({
    queryKey: ['tickets', guildId, status, priority],
    queryFn: () => db.getTickets(guildId, status, priority),
    staleTime: 30000,
  });
}

export function useClaimTicket(guildId: string = DEFAULT_GUILD_ID) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, userId }: { id: string; userId: string }) => db.claimTicket(id, userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tickets', guildId] }),
  });
}

export function useCloseTicket(guildId: string = DEFAULT_GUILD_ID) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => db.closeTicket(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tickets', guildId] }),
  });
}

export function useAuditLogs(guildId: string = DEFAULT_GUILD_ID, severity?: string, search?: string) {
  return useQuery({
    queryKey: ['audit-logs', guildId, severity, search],
    queryFn: () => db.getAuditLogs(guildId, severity, search),
    staleTime: 30000,
  });
}

export function useBotSettings(guildId: string = DEFAULT_GUILD_ID) {
  return useQuery({
    queryKey: ['bot-settings', guildId],
    queryFn: () => db.getBotSettings(guildId),
    staleTime: 60000,
  });
}

export function useUpdateBotSettings(guildId: string = DEFAULT_GUILD_ID) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: any) => db.updateBotSettings(settings, guildId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bot-settings', guildId] }),
  });
}

export function useReactionRoles(guildId: string = DEFAULT_GUILD_ID) {
  return useQuery({
    queryKey: ['reaction-roles', guildId],
    queryFn: () => db.getReactionRoles(guildId),
    staleTime: 60000,
  });
}

export function useCreateReactionRole(guildId: string = DEFAULT_GUILD_ID) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (role: Partial<ReactionRole>) => db.createReactionRole(role, guildId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reaction-roles', guildId] }),
  });
}

export function useDeleteReactionRole(guildId: string = DEFAULT_GUILD_ID) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => db.deleteReactionRole(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reaction-roles', guildId] }),
  });
}

export function useCustomCommands(guildId: string = DEFAULT_GUILD_ID) {
  return useQuery({
    queryKey: ['custom-commands', guildId],
    queryFn: () => db.getCustomCommands(guildId),
    staleTime: 60000,
  });
}

export function useCreateCustomCommand(guildId: string = DEFAULT_GUILD_ID) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: Partial<CustomCommand>) => db.createCustomCommand(command, guildId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['custom-commands', guildId] }),
  });
}

export function useUpdateCustomCommand(guildId: string = DEFAULT_GUILD_ID) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<CustomCommand> }) => db.updateCustomCommand(id, updates),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['custom-commands', guildId] }),
  });
}

export function useDeleteCustomCommand(guildId: string = DEFAULT_GUILD_ID) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => db.deleteCustomCommand(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['custom-commands', guildId] }),
  });
}

export function useTicketPanels(guildId: string = DEFAULT_GUILD_ID) {
  return useQuery({
    queryKey: ['ticket-panels', guildId],
    queryFn: () => db.getTicketPanels(guildId),
    staleTime: 60000,
  });
}

export function useCreateTicketPanel(guildId: string = DEFAULT_GUILD_ID) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (panel: Partial<TicketPanel>) => db.createTicketPanel(panel, guildId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ticket-panels', guildId] }),
  });
}

export function useDeleteTicketPanel(guildId: string = DEFAULT_GUILD_ID) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => db.deleteTicketPanel(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ticket-panels', guildId] }),
  });
}
