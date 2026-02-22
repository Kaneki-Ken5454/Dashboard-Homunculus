import { useEffect, useState, useRef } from 'react';
import {
  LayoutDashboard, Settings, Users, Terminal, Zap,
  Ticket, Shield, Tag, BarChart2, BookOpen,
  RefreshCw, Server, Search, ChevronDown,
  Database, Loader2, LogOut,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { discoverAllGuildIds, isConfigured, setDatabaseUrl, type DiscoveredGuild } from './lib/db';
import Setup from './components/Setup';

import Overview     from './pages/Overview';
import SettingsPage from './pages/Settings';
import Members      from './pages/Members';
import Commands     from './pages/Commands';
import Triggers     from './pages/Triggers';
import Tickets      from './pages/Tickets';
import Moderation   from './pages/Moderation';
import Roles        from './pages/Roles';
import Votes        from './pages/Votes';
import InfoTopics   from './pages/InfoTopics';

type Page = 'overview'|'settings'|'members'|'commands'|'triggers'|'tickets'|'moderation'|'roles'|'votes'|'info';

const NAV: { id: Page; label: string; icon: LucideIcon }[] = [
  { id: 'overview',    label: 'Overview',      icon: LayoutDashboard },
  { id: 'settings',   label: 'Guild Settings', icon: Settings        },
  { id: 'members',    label: 'Members',        icon: Users           },
  { id: 'commands',   label: 'Commands',       icon: Terminal        },
  { id: 'triggers',   label: 'Triggers',       icon: Zap             },
  { id: 'tickets',    label: 'Tickets',        icon: Ticket          },
  { id: 'moderation', label: 'Moderation',     icon: Shield          },
  { id: 'roles',      label: 'Roles',          icon: Tag             },
  { id: 'votes',      label: 'Votes',          icon: BarChart2       },
  { id: 'info',       label: 'Info Topics',    icon: BookOpen        },
];

export default function App() {
  const [configured, setConfigured] = useState(isConfigured());

  if (!configured) {
    return <Setup onConnect={() => setConfigured(true)} />;
  }

  return <Dashboard onDisconnect={() => {
    setDatabaseUrl('');
    setConfigured(false);
  }} />;
}

function Dashboard({ onDisconnect }: { onDisconnect: () => void }) {
  const [page, setPage]             = useState<Page>('overview');
  const [guildId, setGuildId]       = useState('');
  const [guilds, setGuilds]         = useState<DiscoveredGuild[]>([]);
  const [discovering, setDiscovering] = useState(true);
  const [discoverErr, setDiscoverErr] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const pickerRef = useRef<HTMLDivElement>(null);

  const discover = () => {
    setDiscovering(true); setDiscoverErr('');
    discoverAllGuildIds()
      .then(list => {
        setGuilds(list);
        if (list.length > 0 && !guildId) setGuildId(list[0].guild_id);
      })
      .catch(e => setDiscoverErr((e as Error).message))
      .finally(() => setDiscovering(false));
  };

  useEffect(discover, []);

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  const filteredGuilds = pickerSearch
    ? guilds.filter(g => g.guild_id.includes(pickerSearch))
    : guilds;

  const currentNav = NAV.find(n => n.id === page)!;

  const PageComp = () => {
    if (!guildId) return (
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'60vh', gap:14, textAlign:'center' }}>
        <Database size={36} style={{ color:'var(--text-faint)' }} />
        <div style={{ color:'var(--text)', fontWeight:600, fontSize:16 }}>No guild selected</div>
        {discovering
          ? <div style={{ color:'var(--text-muted)', fontSize:13, display:'flex', alignItems:'center', gap:6 }}>
              <Loader2 size={14} style={{ animation:'spin 1s linear infinite' }} /> Scanning database…
            </div>
          : guilds.length === 0
            ? <div style={{ color:'var(--text-muted)', fontSize:13, maxWidth:380 }}>
                No guild IDs found in any table. Enter one manually using the selector in the sidebar.
                {discoverErr && <div style={{ color:'var(--danger)', marginTop:8, fontSize:12 }}>{discoverErr}</div>}
              </div>
            : <div style={{ color:'var(--text-muted)', fontSize:13 }}>Select a guild from the sidebar to continue</div>
        }
        <button className="btn btn-ghost" onClick={discover}><RefreshCw size={13} /> Re-scan</button>
      </div>
    );

    if (page === 'overview')    return <Overview     guildId={guildId} />;
    if (page === 'settings')    return <SettingsPage guildId={guildId} />;
    if (page === 'members')     return <Members      guildId={guildId} />;
    if (page === 'commands')    return <Commands     guildId={guildId} />;
    if (page === 'triggers')    return <Triggers     guildId={guildId} />;
    if (page === 'tickets')     return <Tickets      guildId={guildId} />;
    if (page === 'moderation')  return <Moderation   guildId={guildId} />;
    if (page === 'roles')       return <Roles        guildId={guildId} />;
    if (page === 'votes')       return <Votes        guildId={guildId} />;
    if (page === 'info')        return <InfoTopics   guildId={guildId} />;
    return null;
  };

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden' }}>

      {/* ── Sidebar ── */}
      <aside style={{ width:224, flexShrink:0, background:'#090a14', borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', overflow:'hidden' }}>

        {/* Logo */}
        <div style={{ padding:'18px 16px 14px', borderBottom:'1px solid var(--border)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:36, height:36, borderRadius:10, background:'linear-gradient(135deg,#5865f2,#7983f5)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <Server size={17} color="white" />
            </div>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:'var(--text)' }}>Bot Dashboard</div>
              <div style={{ fontSize:10, color:'var(--text-muted)' }}>Management Console</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex:1, overflowY:'auto', padding:'8px' }}>
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setPage(id)}
              className={page === id ? 'nav-active' : ''}
              style={{ width:'100%', display:'flex', alignItems:'center', gap:9, padding:'9px 10px', borderRadius:8, border:'none', cursor:'pointer', background:'none', color: page===id ? undefined : 'var(--text-muted)', fontSize:13, fontFamily:'Lexend, sans-serif', fontWeight:500, marginBottom:1, textAlign:'left', transition:'background 0.1s, color 0.1s' }}
              onMouseEnter={e => { if (page!==id) (e.currentTarget as HTMLElement).style.background='rgba(255,255,255,0.04)'; }}
              onMouseLeave={e => { if (page!==id) (e.currentTarget as HTMLElement).style.background='none'; }}
            >
              <Icon size={14} />{label}
            </button>
          ))}
        </nav>

        {/* Guild Picker */}
        <div style={{ padding:'10px 10px 14px', borderTop:'1px solid var(--border)' }}>
          <div style={{ fontSize:10, fontWeight:600, color:'var(--text-faint)', letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:6, paddingLeft:2 }}>Active Guild</div>
          <div ref={pickerRef} style={{ position:'relative' }}>
            <button onClick={() => setPickerOpen(o => !o)} style={{ width:'100%', display:'flex', alignItems:'center', gap:6, padding:'8px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--surface)', color:'var(--text)', cursor:'pointer', fontSize:12, fontFamily:'Lexend, sans-serif' }}>
              <Database size={11} style={{ color:'var(--text-muted)', flexShrink:0 }} />
              <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1, textAlign:'left', fontFamily:'JetBrains Mono, monospace', fontSize:11 }}>
                {discovering ? 'Scanning…' : guildId || 'Select guild…'}
              </span>
              {discovering
                ? <Loader2 size={11} style={{ color:'var(--text-faint)', flexShrink:0, animation:'spin 1s linear infinite' }} />
                : <ChevronDown size={11} style={{ color:'var(--text-muted)', flexShrink:0 }} />
              }
            </button>

            {pickerOpen && (
              <div style={{ position:'absolute', bottom:'calc(100% + 6px)', left:0, right:0, zIndex:50, background:'var(--elevated)', border:'1px solid var(--border)', borderRadius:10, padding:6, maxHeight:260, display:'flex', flexDirection:'column', boxShadow:'0 8px 32px rgba(0,0,0,0.7)' }}>
                <div style={{ position:'relative', marginBottom:6 }}>
                  <Search size={12} style={{ position:'absolute', left:8, top:'50%', transform:'translateY(-50%)', color:'var(--text-faint)' }} />
                  <input className="inp" autoFocus style={{ paddingLeft:26, fontSize:12, borderRadius:7 }} placeholder="Search or type guild ID…" value={pickerSearch} onChange={e => setPickerSearch(e.target.value)}
                    onKeyDown={e => { if (e.key==='Enter' && pickerSearch.trim()) { setGuildId(pickerSearch.trim()); setPickerSearch(''); setPickerOpen(false); } }} />
                </div>
                <div style={{ overflowY:'auto', flex:1 }}>
                  {filteredGuilds.length===0 && pickerSearch && (
                    <button onClick={() => { setGuildId(pickerSearch.trim()); setPickerSearch(''); setPickerOpen(false); }}
                      style={{ width:'100%', padding:'9px 10px', borderRadius:7, border:'none', background:'var(--primary-subtle)', color:'#818cf8', cursor:'pointer', fontSize:12, fontFamily:'Lexend, sans-serif', textAlign:'left' }}>
                      Use "{pickerSearch}" →
                    </button>
                  )}
                  {filteredGuilds.map(g => (
                    <button key={g.guild_id} onClick={() => { setGuildId(g.guild_id); setPickerSearch(''); setPickerOpen(false); }}
                      style={{ width:'100%', padding:'8px 10px', borderRadius:7, border:'none', background: g.guild_id===guildId ? 'var(--primary-subtle)' : 'transparent', color: g.guild_id===guildId ? '#818cf8' : 'var(--text)', cursor:'pointer', textAlign:'left', marginBottom:2 }}>
                      <div style={{ fontFamily:'JetBrains Mono, monospace', fontSize:11, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{g.guild_id}</div>
                      <div style={{ fontSize:10, color:'var(--text-muted)', fontFamily:'Lexend, sans-serif' }}>{g.source} · {g.count} rows</div>
                    </button>
                  ))}
                  {filteredGuilds.length===0 && !pickerSearch && (
                    <div style={{ padding:'12px 10px', color:'var(--text-muted)', fontSize:12, textAlign:'center' }}>No guilds found in DB</div>
                  )}
                </div>
                <div style={{ borderTop:'1px solid var(--border)', paddingTop:6, marginTop:4 }}>
                  <button onClick={() => { discover(); setPickerOpen(false); }}
                    style={{ width:'100%', padding:'7px 10px', borderRadius:7, border:'none', background:'none', color:'var(--text-muted)', cursor:'pointer', fontSize:12, fontFamily:'Lexend, sans-serif', display:'flex', alignItems:'center', gap:6, justifyContent:'center' }}>
                    <RefreshCw size={11} /> Re-scan all tables
                  </button>
                </div>
              </div>
            )}
          </div>

          {discoverErr && <div style={{ fontSize:10, color:'var(--danger)', marginTop:5, paddingLeft:2 }}>{discoverErr}</div>}
          {guilds.length > 0 && <div style={{ fontSize:10, color:'var(--text-faint)', marginTop:5, paddingLeft:2 }}>{guilds.length} guild{guilds.length!==1?'s':''} found</div>}

          {/* Disconnect */}
          <button onClick={onDisconnect} style={{ width:'100%', marginTop:10, display:'flex', alignItems:'center', gap:6, padding:'7px 10px', borderRadius:8, border:'1px solid var(--border)', background:'transparent', color:'var(--text-muted)', cursor:'pointer', fontSize:11, fontFamily:'Lexend, sans-serif' }}>
            <LogOut size={11} /> Change database
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <header style={{ height:56, flexShrink:0, borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 24px', background:'var(--bg)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            {(() => { const Icon = currentNav.icon; return <Icon size={16} style={{ color:'var(--text-muted)' }} />; })()}
            <div style={{ fontSize:14, fontWeight:700, color:'var(--text)' }}>{currentNav.label}</div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            {guildId && (
              <div style={{ fontFamily:'JetBrains Mono, monospace', fontSize:11, color:'var(--text-faint)', background:'var(--elevated)', padding:'4px 10px', borderRadius:6, border:'1px solid var(--border)' }}>{guildId}</div>
            )}
            <div style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:'var(--success)' }}>
              <div style={{ width:7, height:7, borderRadius:'50%', background:'var(--success)', boxShadow:'0 0 6px var(--success)' }} />
              NeonDB
            </div>
          </div>
        </header>
        <main style={{ flex:1, overflowY:'auto', padding:'22px 24px' }}>
          <PageComp />
        </main>
      </div>
    </div>
  );
}
