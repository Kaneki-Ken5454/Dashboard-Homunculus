# Aeon Discord Bot Integration Guide

This document outlines all features, endpoints, and integrations that need to be implemented in the Discord bot to fully utilize the Aeon Dashboard.

## Table of Contents
1. [Core Bot Requirements](#core-bot-requirements)
2. [Module 1: Configuration & Permissions](#module-1-configuration--permissions)
3. [Module 2: Visual Interaction Builder](#module-2-visual-interaction-builder)
4. [Module 3: Custom Commands & Auto-Responders](#module-3-custom-commands--auto-responders)
5. [Module 4: Ticket System](#module-4-ticket-system)
6. [Module 5: Audit Logging](#module-5-audit-logging)
7. [API Endpoints Required](#api-endpoints-required)
8. [WebSocket Events](#websocket-events)
9. [Database Operations](#database-operations)

---

## Core Bot Requirements

### Framework Choice
- **Recommended**: Discord.js v14+ or Sapphire Framework
- Must support Discord API v10 (Message Components, Slash Commands, Buttons, Select Menus)

### Database Connection
- Connect to NeonDB PostgreSQL using Prisma Client
- Use connection string: `postgresql://neondb_owner:npg_dJjb8k0EAUGf@ep-floral-resonance-a1spd9bz-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require`
- Initialize Prisma Client on bot startup

### Required Bot Intents
```javascript
const intents = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMembers,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.GuildMessageReactions,
  GatewayIntentBits.MessageContent,
  GatewayIntentBits.GuildModeration, // For audit logs
];
```

### Environment Variables
```env
DISCORD_BOT_TOKEN=your_bot_token
DATABASE_URL=postgresql://neondb_owner:npg_dJjb8k0EAUGf@ep-floral-resonance-a1spd9bz-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
DASHBOARD_API_URL=http://localhost:3000/api
WEBSOCKET_PORT=3001
```

---

## Module 1: Configuration & Permissions

### Features to Implement

#### 1.1 Prefix/Slash Command Toggle
- **Database Table**: `GuildSettings`
- **Bot Behavior**:
  - On guild join, create default `GuildSettings` record
  - Check `useSlashCommands` flag before processing commands
  - If `useSlashCommands = false`, listen for prefix commands
  - If `useSlashCommands = true`, register slash commands for that guild
  - Support hybrid mode (both prefix and slash)

**Implementation Example**:
```javascript
// Pseudo-code
async function handleCommand(message, interaction) {
  const settings = await prisma.guildSettings.findUnique({
    where: { guildId: message.guild.id }
  });
  
  if (interaction) {
    // Slash command
    if (!settings.useSlashCommands) return;
  } else {
    // Prefix command
    if (settings.useSlashCommands && !settings.allowPrefixFallback) return;
    if (!message.content.startsWith(settings.prefix)) return;
  }
  
  // Process command...
}
```

#### 1.2 Module Toggles
- **Database Fields**: `moderationEnabled`, `levellingEnabled`, `funEnabled`, `ticketsEnabled`, `customCommandsEnabled`, `autoRespondersEnabled`
- **Bot Behavior**:
  - Before executing any command, check if its module is enabled
  - If disabled, send a message: "This module is currently disabled. Enable it in the dashboard."

**Command Module Mapping**:
- Moderation: `ban`, `kick`, `mute`, `warn`, `timeout`, `purge`
- Levelling: `level`, `leaderboard`, `rank`, `xp`
- Fun: `8ball`, `meme`, `joke`, `poll`
- Tickets: All ticket-related commands
- Custom Commands: Dynamic command execution
- Auto-Responders: Trigger matching

#### 1.3 Permission Hierarchy
- **Database Table**: `RolePermission`
- **Bot Behavior**:
  - On command execution, check user's roles against `RolePermission` table
  - Verify user has required `commandGroup` permission
  - Implement role hierarchy (higher roles inherit lower permissions)

**Permission Check Function**:
```javascript
async function hasPermission(member, commandGroup) {
  const memberRoles = member.roles.cache.map(r => r.id);
  const permissions = await prisma.rolePermission.findMany({
    where: {
      guildId: member.guild.id,
      roleId: { in: memberRoles },
      commandGroup: commandGroup
    }
  });
  return permissions.length > 0;
}
```

#### 1.4 Rate Limiting
- **Database Tables**: `GuildSettings.globalCooldown`, `CommandCooldown`
- **Bot Behavior**:
  - Implement in-memory cooldown cache (Map<userId_commandName, timestamp>)
  - Check `CommandCooldown` table for command-specific cooldowns
  - Fall back to `globalCooldown` if no command-specific cooldown exists
  - Send cooldown message: "Please wait X seconds before using this command again."

**Cooldown Implementation**:
```javascript
const cooldowns = new Map();

async function checkCooldown(userId, commandName, guildId) {
  const settings = await prisma.guildSettings.findUnique({
    where: { guildId }
  });
  
  const commandCooldown = await prisma.commandCooldown.findUnique({
    where: { guildId_commandName: { guildId, commandName } }
  });
  
  const cooldownMs = commandCooldown?.cooldownMs || settings.globalCooldown;
  const key = `${userId}_${commandName}`;
  const lastUsed = cooldowns.get(key);
  
  if (lastUsed && Date.now() - lastUsed < cooldownMs) {
    return cooldownMs - (Date.now() - lastUsed);
  }
  
  cooldowns.set(key, Date.now());
  return 0;
}
```

---

## Module 2: Visual Interaction Builder

### Features to Implement

#### 2.1 Message Template Execution
- **Database Table**: `MessageTemplate`
- **Bot Behavior**:
  - Create command: `/send-template <name>` or `!send-template <name>`
  - Fetch template from database
  - Parse `embedData` and `components` JSON
  - Send message with embed and components (buttons/select menus)

**Template Execution**:
```javascript
async function sendTemplate(channel, templateName, guildId) {
  const template = await prisma.messageTemplate.findFirst({
    where: {
      guildId,
      name: templateName
    }
  });
  
  if (!template) throw new Error('Template not found');
  
  const embed = template.embedData ? new EmbedBuilder(template.embedData) : null;
  const components = template.components ? parseComponents(template.components) : [];
  
  await channel.send({
    content: template.content,
    embeds: embed ? [embed] : [],
    components: components
  });
}
```

#### 2.2 Reaction Role Handler
- **Database Table**: `ReactionRole`
- **Bot Behavior**:
  - Listen for `messageReactionAdd` and `messageReactionRemove` events
  - Check if message has reaction roles configured
  - Add/remove role based on reaction

**Reaction Handler**:
```javascript
client.on(Events.MessageReactionAdd, async (reaction, user) => {
  if (user.bot) return;
  
  const emoji = reaction.emoji.id || reaction.emoji.name;
  const reactionRole = await prisma.reactionRole.findUnique({
    where: {
      messageId_emoji: {
        messageId: reaction.message.id,
        emoji: emoji
      }
    }
  });
  
  if (reactionRole) {
    const member = await reaction.message.guild.members.fetch(user.id);
    await member.roles.add(reactionRole.roleId);
  }
});
```

#### 2.3 Button Role Handler
- **Database Table**: `ButtonRole`
- **Bot Behavior**:
  - Listen for `interactionCreate` events (button clicks)
  - Check if button is linked to a role
  - Add/remove role (toggle behavior)

**Button Handler**:
```javascript
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;
  
  const buttonRole = await prisma.buttonRole.findUnique({
    where: {
      messageId_buttonId: {
        messageId: interaction.message.id,
        buttonId: interaction.customId
      }
    }
  });
  
  if (buttonRole) {
    const member = interaction.member;
    const hasRole = member.roles.cache.has(buttonRole.roleId);
    
    if (hasRole) {
      await member.roles.remove(buttonRole.roleId);
      await interaction.reply({ content: 'Role removed!', ephemeral: true });
    } else {
      await member.roles.add(buttonRole.roleId);
      await interaction.reply({ content: 'Role added!', ephemeral: true });
    }
  }
});
```

#### 2.4 Emoji Picker Integration
- **Bot Behavior**:
  - Provide API endpoint: `GET /api/guild/:guildId/emojis`
  - Return all custom emojis from the guild
  - Format: `{ id, name, animated, url }`

---

## Module 3: Custom Commands & Auto-Responders

### Features to Implement

#### 3.1 Custom Command Execution
- **Database Table**: `CustomCommand`
- **Bot Behavior**:
  - On message/command, check if trigger matches a custom command
  - Parse variables: `{user}`, `{user.mention}`, `{server.name}`, `{server.memberCount}`, `{channel}`, `{channel.mention}`
  - Execute response based on `responseType`:
    - `text`: Send plain text
    - `embed`: Parse `embedData` and send embed
    - `template`: Reference a `MessageTemplate`

**Variable Replacement**:
```javascript
function replaceVariables(text, message) {
  return text
    .replace(/{user}/g, message.author.username)
    .replace(/{user.mention}/g, message.author.toString())
    .replace(/{server.name}/g, message.guild.name)
    .replace(/{server.memberCount}/g, message.guild.memberCount)
    .replace(/{channel}/g, message.channel.name)
    .replace(/{channel.mention}/g, message.channel.toString());
}
```

#### 3.2 Tag System
- **Database Field**: `CustomCommand.isTag`
- **Bot Behavior**:
  - Tags can be triggered without prefix: `!tag-name` or `/tag tag-name`
  - Support tag categories for organization
  - List command: `!tags [category]` shows all tags

#### 3.3 Multi-Page Menu System
- **Database Field**: `CustomCommand.menuPages`
- **Bot Behavior**:
  - Parse `menuPages` JSON array
  - Send first page with navigation buttons (◀ Previous, Next ▶)
  - Handle button interactions to navigate pages
  - Store current page in interaction cache

**Menu Implementation**:
```javascript
async function sendMenuPages(message, command) {
  const pages = JSON.parse(command.menuPages);
  let currentPage = 0;
  
  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('prev_page')
        .setLabel('◀ Previous')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage === 0),
      new ButtonBuilder()
        .setCustomId('next_page')
        .setLabel('Next ▶')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage === pages.length - 1)
    );
  
  await message.channel.send({
    embeds: [pages[currentPage].embed],
    components: [row]
  });
}
```

#### 3.4 Auto-Responder System
- **Database Table**: `AutoResponder`
- **Bot Behavior**:
  - On every message, check against all enabled auto-responders
  - Match types:
    - `exact`: Exact match
    - `contains`: Message contains trigger
    - `starts_with`: Message starts with trigger
    - `ends_with`: Message ends with trigger
    - `regex`: Regular expression match
  - Increment `triggerCount` on match
  - Rate limit: Max 1 response per 10 seconds per channel

**Auto-Responder Check**:
```javascript
async function checkAutoResponders(message) {
  if (message.author.bot) return;
  
  const responders = await prisma.autoResponder.findMany({
    where: {
      guildId: message.guild.id,
      isEnabled: true
    }
  });
  
  for (const responder of responders) {
    let matches = false;
    
    switch (responder.matchType) {
      case 'exact':
        matches = message.content === responder.triggerText;
        break;
      case 'contains':
        matches = message.content.includes(responder.triggerText);
        break;
      case 'starts_with':
        matches = message.content.startsWith(responder.triggerText);
        break;
      case 'ends_with':
        matches = message.content.endsWith(responder.triggerText);
        break;
      case 'regex':
        matches = new RegExp(responder.triggerText).test(message.content);
        break;
    }
    
    if (matches) {
      await sendResponse(message, responder);
      await prisma.autoResponder.update({
        where: { id: responder.id },
        data: { triggerCount: { increment: 1 } }
      });
      break; // Only respond once per message
    }
  }
}
```

---

## Module 4: Ticket System

### Features to Implement

#### 4.1 Ticket Panel Creation
- **Database Table**: `TicketPanel`
- **Bot Behavior**:
  - Command: `/ticket-panel create <name>` or dashboard creates panel
  - Send panel message with button
  - Store `messageId` and `channelId` in database

**Panel Message**:
```javascript
async function createTicketPanel(channel, panelData) {
  const button = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket_create_${panelData.id}`)
        .setLabel(panelData.buttonLabel)
        .setEmoji(panelData.buttonEmoji)
        .setStyle(ButtonStyle.Primary)
    );
  
  const embed = new EmbedBuilder()
    .setTitle(panelData.title)
    .setDescription(panelData.description)
    .setColor(0x5865F2);
  
  const message = await channel.send({
    embeds: [embed],
    components: [button]
  });
  
  await prisma.ticketPanel.update({
    where: { id: panelData.id },
    data: {
      channelId: channel.id,
      messageId: message.id
    }
  });
}
```

#### 4.2 Ticket Creation
- **Database Table**: `Ticket`
- **Bot Behavior**:
  - On button click (`ticket_create_*`), create ticket channel
  - Channel name format: `ticket-username` or `ticket-1234`
  - Set permissions: Creator + Support Roles can view
  - Send welcome message with ticket controls

**Ticket Creation**:
```javascript
async function createTicket(interaction, panelId) {
  const panel = await prisma.ticketPanel.findUnique({
    where: { id: panelId }
  });
  
  const category = panel.categoryId 
    ? await interaction.guild.channels.fetch(panel.categoryId)
    : null;
  
  const channel = await interaction.guild.channels.create({
    name: `ticket-${interaction.user.username}`,
    type: ChannelType.GuildText,
    parent: category?.id,
    permissionOverwrites: [
      {
        id: interaction.guild.id,
        deny: [PermissionFlagsBits.ViewChannel]
      },
      {
        id: interaction.user.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
      },
      ...panel.supportRoles.map(roleId => ({
        id: roleId,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
      }))
    ]
  });
  
  const ticket = await prisma.ticket.create({
    data: {
      guildId: interaction.guild.id,
      panelId: panel.id,
      channelId: channel.id,
      userId: interaction.user.id,
      status: 'open'
    }
  });
  
  const controls = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket_claim_${ticket.id}`)
        .setLabel('Claim')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`ticket_close_${ticket.id}`)
        .setLabel('Close')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`ticket_delete_${ticket.id}`)
        .setLabel('Delete')
        .setStyle(ButtonStyle.Danger)
    );
  
  await channel.send({
    content: `Ticket created by ${interaction.user}`,
    components: [controls]
  });
  
  await interaction.reply({
    content: `Ticket created: ${channel}`,
    ephemeral: true
  });
}
```

#### 4.3 Ticket Management
- **Bot Behavior**:
  - **Claim**: Assign ticket to staff member, update `assignedTo` and `status`
  - **Unclaim**: Remove assignment, set `status` back to "open"
  - **Close**: Generate transcript, set `status` to "closed", lock channel
  - **Delete**: Delete channel, set `status` to "deleted"

**Ticket Claim**:
```javascript
async function claimTicket(interaction, ticketId) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId }
  });
  
  if (ticket.status !== 'open') {
    return interaction.reply({ content: 'Ticket is not open!', ephemeral: true });
  }
  
  await prisma.ticket.update({
    where: { id: ticketId },
    data: {
      assignedTo: interaction.user.id,
      status: 'claimed',
      claimedAt: new Date()
    }
  });
  
  await interaction.reply({
    content: `Ticket claimed by ${interaction.user}`,
    ephemeral: false
  });
}
```

#### 4.4 Transcript Generation
- **Bot Behavior**:
  - On ticket close, fetch all messages from channel
  - Format as HTML with timestamps, usernames, avatars
  - Upload to storage (S3, Cloudflare R2, or database)
  - Store URL in `Ticket.transcriptUrl` and HTML in `Ticket.transcriptHtml`
  - Send transcript link to ticket creator via DM

**Transcript Generation**:
```javascript
async function generateTranscript(ticket) {
  const channel = await client.channels.fetch(ticket.channelId);
  const messages = await channel.messages.fetch({ limit: 100 });
  
  let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Ticket Transcript - ${ticket.id}</title>
      <style>
        body { font-family: Arial; background: #2f3136; color: #dcddde; }
        .message { margin: 10px 0; padding: 10px; background: #36393f; }
        .author { font-weight: bold; color: #5865f2; }
        .timestamp { color: #72767d; font-size: 0.9em; }
      </style>
    </head>
    <body>
      <h1>Ticket Transcript</h1>
      <p>Guild: ${channel.guild.name}</p>
      <p>Created: ${ticket.openedAt}</p>
  `;
  
  for (const message of messages.reverse()) {
    html += `
      <div class="message">
        <span class="author">${message.author.tag}</span>
        <span class="timestamp">${message.createdAt}</span>
        <p>${message.content}</p>
      </div>
    `;
  }
  
  html += `</body></html>`;
  
  // Upload HTML and get URL
  const transcriptUrl = await uploadTranscript(html, ticket.id);
  
  await prisma.ticket.update({
    where: { id: ticket.id },
    data: {
      transcriptUrl,
      transcriptHtml: html
    }
  });
  
  return transcriptUrl;
}
```

---

## Module 5: Audit Logging

### Features to Implement

#### 5.1 Comprehensive Audit Logging
- **Database Table**: `AuditLog`
- **Bot Behavior**:
  - Log ALL moderation actions: ban, kick, mute, timeout, warn, role_add, role_remove
  - Log bot actions: auto-moderation, auto-responses, ticket creation
  - Log configuration changes: settings updates, permission changes
  - Include metadata: role IDs, channel IDs, duration, reason

**Audit Log Function**:
```javascript
async function logAction(guildId, actionType, options) {
  await prisma.auditLog.create({
    data: {
      guildId,
      actionType,
      userId: options.userId,
      moderatorId: options.moderatorId,
      botAction: options.botAction || false,
      reason: options.reason,
      metadata: options.metadata || {}
    }
  });
  
  // Emit WebSocket event for real-time dashboard update
  websocketServer.emit('audit_log', {
    guildId,
    actionType,
    ...options
  });
}
```

**Usage Examples**:
```javascript
// On ban
await logAction(guild.id, 'ban', {
  userId: member.id,
  moderatorId: moderator.id,
  reason: reason,
  metadata: { duration: duration }
});

// On ticket creation
await logAction(guild.id, 'ticket_create', {
  userId: user.id,
  botAction: true,
  metadata: { ticketId: ticket.id, panelId: panel.id }
});
```

#### 5.2 Timeline Feed
- **Bot Behavior**:
  - Provide WebSocket stream of audit logs
  - Dashboard subscribes to `guildId` and receives real-time updates
  - Format: `{ type, user, moderator, action, timestamp, metadata }`

---

## API Endpoints Required

The bot should expose REST API endpoints for the dashboard to interact with:

### Configuration Endpoints
```
GET    /api/guild/:guildId/settings
PUT    /api/guild/:guildId/settings
GET    /api/guild/:guildId/permissions
POST   /api/guild/:guildId/permissions
DELETE /api/guild/:guildId/permissions/:id
```

### Message Template Endpoints
```
GET    /api/guild/:guildId/templates
POST   /api/guild/:guildId/templates
PUT    /api/guild/:guildId/templates/:id
DELETE /api/guild/:guildId/templates/:id
POST   /api/guild/:guildId/templates/:id/send
```

### Custom Commands Endpoints
```
GET    /api/guild/:guildId/commands
POST   /api/guild/:guildId/commands
PUT    /api/guild/:guildId/commands/:id
DELETE /api/guild/:guildId/commands/:id
```

### Ticket Endpoints
```
GET    /api/guild/:guildId/tickets
GET    /api/guild/:guildId/tickets/:id
POST   /api/guild/:guildId/tickets/:id/claim
POST   /api/guild/:guildId/tickets/:id/close
POST   /api/guild/:guildId/tickets/:id/delete
GET    /api/guild/:guildId/tickets/:id/transcript
```

### Audit Log Endpoints
```
GET    /api/guild/:guildId/audit-logs
GET    /api/guild/:guildId/audit-logs/:id
```

### Guild Data Endpoints
```
GET    /api/guild/:guildId/emojis
GET    /api/guild/:guildId/roles
GET    /api/guild/:guildId/channels
GET    /api/guild/:guildId/members
```

---

## WebSocket Events

### Server → Client (Dashboard)
```javascript
// Audit log created
emit('audit_log', { guildId, actionType, userId, moderatorId, ... });

// Ticket created/updated
emit('ticket_update', { guildId, ticketId, status, ... });

// Command executed
emit('command_executed', { guildId, commandName, userId, ... });

// Settings updated
emit('settings_update', { guildId, settings });
```

### Client → Server (Dashboard → Bot)
```javascript
// Request real-time updates for guild
on('subscribe_guild', (guildId) => { ... });

// Unsubscribe from guild updates
on('unsubscribe_guild', (guildId) => { ... });
```

---

## Database Operations

### Prisma Client Initialization
```javascript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

// Handle graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});
```

### Common Queries

**Get Guild Settings**:
```javascript
const settings = await prisma.guildSettings.findUnique({
  where: { guildId: guild.id }
}) || await prisma.guildSettings.create({
  data: { guildId: guild.id }
});
```

**Check Permissions**:
```javascript
const hasPermission = await prisma.rolePermission.findFirst({
  where: {
    guildId: guild.id,
    roleId: { in: member.roles.cache.map(r => r.id) },
    commandGroup: 'admin'
  }
});
```

**Create Audit Log**:
```javascript
await prisma.auditLog.create({
  data: {
    guildId: guild.id,
    actionType: 'ban',
    userId: target.id,
    moderatorId: moderator.id,
    reason: reason,
    metadata: { duration }
  }
});
```

---

## Implementation Checklist

- [ ] Set up Discord.js/Sapphire bot with required intents
- [ ] Initialize Prisma Client with NeonDB connection
- [ ] Implement guild settings loading and caching
- [ ] Create command handler with module toggle checks
- [ ] Implement permission checking system
- [ ] Add rate limiting with database-backed cooldowns
- [ ] Create message template execution system
- [ ] Implement reaction role handler
- [ ] Implement button role handler
- [ ] Create custom command system with variable replacement
- [ ] Implement tag system
- [ ] Create multi-page menu system
- [ ] Implement auto-responder with match types
- [ ] Create ticket panel system
- [ ] Implement ticket creation and management
- [ ] Add transcript generation and storage
- [ ] Create comprehensive audit logging
- [ ] Set up REST API endpoints
- [ ] Implement WebSocket server for real-time updates
- [ ] Add error handling and logging
- [ ] Create database migration scripts
- [ ] Add health check endpoint

---

## Testing Recommendations

1. **Unit Tests**: Test individual functions (variable replacement, permission checks)
2. **Integration Tests**: Test database operations with test database
3. **E2E Tests**: Test full command flows with Discord test server
4. **Load Tests**: Test rate limiting and cooldown systems
5. **WebSocket Tests**: Test real-time event delivery

---

## Security Considerations

1. **API Authentication**: Use JWT tokens or API keys for dashboard-bot communication
2. **Permission Validation**: Always verify user permissions server-side
3. **Input Sanitization**: Sanitize all user inputs before database operations
4. **Rate Limiting**: Implement API rate limiting to prevent abuse
5. **SQL Injection**: Use Prisma parameterized queries (handled automatically)
6. **XSS Prevention**: Sanitize HTML in transcripts and embeds

---

## Performance Optimization

1. **Database Indexing**: Ensure all frequently queried fields are indexed
2. **Caching**: Cache guild settings and permissions in memory (Redis optional)
3. **Connection Pooling**: Use NeonDB connection pooling
4. **Batch Operations**: Batch database queries where possible
5. **Lazy Loading**: Load data only when needed

---

## Deployment Notes

1. **Environment Variables**: Store sensitive data in environment variables
2. **Database Migrations**: Run Prisma migrations on deployment
3. **Health Checks**: Implement health check endpoints
4. **Logging**: Set up structured logging (Winston, Pino)
5. **Monitoring**: Add error tracking (Sentry, etc.)
6. **Scaling**: Consider horizontal scaling with multiple bot instances

---

## Support & Maintenance

- **Database Backups**: Set up automated NeonDB backups
- **Migration Strategy**: Use NeonDB branching for testing
- **Version Control**: Keep bot code and database schema in sync
- **Documentation**: Keep this guide updated as features are added

---

**Last Updated**: 2026-02-19
**Version**: 1.0.0
