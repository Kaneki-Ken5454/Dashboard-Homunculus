# Database Setup Guide for Aeon

This guide will help you set up the NeonDB database for the Aeon Discord Management System.

## Prerequisites

- NeonDB account and project (already configured)
- Connection string: `postgresql://neondb_owner:npg_dJjb8k0EAUGf@ep-floral-resonance-a1spd9bz-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require`
- Node.js 18+ installed
- Prisma CLI installed (`npm install -g prisma` or use `npx prisma`)

## Step 1: Install Dependencies

```bash
npm install
```

This will install:
- `@prisma/client` - Prisma Client for database operations
- `prisma` - Prisma CLI for migrations and schema management

## Step 2: Configure Environment Variables

Create a `.env` file in the root directory:

```env
DATABASE_URL="postgresql://neondb_owner:npg_dJjb8k0EAUGf@ep-floral-resonance-a1spd9bz-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
```

## Step 3: Generate Prisma Client

Generate the Prisma Client based on the schema:

```bash
npm run db:generate
```

Or using npx:
```bash
npx prisma generate
```

This creates the TypeScript types and client code in `node_modules/.prisma/client`.

## Step 4: Push Schema to Database

### Option A: Push Schema (Development - Fast)
```bash
npm run db:push
```

This will:
- Create all tables if they don't exist
- Update existing tables to match the schema
- **Note**: This does NOT create migration history

### Option B: Create Migration (Production - Recommended)
```bash
npm run db:migrate
```

When prompted:
- Enter a migration name (e.g., `init_aeon_schema`)
- Prisma will create a migration file in `prisma/migrations/`
- Apply the migration to the database

## Step 5: Verify Database Setup

### Option A: Using Prisma Studio (Visual GUI)
```bash
npm run db:studio
```

This opens a web interface at `http://localhost:5555` where you can:
- View all tables
- Browse data
- Edit records
- Test queries

### Option B: Using SQL Client

Connect to your NeonDB database using any PostgreSQL client:
- **Connection String**: `postgresql://neondb_owner:npg_dJjb8k0EAUGf@ep-floral-resonance-a1spd9bz-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require`
- **Host**: `ep-floral-resonance-a1spd9bz-pooler.ap-southeast-1.aws.neon.tech`
- **Database**: `neondb`
- **User**: `neondb_owner`
- **Password**: `npg_dJjb8k0EAUGf`
- **Port**: `5432` (default)
- **SSL**: Required

## Step 6: Check Tables Created

After migration, verify these tables exist:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public'
ORDER BY table_name;
```

Expected tables:
- `audit_logs`
- `auto_responders`
- `button_roles`
- `command_cooldowns`
- `custom_commands`
- `guild_members`
- `guild_settings`
- `level_rewards`
- `message_templates`
- `reaction_roles`
- `role_permissions`
- `ticket_panels`
- `tickets`

## Step 7: Initialize Default Settings (Optional)

You can create a seed script to initialize default data:

Create `prisma/seed.ts`:
```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Example: Create default settings for a test guild
  const testGuildId = '1234567890123456789';
  
  await prisma.guildSettings.upsert({
    where: { guildId: testGuildId },
    update: {},
    create: {
      guildId: testGuildId,
      prefix: '!',
      useSlashCommands: true,
      moderationEnabled: true,
      levellingEnabled: true,
      funEnabled: true,
      ticketsEnabled: true,
      customCommandsEnabled: true,
      autoRespondersEnabled: true,
    },
  });
  
  console.log('Seed data created successfully');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

Run seed:
```bash
npx ts-node prisma/seed.ts
```

## Troubleshooting

### Error: "Can't reach database server"
- Check your internet connection
- Verify the connection string is correct
- Ensure NeonDB project is active (not paused)

### Error: "SSL connection required"
- Ensure `?sslmode=require` is in the connection string
- Some clients may need `sslmode=require` instead

### Error: "Table already exists"
- If tables already exist, use `db:migrate` instead of `db:push`
- Or manually drop tables if in development

### Error: "Migration failed"
- Check Prisma migration logs
- Verify schema syntax is correct
- Check for conflicting migrations

## Using NeonDB Branching (Testing)

NeonDB supports database branching for testing:

1. Create a branch in NeonDB dashboard
2. Update `DATABASE_URL` to point to branch
3. Run migrations on branch
4. Test changes
5. Merge branch or update main branch

Example branch URL:
```
postgresql://neondb_owner:npg_dJjb8k0EAUGf@ep-floral-resonance-a1spd9bz-pooler.ap-southeast-1.aws.neon.tech/neondb_branch_name?sslmode=require
```

## Next Steps

After database setup:
1. ✅ Database schema created
2. ✅ Prisma Client generated
3. ⏭️ Implement bot backend (see `BOT_INTEGRATION_GUIDE.md`)
4. ⏭️ Connect dashboard to database
5. ⏭️ Set up WebSocket server
6. ⏭️ Configure API endpoints

## Useful Commands

```bash
# Generate Prisma Client
npm run db:generate

# Push schema changes (dev)
npm run db:push

# Create migration (prod)
npm run db:migrate

# Open Prisma Studio
npm run db:studio

# Reset database (⚠️ DANGER: Deletes all data)
npx prisma migrate reset

# Format Prisma schema
npx prisma format

# Validate schema
npx prisma validate
```

## Database Schema Overview

### Core Tables
- **guild_settings**: Server configuration and module toggles
- **role_permissions**: Role-based command permissions
- **command_cooldowns**: Rate limiting configuration

### Interaction Tables
- **message_templates**: Saved message templates
- **reaction_roles**: Reaction-to-role mappings
- **button_roles**: Button-to-role mappings

### Command Tables
- **custom_commands**: Custom commands with variables
- **auto_responders**: Auto-response triggers

### Ticket Tables
- **ticket_panels**: Ticket panel configurations
- **tickets**: Ticket records with transcripts

### Analytics Tables
- **audit_logs**: Comprehensive audit trail
- **guild_members**: Member activity tracking
- **level_rewards**: Levelling system rewards

See `prisma/schema.prisma` for complete schema details.

---

**Last Updated**: 2026-02-19
