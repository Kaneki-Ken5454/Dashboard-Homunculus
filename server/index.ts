import cors from 'cors';
import * as dotenv from 'dotenv';
import express from 'express';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient, Prisma } from '@prisma/client';
const prisma = new PrismaClient();

dotenv.config();

const app = express();
const port = Number(process.env.PORT || process.env.BACKEND_PORT || 5000);
const defaultGuildId = process.env.VITE_DISCORD_GUILD_ID || '1234567890123456789';
const hardcodedFallbackGuildId = '1234567890123456789';
let autoDetectedGuildId: string | null = null;

type JsonRecord = Record<string, unknown>;

interface ActionRequest {
  action?: string;
  params?: Record<string, any>;
}

type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

app.use(cors());
app.use(express.json({ limit: '2mb' }));

let bootstrapPromise: Promise<void> | null = null;

function ensureBootstrapped(): Promise<void> {
  if (!bootstrapPromise) {
    bootstrapPromise = bootstrapAuxiliaryTables();
  }
  return bootstrapPromise;
}

async function bootstrapAuxiliaryTables(): Promise<void> {
  await ensurePrismaTables();
  await detectAutoGuildId();
  await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
}

async function detectAutoGuildId(): Promise<void> {
  const rows = await prisma.$queryRaw<Array<{ guild_id: string; row_count: bigint }>>`
    SELECT guild_id::text AS guild_id, COUNT(*)::bigint AS row_count
    FROM (
      SELECT guild_id FROM guild_members
      UNION ALL
      SELECT guild_id FROM custom_commands
      UNION ALL
      SELECT guild_id FROM auto_responders
      UNION ALL
      SELECT guild_id FROM tickets
      UNION ALL
      SELECT guild_id FROM ticket_panels
      UNION ALL
      SELECT guild_id FROM audit_logs
      UNION ALL
      SELECT guild_id FROM guild_settings
    ) all_guilds
    GROUP BY guild_id
    ORDER BY row_count DESC
    LIMIT 1
  `;
  autoDetectedGuildId = rows[0]?.guild_id || null;
}

async function ensurePrismaTables(): Promise<void> {
  const [existing] = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('guild_settings', 'custom_commands', 'reaction_roles', 'ticket_panels', 'tickets')
  `;
  if (Number(existing?.count || 0) === 5) {
    return;
  }

  const sqlPath = path.join(process.cwd(), 'prisma', 'init_schema.sql');
  const raw = await fs.readFile(sqlPath, 'utf8');
  const cleaned = raw
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');

  const statements = cleaned
    .split(/;\s*\n/g)
    .map((stmt) => stmt.trim())
    .filter(Boolean);

  for (const statement of statements) {
    try {
      await prisma.$executeRawUnsafe(statement);
    } catch (error: any) {
      const sqlState = error?.meta?.code as string | undefined;
      if (sqlState === '42P07' || sqlState === '42710') {
        continue;
      }
      throw error;
    }
  }
}

function isPlaceholderGuildId(guildId: string | undefined): boolean {
  if (!guildId) return true;
  return guildId.includes('your_discord_guild_id_here');
}

function getGuildId(params?: Record<string, any>): string {
  const requestedGuildId = params?.guildId ? String(params.guildId).trim() : '';
  if (requestedGuildId && !isPlaceholderGuildId(requestedGuildId) && requestedGuildId !== hardcodedFallbackGuildId) {
    return requestedGuildId;
  }

  if (autoDetectedGuildId) {
    return autoDetectedGuildId;
  }

  if (requestedGuildId && !isPlaceholderGuildId(requestedGuildId)) {
    return requestedGuildId;
  }

  return isPlaceholderGuildId(defaultGuildId) ? hardcodedFallbackGuildId : defaultGuildId;
}

function getGuildIdBigInt(params?: Record<string, any>): bigint {
  const guildId = getGuildId(params);
  try {
    return BigInt(guildId);
  } catch {
    return BigInt(hardcodedFallbackGuildId);
  }
}

function toLegacyGuildId(guildId: string): bigint | null {
  try {
    return BigInt(guildId);
  } catch {
    return null;
  }
}

function toJsonValue(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  return value;
}

function normalizeLegacyEmbed(embedRow: Record<string, any>): Record<string, unknown> {
  const embedData = embedRow.embed_data && typeof embedRow.embed_data === 'object' ? embedRow.embed_data : {};
  const footerValue = (embedData as Record<string, any>).footer;
  const footer =
    typeof footerValue === 'string'
      ? footerValue
      : footerValue && typeof footerValue === 'object'
      ? String((footerValue as Record<string, unknown>).text || '')
      : '';

  return {
    id: String(embedRow.id),
    guild_id: String(embedRow.guild_id),
    name: embedRow.name,
    title: (embedData as Record<string, any>).title || embedRow.name,
    description: (embedData as Record<string, any>).description || '',
    color: (embedData as Record<string, any>).color || '#6366f1',
    footer,
    thumbnail_url: (embedData as Record<string, any>).thumbnail || null,
    image_url: (embedData as Record<string, any>).image || null,
    fields: Array.isArray((embedData as Record<string, any>).fields) ? (embedData as Record<string, any>).fields : [],
    created_by: (embedData as Record<string, any>).creator || 'dashboard_admin',
    created_at: embedRow.created_at,
    updated_at: embedRow.updated_at,
  };
}

function toInt(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
  }
  return fallback;
}

function normalizeTicketStatus(status: string): TicketStatus {
  if (status === 'claimed' || status === 'in_progress') return 'in_progress';
  if (status === 'resolved') return 'resolved';
  if (status === 'closed' || status === 'deleted') return 'closed';
  return 'open';
}

function severityFromAction(actionType: string): 'info' | 'warning' | 'error' | 'success' {
  if (['ban', 'kick', 'delete', 'hard_delete'].includes(actionType)) return 'error';
  if (['warn', 'mute', 'timeout'].includes(actionType)) return 'warning';
  if (['unban', 'unmute', 'resolved', 'approve'].includes(actionType)) return 'success';
  return 'info';
}

function mapTicketRecord(ticket: any): Record<string, unknown> {
  const status = normalizeTicketStatus(ticket.status);
  const panelName = ticket.panel?.name || 'general';
  return {
    id: ticket.id,
    guild_id: ticket.guildId,
    title: ticket.title || `${panelName} Ticket`,
    user_id: ticket.userId,
    username: ticket.username || ticket.userId,
    status,
    priority: ticket.priority || 'medium',
    category: ticket.category || panelName.toLowerCase(),
    claimed_by: ticket.assignedTo || undefined,
    messages_count: ticket.messagesCount || 0,
    created_at: ticket.openedAt,
    updated_at: ticket.closedAt || ticket.claimedAt || ticket.openedAt,
  };
}

async function handleAction(action: string, params: Record<string, any> = {}): Promise<unknown> {
  switch (action) {
    case 'inspectSchema': {
      return prisma.$queryRaw<Array<{ table_name: string; column_name: string; data_type: string; is_nullable: string; column_default: string | null }>>`
        SELECT table_name, column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'public'
        ORDER BY table_name, ordinal_position
      `;
    }

    case 'getGuildStats': {
      const guildId = getGuildId(params);
      const [membersRow] = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count
        FROM guild_members
        WHERE guild_id = ${guildId}
      `;
      const [votesRow] = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count
        FROM votes
        WHERE guild_id = ${BigInt(guildId)}
          AND is_active = TRUE
          AND end_time > NOW()
      `;
      const [messagesRow] = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COALESCE(SUM(message_count), 0)::bigint AS count
        FROM guild_members
        WHERE guild_id = ${guildId}
      `;
      const [weeklyRow] = await prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count
        FROM audit_logs
        WHERE guild_id = ${guildId}
          AND created_at >= NOW() - INTERVAL '7 days'
      `;

      return {
        totalMembers: Number(membersRow?.count || 0n),
        activeVotes: Number(votesRow?.count || 0n),
        totalMessages: Number(messagesRow?.count || 0n),
        weeklyActivity: Number(weeklyRow?.count || 0n),
      };
    }

    case 'getTopMembers': {
      const guildId = getGuildId(params);
      const limit = Math.max(1, Math.min(100, toInt(params?.limit, 10)));
      return prisma.$queryRaw<Array<Record<string, unknown>>>`
        SELECT
          id,
          guild_id,
          user_id,
          username,
          discriminator,
          avatar_url,
          joined_at,
          last_active,
          message_count,
          vote_count,
          role_ids
        FROM guild_members
        WHERE guild_id = ${guildId}
        ORDER BY message_count DESC, vote_count DESC, last_active DESC
        LIMIT ${limit}
      `;
    }

    case 'getActiveVotes': {
      const guildId = getGuildId(params);
      return prisma.$queryRaw<Array<Record<string, unknown>>>`
        SELECT
          id,
          guild_id,
          question,
          description,
          options,
          created_by,
          channel_id,
          message_id,
          start_time,
          end_time,
          is_active,
          total_votes,
          created_at
        FROM votes
        WHERE guild_id = ${guildId}
          AND is_active = TRUE
          AND end_time > NOW()
        ORDER BY created_at DESC
      `;
    }

    case 'getAllVotes': {
      const guildId = getGuildId(params);
      const rows = await prisma.$queryRaw<Array<any>>`
        SELECT
          id,
          guild_id,
          question,
          description,
          options,
          created_by,
          channel_id,
          message_id,
          start_time,
          end_time,
          is_active,
          total_votes,
          created_at
        FROM votes
        WHERE guild_id = ${guildId}
        ORDER BY created_at DESC
      `;
      return rows.map((vote) => ({
        ...vote,
        is_active: Boolean(vote.is_active) && new Date(vote.end_time) > new Date(),
      }));
    }

    case 'getEmbeds': {
      const guildId = getGuildId(params);
      return prisma.$queryRaw<Array<Record<string, unknown>>>`
        SELECT
          id,
          guild_id,
          name,
          title,
          description,
          color,
          footer,
          thumbnail_url,
          image_url,
          fields,
          created_by,
          created_at,
          updated_at
        FROM message_templates
        WHERE guild_id = ${guildId}
        ORDER BY created_at DESC
      `;
    }

    case 'createEmbed': {
      const guildId = getGuildId(params);
      const embed = (params?.embed || {}) as Record<string, any>;
      if (!embed.name || !embed.title) throw new Error('Embed name and title are required');
      const [created] = await prisma.$queryRaw<Array<Record<string, unknown>>>`
        INSERT INTO message_templates (
          guild_id,
          name,
          content,
          embed_data,
          created_by
        )
        VALUES (
          ${guildId},
          ${String(embed.name)},
          ${String(embed.title)},
          ${JSON.stringify({
            title: embed.title,
            description: embed.description || '',
            color: embed.color || '#6366f1',
            footer: embed.footer || '',
            thumbnail: embed.thumbnail_url || null,
            image: embed.image_url || null,
            fields: embed.fields || []
          })}::jsonb,
          ${embed.created_by ? String(embed.created_by) : 'dashboard_admin'}
        )
        RETURNING
          id,
          guild_id,
          name,
          content,
          embed_data,
          created_by,
          created_at,
          updated_at
      `;
      return created;
    }

    case 'deleteEmbed': {
      if (!params?.id) throw new Error('Embed id is required');
      await prisma.$executeRaw`
        DELETE FROM message_templates
        WHERE id = ${String(params.id)}
      `;
      return { success: true };
    }

    case 'getTriggers': {
      const guildId = getGuildId(params);
      return prisma.$queryRaw<Array<Record<string, unknown>>>`
        SELECT
          id,
          guild_id,
          trigger_text,
          response,
          match_type,
          is_enabled,
          trigger_count,
          created_by,
          created_at,
          updated_at
        FROM triggers
        WHERE guild_id = ${guildId}
        ORDER BY created_at DESC
      `;
    }

    case 'createTrigger': {
      const guildId = getGuildId(params);
      const trigger = (params?.trigger || {}) as Record<string, any>;
      if (!trigger.trigger_text || !trigger.response) throw new Error('Trigger text and response are required');
      const [created] = await prisma.$queryRaw<Array<Record<string, unknown>>>`
        INSERT INTO triggers (
          guild_id,
          trigger_text,
          response,
          match_type,
          is_enabled,
          created_by
        )
        VALUES (
          ${guildId},
          ${String(trigger.trigger_text)},
          ${String(trigger.response)},
          ${String(trigger.match_type || 'contains')},
          ${trigger.is_enabled !== false},
          ${trigger.created_by ? String(trigger.created_by) : 'dashboard_admin'}
        )
        RETURNING
          id,
          guild_id,
          trigger_text,
          response,
          match_type,
          is_enabled,
          trigger_count,
          created_by,
          created_at,
          updated_at
      `;
      return created;
    }

    case 'updateTrigger': {
      const id = String(params?.id || '');
      if (!id) throw new Error('Trigger id is required');
      const updates = (params?.updates || {}) as Record<string, any>;
      const [current] = await prisma.$queryRaw<Array<any>>`
        SELECT id, trigger_text, response, match_type, is_enabled
        FROM triggers
        WHERE id = ${id}
        LIMIT 1
      `;
      if (!current) throw new Error('Trigger not found');

      const triggerText = updates.trigger_text ?? current.trigger_text;
      const response = updates.response ?? current.response;
      const matchType = updates.match_type ?? current.match_type;
      const isEnabled = updates.is_enabled ?? current.is_enabled;

      const [updated] = await prisma.$queryRaw<Array<Record<string, unknown>>>`
        UPDATE triggers
        SET
          trigger_text = ${String(triggerText)},
          response = ${String(response)},
          match_type = ${String(matchType)},
          is_enabled = ${Boolean(isEnabled)},
          updated_at = NOW()
        WHERE id = ${id}
        RETURNING
          id,
          guild_id,
          trigger_text,
          response,
          match_type,
          is_enabled,
          trigger_count,
          created_by,
          created_at,
          updated_at
      `;
      return updated;
    }

    case 'deleteTrigger': {
      if (!params?.id) throw new Error('Trigger id is required');
      await prisma.$executeRaw`
        DELETE FROM triggers
        WHERE id = ${String(params.id)}
      `;
      return { success: true };
    }

    case 'getActivityAnalytics': {
      const guildId = getGuildId(params);
      const days = Math.max(1, Math.min(365, toInt(params?.days, 7)));
      return prisma.$queryRaw<Array<Record<string, unknown>>>`
        SELECT action_type, created_at
        FROM audit_logs
        WHERE guild_id = ${guildId}
          AND created_at >= NOW() - INTERVAL '${days} days'
        ORDER BY created_at ASC
      `;
    }

    case 'getTopChannels': {
      const guildId = getGuildId(params);
      const limit = Math.max(1, Math.min(25, toInt(params?.limit, 5)));
      return prisma.$queryRaw<Array<{ channel_id: string; message_count: number }>>`
        SELECT channel_id, COUNT(*)::int AS message_count
        FROM audit_logs
        WHERE guild_id = ${guildId}
          AND action_type = 'message'
          AND channel_id IS NOT NULL
        GROUP BY channel_id
        ORDER BY message_count DESC
        LIMIT ${limit}
      `;
    }

    case 'getTickets': {
      const guildId = getGuildId(params);
      const statusFilter = params?.status ? String(params.status) : undefined;
      const priorityFilter = params?.priority ? String(params.priority) : undefined;.TicketWhereInput = { guildId };

      if (statusFilter === 'in_progress') where.status = { in: ['in_progress', 'claimed'] };
      else if (statusFilter === 'closed') where.status = { in: ['closed', 'deleted'] };
      else if (statusFilter && statusFilter !== 'all') where.status = statusFilter;

      if (priorityFilter && priorityFilter !== 'all') where.priority = priorityFilter;

      const tickets = await prisma.ticket.findMany({
        where,
        include: { panel: true },
        orderBy: { openedAt: 'desc' },
      });
      return tickets.map(mapTicketRecord);
    }

    case 'claimTicket': {
      const id = String(params?.id || '');
      const userId = String(params?.userId || '');
      if (!id || !userId) throw new Error('Ticket id and userId are required');
      const updated = await prisma.ticket.update({
        where: { id },
        data: {
          assignedTo: userId,
          status: 'in_progress',
          claimedAt: new Date(),
        },
        include: { panel: true },
      });
      return mapTicketRecord(updated);
    }

    case 'closeTicket': {
      const id = String(params?.id || '');
      if (!id) throw new Error('Ticket id is required');
      const updated = await prisma.ticket.update({
        where: { id },
        data: {
          status: 'resolved',
          closedAt: new Date(),
        },
        include: { panel: true },
      });
      return mapTicketRecord(updated);
    }

    case 'getAuditLogs': {
      const guildId = getGuildId(params);
      const severityFilter = params?.severity ? String(params.severity) : undefined;
      const search = params?.search ? String(params.search).toLowerCase() : '';
      const limit = Math.max(1, Math.min(250, toInt(params?.limit, 50)));

      const rows = await prisma.auditLog.findMany({
        where: { guildId },
        orderBy: { createdAt: 'desc' },
        take: Math.max(limit * 3, 100),
      });

      const mapped = rows.map((log) => {
        const severity = severityFromAction(log.actionType);
        const username = log.moderatorId || log.userId || 'system';
        return {
          id: log.id,
          guild_id: log.guildId,
          action: log.actionType,
          username,
          user_id: log.userId || undefined,
          details: log.reason || '',
          severity,
          created_at: log.createdAt,
        };
      });

      const filtered = mapped.filter((row) => {
        if (severityFilter && severityFilter !== 'all' && row.severity !== severityFilter) return false;
        if (!search) return true;
        return (
          row.action.toLowerCase().includes(search) ||
          row.username.toLowerCase().includes(search) ||
          row.details.toLowerCase().includes(search)
        );
      });

      return filtered.slice(0, limit);
    }

    case 'getBotSettings': {
      const guildId = getGuildId(params);
      const row = await prisma.guildSettings.findUnique({ where: { guildId } });
      if (!row) return null;

      const cooldownData =
        row.commandCooldown && typeof row.commandCooldown === 'object' ? (row.commandCooldown as JsonRecord) : {};
      const ratelimit = Number(cooldownData.ratelimit_per_minute || 20);

      return {
        id: row.id,
        guild_id: row.guildId,
        prefix: row.prefix,
        slash_commands_enabled: row.useSlashCommands,
        modules: {
          moderation: row.moderationEnabled,
          leveling: row.levellingEnabled,
          fun: row.funEnabled,
          tickets: row.ticketsEnabled,
          custom_commands: row.customCommandsEnabled,
          auto_responders: row.autoRespondersEnabled,
        },
        cooldown_seconds: Math.max(0, Math.round((row.globalCooldown || 0) / 1000)),
        ratelimit_per_minute: Number.isFinite(ratelimit) ? ratelimit : 20,
        created_at: row.createdAt,
        updated_at: row.updatedAt,
      };
    }

    case 'updateBotSettings': {
      const guildId = getGuildId(params);
      const settings = (params?.settings || {}) as Record<string, any>;
      const modules = (settings.modules || {}) as Record<string, boolean>;
      const cooldownSeconds = Math.max(0, toInt(settings.cooldown_seconds, 3));
      const ratelimit = Math.max(1, toInt(settings.ratelimit_per_minute, 20));

      const updated = await prisma.guildSettings.upsert({
        where: { guildId },
        update: {
          prefix: settings.prefix ? String(settings.prefix) : '!',
          useSlashCommands: settings.slash_commands_enabled !== false,
          moderationEnabled: modules.moderation ?? true,
          levellingEnabled: modules.leveling ?? true,
          funEnabled: modules.fun ?? true,
          ticketsEnabled: modules.tickets ?? true,
          customCommandsEnabled: modules.custom_commands ?? true,
          autoRespondersEnabled: modules.auto_responders ?? true,
          globalCooldown: cooldownSeconds * 1000,
          commandCooldown: { ratelimit_per_minute: ratelimit },
        },
        create: {
          guildId,
          prefix: settings.prefix ? String(settings.prefix) : '!',
          useSlashCommands: settings.slash_commands_enabled !== false,
          moderationEnabled: modules.moderation ?? true,
          levellingEnabled: modules.leveling ?? true,
          funEnabled: modules.fun ?? true,
          ticketsEnabled: modules.tickets ?? true,
          customCommandsEnabled: modules.custom_commands ?? true,
          autoRespondersEnabled: modules.auto_responders ?? true,
          globalCooldown: cooldownSeconds * 1000,
          commandCooldown: { ratelimit_per_minute: ratelimit },
        },
      });

      return {
        id: updated.id,
        guild_id: updated.guildId,
        prefix: updated.prefix,
        slash_commands_enabled: updated.useSlashCommands,
        modules,
        cooldown_seconds: cooldownSeconds,
        ratelimit_per_minute: ratelimit,
        created_at: updated.createdAt,
        updated_at: updated.updatedAt,
      };
    }

    case 'getReactionRoles': {
      const guildId = getGuildId(params);
      const roles = await prisma.reactionRole.findMany({
        where: { guildId },
        orderBy: { createdAt: 'desc' },
      });
      return roles.map((role) => ({
        id: role.id,
        guild_id: role.guildId,
        message_id: role.messageId,
        channel_id: role.channelId,
        emoji: role.emoji,
        role_id: role.roleId,
        role_name: role.roleName || role.roleId,
        type: role.isReaction ? 'reaction' : 'button',
        created_by: role.createdBy || 'dashboard_admin',
        created_at: role.createdAt,
      }));
    }

    case 'createReactionRole': {
      const guildId = getGuildId(params);
      const role = (params?.role || {}) as Record<string, any>;
      if (!role.emoji || !role.role_id || !role.message_id || !role.channel_id) {
        throw new Error('emoji, role_id, message_id and channel_id are required');
      }

      const created = await prisma.reactionRole.create({
        data: {
          guildId,
          messageId: String(role.message_id),
          channelId: String(role.channel_id),
          emoji: String(role.emoji),
          roleId: String(role.role_id),
          roleName: role.role_name ? String(role.role_name) : String(role.role_id),
          createdBy: role.created_by ? String(role.created_by) : 'dashboard_admin',
          isReaction: String(role.type || 'reaction') !== 'button',
        },
      });

      return {
        id: created.id,
        guild_id: created.guildId,
        message_id: created.messageId,
        channel_id: created.channelId,
        emoji: created.emoji,
        role_id: created.roleId,
        role_name: created.roleName || created.roleId,
        type: created.isReaction ? 'reaction' : 'button',
        created_by: created.createdBy || 'dashboard_admin',
        created_at: created.createdAt,
      };
    }

    case 'deleteReactionRole': {
      const id = String(params?.id || '');
      if (!id) throw new Error('Reaction role id is required');
      await prisma.reactionRole.delete({ where: { id } });
      return { success: true };
    }

    case 'getCustomCommands': {
      const guildId = getGuildId(params);
      const commands = await prisma.customCommand.findMany({
        where: { guildId },
        orderBy: { createdAt: 'desc' },
      });
      return commands.map((command) => ({
        id: command.id,
        guild_id: command.guildId,
        name: command.name || command.trigger,
        description: command.description || '',
        response: command.response,
        permission_level: command.permissionLevel || 'everyone',
        is_enabled: command.isEnabled,
        cooldown_seconds: command.cooldownSeconds || 0,
        use_count: command.usageCount || 0,
        created_by: command.createdBy,
        created_at: command.createdAt,
        updated_at: command.updatedAt,
      }));
    }

    case 'createCustomCommand': {
      const guildId = getGuildId(params);
      const command = (params?.command || {}) as Record<string, any>;
      const name = command.name ? String(command.name) : '';
      const trigger = command.trigger ? String(command.trigger) : name;
      if (!trigger || !command.response) throw new Error('Command name/trigger and response are required');

      const created = await prisma.customCommand.create({
        data: {
          guildId,
          name: name || trigger,
          trigger,
          description: command.description ? String(command.description) : null,
          response: String(command.response),
          permissionLevel: command.permission_level ? String(command.permission_level) : 'everyone',
          cooldownSeconds: Math.max(0, toInt(command.cooldown_seconds, 0)),
          createdBy: command.created_by ? String(command.created_by) : 'dashboard_admin',
          responseType: 'text',
        },
      });

      return {
        id: created.id,
        guild_id: created.guildId,
        name: created.name || created.trigger,
        description: created.description || '',
        response: created.response,
        permission_level: created.permissionLevel,
        is_enabled: created.isEnabled,
        cooldown_seconds: created.cooldownSeconds,
        use_count: created.usageCount,
        created_by: created.createdBy,
        created_at: created.createdAt,
        updated_at: created.updatedAt,
      };
    }

    case 'updateCustomCommand': {
      const id = String(params?.id || '');
      if (!id) throw new Error('Command id is required');
      const updates = (params?.updates || {}) as Record<string, any>;

      const payload: Prisma.CustomCommandUpdateInput = {};
      if (updates.name !== undefined) {
        payload.name = String(updates.name);
        payload.trigger = String(updates.name);
      }
      if (updates.description !== undefined) payload.description = updates.description ? String(updates.description) : null;
      if (updates.response !== undefined) payload.response = String(updates.response);
      if (updates.permission_level !== undefined) payload.permissionLevel = String(updates.permission_level);
      if (updates.cooldown_seconds !== undefined) payload.cooldownSeconds = Math.max(0, toInt(updates.cooldown_seconds, 0));
      if (updates.is_enabled !== undefined) payload.isEnabled = Boolean(updates.is_enabled);

      const updated = await prisma.customCommand.update({
        where: { id },
        data: payload,
      });

      return {
        id: updated.id,
        guild_id: updated.guildId,
        name: updated.name || updated.trigger,
        description: updated.description || '',
        response: updated.response,
        permission_level: updated.permissionLevel,
        is_enabled: updated.isEnabled,
        cooldown_seconds: updated.cooldownSeconds,
        use_count: updated.usageCount,
        created_by: updated.createdBy,
        created_at: updated.createdAt,
        updated_at: updated.updatedAt,
      };
    }

    case 'deleteCustomCommand': {
      const id = String(params?.id || '');
      if (!id) throw new Error('Command id is required');
      await prisma.customCommand.delete({ where: { id } });
      return { success: true };
    }

    case 'getTicketPanels': {
      const guildId = getGuildId(params);
      const panels = await prisma.ticketPanel.findMany({
        where: { guildId },
        orderBy: { createdAt: 'desc' },
      });
      return panels.map((panel) => ({
        id: panel.id,
        guild_id: panel.guildId,
        name: panel.name,
        channel_id: panel.channelId || '',
        category_id: panel.categoryId || undefined,
        message: panel.message || panel.description || '',
        button_label: panel.buttonLabel,
        button_color: panel.buttonColor || 'primary',
        created_by: panel.createdBy,
        created_at: panel.createdAt,
      }));
    }

    case 'createTicketPanel': {
      const guildId = getGuildId(params);
      const panel = (params?.panel || {}) as Record<string, any>;
      if (!panel.name || !panel.channel_id) throw new Error('Panel name and channel_id are required');

      const created = await prisma.ticketPanel.create({
        data: {
          guildId,
          name: String(panel.name),
          channelId: String(panel.channel_id),
          message: panel.message ? String(panel.message) : null,
          title: String(panel.name),
          description: panel.message ? String(panel.message) : 'Open a support ticket',
          buttonLabel: panel.button_label ? String(panel.button_label) : 'Open Ticket',
          buttonColor: panel.button_color ? String(panel.button_color) : 'primary',
          supportRoles: [],
          createdBy: panel.created_by ? String(panel.created_by) : 'dashboard_admin',
          isEnabled: true,
        },
      });

      return {
        id: created.id,
        guild_id: created.guildId,
        name: created.name,
        channel_id: created.channelId || '',
        category_id: created.categoryId || undefined,
        message: created.message || created.description || '',
        button_label: created.buttonLabel,
        button_color: created.buttonColor || 'primary',
        created_by: created.createdBy,
        created_at: created.createdAt,
      };
    }

    case 'deleteTicketPanel': {
      const id = String(params?.id || '');
      if (!id) throw new Error('Panel id is required');
      await prisma.ticket.deleteMany({ where: { panelId: id } });
      await prisma.ticketPanel.delete({ where: { id } });
      return { success: true };
    }

    case 'sendEmbedToChannel': {
      const guildId = getGuildId(params);
      const embed = (params?.embed || {}) as Record<string, any>;
      const channelId = params?.channel_id ? String(params.channel_id) : '';
      
      if (!channelId) throw new Error('Channel ID is required');
      if (!embed.title) throw new Error('Embed title is required');

      // This would normally send the embed to Discord via the bot
      // For now, we'll just return a success response to simulate the functionality
      // In a real implementation, this would use the Discord.js library to send the embed
      
      return {
        success: true,
        message: 'Embed would be sent to channel',
        channel_id: channelId,
        embed: {
          title: embed.title,
          description: embed.description || '',
          color: embed.color || '#6366f1',
          footer: embed.footer || '',
          thumbnail: embed.thumbnail_url || null,
          image: embed.image_url || null,
          fields: embed.fields || []
        }
      };
    }

    case 'getTopMembers': {
      const guildId = getGuildId(params);
      const limit = Math.max(1, Math.min(100, toInt(params?.limit, 10)));
      return prisma.$queryRaw<Array<Record<string, unknown>>>`
        SELECT
          id,
          guild_id,
          user_id,
          username,
          discriminator,
          avatar_url,
          joined_at,
          last_active,
          message_count,
          vote_count,
          role_ids
        FROM guild_members
        WHERE guild_id = ${guildId}
        ORDER BY message_count DESC, vote_count DESC, last_active DESC
        LIMIT ${limit}
      `;
    }

    case 'getActiveVotes': {
      const guildId = getGuildId(params);
      return prisma.$queryRaw<Array<Record<string, unknown>>>`
        SELECT
          id,
          guild_id,
          question,
          description,
          options,
          created_by,
          channel_id,
          message_id,
          start_time,
          end_time,
          is_active,
          total_votes,
          created_at
        FROM votes
        WHERE guild_id = ${guildId}
          AND is_active = TRUE
          AND end_time > NOW()
        ORDER BY created_at DESC
      `;
    }

    case 'getAllVotes': {
      const guildId = getGuildId(params);
      const rows = await prisma.$queryRaw<Array<any>>`
        SELECT
          id,
          guild_id,
          question,
          description,
          options,
          created_by,
          channel_id,
          message_id,
          start_time,
          end_time,
          is_active,
          total_votes,
          created_at
        FROM votes
        WHERE guild_id = ${guildId}
        ORDER BY created_at DESC
      `;
      return rows.map((vote) => ({
        ...vote,
        is_active: Boolean(vote.is_active) && new Date(vote.end_time) > new Date(),
      }));
    }

    case 'getEmbeds': {
      const guildId = getGuildId(params);
      return prisma.$queryRaw<Array<Record<string, unknown>>>`
        SELECT
          id,
          guild_id,
          name,
          title,
          description,
          color,
          footer,
          thumbnail_url,
          image_url,
          fields,
          created_by,
          created_at,
          updated_at
        FROM message_templates
        WHERE guild_id = ${guildId}
        ORDER BY created_at DESC
      `;
    }

    case 'createEmbed': {
      const guildId = getGuildId(params);
      const embed = (params?.embed || {}) as Record<string, any>;
      if (!embed.name || !embed.title) throw new Error('Embed name and title are required');
      const [created] = await prisma.$queryRaw<Array<Record<string, unknown>>>`
        INSERT INTO message_templates (
          guild_id,
          name,
          content,
          embed_data,
          created_by
        )
        VALUES (
          ${guildId},
          ${String(embed.name)},
          ${String(embed.title)},
          ${JSON.stringify({
            title: embed.title,
            description: embed.description || '',
            color: embed.color || '#6366f1',
            footer: embed.footer || '',
            thumbnail: embed.thumbnail_url || null,
            image: embed.image_url || null,
            fields: embed.fields || []
          })}::jsonb,
          ${embed.created_by ? String(embed.created_by) : 'dashboard_admin'}
        )
        RETURNING
          id,
          guild_id,
          name,
          content,
          embed_data,
          created_by,
          created_at,
          updated_at
      `;
      return created;
    }

    case 'deleteEmbed': {
      if (!params?.id) throw new Error('Embed id is required');
      await prisma.$executeRaw`
        DELETE FROM message_templates
        WHERE id = ${String(params.id)}
      `;
      return { success: true };
    }

    case 'getTriggers': {
      const guildId = getGuildId(params);
      return prisma.$queryRaw<Array<Record<string, unknown>>>`
        SELECT
          id,
          guild_id,
          trigger_text,
          response,
          match_type,
          is_enabled,
          trigger_count,
          created_by,
          created_at,
          updated_at
        FROM triggers
        WHERE guild_id = ${guildId}
        ORDER BY created_at DESC
      `;
    }

    case 'createTrigger': {
      const guildId = getGuildId(params);
      const trigger = (params?.trigger || {}) as Record<string, any>;
      if (!trigger.trigger_text || !trigger.response) throw new Error('Trigger text and response are required');
      const [created] = await prisma.$queryRaw<Array<Record<string, unknown>>>`
        INSERT INTO triggers (
          guild_id,
          trigger_text,
          response,
          match_type,
          is_enabled,
          created_by
        )
        VALUES (
          ${guildId},
          ${String(trigger.trigger_text)},
          ${String(trigger.response)},
          ${String(trigger.match_type || 'contains')},
          ${trigger.is_enabled !== false},
          ${trigger.created_by ? String(trigger.created_by) : 'dashboard_admin'}
        )
        RETURNING
          id,
          guild_id,
          trigger_text,
          response,
          match_type,
          is_enabled,
          trigger_count,
          created_by,
          created_at,
          updated_at
      `;
      return created;
    }

    case 'updateTrigger': {
      const id = String(params?.id || '');
      if (!id) throw new Error('Trigger id is required');
      const updates = (params?.updates || {}) as Record<string, any>;
      const [current] = await prisma.$queryRaw<Array<any>>`
        SELECT id, trigger_text, response, match_type, is_enabled
        FROM triggers
        WHERE id = ${id}
        LIMIT 1
      `;
      if (!current) throw new Error('Trigger not found');

      const triggerText = updates.trigger_text ?? current.trigger_text;
      const response = updates.response ?? current.response;
      const matchType = updates.match_type ?? current.match_type;
      const isEnabled = updates.is_enabled ?? current.is_enabled;

      const [updated] = await prisma.$queryRaw<Array<Record<string, unknown>>>`
        UPDATE triggers
        SET
          trigger_text = ${String(triggerText)},
          response = ${String(response)},
          match_type = ${String(matchType)},
          is_enabled = ${Boolean(isEnabled)},
          updated_at = NOW()
        WHERE id = ${id}
        RETURNING
          id,
          guild_id,
          trigger_text,
          response,
          match_type,
          is_enabled,
          trigger_count,
          created_by,
          created_at,
          updated_at
      `;
      return updated;
    }

    case 'deleteTrigger': {
      if (!params?.id) throw new Error('Trigger id is required');
      await prisma.$executeRaw`
        DELETE FROM triggers
        WHERE id = ${String(params.id)}
      `;
      return { success: true };
    }

    case 'getInfoTopics': {
      const guildId = getGuildId(params);
      const section = params?.section ? String(params.section) : undefined;
      const subcategory = params?.subcategory ? String(params.subcategory) : undefined;
      
      const where: any = { guildId };
      if (section) where.section = section;
      if (subcategory) where.subcategory = subcategory;

      const topics = await prisma.infoTopic.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      });

      return topics.map(topic => ({
        id: topic.id,
        guild_id: String(topic.guildId),
        section: topic.section,
        subcategory: topic.subcategory,
        topic_id: topic.id,
        name: topic.name,
        embed_title: topic.name,
        embed_description: topic.name,
        embed_color: '#5865F2',
        emoji: '📄',
        category_emoji_id: null,
        image: null,
        thumbnail: null,
        footer: null,
        views: topic.views,
        created_at: topic.createdAt,
        updated_at: topic.updatedAt,
      }));
    }

    case 'getActivityAnalytics': {
      const guildId = getGuildId(params);
      const days = Math.max(1, Math.min(365, toInt(params?.days, 7)));
      return prisma.$queryRaw<Array<Record<string, unknown>>>`
        SELECT action_type, created_at
        FROM audit_logs
        WHERE guild_id = ${guildId}
          AND created_at >= NOW() - INTERVAL '${days} days'
        ORDER BY created_at ASC
      `;
    }

    case 'getTopChannels': {
      const guildId = getGuildId(params);
      const limit = Math.max(1, Math.min(25, toInt(params?.limit, 5)));
      return prisma.$queryRaw<Array<{ channel_id: string; message_count: number }>>`
        SELECT channel_id, COUNT(*)::int AS message_count
        FROM audit_logs
        WHERE guild_id = ${guildId}
          AND action_type = 'message'
          AND channel_id IS NOT NULL
        GROUP BY channel_id
        ORDER BY message_count DESC
        LIMIT ${limit}
      `;
    }

    case 'getTickets': {
      const guildId = getGuildId(params);
      const statusFilter = params?.status ? String(params.status) : undefined;
      const priorityFilter = params?.priority ? String(params.priority) : undefined;
      const where: Prisma.TicketWhereInput = { guildId };

      if (statusFilter === 'in_progress') where.status = { in: ['in_progress', 'claimed'] };
      else if (statusFilter === 'closed') where.status = { in: ['closed', 'deleted'] };
      else if (statusFilter && statusFilter !== 'all') where.status = statusFilter;

      if (priorityFilter && priorityFilter !== 'all') where.priority = priorityFilter;

      const tickets = await prisma.ticket.findMany({
        where,
        include: { panel: true },
        orderBy: { openedAt: 'desc' },
      });
      return tickets.map(mapTicketRecord);
    }

    case 'claimTicket': {
      const id = String(params?.id || '');
      const userId = String(params?.userId || '');
      if (!id || !userId) throw new Error('Ticket id and userId are required');
      const updated = await prisma.ticket.update({
        where: { id },
        data: {
          assignedTo: userId,
          status: 'in_progress',
          claimedAt: new Date(),
        },
        include: { panel: true },
      });
      return mapTicketRecord(updated);
    }

    case 'closeTicket': {
      const id = String(params?.id || '');
      if (!id) throw new Error('Ticket id is required');
      const updated = await prisma.ticket.update({
        where: { id },
        data: {
          status: 'resolved',
          closedAt: new Date(),
        },
        include: { panel: true },
      });
      return mapTicketRecord(updated);
    }

    case 'getAuditLogs': {
      const guildId = getGuildId(params);
      const severityFilter = params?.severity ? String(params.severity) : undefined;
      const search = params?.search ? String(params.search).toLowerCase() : '';
      const limit = Math.max(1, Math.min(250, toInt(params?.limit, 50)));

      const rows = await prisma.auditLog.findMany({
        where: { guildId },
        orderBy: { createdAt: 'desc' },
        take: Math.max(limit * 3, 100),
      });

      const mapped = rows.map((log) => {
        const severity = severityFromAction(log.actionType);
        const username = log.moderatorId || log.userId || 'system';
        return {
          id: log.id,
          guild_id: log.guildId,
          action: log.actionType,
          username,
          user_id: log.userId || undefined,
          details: log.reason || '',
          severity,
          created_at: log.createdAt,
        };
      });

      const filtered = mapped.filter((row) => {
        if (severityFilter && severityFilter !== 'all' && row.severity !== severityFilter) return false;
        if (!search) return true;
        return (
          row.action.toLowerCase().includes(search) ||
          row.username.toLowerCase().includes(search) ||
          row.details.toLowerCase().includes(search)
        );
      });

      return filtered.slice(0, limit);
    }

    case 'getBotSettings': {
      const guildId = getGuildId(params);
      const row = await prisma.guildSettings.findUnique({ where: { guildId } });
      if (!row) return null;

      const cooldownData =
        row.commandCooldown && typeof row.commandCooldown === 'object' ? (row.commandCooldown as JsonRecord) : {};
      const ratelimit = Number(cooldownData.ratelimit_per_minute || 20);

      return {
        id: row.id,
        guild_id: row.guildId,
        prefix: row.prefix,
        slash_commands_enabled: row.useSlashCommands,
        modules: {
          moderation: row.moderationEnabled,
          leveling: row.levellingEnabled,
          fun: row.funEnabled,
          tickets: row.ticketsEnabled,
          custom_commands: row.customCommandsEnabled,
          auto_responders: row.autoRespondersEnabled,
        },
        cooldown_seconds: Math.max(0, Math.round((row.globalCooldown || 0) / 1000)),
        ratelimit_per_minute: Number.isFinite(ratelimit) ? ratelimit : 20,
        created_at: row.createdAt,
        updated_at: row.updatedAt,
      };
    }

    case 'updateBotSettings': {
      const guildId = getGuildId(params);
      const settings = (params?.settings || {}) as Record<string, any>;
      const modules = (settings.modules || {}) as Record<string, boolean>;
      const cooldownSeconds = Math.max(0, toInt(settings.cooldown_seconds, 3));
      const ratelimit = Math.max(1, toInt(settings.ratelimit_per_minute, 20));

      const updated = await prisma.guildSettings.upsert({
        where: { guildId },
        update: {
          prefix: settings.prefix ? String(settings.prefix) : '!',
          useSlashCommands: settings.slash_commands_enabled !== false,
          moderationEnabled: modules.moderation ?? true,
          levellingEnabled: modules.leveling ?? true,
          funEnabled: modules.fun ?? true,
          ticketsEnabled: modules.tickets ?? true,
          customCommandsEnabled: modules.custom_commands ?? true,
          autoRespondersEnabled: modules.auto_responders ?? true,
          globalCooldown: cooldownSeconds * 1000,
          commandCooldown: { ratelimit_per_minute: ratelimit },
        },
        create: {
          guildId,
          prefix: settings.prefix ? String(settings.prefix) : '!',
          useSlashCommands: settings.slash_commands_enabled !== false,
          moderationEnabled: modules.moderation ?? true,
          levellingEnabled: modules.leveling ?? true,
          funEnabled: modules.fun ?? true,
          ticketsEnabled: modules.tickets ?? true,
          customCommandsEnabled: modules.custom_commands ?? true,
          autoRespondersEnabled: modules.auto_responders ?? true,
          globalCooldown: cooldownSeconds * 1000,
          commandCooldown: { ratelimit_per_minute: ratelimit },
        },
      });

      return {
        id: updated.id,
        guild_id: updated.guildId,
        prefix: updated.prefix,
        slash_commands_enabled: updated.useSlashCommands,
        modules,
        cooldown_seconds: cooldownSeconds,
        ratelimit_per_minute: ratelimit,
        created_at: updated.createdAt,
        updated_at: updated.updatedAt,
      };
    }

    case 'getReactionRoles': {
      const guildId = getGuildId(params);
      const roles = await prisma.reactionRole.findMany({
        where: { guildId },
        orderBy: { createdAt: 'desc' },
      });
      return roles.map((role) => ({
        id: role.id,
        guild_id: role.guildId,
        message_id: role.messageId,
        channel_id: role.channelId,
        emoji: role.emoji,
        role_id: role.roleId,
        role_name: role.roleName || role.roleId,
        type: role.isReaction ? 'reaction' : 'button',
        created_by: role.createdBy || 'dashboard_admin',
        created_at: role.createdAt,
      }));
    }

    case 'createReactionRole': {
      const guildId = getGuildId(params);
      const role = (params?.role || {}) as Record<string, any>;
      if (!role.emoji || !role.role_id || !role.message_id || !role.channel_id) {
        throw new Error('emoji, role_id, message_id and channel_id are required');
      }

      const created = await prisma.reactionRole.create({
        data: {
          guildId,
          messageId: String(role.message_id),
          channelId: String(role.channel_id),
          emoji: String(role.emoji),
          roleId: String(role.role_id),
          roleName: role.role_name ? String(role.role_name) : String(role.role_id),
          createdBy: role.created_by ? String(role.created_by) : 'dashboard_admin',
          isReaction: String(role.type || 'reaction') !== 'button',
        },
      });

      return {
        id: created.id,
        guild_id: created.guildId,
        message_id: created.messageId,
        channel_id: created.channelId,
        emoji: created.emoji,
        role_id: created.roleId,
        role_name: created.roleName || created.roleId,
        type: created.isReaction ? 'reaction' : 'button',
        created_by: created.createdBy || 'dashboard_admin',
        created_at: created.createdAt,
      };
    }

    case 'deleteReactionRole': {
      const id = String(params?.id || '');
      if (!id) throw new Error('Reaction role id is required');
      await prisma.reactionRole.delete({ where: { id } });
      return { success: true };
    }

    case 'getCustomCommands': {
      const guildId = getGuildId(params);
      const commands = await prisma.customCommand.findMany({
        where: { guildId },
        orderBy: { createdAt: 'desc' },
      });
      return commands.map((command) => ({
        id: command.id,
        guild_id: command.guildId,
        name: command.name || command.trigger,
        description: command.description || '',
        response: command.response,
        permission_level: command.permissionLevel || 'everyone',
        is_enabled: command.isEnabled,
        cooldown_seconds: command.cooldownSeconds || 0,
        use_count: command.usageCount || 0,
        created_by: command.createdBy,
        created_at: command.createdAt,
        updated_at: command.updatedAt,
      }));
    }

    case 'createCustomCommand': {
      const guildId = getGuildId(params);
      const command = (params?.command || {}) as Record<string, any>;
      const name = command.name ? String(command.name) : '';
      const trigger = command.trigger ? String(command.trigger) : name;
      if (!trigger || !command.response) throw new Error('Command name/trigger and response are required');

      const created = await prisma.customCommand.create({
        data: {
          guildId,
          name: name || trigger,
          trigger,
          description: command.description ? String(command.description) : null,
          response: String(command.response),
          permissionLevel: command.permission_level ? String(command.permission_level) : 'everyone',
          cooldownSeconds: Math.max(0, toInt(command.cooldown_seconds, 0)),
          createdBy: command.created_by ? String(command.created_by) : 'dashboard_admin',
          responseType: 'text',
        },
      });

      return {
        id: created.id,
        guild_id: created.guildId,
        name: created.name || created.trigger,
        description: created.description || '',
        response: created.response,
        permission_level: created.permissionLevel,
        is_enabled: created.isEnabled,
        cooldown_seconds: created.cooldownSeconds,
        use_count: created.usageCount,
        created_by: created.createdBy,
        created_at: created.createdAt,
        updated_at: created.updatedAt,
      };
    }

    case 'updateCustomCommand': {
      const id = String(params?.id || '');
      if (!id) throw new Error('Command id is required');
      const updates = (params?.updates || {}) as Record<string, any>;

      const payload: Prisma.CustomCommandUpdateInput = {};
      if (updates.name !== undefined) {
        payload.name = String(updates.name);
        payload.trigger = String(updates.name);
      }
      if (updates.description !== undefined) payload.description = updates.description ? String(updates.description) : null;
      if (updates.response !== undefined) payload.response = String(updates.response);
      if (updates.permission_level !== undefined) payload.permissionLevel = String(updates.permission_level);
      if (updates.cooldown_seconds !== undefined) payload.cooldownSeconds = Math.max(0, toInt(updates.cooldown_seconds, 0));
      if (updates.is_enabled !== undefined) payload.isEnabled = Boolean(updates.is_enabled);

      const updated = await prisma.customCommand.update({
        where: { id },
        data: payload,
      });

      return {
        id: updated.id,
        guild_id: updated.guildId,
        name: updated.name || updated.trigger,
        description: updated.description || '',
        response: updated.response,
        permission_level: updated.permissionLevel,
        is_enabled: updated.isEnabled,
        cooldown_seconds: updated.cooldownSeconds,
        use_count: updated.usageCount,
        created_by: updated.createdBy,
        created_at: updated.createdAt,
        updated_at: updated.updatedAt,
      };
    }

    case 'deleteCustomCommand': {
      const id = String(params?.id || '');
      if (!id) throw new Error('Command id is required');
      await prisma.customCommand.delete({ where: { id } });
      return { success: true };
    }

    case 'getTicketPanels': {
      const guildId = getGuildId(params);
      const panels = await prisma.ticketPanel.findMany({
        where: { guildId },
        orderBy: { createdAt: 'desc' },
      });
      return panels.map((panel) => ({
        id: panel.id,
        guild_id: panel.guildId,
        name: panel.name,
        channel_id: panel.channelId || '',
        category_id: panel.categoryId || undefined,
        message: panel.message || panel.description || '',
        button_label: panel.buttonLabel,
        button_color: panel.buttonColor || 'primary',
        created_by: panel.createdBy,
        created_at: panel.createdAt,
      }));
    }

    case 'createTicketPanel': {
      const guildId = getGuildId(params);
      const panel = (params?.panel || {}) as Record<string, any>;
      if (!panel.name || !panel.channel_id) throw new Error('Panel name and channel_id are required');

      const created = await prisma.ticketPanel.create({
        data: {
          guildId,
          name: String(panel.name),
          channelId: String(panel.channel_id),
          message: panel.message ? String(panel.message) : null,
          title: String(panel.name),
          description: panel.message ? String(panel.message) : 'Open a support ticket',
          buttonLabel: panel.button_label ? String(panel.button_label) : 'Open Ticket',
          buttonColor: panel.button_color ? String(panel.button_color) : 'primary',
          supportRoles: [],
          createdBy: panel.created_by ? String(panel.created_by) : 'dashboard_admin',
          isEnabled: true,
        },
      });

      return {
        id: created.id,
        guild_id: created.guildId,
        name: created.name,
        channel_id: created.channelId || '',
        category_id: created.categoryId || undefined,
        message: created.message || created.description || '',
        button_label: created.buttonLabel,
        button_color: created.buttonColor || 'primary',
        created_by: created.createdBy,
        created_at: created.createdAt,
      };
    }

    case 'deleteTicketPanel': {
      const id = String(params?.id || '');
      if (!id) throw new Error('Panel id is required');
      await prisma.ticket.deleteMany({ where: { panelId: id } });
      await prisma.ticketPanel.delete({ where: { id } });
      return { success: true };
    }

    case 'sendEmbedToChannel': {
      const guildId = getGuildId(params);
      const embed = (params?.embed || {}) as Record<string, any>;
      const channelId = params?.channel_id ? String(params.channel_id) : '';
      
      if (!channelId) throw new Error('Channel ID is required');
      if (!embed.title) throw new Error('Embed title is required');

      // This would normally send the embed to Discord via the bot
      // For now, we'll just return a success response to simulate the functionality
      // In a real implementation, this would use the Discord.js library to send the embed
      
      return {
        success: true,
        message: 'Embed would be sent to channel',
        channel_id: channelId,
        embed: {
          title: embed.title,
          description: embed.description || '',
          color: embed.color || '#6366f1',
          footer: embed.footer || '',
          thumbnail: embed.thumbnail_url || null,
          image: embed.image_url || null,
          fields: embed.fields || []
        }
      };
    }

    // Info Topics CRUD Operations
    case 'createInfoTopic': {
      const guildId = getGuildId(params);
      const topic = (params?.topic || {}) as Record<string, any>;
      if (!topic.title || !topic.content || !topic.section) {
        throw new Error('Title, content, and section are required');
      }

      const [created] = await prisma.$queryRaw<Array<Record<string, unknown>>>`
        INSERT INTO info_topics (
          guild_id,
          section,
          subcategory,
          topic_id,
          name,
          embed_title,
          embed_description,
          embed_color,
          emoji,
          category_emoji_id,
          image,
          thumbnail,
          footer
        )
        VALUES (
          ${BigInt(guildId)},
          ${String(topic.section)},
          ${topic.subcategory ? String(topic.subcategory) : 'General'},
          ${String(topic.topic_id || 'topic_' + Math.random().toString(36).substr(2, 9))},
          ${String(topic.name || topic.title)},
          ${topic.embed_title ? String(topic.embed_title) : null},
          ${topic.embed_description ? String(topic.embed_description) : null},
          ${topic.embed_color ? String(topic.embed_color) : '#5865F2'},
          ${topic.emoji ? String(topic.emoji) : '📄'},
          ${topic.category_emoji_id ? String(topic.category_emoji_id) : null},
          ${topic.image ? String(topic.image) : null},
          ${topic.thumbnail ? String(topic.thumbnail) : null},
          ${topic.footer ? String(topic.footer) : null}
        )
        RETURNING
          id,
          guild_id,
          section,
          subcategory,
          topic_id,
          name,
          embed_title,
          embed_description,
          embed_color,
          emoji,
          category_emoji_id,
          image,
          thumbnail,
          footer,
          views,
          created_at,
          updated_at
      `;

      return {
        id: created.id,
        guild_id: String(created.guild_id),
        section: created.section,
        subcategory: created.subcategory,
        topic_id: created.topic_id,
        name: created.name,
        embed_title: created.embed_title,
        embed_description: created.embed_description,
        embed_color: created.embed_color,
        emoji: created.emoji,
        category_emoji_id: created.category_emoji_id,
        image: created.image,
        thumbnail: created.thumbnail,
        footer: created.footer,
        views: created.views,
        created_at: created.created_at,
        updated_at: created.updated_at,
      };
    }

    case 'updateInfoTopic': {
      const id = String(params?.id || '');
      if (!id) throw new Error('Topic id is required');
      const updates = (params?.updates || {}) as Record<string, any>;

      const [updated] = await prisma.$queryRaw<Array<Record<string, unknown>>>`
        UPDATE info_topics
        SET
          section = ${updates.section ? String(updates.section) : undefined},
          subcategory = ${updates.subcategory ? String(updates.subcategory) : undefined},
          name = ${updates.name ? String(updates.name) : undefined},
          embed_title = ${updates.embed_title ? String(updates.embed_title) : undefined},
          embed_description = ${updates.embed_description ? String(updates.embed_description) : undefined},
          embed_color = ${updates.embed_color ? String(updates.embed_color) : undefined},
          emoji = ${updates.emoji ? String(updates.emoji) : undefined},
          image = ${updates.image ? String(updates.image) : undefined},
          thumbnail = ${updates.thumbnail ? String(updates.thumbnail) : undefined},
          footer = ${updates.footer ? String(updates.footer) : undefined},
          updated_at = NOW()
        WHERE id = ${Number(id)}
        RETURNING
          id,
          guild_id,
          section,
          subcategory,
          topic_id,
          name,
          embed_title,
          embed_description,
          embed_color,
          emoji,
          category_emoji_id,
          image,
          thumbnail,
          footer,
          views,
          created_at,
          updated_at
      `;

      return {
        id: updated.id,
        guild_id: String(updated.guild_id),
        section: updated.section,
        subcategory: updated.subcategory,
        topic_id: updated.topic_id,
        name: updated.name,
        embed_title: updated.embed_title,
        embed_description: updated.embed_description,
        embed_color: updated.embed_color,
        emoji: updated.emoji,
        category_emoji_id: updated.category_emoji_id,
        image: updated.image,
        thumbnail: updated.thumbnail,
        footer: updated.footer,
        views: updated.views,
        created_at: updated.created_at,
        updated_at: updated.updated_at,
      };
    }

    case 'deleteInfoTopic': {
      const id = String(params?.id || '');
      if (!id) throw new Error('Topic id is required');
      await prisma.$executeRaw`
        DELETE FROM info_topics
        WHERE id = ${Number(id)}
      `;
      return { success: true };
    }

    // Warn Data CRUD Operations
    case 'createWarn': {
      const guildId = getGuildId(params);
      const warn = (params?.warn || {}) as Record<string, any>;
      if (!warn.user_id || !warn.moderator_id) {
        throw new Error('User ID and moderator ID are required');
      }

      const created = await prisma.warnData.create({
        data: {
          guildId,
          userId: String(warn.user_id),
          moderatorId: String(warn.moderator_id),
          reason: warn.reason ? String(warn.reason) : null,
          severity: String(warn.severity || 'medium'),
        },
      });

      return {
        id: created.id,
        guild_id: created.guildId,
        user_id: created.userId,
        moderator_id: created.moderatorId,
        reason: created.reason,
        severity: created.severity,
        created_at: created.createdAt,
      };
    }

    case 'getWarns': {
      const guildId = getGuildId(params);
      const userId = params?.user_id ? String(params.user_id) : undefined;
      const severity = params?.severity ? String(params.severity) : undefined;

      const where: any = { guildId };
      if (userId) where.userId = userId;
      if (severity) where.severity = severity;

      const warns = await prisma.warnData.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      });

      return warns.map(warn => ({
        id: warn.id,
        guild_id: warn.guildId,
        user_id: warn.userId,
        moderator_id: warn.moderatorId,
        reason: warn.reason,
        severity: warn.severity,
        created_at: warn.createdAt,
      }));
    }

    // Blacklist Data CRUD Operations
    case 'createBlacklist': {
      const guildId = getGuildId(params);
      const blacklist = (params?.blacklist || {}) as Record<string, any>;
      if (!blacklist.user_id) {
        throw new Error('User ID is required');
      }

      const created = await prisma.blacklistData.create({
        data: {
          guildId,
          userId: String(blacklist.user_id),
          reason: blacklist.reason ? String(blacklist.reason) : null,
          createdBy: blacklist.created_by ? String(blacklist.created_by) : 'dashboard_admin',
        },
      });

      return {
        id: created.id,
        guild_id: created.guildId,
        user_id: created.userId,
        reason: created.reason,
        created_by: created.createdBy,
        created_at: created.createdAt,
      };
    }

    case 'getBlacklist': {
      const guildId = getGuildId(params);
      const blacklist = await prisma.blacklistData.findMany({
        where: { guildId },
        orderBy: { createdAt: 'desc' },
      });

      return blacklist.map(item => ({
        id: item.id,
        guild_id: item.guildId,
        user_id: item.userId,
        reason: item.reason,
        created_by: item.createdBy,
        created_at: item.createdAt,
      }));
    }

    case 'deleteBlacklist': {
      const id = String(params?.id || '');
      if (!id) throw new Error('Blacklist id is required');
      await prisma.blacklistData.delete({ where: { id } });
      return { success: true };
    }

    // Scanner Data CRUD Operations
    case 'createScan': {
      const guildId = getGuildId(params);
      const scan = (params?.scan || {}) as Record<string, any>;
      if (!scan.user_id || !scan.detected_type) {
        throw new Error('User ID and detected type are required');
      }

      const created = await prisma.scannerData.create({
        data: {
          guildId,
          userId: String(scan.user_id),
          messageContent: scan.message_content ? String(scan.message_content) : null,
          detectedType: String(scan.detected_type),
          severity: String(scan.severity || 'medium'),
        },
      });

      return {
        id: created.id,
        guild_id: created.guildId,
        user_id: created.userId,
        message_content: created.messageContent,
        detected_type: created.detectedType,
        severity: created.severity,
        created_at: created.createdAt,
      };
    }

    case 'getScans': {
      const guildId = getGuildId(params);
      const userId = params?.user_id ? String(params.user_id) : undefined;
      const severity = params?.severity ? String(params.severity) : undefined;
      const detectedType = params?.detected_type ? String(params.detected_type) : undefined;

      const where: any = { guildId };
      if (userId) where.userId = userId;
      if (severity) where.severity = severity;
      if (detectedType) where.detectedType = detectedType;

      const scans = await prisma.scannerData.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      });

      return scans.map(scan => ({
        id: scan.id,
        guild_id: scan.guildId,
        user_id: scan.userId,
        message_content: scan.messageContent,
        detected_type: scan.detectedType,
        severity: scan.severity,
        created_at: scan.createdAt,
      }));
    }

    // Vote Cast CRUD Operations
    case 'castVote': {
      const guildId = getGuildId(params);
      const voteCast = (params?.vote_cast || {}) as Record<string, any>;
      if (!voteCast.vote_id || !voteCast.user_id || voteCast.option_index === undefined) {
        throw new Error('Vote ID, user ID, and option index are required');
      }

      // Check if user already voted
      const existingVote = await prisma.voteCast.findUnique({
        where: {
          voteId_userId: {
            voteId: String(voteCast.vote_id),
            userId: String(voteCast.user_id),
          },
        },
      });

      if (existingVote) {
        throw new Error('User has already voted on this poll');
      }

      const created = await prisma.voteCast.create({
        data: {
          guildId,
          voteId: String(voteCast.vote_id),
          userId: String(voteCast.user_id),
          optionIndex: Number(voteCast.option_index),
        },
      });

      // Update vote total
      await prisma.vote.update({
        where: { id: String(voteCast.vote_id) },
        data: {
          totalVotes: {
            increment: 1,
          },
        },
      });

      return {
        id: created.id,
        guild_id: created.guildId,
        vote_id: created.voteId,
        user_id: created.userId,
        option_index: created.optionIndex,
        created_at: created.createdAt,
      };
    }

    case 'getVoteResults': {
      const guildId = getGuildId(params);
      const voteId = params?.vote_id ? String(params.vote_id) : '';
      if (!voteId) throw new Error('Vote ID is required');

      const vote = await prisma.vote.findUnique({
        where: { id: voteId, guildId },
        include: {
          votesCast: {
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      if (!vote) throw new Error('Vote not found');

      // Count votes for each option
      const optionsArray = Array.isArray(vote.options) ? vote.options : [];
      const optionCounts = new Map<number, number>();
      optionsArray.forEach((_, index) => optionCounts.set(index, 0));
      
      vote.votesCast.forEach(voteCast => {
        const count = optionCounts.get(voteCast.optionIndex) || 0;
        optionCounts.set(voteCast.optionIndex, count + 1);
      });

      return {
        id: vote.id,
        guild_id: vote.guildId,
        question: vote.question,
        description: vote.description,
        options: optionsArray,
        total_votes: vote.totalVotes,
        results: Array.from(optionCounts.entries()).map(([optionIndex, count]) => ({
          option_index: optionIndex,
          option_text: optionsArray[optionIndex] || '',
          vote_count: count,
          percentage: vote.totalVotes > 0 ? Math.round((count / vote.totalVotes) * 100) : 0,
        })),
        created_at: vote.createdAt,
      };
    }

    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

app.get('/api/health', async (_req, res) => {
  try {
    await ensureBootstrapped();
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ ok: false, error: error?.message || 'Healthcheck failed' });
  }
});

app.post('/api/neon-query', async (req, res) => {
  try {
    await ensureBootstrapped();
    const body = (req.body || {}) as ActionRequest;
    if (!body.action) {
      res.status(400).json({ error: 'action is required' });
      return;
    }
    const data = await handleAction(body.action, body.params || {});
    res.json({ data });
  } catch (error: any) {
    const message = error?.message || 'Internal server error';
    if (message.includes('Unknown action')) {
      res.status(400).json({ error: message });
      return;
    }
    console.error('Backend error:', error);
    res.status(500).json({ error: message });
  }
});

async function start() {
  try {
    await ensureBootstrapped();
    app.listen(port, () => {
      console.log(`Dashboard backend listening on http://localhost:${port}`);
    });
  } catch (error) {
    console.error('Failed to start backend:', error);
    process.exit(1);
  }
}

void start();
