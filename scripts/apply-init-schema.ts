import fs from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
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

  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i];
    try {
      await prisma.$executeRawUnsafe(statement);
    } catch (error: any) {
      const sqlState = error?.meta?.code as string | undefined;
      if (sqlState === '42P07' || sqlState === '42710') {
        continue;
      }
      console.error(`Failed statement #${i + 1}:`);
      console.error(statement);
      throw error;
    }
  }

  console.log(`Applied ${statements.length} SQL statements from prisma/init_schema.sql`);
}

main()
  .catch((error) => {
    console.error('Failed to apply init schema:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
