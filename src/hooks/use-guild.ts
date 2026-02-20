import { createContext, useContext, useState, createElement } from 'react';

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
