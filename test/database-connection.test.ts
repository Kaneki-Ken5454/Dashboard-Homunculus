/**
 * Database Connection Test
 * Tests basic database connectivity and Prisma Client initialization
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { testConnection } from '../server/prisma-client';

const prisma = new PrismaClient();

describe('Database Connection', () => {
  it('should connect to NeonDB successfully', async () => {
    const connected = await testConnection();
    expect(connected).toBe(true);
  });

  it('should be able to query database', async () => {
    const result = await prisma.$queryRaw`SELECT 1 as test`;
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toHaveProperty('test');
  });

  it('should be able to check if tables exist', async () => {
    const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;
    
    expect(tables.length).toBeGreaterThan(0);
    console.log('Found tables:', tables.map(t => t.table_name));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });
});
