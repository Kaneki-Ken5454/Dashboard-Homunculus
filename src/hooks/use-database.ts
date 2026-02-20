import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/database';
import { useGuild } from '@/hooks/use-guild';
import type { Embed, Trigger, CustomCommand, ReactionRole, TicketPanel } from '@/lib/database';

const POLL_INTERVAL = 30000; // 30 seconds

export function useGuildStats() {
  const { guildId } = useGuild();
  return useQuery({
    queryKey: ['guild-stats', guildId],
    queryFn: () => db.getGuildStats(guildId),
    staleTime: 15000,
    refetchInterval: POLL_INTERVAL,
  });
}

export function useTopMembers(limit = 10) {
  const { guildId } = useGuild();
  return useQuery({
    queryKey: ['top-members', guildId, limit],
    queryFn: () => db.getTopMembers(guildId, limit),
    staleTime: 30000,
    refetchInterval: POLL_INTERVAL,
  });
}

export function useActiveVotes() {
  const { guildId } = useGuild();
  return useQuery({
    queryKey: ['active-votes', guildId],
    queryFn: () => db.getActiveVotes(guildId),
    staleTime: 15000,
    refetchInterval: POLL_INTERVAL,
  });
}

export function useAllVotes() {
  const { guildId } = useGuild();
  return useQuery({
    queryKey: ['all-votes', guildId],
    queryFn: () => db.getAllVotes(guildId),
    staleTime: 15000,
    refetchInterval: POLL_INTERVAL,
  });
}

export function useEmbeds() {
  const { guildId } = useGuild();
  return useQuery({
    queryKey: ['embeds', guildId],
    queryFn: () => db.getEmbeds(guildId),
    staleTime: 30000,
    refetchInterval: POLL_INTERVAL,
  });
}

export function useCreateEmbed() {
  const { guildId } = useGuild();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (embed: Partial<Embed>) => db.createEmbed(embed, guildId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['embeds', guildId] }),
  });
}

export function useDeleteEmbed() {
  const { guildId } = useGuild();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (embedId: string) => db.deleteEmbed(embedId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['embeds', guildId] }),
  });
}

export function useTriggers() {
  const { guildId } = useGuild();
  return useQuery({
    queryKey: ['triggers', guildId],
    queryFn: () => db.getTriggers(guildId),
    staleTime: 30000,
    refetchInterval: POLL_INTERVAL,
  });
}

export function useCreateTrigger() {
  const { guildId } = useGuild();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (trigger: Partial<Trigger>) => db.createTrigger(trigger, guildId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['triggers', guildId] }),
  });
}

export function useUpdateTrigger() {
  const { guildId } = useGuild();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Trigger> }) => db.updateTrigger(id, updates),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['triggers', guildId] }),
  });
}

export function useDeleteTrigger() {
  const { guildId } = useGuild();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (triggerId: string) => db.deleteTrigger(triggerId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['triggers', guildId] }),
  });
}

export function useInfoTopics(category?: string) {
  const { guildId } = useGuild();
  return useQuery({
    queryKey: ['info-topics', guildId, category],
    queryFn: () => db.getInfoTopics(guildId, category),
    staleTime: 30000,
    refetchInterval: POLL_INTERVAL,
  });
}

export function useActivityAnalytics(days = 7) {
  const { guildId } = useGuild();
  return useQuery({
    queryKey: ['activity-analytics', guildId, days],
    queryFn: () => db.getActivityAnalytics(guildId, days),
    staleTime: 30000,
    refetchInterval: POLL_INTERVAL,
  });
}

export function useTopChannels(limit = 5) {
  const { guildId } = useGuild();
  return useQuery({
    queryKey: ['top-channels', guildId, limit],
    queryFn: () => db.getTopChannels(guildId, limit),
    staleTime: 30000,
    refetchInterval: POLL_INTERVAL,
  });
}

export function useTickets(status?: string, priority?: string) {
  const { guildId } = useGuild();
  return useQuery({
    queryKey: ['tickets', guildId, status, priority],
    queryFn: () => db.getTickets(guildId, status, priority),
    staleTime: 15000,
    refetchInterval: POLL_INTERVAL,
  });
}

export function useClaimTicket() {
  const { guildId } = useGuild();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, userId }: { id: string; userId: string }) => db.claimTicket(id, userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tickets', guildId] }),
  });
}

export function useCloseTicket() {
  const { guildId } = useGuild();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => db.closeTicket(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tickets', guildId] }),
  });
}

export function useAuditLogs(severity?: string, search?: string) {
  const { guildId } = useGuild();
  return useQuery({
    queryKey: ['audit-logs', guildId, severity, search],
    queryFn: () => db.getAuditLogs(guildId, severity, search),
    staleTime: 15000,
    refetchInterval: POLL_INTERVAL,
  });
}

export function useBotSettings() {
  const { guildId } = useGuild();
  return useQuery({
    queryKey: ['bot-settings', guildId],
    queryFn: () => db.getBotSettings(guildId),
    staleTime: 30000,
    refetchInterval: POLL_INTERVAL,
  });
}

export function useUpdateBotSettings() {
  const { guildId } = useGuild();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: any) => db.updateBotSettings(settings, guildId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bot-settings', guildId] }),
  });
}

export function useReactionRoles() {
  const { guildId } = useGuild();
  return useQuery({
    queryKey: ['reaction-roles', guildId],
    queryFn: () => db.getReactionRoles(guildId),
    staleTime: 30000,
    refetchInterval: POLL_INTERVAL,
  });
}

export function useCreateReactionRole() {
  const { guildId } = useGuild();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (role: Partial<ReactionRole>) => db.createReactionRole(role, guildId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reaction-roles', guildId] }),
  });
}

export function useDeleteReactionRole() {
  const { guildId } = useGuild();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => db.deleteReactionRole(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reaction-roles', guildId] }),
  });
}

export function useCustomCommands() {
  const { guildId } = useGuild();
  return useQuery({
    queryKey: ['custom-commands', guildId],
    queryFn: () => db.getCustomCommands(guildId),
    staleTime: 30000,
    refetchInterval: POLL_INTERVAL,
  });
}

export function useCreateCustomCommand() {
  const { guildId } = useGuild();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: Partial<CustomCommand>) => db.createCustomCommand(command, guildId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['custom-commands', guildId] }),
  });
}

export function useUpdateCustomCommand() {
  const { guildId } = useGuild();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<CustomCommand> }) => db.updateCustomCommand(id, updates),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['custom-commands', guildId] }),
  });
}

export function useDeleteCustomCommand() {
  const { guildId } = useGuild();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => db.deleteCustomCommand(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['custom-commands', guildId] }),
  });
}

export function useTicketPanels() {
  const { guildId } = useGuild();
  return useQuery({
    queryKey: ['ticket-panels', guildId],
    queryFn: () => db.getTicketPanels(guildId),
    staleTime: 30000,
    refetchInterval: POLL_INTERVAL,
  });
}

export function useCreateTicketPanel() {
  const { guildId } = useGuild();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (panel: Partial<TicketPanel>) => db.createTicketPanel(panel, guildId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ticket-panels', guildId] }),
  });
}

export function useDeleteTicketPanel() {
  const { guildId } = useGuild();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => db.deleteTicketPanel(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ticket-panels', guildId] }),
  });
}
