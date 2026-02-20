import { PrismaClient } from '@prisma/client';

async function testDatabase() {
  const prisma = new PrismaClient();
  
  try {
    console.log('Testing database connection...');
    
    // Test basic connection
    await prisma.$connect();
    console.log('✓ Database connection successful');
    
    // Test existing tables
    const guildSettings = await prisma.guildSettings.findFirst();
    console.log('✓ Guild settings table accessible');
    
    const customCommands = await prisma.customCommand.findFirst();
    console.log('✓ Custom commands table accessible');
    
    // Test new tables
    const infoTopics = await prisma.infoTopic.findFirst();
    console.log('✓ Info topics table accessible');
    
    const warns = await prisma.warnsData.findFirst();
    console.log('✓ Warns data table accessible');
    
    const blacklist = await prisma.blacklistData.findFirst();
    console.log('✓ Blacklist data table accessible');
    
    const votes = await prisma.vote.findFirst();
    console.log('✓ Votes table accessible');
    
    const voteCasts = await prisma.voteCast.findFirst();
    console.log('✓ Votes cast table accessible');
    
    const scans = await prisma.scannerData.findFirst();
    console.log('✓ Scanner data table accessible');
    
    const triggers = await prisma.trigger.findFirst();
    console.log('✓ Triggers table accessible');
    
    console.log('\n🎉 All database tests passed!');
    
  } catch (error) {
    console.error('❌ Database test failed:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

testDatabase();