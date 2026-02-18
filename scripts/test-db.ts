/**
 * Quick Database Test Script
 * Run this to verify your database connection and basic operations
 * 
 * Usage: npx tsx scripts/test-db.ts
 * Or: npm run test:db (if script is added to package.json)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const TEST_GUILD_ID = '999999999999999999';

async function main() {
  console.log('🧪 Starting database tests...\n');

  try {
    // Test 1: Connection
    console.log('1️⃣ Testing database connection...');
    await prisma.$connect();
    console.log('   ✅ Connected successfully\n');

    // Test 2: List tables
    console.log('2️⃣ Checking database tables...');
    const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;
    console.log(`   ✅ Found ${tables.length} tables:`);
    tables.forEach((t) => console.log(`      - ${t.table_name}`));
    console.log();

    // Test 3: Create guild settings
    console.log('3️⃣ Testing CRUD operations...');
    const settings = await prisma.guildSettings.upsert({
      where: { guildId: TEST_GUILD_ID },
      update: {},
      create: {
        guildId: TEST_GUILD_ID,
        prefix: '!',
        useSlashCommands: true,
      },
    });
    console.log('   ✅ Created guild settings');
    console.log(`      Guild ID: ${settings.guildId}`);
    console.log(`      Prefix: ${settings.prefix}`);
    console.log();

    // Test 4: Read guild settings
    const readSettings = await prisma.guildSettings.findUnique({
      where: { guildId: TEST_GUILD_ID },
    });
    console.log('   ✅ Read guild settings');
    console.log(`      Prefix: ${readSettings?.prefix}`);
    console.log();

    // Test 5: Update guild settings
    const updated = await prisma.guildSettings.update({
      where: { guildId: TEST_GUILD_ID },
      data: { prefix: '?' },
    });
    console.log('   ✅ Updated guild settings');
    console.log(`      New prefix: ${updated.prefix}`);
    console.log();

    // Test 6: Create custom command
    const command = await prisma.customCommand.create({
      data: {
        guildId: TEST_GUILD_ID,
        trigger: 'test',
        response: 'Hello {user}!',
        createdBy: '123456789',
      },
    });
    console.log('   ✅ Created custom command');
    console.log(`      Trigger: ${command.trigger}`);
    console.log(`      Response: ${command.response}`);
    console.log();

    // Test 7: Create ticket panel
    const panel = await prisma.ticketPanel.create({
      data: {
        guildId: TEST_GUILD_ID,
        name: 'Support',
        title: 'Support Ticket',
        description: 'Get help here',
        buttonLabel: 'Create Ticket',
        supportRoles: ['role1'],
        createdBy: '123456789',
      },
    });
    console.log('   ✅ Created ticket panel');
    console.log(`      Panel: ${panel.name}`);
    console.log();

    // Test 8: Create ticket with relation
    const ticket = await prisma.ticket.create({
      data: {
        guildId: TEST_GUILD_ID,
        panelId: panel.id,
        channelId: 'channel123',
        userId: 'user123',
      },
    });
    console.log('   ✅ Created ticket');
    console.log(`      Ticket ID: ${ticket.id}`);
    console.log(`      Status: ${ticket.status}`);
    console.log();

    // Test 9: Load ticket with panel (relation)
    const ticketWithPanel = await prisma.ticket.findUnique({
      where: { id: ticket.id },
      include: { panel: true },
    });
    console.log('   ✅ Loaded ticket with panel relation');
    console.log(`      Panel name: ${ticketWithPanel?.panel.name}`);
    console.log();

    // Cleanup
    console.log('🧹 Cleaning up test data...');
    await prisma.ticket.delete({ where: { id: ticket.id } });
    await prisma.ticketPanel.delete({ where: { id: panel.id } });
    await prisma.customCommand.delete({ where: { id: command.id } });
    await prisma.guildSettings.delete({ where: { guildId: TEST_GUILD_ID } });
    console.log('   ✅ Cleanup complete\n');

    console.log('✅ All tests passed!');
    console.log('🎉 Your database is ready to use!');

  } catch (error) {
    console.error('\n❌ Test failed:');
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
