/**
 * Prisma CRUD Operations Test
 * Tests basic CRUD operations on key tables
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const TEST_GUILD_ID = '999999999999999999';

describe('Prisma CRUD Operations', () => {
  beforeEach(async () => {
    // Clean up test data before each test
    await prisma.ticket.deleteMany({
      where: { guildId: TEST_GUILD_ID },
    });
    await prisma.ticketPanel.deleteMany({
      where: { guildId: TEST_GUILD_ID },
    });
    await prisma.customCommand.deleteMany({
      where: { guildId: TEST_GUILD_ID },
    });
    await prisma.guildSettings.deleteMany({
      where: { guildId: TEST_GUILD_ID },
    });
  });

  describe('GuildSettings', () => {
    it('should create guild settings', async () => {
      const settings = await prisma.guildSettings.create({
        data: {
          guildId: TEST_GUILD_ID,
          prefix: '!',
          useSlashCommands: true,
          moderationEnabled: true,
          levellingEnabled: true,
        },
      });

      expect(settings.guildId).toBe(TEST_GUILD_ID);
      expect(settings.prefix).toBe('!');
      expect(settings.useSlashCommands).toBe(true);
    });

    it('should read guild settings', async () => {
      await prisma.guildSettings.create({
        data: { guildId: TEST_GUILD_ID, prefix: '!' },
      });

      const settings = await prisma.guildSettings.findUnique({
        where: { guildId: TEST_GUILD_ID },
      });

      expect(settings).toBeDefined();
      expect(settings?.prefix).toBe('!');
    });

    it('should update guild settings', async () => {
      await prisma.guildSettings.create({
        data: { guildId: TEST_GUILD_ID, prefix: '!' },
      });

      const updated = await prisma.guildSettings.update({
        where: { guildId: TEST_GUILD_ID },
        data: { prefix: '?' },
      });

      expect(updated.prefix).toBe('?');
    });

    it('should enforce unique guild ID', async () => {
      await prisma.guildSettings.create({
        data: { guildId: TEST_GUILD_ID, prefix: '!' },
      });

      await expect(
        prisma.guildSettings.create({
          data: { guildId: TEST_GUILD_ID, prefix: '?' },
        })
      ).rejects.toThrow();
    });
  });

  describe('CustomCommands', () => {
    it('should create custom command', async () => {
      const command = await prisma.customCommand.create({
        data: {
          guildId: TEST_GUILD_ID,
          trigger: 'test',
          response: 'Hello {user}!',
          createdBy: '123456789',
        },
      });

      expect(command.trigger).toBe('test');
      expect(command.response).toContain('{user}');
      expect(command.usageCount).toBe(0);
    });

    it('should enforce unique trigger per guild', async () => {
      await prisma.customCommand.create({
        data: {
          guildId: TEST_GUILD_ID,
          trigger: 'test',
          response: 'First',
          createdBy: '123456789',
        },
      });

      await expect(
        prisma.customCommand.create({
          data: {
            guildId: TEST_GUILD_ID,
            trigger: 'test', // Duplicate
            response: 'Second',
            createdBy: '123456789',
          },
        })
      ).rejects.toThrow();
    });

    it('should allow same trigger in different guilds', async () => {
      const OTHER_GUILD_ID = '888888888888888888';

      await prisma.customCommand.create({
        data: {
          guildId: TEST_GUILD_ID,
          trigger: 'test',
          response: 'First',
          createdBy: '123456789',
        },
      });

      const command2 = await prisma.customCommand.create({
        data: {
          guildId: OTHER_GUILD_ID,
          trigger: 'test', // Same trigger, different guild
          response: 'Second',
          createdBy: '123456789',
        },
      });

      expect(command2.guildId).toBe(OTHER_GUILD_ID);

      // Cleanup
      await prisma.customCommand.deleteMany({
        where: { guildId: OTHER_GUILD_ID },
      });
    });
  });

  describe('Tickets', () => {
    it('should create ticket with panel relation', async () => {
      const panel = await prisma.ticketPanel.create({
        data: {
          guildId: TEST_GUILD_ID,
          name: 'Support',
          title: 'Support Ticket',
          description: 'Get help here',
          buttonLabel: 'Create Ticket',
          supportRoles: ['role1', 'role2'],
          createdBy: '123456789',
        },
      });

      const ticket = await prisma.ticket.create({
        data: {
          guildId: TEST_GUILD_ID,
          panelId: panel.id,
          channelId: 'channel123',
          userId: 'user123',
          status: 'open',
        },
      });

      expect(ticket.panelId).toBe(panel.id);
      expect(ticket.status).toBe('open');
      expect(ticket.userId).toBe('user123');
    });

    it('should load ticket with panel', async () => {
      const panel = await prisma.ticketPanel.create({
        data: {
          guildId: TEST_GUILD_ID,
          name: 'Support',
          title: 'Support',
          description: 'Test',
          buttonLabel: 'Create',
          supportRoles: [],
          createdBy: '123',
        },
      });

      const ticket = await prisma.ticket.create({
        data: {
          guildId: TEST_GUILD_ID,
          panelId: panel.id,
          channelId: 'channel1',
          userId: 'user1',
        },
      });

      const ticketWithPanel = await prisma.ticket.findUnique({
        where: { id: ticket.id },
        include: { panel: true },
      });

      expect(ticketWithPanel?.panel).toBeDefined();
      expect(ticketWithPanel?.panel.name).toBe('Support');
    });
  });

  afterEach(async () => {
    // Clean up after each test
    await prisma.ticket.deleteMany({
      where: { guildId: TEST_GUILD_ID },
    });
    await prisma.ticketPanel.deleteMany({
      where: { guildId: TEST_GUILD_ID },
    });
    await prisma.customCommand.deleteMany({
      where: { guildId: TEST_GUILD_ID },
    });
    await prisma.guildSettings.deleteMany({
      where: { guildId: TEST_GUILD_ID },
    });
  });
});
