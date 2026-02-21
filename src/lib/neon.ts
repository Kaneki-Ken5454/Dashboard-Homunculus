import { neon } from '@neondatabase/serverless';

export type DashboardHealth = {
  readOk: boolean;
  writeOk: boolean;
  tables: string[];
  missingTables: string[];
  errorMessage?: string;
};

const expectedTables = [
  'guild_settings',
  'custom_commands',
  'tickets',
  'audit_logs',
  'guild_members',
  'info_topics',
  'votes',
  'triggers',
];

function getDatabaseUrl() {
  // DATABASE_URL is no longer exposed via envPrefix; use VITE_DATABASE_URL only.
  return import.meta.env.VITE_DATABASE_URL;
}

export async function runDashboardHealthCheck(): Promise<DashboardHealth> {
  const databaseUrl = getDatabaseUrl();

  if (!databaseUrl) {
    return {
      readOk: false,
      writeOk: false,
      tables: [],
      missingTables: expectedTables,
      errorMessage:
        'Missing database URL. Set VITE_DATABASE_URL in your .env file before running the dashboard.',
    };
  }

  try {
    const sql = neon(databaseUrl);

    const tableRows = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;

    const tables = tableRows
      .map((row) => String(row.table_name ?? ''))
      .filter(Boolean);

    const missingTables = expectedTables.filter((table) => !tables.includes(table));

    const readRows = await sql`SELECT NOW() AS current_time`;
    const readOk = readRows.length === 1;

    // BUG FIX: NeonDB's HTTP driver sends each sql`...` call as a separate HTTP
    // request — TEMP TABLEs created in one call are not visible in the next.
    // Using a single DO block keeps everything in one round-trip so session
    // state (the temp table) is maintained for the duration of the block.
    await sql`
      DO $$
      BEGIN
        CREATE TEMP TABLE IF NOT EXISTS _dashboard_write_test (id integer);
        INSERT INTO _dashboard_write_test (id) VALUES (1);
        DELETE FROM _dashboard_write_test WHERE id = 1;
      END $$
    `;

    return {
      readOk,
      writeOk: true,
      tables,
      missingTables,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown NeonDB error';
    return {
      readOk: false,
      writeOk: false,
      tables: [],
      missingTables: expectedTables,
      errorMessage: message,
    };
  }
}
