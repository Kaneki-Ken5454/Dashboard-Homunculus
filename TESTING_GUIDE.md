# Aeon Testing Guide

This guide covers how to test all components of the Aeon Discord Management System.

## Table of Contents
1. [Database Testing](#database-testing)
2. [Prisma Client Testing](#prisma-client-testing)
3. [Bot Integration Testing](#bot-integration-testing)
4. [API Endpoint Testing](#api-endpoint-testing)
5. [WebSocket Testing](#websocket-testing)
6. [Dashboard Testing](#dashboard-testing)
7. [End-to-End Testing](#end-to-end-testing)

---

## Database Testing

### 1. Test Database Connection

Create a test file `test/database-connection.test.ts`:

```typescript
import { PrismaClient } from '@prisma/client';
import { testConnection } from '../server/prisma-client';

describe('Database Connection', () => {
  it('should connect to NeonDB successfully', async () => {
    const connected = await testConnection();
    expect(connected).toBe(true);
  });

  it('should be able to query database', async () => {
    const prisma = new PrismaClient();
    const result = await prisma.$queryRaw`SELECT 1 as test`;
    expect(result).toBeDefined();
    await prisma.$disconnect();
  });
});
```

Run test:
```bash
npm test -- database-connection
```

### 2. Test Schema Tables Exist

```typescript
import { PrismaClient } from '@prisma/client';

describe('Database Schema', () => {
  const prisma = new PrismaClient();

  const requiredTables = [
    'guild_settings',
    'role_permissions',
    'command_cooldowns',
    'message_templates',
    'reaction_roles',
    'button_roles',
    'custom_commands',
    'auto_responders',
    'ticket_panels',
    'tickets',
    'audit_logs',
    'guild_members',
    'level_rewards',
  ];

  requiredTables.forEach((table) => {
    it(`should have ${table} table`, async () => {
      const result = await prisma.$queryRawUnsafe(
        `SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = $1
        )`,
        table
      );
      expect(result[0].exists).toBe(true);
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });
});
```

### 3. Test Using Prisma Studio

Visual database testing:
```bash
npm run db:studio
```

This opens a GUI at `http://localhost:5555` where you can:
- Browse all tables
- Create test data
- Verify relationships
- Test queries

---

## Prisma Client Testing

### 1. Test CRUD Operations

Create `test/prisma-operations.test.ts`:

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const TEST_GUILD_ID = '999999999999999999';

describe('Prisma CRUD Operations', () => {
  // Clean up before each test
  beforeEach(async () => {
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
        },
      });

      expect(settings.guildId).toBe(TEST_GUILD_ID);
      expect(settings.prefix).toBe('!');
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

    it('should delete guild settings', async () => {
      await prisma.guildSettings.create({
        data: { guildId: TEST_GUILD_ID, prefix: '!' },
      });

      await prisma.guildSettings.delete({
        where: { guildId: TEST_GUILD_ID },
      });

      const deleted = await prisma.guildSettings.findUnique({
        where: { guildId: TEST_GUILD_ID },
      });

      expect(deleted).toBeNull();
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
    });
  });

  afterAll(async () => {
    // Clean up test data
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
    await prisma.$disconnect();
  });
});
```

### 2. Test Relationships

```typescript
describe('Database Relationships', () => {
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
```

---

## Bot Integration Testing

### 1. Test Bot Initialization

Create `test/bot-init.test.ts`:

```typescript
import { Client, GatewayIntentBits } from 'discord.js';
import { prisma } from '../server/prisma-client';

describe('Bot Initialization', () => {
  let client: Client;

  beforeAll(() => {
    client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
      ],
    });
  });

  it('should initialize Discord client', () => {
    expect(client).toBeDefined();
    expect(client.user).toBeNull(); // Not logged in yet
  });

  it('should connect to database', async () => {
    const result = await prisma.$queryRaw`SELECT 1 as test`;
    expect(result).toBeDefined();
  });

  afterAll(async () => {
    await client.destroy();
    await prisma.$disconnect();
  });
});
```

### 2. Test Permission Checking

Create `test/permissions.test.ts`:

```typescript
import { prisma } from '../server/prisma-client';

async function hasPermission(
  guildId: string,
  roleIds: string[],
  commandGroup: string
): Promise<boolean> {
  const permissions = await prisma.rolePermission.findFirst({
    where: {
      guildId,
      roleId: { in: roleIds },
      commandGroup,
    },
  });
  return !!permissions;
}

describe('Permission System', () => {
  const TEST_GUILD_ID = '999999999999999999';

  beforeEach(async () => {
    await prisma.rolePermission.create({
      data: {
        guildId: TEST_GUILD_ID,
        roleId: 'admin_role',
        commandGroup: 'admin',
        permissions: ['ban', 'kick'],
      },
    });
  });

  it('should grant permission for matching role', async () => {
    const hasAccess = await hasPermission(
      TEST_GUILD_ID,
      ['admin_role'],
      'admin'
    );
    expect(hasAccess).toBe(true);
  });

  it('should deny permission for non-matching role', async () => {
    const hasAccess = await hasPermission(
      TEST_GUILD_ID,
      ['user_role'],
      'admin'
    );
    expect(hasAccess).toBe(false);
  });

  afterEach(async () => {
    await prisma.rolePermission.deleteMany({
      where: { guildId: TEST_GUILD_ID },
    });
  });
});
```

### 3. Test Rate Limiting

Create `test/rate-limiting.test.ts`:

```typescript
import { prisma } from '../server/prisma-client';

const cooldowns = new Map<string, number>();

async function checkCooldown(
  userId: string,
  commandName: string,
  guildId: string
): Promise<number> {
  const settings = await prisma.guildSettings.findUnique({
    where: { guildId },
  });

  const commandCooldown = await prisma.commandCooldown.findUnique({
    where: {
      guildId_commandName: { guildId, commandName },
    },
  });

  const cooldownMs = commandCooldown?.cooldownMs || settings?.globalCooldown || 1000;
  const key = `${userId}_${commandName}`;
  const lastUsed = cooldowns.get(key);

  if (lastUsed && Date.now() - lastUsed < cooldownMs) {
    return cooldownMs - (Date.now() - lastUsed);
  }

  cooldowns.set(key, Date.now());
  return 0;
}

describe('Rate Limiting', () => {
  const TEST_GUILD_ID = '999999999999999999';
  const TEST_USER_ID = 'user123';

  beforeEach(async () => {
    await prisma.guildSettings.upsert({
      where: { guildId: TEST_GUILD_ID },
      update: {},
      create: {
        guildId: TEST_GUILD_ID,
        globalCooldown: 1000,
      },
    });
    cooldowns.clear();
  });

  it('should allow command on first use', async () => {
    const remaining = await checkCooldown(
      TEST_USER_ID,
      'test',
      TEST_GUILD_ID
    );
    expect(remaining).toBe(0);
  });

  it('should enforce cooldown on second use', async () => {
    await checkCooldown(TEST_USER_ID, 'test', TEST_GUILD_ID);
    const remaining = await checkCooldown(
      TEST_USER_ID,
      'test',
      TEST_GUILD_ID
    );
    expect(remaining).toBeGreaterThan(0);
  });
});
```

---

## API Endpoint Testing

### 1. Test API with Supertest

Install dependencies:
```bash
npm install --save-dev supertest @types/supertest
```

Create `test/api.test.ts`:

```typescript
import request from 'supertest';
import express from 'express';
import { prisma } from '../server/prisma-client';

// Mock API router (replace with your actual router)
const app = express();
app.use(express.json());

app.get('/api/guild/:guildId/settings', async (req, res) => {
  const settings = await prisma.guildSettings.findUnique({
    where: { guildId: req.params.guildId },
  });
  res.json(settings);
});

describe('API Endpoints', () => {
  const TEST_GUILD_ID = '999999999999999999';

  beforeEach(async () => {
    await prisma.guildSettings.upsert({
      where: { guildId: TEST_GUILD_ID },
      update: {},
      create: {
        guildId: TEST_GUILD_ID,
        prefix: '!',
      },
    });
  });

  it('GET /api/guild/:guildId/settings should return settings', async () => {
    const response = await request(app)
      .get(`/api/guild/${TEST_GUILD_ID}/settings`)
      .expect(200);

    expect(response.body.guildId).toBe(TEST_GUILD_ID);
    expect(response.body.prefix).toBe('!');
  });

  afterEach(async () => {
    await prisma.guildSettings.deleteMany({
      where: { guildId: TEST_GUILD_ID },
    });
  });
});
```

---

## WebSocket Testing

### 1. Test WebSocket Connection

Install dependencies:
```bash
npm install --save-dev ws
```

Create `test/websocket.test.ts`:

```typescript
import { WebSocket } from 'ws';
import { AeonWebSocketServer } from '../server/websocket-server';
import { Server } from 'http';

describe('WebSocket Server', () => {
  let server: Server;
  let wss: AeonWebSocketServer;
  let ws: WebSocket;

  beforeAll((done) => {
    server = new Server();
    wss = new AeonWebSocketServer(server, 3001);
    server.listen(3001, () => {
      done();
    });
  });

  beforeEach((done) => {
    ws = new WebSocket('ws://localhost:3001/ws');
    ws.on('open', () => {
      done();
    });
  });

  it('should connect to WebSocket server', (done) => {
    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      if (message.type === 'subscribed') {
        expect(message.guildId).toBe('test123');
        done();
      }
    });

    ws.send(
      JSON.stringify({
        type: 'subscribe_guild',
        guildId: 'test123',
      })
    );
  });

  it('should receive audit log events', (done) => {
    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      if (message.type === 'audit_log') {
        expect(message.data.actionType).toBe('ban');
        done();
      }
    });

    ws.send(
      JSON.stringify({
        type: 'subscribe_guild',
        guildId: 'test123',
      })
    );

    // Emit test event
    setTimeout(() => {
      wss.emitAuditLog('test123', {
        actionType: 'ban',
        userId: 'user123',
      });
    }, 100);
  });

  afterEach(() => {
    ws.close();
  });

  afterAll((done) => {
    server.close(() => {
      done();
    });
  });
});
```

---

## Dashboard Testing

### 1. Test React Components

Create `test/components.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Example: Test a settings component
describe('Settings Component', () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  it('should render settings form', () => {
    render(
      <QueryClientProvider client={queryClient}>
        {/* Your component here */}
      </QueryClientProvider>
    );

    // Add your assertions
    // expect(screen.getByText('Settings')).toBeInTheDocument();
  });
});
```

### 2. Test Database Hooks

Create `test/hooks.test.ts`:

```typescript
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useGuildSettings } from '../src/hooks/use-database';

describe('Database Hooks', () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );

  it('should fetch guild settings', async () => {
    const { result } = renderHook(
      () => useGuildSettings('test123'),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toBeDefined();
  });
});
```

---

## End-to-End Testing

### 1. Test Complete Workflow

Create `test/e2e-workflow.test.ts`:

```typescript
import { PrismaClient } from '@prisma/client';

describe('E2E: Custom Command Workflow', () => {
  const prisma = new PrismaClient();
  const TEST_GUILD_ID = '999999999999999999';

  it('should create and execute custom command', async () => {
    // 1. Create guild settings
    await prisma.guildSettings.upsert({
      where: { guildId: TEST_GUILD_ID },
      update: {},
      create: {
        guildId: TEST_GUILD_ID,
        customCommandsEnabled: true,
      },
    });

    // 2. Create custom command
    const command = await prisma.customCommand.create({
      data: {
        guildId: TEST_GUILD_ID,
        trigger: 'hello',
        response: 'Hello {user}!',
        createdBy: '123456789',
      },
    });

    expect(command.id).toBeDefined();

    // 3. Verify command exists
    const found = await prisma.customCommand.findUnique({
      where: {
        guildId_trigger: {
          guildId: TEST_GUILD_ID,
          trigger: 'hello',
        },
      },
    });

    expect(found).toBeDefined();
    expect(found?.response).toBe('Hello {user}!');

    // 4. Test variable replacement (mock)
    const replaced = found!.response.replace('{user}', 'TestUser');
    expect(replaced).toBe('Hello TestUser!');

    // 5. Increment usage count
    await prisma.customCommand.update({
      where: { id: command.id },
      data: { usageCount: { increment: 1 } },
    });

    const updated = await prisma.customCommand.findUnique({
      where: { id: command.id },
    });

    expect(updated?.usageCount).toBe(1);
  });

  afterAll(async () => {
    await prisma.customCommand.deleteMany({
      where: { guildId: TEST_GUILD_ID },
    });
    await prisma.guildSettings.deleteMany({
      where: { guildId: TEST_GUILD_ID },
    });
    await prisma.$disconnect();
  });
});
```

---

## Manual Testing Checklist

### Database
- [ ] Connect to NeonDB using Prisma Studio
- [ ] Create test guild settings
- [ ] Create test custom command
- [ ] Create test ticket panel
- [ ] Verify relationships work
- [ ] Test queries with filters

### Bot (when implemented)
- [ ] Bot connects to database
- [ ] Bot loads guild settings on join
- [ ] Commands respect module toggles
- [ ] Permission checks work
- [ ] Rate limiting works
- [ ] Custom commands execute
- [ ] Tickets can be created
- [ ] Audit logs are created

### Dashboard
- [ ] Dashboard loads
- [ ] Can view guild settings
- [ ] Can update settings
- [ ] Can create custom commands
- [ ] Can view audit logs
- [ ] WebSocket updates work

---

## Running Tests

### Run all tests
```bash
npm test
```

### Run specific test file
```bash
npm test -- database-connection
```

### Run tests in watch mode
```bash
npm run test:watch
```

### Run tests with coverage
```bash
npm test -- --coverage
```

---

## Test Database Setup

For testing, consider using a separate test database:

```env
# .env.test
DATABASE_URL="postgresql://neondb_owner:npg_dJjb8k0EAUGf@ep-floral-resonance-a1spd9bz-pooler.ap-southeast-1.aws.neon.tech/neondb_test?sslmode=require"
```

Then in your test setup:
```typescript
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
```

---

## Troubleshooting Tests

### Issue: Tests timeout
- Increase timeout: `jest.setTimeout(10000)`
- Check database connection
- Verify NeonDB is not paused

### Issue: Tests interfere with each other
- Use `beforeEach` and `afterEach` to clean up
- Use unique test guild IDs
- Use transactions for isolation

### Issue: Prisma Client errors
- Run `npm run db:generate` before tests
- Check DATABASE_URL is set
- Verify schema matches database

---

**Last Updated**: 2026-02-19
