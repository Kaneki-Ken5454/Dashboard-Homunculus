# Discord Bot Implementation Guide

This guide provides all the necessary code and instructions to implement the dashboard features into your Discord bot.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Database Setup](#database-setup)
3. [Bot Structure](#bot-structure)
4. [Core Features Implementation](#core-features-implementation)
5. [Event Handlers](#event-handlers)
6. [Commands](#commands)
7. [Integration with Dashboard](#integration-with-dashboard)

## Prerequisites

- Node.js 18+
- Discord.js v14+
- Prisma ORM
- PostgreSQL database
- Discord bot token
- Server URL for dashboard communication

## Database Setup

### Prisma Schema

Create `prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model GuildSettings {
  id                    String   @id @default(cuid())
  guildId              BigInt   @unique
  prefix               String   @default("!")
  useSlashCommands     Boolean  @default(true)
  moderationEnabled    Boolean  @default(true)
  levellingEnabled     Boolean  @default(true)
  funEnabled          Boolean  @default(true)
  ticketsEnabled      Boolean  @default(true)
  customCommandsEnabled Boolean @default(true)
  autoRespondersEnabled Boolean @default(true)
  globalCooldown       Int      @default(3000)
  commandCooldown      Json?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  guildMembers     GuildMember[]
  customCommands   CustomCommand[]
  reactionRoles    ReactionRole[]
  ticketPanels     TicketPanel[]
  tickets          Ticket[]
  auditLogs        AuditLog[]
}

model GuildMember {
  id              String   @id @default(cuid())
  guildId         BigInt
  userId          String
  username        String
  discriminator   String
  avatarUrl       String?
  joinedAt        DateTime
  lastActive      DateTime
  messageCount    Int      @default(0)
  voteCount       Int      @default(0)
  roleIds         String[]
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@unique([guildId, userId])
}

model CustomCommand {
  id              String   @id @default(cuid())
  guildId         BigInt
  name            String
  trigger         String
  description     String?
  response        String
  permissionLevel String   @default("everyone")
  isEnabled       Boolean  @default(true)
  cooldownSeconds Int      @default(0)
  usageCount      Int      @default(0)
  createdBy       String
  responseType    String   @default("text")
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([guildId])
}

model ReactionRole {
  id         String   @id @default(cuid())
  guildId    BigInt
  messageId  String
  channelId  String
  emoji      String
  roleId     String
  roleName   String
  createdBy  String
  isReaction Boolean  @default(true)
  createdAt  DateTime @default(now())

  @@index([guildId])
}

model TicketPanel {
  id           String   @id @default(cuid())
  guildId      BigInt
  name         String
  channelId    String
  categoryId   String?
  message      String?
  title        String
  description  String
  buttonLabel  String
  buttonColor  String   @default("primary")
  supportRoles String[]
  createdBy    String
  isEnabled    Boolean  @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  tickets Ticket[]
  @@index([guildId])
}

model Ticket {
  id         String   @id @default(cuid())
  guildId    BigInt
  userId     String
  username   String?
  title      String?
  status     String   @default("open")
  priority   String   @default("medium")
  category   String
  assignedTo String?
  messagesCount Int   @default(0)
  openedAt   DateTime @default(now())
  claimedAt  DateTime?
  closedAt   DateTime?

  panel TicketPanel? @relation(fields: [panelId], references: [id])
  panelId String?

  @@index([guildId])
}

model AuditLog {
  id        String   @id @default(cuid())
  guildId   BigInt
  actionType String
  userId    String?
  moderatorId String?
  reason    String?
  createdAt DateTime @default(now())

  @@index([guildId])
}

model MessageTemplate {
  id         String   @id @default(cuid())
  guildId    BigInt
  name       String
  content    String
  embedData  Json?
  createdBy  String
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@index([guildId])
}

model Trigger {
  id           String   @id @default(cuid())
  guildId      BigInt
  triggerText  String
  response     String
  matchType    String   @default("contains")
  isEnabled    Boolean  @default(true)
  triggerCount Int      @default(0)
  createdBy    String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@index([guildId])
}

model Vote {
  id          String   @id @default(cuid())
  guildId     BigInt
  question    String
  description String?
  options     String[]
  createdBy   String
  channelId   String
  messageId   String?
  startTime   DateTime
  endTime     DateTime
  isActive    Boolean  @default(true)
  totalVotes  Int      @default(0)
  createdAt   DateTime @default(now())

  votesCast VoteCast[]
  @@index([guildId])
}

model VoteCast {
  id         String   @id @default(cuid())
  guildId    BigInt
  voteId     String
  userId     String
  optionIndex Int
  createdAt  DateTime @default(now())

  vote Vote @relation(fields: [voteId], references: [id])
  @@unique([voteId, userId])
  @@index([guildId])
}

model WarnData {
  id           String   @id @default(cuid())
  guildId      BigInt
  userId       String
  moderatorId  String
  reason       String?
  severity     String   @default("medium")
  createdAt    DateTime @default(now())

  @@index([guildId])
}

model BlacklistData {
  id        String   @id @default(cuid())
  guildId   BigInt
  userId    String
  reason    String?
  createdBy String
  createdAt DateTime @default(now())

  @@index([guildId])
}

model ScannerData {
  id            String   @id @default(cuid())
  guildId       BigInt
  userId        String
  messageContent String?
  detectedType  String
  severity      String   @default("medium")
  createdAt     DateTime @default(now())

  @@index([guildId])
}

model InfoTopic {
  id               String   @id @default(cuid())
  guildId          BigInt
  section          String
  subcategory      String   @default("General")
  topicId          String
  name             String
  embedTitle       String?
  embedDescription String?
  embedColor       String   @default("#5865F2")
  emoji            String   @default("📄")
  categoryEmojiId  String?
  image            String?
  thumbnail        String?
  footer           String?
  views           Int      @default(0)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([guildId])
}
```

## Bot Structure

### Main Bot File

Create `bot/index.js`:

```javascript
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { PrismaClient } = require('@prisma/client');
const { REST, Routes } = require('discord.js');
const path = require('path');
const fs = require('fs');

// Environment variables
require('dotenv').config();

// Initialize clients
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Message, Partials.Reaction, Partials.User]
});

const prisma = new PrismaClient();

// Global variables
let dashboardUrl = process.env.DASHBOARD_URL || 'http://localhost:5000';

// Load event handlers
const eventFiles = fs.readdirSync('./events').filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
  const event = require(`./events/${file}`);
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args, client, prisma));
  } else {
    client.on(event.name, (...args) => event.execute(...args, client, prisma, dashboardUrl));
  }
}

// Load commands
client.commands = new Map();
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  client.commands.set(command.data.name, command);
}

// Register slash commands
const commands = [];
for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  commands.push(command.data.toJSON());
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('Started refreshing application (/) commands.');

    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands },
    );

    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
})();

// Login
client.login(process.env.DISCORD_TOKEN);

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});
```

## Core Features Implementation

### Event Handlers

Create `events/ready.js`:

```javascript
module.exports = {
  name: 'ready',
  once: true,
  async execute(client, prisma) {
    console.log(`Logged in as ${client.user.tag}!`);
    
    // Initialize guild settings if not exists
    const guild = client.guilds.cache.get(process.env.GUILD_ID);
    if (guild) {
      await prisma.guildSettings.upsert({
        where: { guildId: BigInt(guild.id) },
        update: {},
        create: {
          guildId: BigInt(guild.id),
          prefix: '!',
          useSlashCommands: true,
          moderationEnabled: true,
          levellingEnabled: true,
          funEnabled: true,
          ticketsEnabled: true,
          customCommandsEnabled: true,
          autoRespondersEnabled: true,
        }
      });
    }
  }
};
```

Create `events/messageCreate.js`:

```javascript
const fetch = require('node-fetch');

module.exports = {
  name: 'messageCreate',
  async execute(message, client, prisma, dashboardUrl) {
    if (message.author.bot) return;

    const guildId = message.guild?.id;
    if (!guildId) return;

    // Update member activity
    await prisma.guildMember.upsert({
      where: { guildId_userId: { guildId: BigInt(guildId), userId: message.author.id } },
      update: {
        lastActive: new Date(),
        messageCount: { increment: 1 }
      },
      create: {
        guildId: BigInt(guildId),
        userId: message.author.id,
        username: message.author.username,
        discriminator: message.author.discriminator,
        avatarUrl: message.author.displayAvatarURL(),
        joinedAt: message.author.joinedAt || new Date(),
        lastActive: new Date(),
        messageCount: 1
      }
    });

    // Check custom commands
    const customCommand = await prisma.customCommand.findFirst({
      where: {
        guildId: BigInt(guildId),
        trigger: message.content.toLowerCase(),
        isEnabled: true
      }
    });

    if (customCommand) {
      await message.reply(customCommand.response);
      
      // Update usage count
      await prisma.customCommand.update({
        where: { id: customCommand.id },
        data: { usageCount: { increment: 1 } }
      });
      return;
    }

    // Check triggers
    const triggers = await prisma.trigger.findMany({
      where: {
        guildId: BigInt(guildId),
        isEnabled: true
      }
    });

    for (const trigger of triggers) {
      let shouldRespond = false;
      
      if (trigger.matchType === 'exact') {
        shouldRespond = message.content.toLowerCase() === trigger.triggerText.toLowerCase();
      } else if (trigger.matchType === 'contains') {
        shouldRespond = message.content.toLowerCase().includes(trigger.triggerText.toLowerCase());
      } else if (trigger.matchType === 'startsWith') {
        shouldRespond = message.content.toLowerCase().startsWith(trigger.triggerText.toLowerCase());
      }

      if (shouldRespond) {
        await message.reply(trigger.response);
        await prisma.trigger.update({
          where: { id: trigger.id },
          data: { triggerCount: { increment: 1 } }
        });
        break;
      }
    }

    // Check for ticket panel interactions
    if (message.content.toLowerCase().includes('ticket')) {
      const panels = await prisma.ticketPanel.findMany({
        where: { guildId: BigInt(guildId), isEnabled: true }
      });
      
      if (panels.length > 0) {
        const embed = {
          title: 'Ticket Support',
          description: 'Click the button below to open a support ticket',
          color: 0x0099ff
        };
        
        await message.reply({ embeds: [embed], components: [] }); // Add button components
      }
    }
  }
};
```

### Commands

Create `commands/ticket.js`:

```javascript
const { SlashCommandBuilder } = require('discord.js');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Manage support tickets')
    .addSubcommand(subcommand =>
      subcommand
        .setName('create')
        .setDescription('Create a new ticket')
        .addStringOption(option =>
          option.setName('title')
            .setDescription('Title of the ticket')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('claim')
        .setDescription('Claim a ticket')
        .addStringOption(option =>
          option.setName('ticket-id')
            .setDescription('ID of the ticket to claim')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('close')
        .setDescription('Close a ticket')
        .addStringOption(option =>
          option.setName('ticket-id')
            .setDescription('ID of the ticket to close')
            .setRequired(true))),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    if (subcommand === 'create') {
      const title = interaction.options.getString('title');
      
      const ticket = await prisma.ticket.create({
        data: {
          guildId: BigInt(guildId),
          userId: interaction.user.id,
          username: interaction.user.username,
          title: title,
          status: 'open',
          category: 'general'
        }
      });

      await interaction.reply(`Ticket created! ID: ${ticket.id}`);
    }

    if (subcommand === 'claim') {
      const ticketId = interaction.options.getString('ticket-id');
      
      await prisma.ticket.update({
        where: { id: ticketId },
        data: {
          assignedTo: interaction.user.id,
          status: 'in_progress',
          claimedAt: new Date()
        }
      });

      await interaction.reply(`Ticket ${ticketId} claimed!`);
    }

    if (subcommand === 'close') {
      const ticketId = interaction.options.getString('ticket-id');
      
      await prisma.ticket.update({
        where: { id: ticketId },
        data: {
          status: 'resolved',
          closedAt: new Date()
        }
      });

      await interaction.reply(`Ticket ${ticketId} closed!`);
    }
  }
};
```

Create `commands/customcommand.js`:

```javascript
const { SlashCommandBuilder } = require('discord.js');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('customcommand')
    .setDescription('Manage custom commands')
    .addSubcommand(subcommand =>
      subcommand
        .setName('create')
        .setDescription('Create a custom command')
        .addStringOption(option =>
          option.setName('name')
            .setDescription('Name of the command')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('response')
            .setDescription('Response of the command')
            .setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('delete')
        .setDescription('Delete a custom command')
        .addStringOption(option =>
          option.setName('name')
            .setDescription('Name of the command to delete')
            .setRequired(true))),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    if (subcommand === 'create') {
      const name = interaction.options.getString('name');
      const response = interaction.options.getString('response');
      
      await prisma.customCommand.create({
        data: {
          guildId: BigInt(guildId),
          name: name,
          trigger: name,
          response: response,
          createdBy: interaction.user.id
        }
      });

      await interaction.reply(`Custom command "${name}" created!`);
    }

    if (subcommand === 'delete') {
      const name = interaction.options.getString('name');
      
      const result = await prisma.customCommand.deleteMany({
        where: {
          guildId: BigInt(guildId),
          name: name
        }
      });

      if (result.count > 0) {
        await interaction.reply(`Custom command "${name}" deleted!`);
      } else {
        await interaction.reply(`Custom command "${name}" not found!`);
      }
    }
  }
};
```

Create `commands/reactionrole.js`:

```javascript
const { SlashCommandBuilder } = require('discord.js');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reactionrole')
    .setDescription('Manage reaction roles')
    .addSubcommand(subcommand =>
      subcommand
        .setName('create')
        .setDescription('Create a reaction role')
        .addStringOption(option =>
          option.setName('message-id')
            .setDescription('ID of the message')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('channel-id')
            .setDescription('ID of the channel')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('emoji')
            .setDescription('Emoji for the reaction')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('role-id')
            .setDescription('ID of the role to give')
            .setRequired(true))),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    if (subcommand === 'create') {
      const messageId = interaction.options.getString('message-id');
      const channelId = interaction.options.getString('channel-id');
      const emoji = interaction.options.getString('emoji');
      const roleId = interaction.options.getString('role-id');
      
      await prisma.reactionRole.create({
        data: {
          guildId: BigInt(guildId),
          messageId: messageId,
          channelId: channelId,
          emoji: emoji,
          roleId: roleId,
          createdBy: interaction.user.id
        }
      });

      await interaction.reply('Reaction role created!');
    }
  }
};
```

## Event Handlers for Reactions

Create `events/messageReactionAdd.js`:

```javascript
module.exports = {
  name: 'messageReactionAdd',
  async execute(reaction, user, client, prisma) {
    if (user.bot) return;

    const guildId = reaction.message.guild?.id;
    if (!guildId) return;

    const reactionRole = await prisma.reactionRole.findFirst({
      where: {
        guildId: BigInt(guildId),
        messageId: reaction.message.id,
        emoji: reaction.emoji.name
      }
    });

    if (reactionRole) {
      const guild = client.guilds.cache.get(guildId);
      const member = guild.members.cache.get(user.id);
      const role = guild.roles.cache.get(reactionRole.roleId);

      if (member && role) {
        await member.roles.add(role);
      }
    }
  }
};
```

Create `events/messageReactionRemove.js`:

```javascript
module.exports = {
  name: 'messageReactionRemove',
  async execute(reaction, user, client, prisma) {
    if (user.bot) return;

    const guildId = reaction.message.guild?.id;
    if (!guildId) return;

    const reactionRole = await prisma.reactionRole.findFirst({
      where: {
        guildId: BigInt(guildId),
        messageId: reaction.message.id,
        emoji: reaction.emoji.name
      }
    });

    if (reactionRole) {
      const guild = client.guilds.cache.get(guildId);
      const member = guild.members.cache.get(user.id);
      const role = guild.roles.cache.get(reactionRole.roleId);

      if (member && role) {
        await member.roles.remove(role);
      }
    }
  }
};
```

## Integration with Dashboard

### API Communication

Create `utils/dashboard.js`:

```javascript
const fetch = require('node-fetch');

class DashboardAPI {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
  }

  async sendAction(action, params = {}) {
    try {
      const response = await fetch(`${this.baseUrl}/api/neon-query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action, params })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Dashboard API error:', error);
      throw error;
    }
  }

  async getGuildStats(guildId) {
    return await this.sendAction('getGuildStats', { guildId });
  }

  async getTopMembers(guildId, limit = 10) {
    return await this.sendAction('getTopMembers', { guildId, limit });
  }

  async getActiveVotes(guildId) {
    return await this.sendAction('getActiveVotes', { guildId });
  }

  async getEmbeds(guildId) {
    return await this.sendAction('getEmbeds', { guildId });
  }

  async createEmbed(guildId, embed) {
    return await this.sendAction('createEmbed', { guildId, embed });
  }

  async getTriggers(guildId) {
    return await this.sendAction('getTriggers', { guildId });
  }

  async createTrigger(guildId, trigger) {
    return await this.sendAction('createTrigger', { guildId, trigger });
  }

  async getTickets(guildId) {
    return await this.sendAction('getTickets', { guildId });
  }

  async claimTicket(ticketId, userId) {
    return await this.sendAction('claimTicket', { id: ticketId, userId });
  }

  async closeTicket(ticketId) {
    return await this.sendAction('closeTicket', { id: ticketId });
  }

  async getAuditLogs(guildId, limit = 50) {
    return await this.sendAction('getAuditLogs', { guildId, limit });
  }

  async getBotSettings(guildId) {
    return await this.sendAction('getBotSettings', { guildId });
  }

  async updateBotSettings(guildId, settings) {
    return await this.sendAction('updateBotSettings', { guildId, settings });
  }

  async getReactionRoles(guildId) {
    return await this.sendAction('getReactionRoles', { guildId });
  }

  async createReactionRole(guildId, role) {
    return await this.sendAction('createReactionRole', { guildId, role });
  }

  async getCustomCommands(guildId) {
    return await this.sendAction('getCustomCommands', { guildId });
  }

  async createCustomCommand(guildId, command) {
    return await this.sendAction('createCustomCommand', { guildId, command });
  }

  async getTicketPanels(guildId) {
    return await this.sendAction('getTicketPanels', { guildId });
  }

  async createTicketPanel(guildId, panel) {
    return await this.sendAction('createTicketPanel', { guildId, panel });
  }

  async sendEmbedToChannel(guildId, embed, channelId) {
    return await this.sendAction('sendEmbedToChannel', { guildId, embed, channel_id: channelId });
  }
}

module.exports = DashboardAPI;
```

### Usage in Bot

Update your main bot file to include the dashboard API:

```javascript
// Add to the top of bot/index.js
const DashboardAPI = require('./utils/dashboard');

// In the ready event, initialize dashboard API
const dashboardAPI = new DashboardAPI(dashboardUrl);

// Make it available globally
client.dashboardAPI = dashboardAPI;
```

## Environment Variables

Create `.env` file:

```env
DISCORD_TOKEN=your_discord_bot_token_here
CLIENT_ID=your_discord_client_id_here
GUILD_ID=your_discord_guild_id_here
DATABASE_URL="postgresql://username:password@localhost:5432/your_database_name"
DASHBOARD_URL=http://localhost:5000
```

## Installation and Setup

1. **Install dependencies:**
   ```bash
   npm install discord.js @prisma/client prisma node-fetch dotenv
   ```

2. **Initialize Prisma:**
   ```bash
   npx prisma generate
   npx prisma migrate dev --name init
   ```

3. **Start the bot:**
   ```bash
   node bot/index.js
   ```

4. **Start the dashboard:**
   ```bash
   npm run dev  # Frontend
   node server/index.ts  # Backend
   ```

## Additional Features

### Moderation Commands

Create `commands/moderate.js`:

```javascript
const { SlashCommandBuilder } = require('discord.js');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

module.exports = {
  data: new SlashCommandBuilder()
    .setName('moderate')
    .setDescription('Moderation commands')
    .addSubcommand(subcommand =>
      subcommand
        .setName('warn')
        .setDescription('Warn a user')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('User to warn')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('reason')
            .setDescription('Reason for warning')
            .setRequired(false)))
    .addSubcommand(subcommand =>
      subcommand
        .setName('kick')
        .setDescription('Kick a user')
        .addUserOption(option =>
          option.setName('user')
            .setDescription('User to kick')
            .setRequired(true))
        .addStringOption(option =>
          option.setName('reason')
            .setDescription('Reason for kicking')
            .setRequired(false))),

  async execute(interaction) {
    if (!interaction.member.permissions.has('KICK_MEMBERS')) {
      return interaction.reply('You do not have permission to use this command.');
    }

    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    const targetUser = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    if (subcommand === 'warn') {
      await prisma.warnData.create({
        data: {
          guildId: BigInt(guildId),
          userId: targetUser.id,
          moderatorId: interaction.user.id,
          reason: reason,
          severity: 'medium'
        }
      });

      await interaction.reply(`Warned ${targetUser.tag} for: ${reason}`);
    }

    if (subcommand === 'kick') {
      try {
        await interaction.guild.members.kick(targetUser, reason);
        await interaction.reply(`Kicked ${targetUser.tag} for: ${reason}`);
      } catch (error) {
        await interaction.reply('Failed to kick user. Check my permissions.');
      }
    }
  }
};
```

### Leveling System

Create `events/messageCreateLeveling.js`:

```javascript
module.exports = {
  name: 'messageCreate',
  async execute(message, client, prisma) {
    if (message.author.bot) return;
    if (!message.guild) return;

    const guildId = message.guild.id;
    const userId = message.author.id;

    // Get or create user profile
    let userProfile = await prisma.guildMember.findUnique({
      where: { guildId_userId: { guildId: BigInt(guildId), userId: userId } }
    });

    if (!userProfile) {
      userProfile = await prisma.guildMember.create({
        data: {
          guildId: BigInt(guildId),
          userId: userId,
          username: message.author.username,
          discriminator: message.author.discriminator,
          avatarUrl: message.author.displayAvatarURL(),
          joinedAt: message.author.joinedAt || new Date(),
          lastActive: new Date(),
          messageCount: 1
        }
      });
    }

    // Update message count and last active
    await prisma.guildMember.update({
      where: { id: userProfile.id },
      data: {
        lastActive: new Date(),
        messageCount: { increment: 1 }
      }
    });

    // Level up logic (every 100 messages = 1 level)
    const newLevel = Math.floor(userProfile.messageCount / 100);
    const currentLevel = Math.floor((userProfile.messageCount - 1) / 100);

    if (newLevel > currentLevel) {
      // Level up!
      const guild = client.guilds.cache.get(guildId);
      const member = guild.members.cache.get(userId);
      
      if (member) {
        await message.channel.send(`${member} leveled up to level ${newLevel + 1}! 🎉`);
      }
    }
  }
};
```

This implementation guide provides a complete foundation for integrating all the dashboard features into your Discord bot. The bot will handle all the core functionality while communicating with your dashboard backend for data management and configuration.