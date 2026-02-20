import { createContext, useContext, useState, useEffect, createElement } from 'react';
import { db } from '@/lib/database';

const STORAGE_KEY = 'dashboard_guild_id';
const DEFAULT_GUILD_ID = '1234567890123456789';

interface GuildContextValue {
  guildId: string;
  setGuildId: (id: string) => void;
}

export const GuildContext = createContext<GuildContextValue>({
  guildId: DEFAULT_GUILD_ID,
  setGuildId: () => {},
});

export function GuildProvider({ children }: { children: React.ReactNode }) {
  const [guildId, setGuildIdState] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_GUILD_ID;
  });

  // Auto-create missing NeonDB tables on startup
  useEffect(() => {
    (db as any).neonQuery?.('ensureTables').catch(() => {});
    // Call via the db object's internal neonQuery
    fetch(
      `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/neon-query`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ action: 'ensureTables', params: {} }),
      }
    ).catch(() => {});
  }, []);

  const setGuildId = (id: string) => {
    const cleaned = id.trim();
    if (cleaned) {
      localStorage.setItem(STORAGE_KEY, cleaned);
      setGuildIdState(cleaned);
    }
  };

  return createElement(GuildContext.Provider, { value: { guildId, setGuildId } }, children);
}

export function useGuild() {
  return useContext(GuildContext);
}
