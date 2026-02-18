# How to Test Aeon System

## 🎯 Quick Test (Recommended)

### Option 1: Run Automated Tests (Easiest)

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Generate Prisma Client:**
   ```bash
   npm run db:generate
   ```

3. **Run tests:**
   ```bash
   npm test
   ```

This will run:
- ✅ Database connection test
- ✅ CRUD operations test
- ✅ Relationship tests

### Option 2: Visual Testing with Prisma Studio

1. **Open Prisma Studio:**
   ```bash
   npm run db:studio
   ```

2. **Browser opens at `http://localhost:5555`**

3. **Manually test:**
   - Browse all tables
   - Create test data
   - Verify relationships
   - Test queries

### Option 3: Quick Database Test Script

1. **Install tsx (if not already installed):**
   ```bash
   npm install -D tsx
   ```

2. **Run test script:**
   ```bash
   npm run test:db
   ```

Or manually:
```bash
npx tsx scripts/test-db.ts
```

This will:
- ✅ Test database connection
- ✅ List all tables
- ✅ Test CRUD operations
- ✅ Test relationships
- ✅ Clean up test data

---

## 📋 Step-by-Step Testing Guide

### Step 1: Verify Database Connection

**Using Prisma Studio:**
```bash
npm run db:studio
```
If it opens without errors, connection is working!

**Using Tests:**
```bash
npm test -- test/database-connection
```

**Expected Output:**
```
✅ Connected to database
✅ Found 13 tables
```

### Step 2: Test Basic Operations

**Run CRUD tests:**
```bash
npm test -- test/prisma-crud
```

**Expected Output:**
```
✅ Created guild settings
✅ Read guild settings
✅ Updated guild settings
✅ Created custom command
✅ Created ticket with panel
```

### Step 3: Test Relationships

The CRUD tests also verify:
- ✅ Tickets can be created with panel relations
- ✅ Tickets can load their panel data
- ✅ Unique constraints work correctly

---

## 🧪 Manual Testing Checklist

### Database Level

- [ ] **Connection Test**
  ```bash
  npm run db:studio
  ```
  - Should open without errors

- [ ] **Table Verification**
  - Open Prisma Studio
  - Verify all 13 tables exist:
    - guild_settings
    - role_permissions
    - command_cooldowns
    - message_templates
    - reaction_roles
    - button_roles
    - custom_commands
    - auto_responders
    - ticket_panels
    - tickets
    - audit_logs
    - guild_members
    - level_rewards

- [ ] **Create Test Data**
  - Create a guild setting
  - Create a custom command
  - Create a ticket panel
  - Create a ticket linked to the panel

- [ ] **Verify Relationships**
  - Load ticket with panel
  - Verify panel data is accessible

### Application Level (When Bot is Implemented)

- [ ] Bot connects to database
- [ ] Bot loads guild settings
- [ ] Commands respect module toggles
- [ ] Permission checks work
- [ ] Custom commands execute
- [ ] Tickets can be created
- [ ] Audit logs are created

---

## 🔍 Testing Individual Components

### Test Database Connection Only
```bash
npm test -- test/database-connection
```

### Test CRUD Operations Only
```bash
npm test -- test/prisma-crud
```

### Test in Watch Mode (Auto-rerun)
```bash
npm run test:watch
```

### Run All Tests
```bash
npm test
```

---

## 🐛 Troubleshooting Tests

### Error: "Can't reach database server"

**Solutions:**
1. Check internet connection
2. Verify `.env` file has correct `DATABASE_URL`
3. Ensure NeonDB project is active (not paused)
4. Check if connection string is correct

### Error: "Prisma Client not generated"

**Solution:**
```bash
npm run db:generate
```

### Error: "Table doesn't exist"

**Solution:**
```bash
npm run db:push
```

This will create all tables in your database.

### Error: "Tests timeout"

**Solutions:**
1. Check database connection
2. Verify NeonDB is not paused
3. Increase timeout in `vitest.config.ts`:
   ```typescript
   testTimeout: 30000, // 30 seconds
   ```

### Error: "Module not found" or TypeScript errors

**Solutions:**
1. Install dependencies: `npm install`
2. Generate Prisma Client: `npm run db:generate`
3. Restart your IDE/editor

---

## 📊 What Gets Tested

### ✅ Database Connection
- Connection to NeonDB
- Query execution
- Table listing

### ✅ CRUD Operations
- Create records
- Read records
- Update records
- Delete records
- Unique constraints

### ✅ Relationships
- Foreign key relationships
- Include queries
- Cascade deletes

### ✅ Data Integrity
- Required fields
- Unique constraints
- Default values
- Data types

---

## 🚀 Quick Start Commands

```bash
# 1. Install everything
npm install

# 2. Generate Prisma Client
npm run db:generate

# 3. Push schema to database (if tables don't exist)
npm run db:push

# 4. Run tests
npm test

# 5. Open visual database browser
npm run db:studio
```

---

## 📚 More Information

- **Comprehensive Testing Guide**: See `TESTING_GUIDE.md`
- **Quick Test Reference**: See `QUICK_TEST.md`
- **Database Setup**: See `DATABASE_SETUP.md`
- **Bot Integration**: See `BOT_INTEGRATION_GUIDE.md`

---

## ✅ Success Criteria

Your system is ready when:
- ✅ All tests pass
- ✅ Prisma Studio opens successfully
- ✅ Can create test data
- ✅ Can read test data
- ✅ Relationships work correctly
- ✅ No database errors

---

**Last Updated**: 2026-02-19
