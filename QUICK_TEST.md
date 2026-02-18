# Quick Testing Guide

## 🚀 Quick Start Testing

### 1. Install Dependencies
```bash
npm install
```

### 2. Set Up Environment
Create `.env` file:
```env
DATABASE_URL="postgresql://neondb_owner:npg_dJjb8k0EAUGf@ep-floral-resonance-a1spd9bz-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
```

### 3. Generate Prisma Client
```bash
npm run db:generate
```

### 4. Run Tests

**Test database connection:**
```bash
npm test -- test/database-connection
```

**Test CRUD operations:**
```bash
npm test -- test/prisma-crud
```

**Run all tests:**
```bash
npm test
```

**Watch mode (auto-rerun on changes):**
```bash
npm run test:watch
```

## ✅ What Gets Tested

### Database Connection Test
- ✅ Connects to NeonDB
- ✅ Can execute queries
- ✅ Lists all tables

### CRUD Operations Test
- ✅ Create guild settings
- ✅ Read guild settings
- ✅ Update guild settings
- ✅ Create custom commands
- ✅ Enforce unique constraints
- ✅ Create tickets with relations
- ✅ Load related data

## 🧪 Manual Testing

### Using Prisma Studio (Visual Testing)
```bash
npm run db:studio
```

Opens GUI at `http://localhost:5555` where you can:
- Browse all tables
- Create test data manually
- Verify relationships
- Test queries visually

### Quick Database Test Script

Create `test-quick.js`:
```javascript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function quickTest() {
  try {
    // Test connection
    await prisma.$connect();
    console.log('✅ Connected to database');

    // List tables
    const tables = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;
    console.log('📊 Tables:', tables);

    // Test creating a guild setting
    const testGuildId = '999999999999999999';
    const settings = await prisma.guildSettings.upsert({
      where: { guildId: testGuildId },
      update: {},
      create: {
        guildId: testGuildId,
        prefix: '!',
      },
    });
    console.log('✅ Created guild settings:', settings);

    // Clean up
    await prisma.guildSettings.delete({
      where: { guildId: testGuildId },
    });
    console.log('✅ Cleaned up test data');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

quickTest();
```

Run it:
```bash
node test-quick.js
```

## 📋 Test Checklist

Before deploying, verify:

- [ ] Database connection works
- [ ] Can create guild settings
- [ ] Can create custom commands
- [ ] Can create tickets
- [ ] Unique constraints work
- [ ] Relationships load correctly
- [ ] Can update records
- [ ] Can delete records

## 🐛 Troubleshooting

### Error: "Can't reach database server"
- Check your internet connection
- Verify DATABASE_URL in .env
- Ensure NeonDB project is active

### Error: "Prisma Client not generated"
```bash
npm run db:generate
```

### Error: "Table doesn't exist"
```bash
npm run db:push
```

### Tests timeout
- Check database connection
- Increase timeout in vitest.config.ts
- Verify NeonDB is not paused

## 📚 More Information

For comprehensive testing guide, see `TESTING_GUIDE.md`
