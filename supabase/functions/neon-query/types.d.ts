declare module "npm:postgres@3.4.5" {
  interface PostgresOptions {
    ssl?: string;
    max?: number;
  }
  
  interface QueryResult<T = any> {
    rows: T[];
  }
  
  interface Postgres {
    <T = any>(query: string, params?: any[]): Promise<QueryResult<T>>;
    unsafe<T = any>(query: string, params?: any[]): Promise<T[]>;
  }
  
  function postgres(url: string, options?: PostgresOptions): Postgres;
  export = postgres;
}

declare namespace Deno {
  export namespace env {
    export function get(key: string): string | undefined;
  }
  
  export function serve(handler: (req: Request) => Promise<Response>): void;
}
