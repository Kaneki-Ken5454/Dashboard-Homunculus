declare module 'https://esm.sh/@neondatabase/serverless@1.0.1' {
  type SqlRow = Record<string, unknown>;

  export function neon(connectionString: string): (
    strings: TemplateStringsArray,
    ...params: unknown[]
  ) => Promise<SqlRow[]>;
}

interface ImportMetaEnv {
  readonly VITE_DATABASE_URL?: string;
  readonly DATABASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
