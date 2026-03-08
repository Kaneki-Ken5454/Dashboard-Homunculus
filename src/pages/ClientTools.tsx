import { useState, useEffect, useCallback } from 'react';
import { Monitor, RefreshCw, Trash2, Globe, Hash, Clock, BarChart2, Users, ShieldOff, Ban, ShieldCheck, Terminal, ChevronDown, ChevronUp, LogIn, Shield } from 'lucide-react';
import {
  getClientVisitors, getClientVisitorStats, clearClientVisitors,
  getClientFeatureFlags, setClientFeatureFlag,
  getClientSessions, revokeClientSession,
  apiCall as query,
  type ClientVisitor, type ClientVisitorStats, type ClientFeatureFlags, type ClientSession,
} from '../lib/db';

// ── Extra interfaces ──────────────────────────────────────────────────────────
interface LoginSession { id: number; discord_id: string; username: string; avatar_url: string | null; guild_id: string; is_admin: boolean; created_at: string; last_seen: string; expires_at: string; }
interface DashboardBan { id: number; discord_id: string; username: string; reason: string; banned_by: string; banned_at: string; }
interface CmdUsageLog { id: number; user_id: string; username: string; command: string; metadata: Record<string, unknown>; used_at: string; }
interface CmdStats {
  byCommand: { command: string; total_uses: number; unique_users: number }[];
  topUsers:  { user_id: string; username: string; uses: number }[];
}
const CMD_ICONS: Record<string, string> = { infoview: '📚', bossinfo: '👹', weakness: '🛡️', damage: '⚡' };
function fmtFull(ts: string): string {
  try { return new Date(ts).toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}); } catch { return '—'; }
}

// ── Feature definitions ───────────────────────────────────────────────────────
const FEATURES: Array<{ id: string; label: string; desc: string; icon: string }> = [
  { id: 'damage_calc',     label: 'Damage Calculator', desc: 'Full Gen 9 damage formula — attacker vs defender', icon: '⚡' },
  { id: 'weakness_lookup', label: 'Weakness Lookup',   desc: 'Type chart + base stats for any Pokémon',         icon: '🛡️' },
  { id: 'counter_calc',    label: 'Counter Calculator',desc: 'Raid simulation with Monte-Carlo battle engine',  icon: '👹' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function uaShort(ua: string | null): string {
  if (!ua) return '—';
  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Safari')) return 'Safari';
  if (ua.includes('Edge')) return 'Edge';
  if (ua.includes('bot') || ua.includes('Bot') || ua.includes('crawler')) return '🤖 Bot';
  return ua.slice(0, 28);
}
function fmtTime(ts: string): string {
  const d = new Date(ts);
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60_000)    return `${Math.floor(diff/1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff/60_000)}m ago`;
  if (diff < 86_400_000)return `${Math.floor(diff/3_600_000)}h ago`;
  return d.toLocaleDateString();
}
function pageLabel(page: string): string {
  const map: Record<string,string> = {
    '/':'Home', damage:'⚡ Damage', weakness:'🛡️ Weakness', counter:'👹 Counter',
  };
  return map[page] ?? page;
}

// ── Feature Toggle Card ───────────────────────────────────────────────────────
function FeatureToggle({ feature, flags, guildId, onToggle }: {
  feature: typeof FEATURES[0]; flags: ClientFeatureFlags|null;
  guildId: string; onToggle: (id:string, val:boolean)=>void;
}) {
  const [saving,  setSaving]  = useState(false);
  const [saveErr, setSaveErr] = useState('');
  const enabled = flags ? (flags[feature.id] ?? true) : true;

  const toggle = async () => {
    setSaving(true); setSaveErr('');
    try {
      await setClientFeatureFlag(guildId, feature.id, !enabled);
      onToggle(feature.id, !enabled);
    } catch (e: any) {
      setSaveErr(e.message || 'Save failed');
    }
    setSaving(false);
  };

  return (
    <div style={{
      display:'flex', alignItems:'center', gap:14, padding:'13px 16px',
      background:'var(--elevated)', border:`1px solid ${enabled?'rgba(59,165,93,.3)':'var(--border)'}`,
      borderRadius:10, transition:'border-color .2s', flexDirection:'column', alignItems:'stretch',
    }}>
      <div style={{display:'flex',alignItems:'center',gap:14}}>
        <span style={{fontSize:22,flexShrink:0}}>{feature.icon}</span>
        <div style={{flex:1}}>
          <div style={{fontSize:14,fontWeight:700,color:'var(--text)',marginBottom:2}}>{feature.label}</div>
          <div style={{fontSize:11,color:'var(--text-muted)'}}>{feature.desc}</div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
          <span style={{fontSize:11,color:enabled?'var(--success)':'var(--text-faint)',fontWeight:600}}>
            {saving ? '…' : enabled ? 'Enabled' : 'Disabled'}
          </span>
          <button onClick={toggle} disabled={saving} style={{
            appearance:'none', width:44, height:24, borderRadius:12, border:'none',
            cursor:saving?'wait':'pointer',
            background:enabled?'var(--success)':'var(--border)', position:'relative',
            transition:'background .2s', flexShrink:0,
          }}>
            <div style={{
              position:'absolute', left:enabled?22:2, top:2, width:20, height:20,
              borderRadius:'50%', background:'white', transition:'left .18s',
              boxShadow:'0 1px 4px rgba(0,0,0,.4)',
            }}/>
          </button>
        </div>
      </div>
      {saveErr && (
        <div style={{fontSize:11,color:'var(--danger)',background:'var(--danger-subtle)',borderRadius:5,padding:'4px 10px'}}>
          ⚠️ {saveErr}
        </div>
      )}
    </div>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon, color }: { label:string; value:string|number; icon:React.ReactNode; color:string }) {
  return (
    <div style={{background:'var(--elevated)',border:'1px solid var(--border)',borderRadius:10,padding:'14px 16px'}}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
        <span style={{color}}>{icon}</span>
        <span style={{fontSize:10,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'.07em'}}>{label}</span>
      </div>
      <div style={{fontSize:26,fontWeight:800,color:'var(--text)',fontFamily:"'JetBrains Mono',monospace"}}>{value}</div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ClientToolsPage({ guildId }: { guildId: string }) {
  const [visitors,   setVisitors]   = useState<ClientVisitor[]>([]);
  const [stats,      setStats]      = useState<ClientVisitorStats|null>(null);
  const [flags,      setFlags]      = useState<ClientFeatureFlags|null>(null);
  const [sessions,   setSessions]   = useState<ClientSession[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [clearing,   setClearing]   = useState(false);
  const [error,      setError]      = useState('');
  const [tab,        setTab]        = useState<'visitors'|'toggles'|'sessions'|'logins'|'bans'|'cmdlogs'>('visitors');
  const [loginSessions, setLoginSessions] = useState<LoginSession[]>([]);
  const [dashBans,    setDashBans]     = useState<DashboardBan[]>([]);
  const [banReason,   setBanReason]    = useState<Record<string,string>>({});
  const [cmdLogs,     setCmdLogs]     = useState<CmdUsageLog[]>([]);
  const [cmdStats,    setCmdStats]    = useState<CmdStats | null>(null);
  const [cmdFilter,   setCmdFilter]   = useState('all');
  const [cmdLoading,  setCmdLoading]  = useState(false);
  const [sessLoading, setSessLoading] = useState(false);
  const [banLoading,  setBanLoading]  = useState(false);
  const [search,     setSearch]     = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [v, s, f, sess] = await Promise.all([
        getClientVisitors(guildId, 200),
        getClientVisitorStats(guildId),
        getClientFeatureFlags(guildId),
        getClientSessions(guildId),
      ]);
      setVisitors(v); setStats(s); setFlags(f); setSessions(sess);
    } catch (e: any) {
      setError(e.message || 'Failed to load');
    }
    setLoading(false);
  }, [guildId]);

  useEffect(() => { load(); }, [load]);

  const loadLoginSessions = useCallback(async () => {
    setSessLoading(true);
    try { const rows = await query('getLoginSessions', {}); setLoginSessions(Array.isArray(rows)?rows:[]); } catch {}
    setSessLoading(false);
  }, []);

  const loadBans = useCallback(async () => {
    setBanLoading(true);
    try { const rows = await query('getDashboardBans', {}); setDashBans(Array.isArray(rows)?rows:[]); } catch {}
    setBanLoading(false);
  }, []);

  const loadCmdUsage = useCallback(async (filter = cmdFilter) => {
    setCmdLoading(true);
    try {
      const [logs, statsData] = await Promise.all([
        query('getCommandUsageLog', { guildId, command: filter === 'all' ? undefined : filter, limit: 100 }),
        query('getCommandUsageStats', { guildId }),
      ]);
      setCmdLogs(Array.isArray(logs) ? logs : []);
      setCmdStats(statsData as CmdStats);
    } catch {}
    setCmdLoading(false);
  }, [guildId, cmdFilter]);

  useEffect(() => { loadLoginSessions(); loadBans(); loadCmdUsage(); }, [guildId]);

  const handleBan = async (discordId: string, username: string) => {
    const reason = banReason[discordId] || '';
    if (!window.confirm(`Ban ${username} from the dashboard?`)) return;
    try {
      await query('banFromDashboard', { discordId, username, reason, bannedBy: 'admin' });
      await Promise.all([loadLoginSessions(), loadBans()]);
    } catch (e: any) { setError(e.message); }
  };

  const handleUnban = async (discordId: string) => {
    try { await query('unbanFromDashboard', { discordId }); await loadBans(); }
    catch (e: any) { setError(e.message); }
  };

  const handleClear = async () => {
    if (!window.confirm('Clear all visitor logs for this guild?')) return;
    setClearing(true);
    try { await clearClientVisitors(guildId); await load(); }
    catch (e: any) { setError(e.message); }
    setClearing(false);
  };

  const handleFlagToggle = (id: string, val: boolean) => {
    setFlags(prev => prev ? { ...prev, [id]: val } : { damage_calc:true, weakness_lookup:true, counter_calc:true, [id]:val });
  };

  const handleRevoke = async (id: number) => {
    if (!window.confirm('Revoke this session?')) return;
    try {
      await revokeClientSession(id);
      setSessions(s => s.filter(x => x.id !== id));
    } catch (e: any) { setError(e.message); }
  };

  const filtered = visitors.filter(v =>
    !search || (v.ip||'').includes(search) || (v.country||'').toLowerCase().includes(search.toLowerCase())
      || (v.user_agent||'').toLowerCase().includes(search.toLowerCase())
      || v.page.includes(search) || v.session_id.includes(search)
  );

  return (
    <div className="animate-fade" style={{ maxWidth: 960 }}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:20}}>
        <Monitor size={20} style={{color:'var(--primary)'}}/>
        <div>
          <h2 style={{fontSize:17,fontWeight:700,color:'var(--text)',margin:0}}>Client Tools Dashboard</h2>
          <p style={{fontSize:12,color:'var(--text-muted)',margin:'2px 0 0'}}>
            Visitor analytics, feature toggles and logged-in users for the public-facing tools site
          </p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading} style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:5}}>
          <RefreshCw size={12} style={{animation:loading?'spin 1s linear infinite':undefined}}/> Refresh
        </button>
      </div>

      {error && (
        <div style={{background:'var(--danger-subtle)',border:'1px solid var(--danger)',borderRadius:8,padding:'9px 14px',color:'var(--danger)',fontSize:13,marginBottom:14}}>
          {error}
        </div>
      )}

      {/* Stats row */}
      {stats && (
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:18}}>
          <StatCard label="Total Visits"   value={stats.total.toLocaleString()} icon={<Globe size={14}/>}    color="var(--primary)"/>
          <StatCard label="Last 24h"       value={stats.today.toLocaleString()} icon={<Clock size={14}/>}    color="var(--success)"/>
          <StatCard label="Unique Pages"   value={stats.byPage.length}          icon={<Hash size={14}/>}     color="var(--warning)"/>
          <StatCard label="Logged In Now"  value={sessions.length}              icon={<Users size={14}/>}    color="#c4b5fd"/>
        </div>
      )}

      {/* Mini breakdown row */}
      {stats && (stats.byPage.length > 0 || stats.byCountry.length > 0) && (
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:18}}>
          <div style={{background:'var(--elevated)',border:'1px solid var(--border)',borderRadius:10,padding:'12px 14px'}}>
            <div style={{fontSize:10,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:8}}>Top Pages</div>
            {stats.byPage.slice(0,5).map(p => (
              <div key={p.page} style={{display:'flex',alignItems:'center',gap:8,marginBottom:5}}>
                <span style={{fontSize:12,color:'var(--text)',flex:1}}>{pageLabel(p.page)}</span>
                <div style={{width:80,height:5,background:'rgba(255,255,255,.07)',borderRadius:3,overflow:'hidden'}}>
                  <div style={{width:`${(p.count/stats.byPage[0].count)*100}%`,height:'100%',background:'var(--primary)',borderRadius:3}}/>
                </div>
                <span style={{fontSize:11,color:'var(--text-muted)',minWidth:28,textAlign:'right',fontFamily:"'JetBrains Mono',monospace"}}>{p.count}</span>
              </div>
            ))}
          </div>
          <div style={{background:'var(--elevated)',border:'1px solid var(--border)',borderRadius:10,padding:'12px 14px'}}>
            <div style={{fontSize:10,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:8}}>Top Countries</div>
            {stats.byCountry.slice(0,5).map(c => (
              <div key={c.country} style={{display:'flex',alignItems:'center',gap:8,marginBottom:5}}>
                <span style={{fontSize:12,color:'var(--text)',flex:1}}>{c.country}</span>
                <div style={{width:80,height:5,background:'rgba(255,255,255,.07)',borderRadius:3,overflow:'hidden'}}>
                  <div style={{width:`${(c.count/stats.byCountry[0].count)*100}%`,height:'100%',background:'#c4b5fd',borderRadius:3}}/>
                </div>
                <span style={{fontSize:11,color:'var(--text-muted)',minWidth:28,textAlign:'right',fontFamily:"'JetBrains Mono',monospace"}}>{c.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sub-tabs */}
      <div style={{display:'flex',gap:0,borderBottom:'1px solid var(--border)',marginBottom:16,flexWrap:'wrap'}}>
        {([
          ['visitors','📋 Visitor Log'],
          ['toggles', '🎛️ Feature Toggles'],
          ['sessions','👤 Client Sessions'],
          ['logins',  '🔐 Login Log'],
          ['bans',    '🚫 Banned Users'],
          ['cmdlogs', '⚡ Command Usage'],
        ] as const).map(([id,label])=>(
          <button key={id} onClick={()=>setTab(id as any)}
            style={{padding:'8px 16px',background:'none',border:'none',cursor:'pointer',fontFamily:"'Lexend',sans-serif",
              color:tab===id?'var(--text)':'var(--text-muted)',fontSize:12,fontWeight:tab===id?700:400,
              borderBottom:tab===id?'2px solid var(--primary)':'2px solid transparent',transition:'all .15s'}}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Visitor log tab ─────────────────────────────────────────────────── */}
      {tab === 'visitors' && (
        <div>
          <div style={{display:'flex',gap:10,alignItems:'center',marginBottom:12,flexWrap:'wrap'}}>
            <input className="inp" style={{flex:1,minWidth:200,maxWidth:340}} placeholder="Search by IP, country, browser, page…"
              value={search} onChange={e=>setSearch(e.target.value)}/>
            <span style={{fontSize:11,color:'var(--text-faint)'}}>{filtered.length} of {visitors.length} rows</span>
            <button className="btn btn-danger btn-sm" onClick={handleClear} disabled={clearing||visitors.length===0}
              style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:5}}>
              <Trash2 size={12}/> {clearing?'Clearing…':'Clear All'}
            </button>
          </div>

          {loading ? (
            <div style={{textAlign:'center',padding:'32px 0',color:'var(--text-muted)',fontSize:13}}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div style={{textAlign:'center',padding:'48px 0',color:'var(--text-faint)'}}>
              <Globe size={36} style={{marginBottom:12,opacity:.3}}/>
              <div style={{fontSize:14,color:'var(--text-muted)',fontWeight:600,marginBottom:4}}>No visitor data yet</div>
              <div style={{fontSize:12}}>Visits from the public client dashboard will appear here automatically</div>
            </div>
          ) : (
            <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10,overflow:'hidden'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                <thead>
                  <tr style={{borderBottom:'1px solid var(--border)',background:'rgba(0,0,0,.2)'}}>
                    {['Time','IP','Country','Page','Browser','Referrer'].map(h=>(
                      <th key={h} style={{padding:'9px 12px',textAlign:'left',fontWeight:700,color:'var(--text-muted)',fontSize:10,textTransform:'uppercase',letterSpacing:'.06em',whiteSpace:'nowrap'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0,150).map((v,i)=>(
                    <tr key={v.id} className="data-row" style={{borderBottom:'1px solid rgba(255,255,255,.04)',background:i===0?'rgba(88,101,242,.04)':'transparent'}}>
                      <td style={{padding:'8px 12px',color:'var(--text-muted)',whiteSpace:'nowrap',fontFamily:"'JetBrains Mono',monospace",fontSize:11}}>{fmtTime(v.visited_at)}</td>
                      <td style={{padding:'8px 12px',fontFamily:"'JetBrains Mono',monospace",color:'var(--text)',fontSize:11}}>{v.ip||'—'}</td>
                      <td style={{padding:'8px 12px',color:'var(--text)'}}>{v.country||'—'}</td>
                      <td style={{padding:'8px 12px'}}>
                        <span style={{background:'var(--primary-subtle)',color:'var(--primary)',borderRadius:5,padding:'2px 8px',fontSize:11,fontWeight:600}}>{pageLabel(v.page)}</span>
                      </td>
                      <td style={{padding:'8px 12px',color:'var(--text-muted)',maxWidth:140,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{uaShort(v.user_agent)}</td>
                      <td style={{padding:'8px 12px',color:'var(--text-faint)',maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{v.referrer||'direct'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length > 150 && (
                <div style={{padding:'8px 12px',fontSize:11,color:'var(--text-faint)',borderTop:'1px solid var(--border)',textAlign:'center'}}>
                  Showing 150 of {filtered.length} results — refine your search to see more
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Feature toggles tab ─────────────────────────────────────────────── */}
      {tab === 'toggles' && (
        <div>
          <div style={{background:'rgba(88,101,242,.07)',border:'1px solid rgba(88,101,242,.2)',borderRadius:9,padding:'10px 14px',marginBottom:14,fontSize:12,color:'var(--text-muted)',lineHeight:1.6}}>
            <strong style={{color:'var(--text)'}}>These toggles control which tabs are visible on the public client dashboard.</strong>
            {' '}Changes take effect immediately — the client app checks feature flags on every page load.
            Disabled features hide the tab entirely and return a "currently unavailable" message.
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            {FEATURES.map(f => (
              <FeatureToggle key={f.id} feature={f} flags={flags} guildId={guildId} onToggle={handleFlagToggle}/>
            ))}
          </div>
          <div style={{marginTop:16,fontSize:11,color:'var(--text-faint)'}}>
            Client dashboard reads config from: <code style={{background:'rgba(255,255,255,.06)',padding:'2px 6px',borderRadius:4,fontFamily:"'JetBrains Mono',monospace"}}>GET /api/client/config?guild_id={guildId}</code>
          </div>
        </div>
      )}

      {/* ── Logged-in users tab ─────────────────────────────────────────────── */}
      {tab === 'sessions' && (
        <div>
          <div style={{background:'rgba(88,101,242,.07)',border:'1px solid rgba(88,101,242,.2)',borderRadius:9,padding:'10px 14px',marginBottom:14,fontSize:12,color:'var(--text-muted)',lineHeight:1.6}}>
            <strong style={{color:'var(--text)'}}>Users who logged in via Discord DM verification.</strong>
            {' '}Sessions are valid for 7 days. You can revoke any session immediately.
          </div>

          {loading ? (
            <div style={{textAlign:'center',padding:'32px 0',color:'var(--text-muted)',fontSize:13}}>Loading…</div>
          ) : sessions.length === 0 ? (
            <div style={{textAlign:'center',padding:'48px 0',color:'var(--text-faint)'}}>
              <Users size={36} style={{marginBottom:12,opacity:.3}}/>
              <div style={{fontSize:14,color:'var(--text-muted)',fontWeight:600,marginBottom:4}}>No active sessions</div>
              <div style={{fontSize:12}}>Users who log in via the client dashboard will appear here</div>
            </div>
          ) : (
            <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10,overflow:'hidden'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                <thead>
                  <tr style={{borderBottom:'1px solid var(--border)',background:'rgba(0,0,0,.2)'}}>
                    {['User','Discord ID','Last Seen','Login Date','Actions'].map(h=>(
                      <th key={h} style={{padding:'9px 12px',textAlign:'left',fontWeight:700,color:'var(--text-muted)',fontSize:10,textTransform:'uppercase',letterSpacing:'.06em'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s,i) => (
                    <tr key={s.id} className="data-row" style={{borderBottom:'1px solid rgba(255,255,255,.04)'}}>
                      <td style={{padding:'10px 12px'}}>
                        <div style={{display:'flex',alignItems:'center',gap:8}}>
                          <div style={{width:28,height:28,borderRadius:'50%',background:'linear-gradient(135deg,#5865f2,#7c3aed)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,color:'#fff',flexShrink:0}}>
                            {(s.username||'?')[0].toUpperCase()}
                          </div>
                          <span style={{fontSize:13,fontWeight:600,color:'var(--text)'}}>{s.username || `User ${s.discord_id.slice(-4)}`}</span>
                        </div>
                      </td>
                      <td style={{padding:'10px 12px',fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:'var(--text-muted)'}}>{s.discord_id}</td>
                      <td style={{padding:'10px 12px',color:'var(--text-muted)',fontSize:11}}>{fmtTime(s.last_seen)}</td>
                      <td style={{padding:'10px 12px',color:'var(--text-faint)',fontSize:11}}>{fmtTime(s.created_at)}</td>
                      <td style={{padding:'10px 12px'}}>
                        <button
                          onClick={() => handleRevoke(s.id)}
                          style={{display:'flex',alignItems:'center',gap:4,padding:'4px 9px',borderRadius:5,border:'1px solid var(--danger)',background:'var(--danger-subtle)',color:'var(--danger)',cursor:'pointer',fontSize:11,fontWeight:600}}>
                          <ShieldOff size={10}/> Revoke
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Login Log tab ───────────────────────────────────────────────────── */}
      {tab === 'logins' && (
        <div>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
            <div style={{fontSize:12,color:'var(--text-muted)'}}>All users who have authenticated via Discord OAuth. Sessions expire after 14 days.</div>
            <button className="btn btn-ghost btn-sm" onClick={loadLoginSessions} style={{display:'flex',alignItems:'center',gap:5}}><RefreshCw size={11}/> Refresh</button>
          </div>
          {sessLoading ? (
            <div style={{textAlign:'center',padding:'32px 0',color:'var(--text-muted)'}}>Loading…</div>
          ) : loginSessions.length === 0 ? (
            <div style={{textAlign:'center',padding:'48px 0',color:'var(--text-faint)'}}><LogIn size={32} style={{marginBottom:10,opacity:.3}}/><div>No active sessions</div></div>
          ) : (
            <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10,overflow:'hidden'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                <thead>
                  <tr style={{borderBottom:'1px solid var(--border)',background:'rgba(0,0,0,.2)'}}>
                    {['User','Discord ID','Access','Logged In','Last Seen','Expires','Actions'].map(h=>(
                      <th key={h} style={{padding:'9px 12px',textAlign:'left',fontWeight:700,color:'var(--text-muted)',fontSize:10,textTransform:'uppercase',letterSpacing:'.06em',whiteSpace:'nowrap'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loginSessions.map(s=>(
                    <tr key={s.id} className="data-row" style={{borderBottom:'1px solid rgba(255,255,255,.04)'}}>
                      <td style={{padding:'9px 12px'}}>
                        <div style={{display:'flex',alignItems:'center',gap:7}}>
                          {s.avatar_url?<img src={s.avatar_url} alt="" style={{width:24,height:24,borderRadius:'50%',objectFit:'cover'}}/>:<div style={{width:24,height:24,borderRadius:'50%',background:'linear-gradient(135deg,#5865f2,#7c3aed)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,color:'#fff',fontWeight:700}}>{(s.username||'?')[0].toUpperCase()}</div>}
                          <span style={{fontSize:13,fontWeight:600,color:'var(--text)'}}>{s.username}</span>
                        </div>
                      </td>
                      <td style={{padding:'9px 12px',fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:'var(--text-faint)'}}>{s.discord_id}</td>
                      <td style={{padding:'9px 12px'}}>
                        <span style={{padding:'2px 7px',borderRadius:5,fontSize:11,fontWeight:700,background:s.is_admin?'rgba(88,101,242,.18)':'rgba(59,165,93,.14)',color:s.is_admin?'#818cf8':'var(--success)',display:'flex',alignItems:'center',gap:3,width:'fit-content'}}>
                          {s.is_admin&&<Shield size={9}/>}{s.is_admin?'Admin':'Raider'}
                        </span>
                      </td>
                      <td style={{padding:'9px 12px',color:'var(--text-muted)',fontSize:11}}>{fmtFull(s.created_at)}</td>
                      <td style={{padding:'9px 12px',color:'var(--text-muted)',fontSize:11}}>{fmtFull(s.last_seen)}</td>
                      <td style={{padding:'9px 12px',color:'var(--text-faint)',fontSize:11}}>{fmtFull(s.expires_at)}</td>
                      <td style={{padding:'9px 12px'}}>
                        <div style={{display:'flex',gap:4}}>
                          {!s.is_admin&&(
                            <div style={{display:'flex',gap:4,alignItems:'center'}}>
                              <input className="inp" style={{width:120,fontSize:11,padding:'3px 7px'}} placeholder="Ban reason…"
                                value={banReason[s.discord_id]||''} onChange={e=>setBanReason(p=>({...p,[s.discord_id]:e.target.value}))}/>
                              <button onClick={()=>handleBan(s.discord_id,s.username)}
                                style={{display:'flex',alignItems:'center',gap:3,padding:'4px 9px',borderRadius:5,border:'1px solid var(--danger)',background:'var(--danger-subtle)',color:'var(--danger)',cursor:'pointer',fontSize:11,fontWeight:600,whiteSpace:'nowrap'}}>
                                <Ban size={10}/> Ban
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Banned Users tab ────────────────────────────────────────────────── */}
      {tab === 'bans' && (
        <div>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
            <div style={{fontSize:12,color:'var(--text-muted)'}}>Banned users cannot log in to the dashboard. Their sessions are immediately revoked.</div>
            <button className="btn btn-ghost btn-sm" onClick={loadBans} style={{display:'flex',alignItems:'center',gap:5}}><RefreshCw size={11}/> Refresh</button>
          </div>
          {banLoading ? (
            <div style={{textAlign:'center',padding:'32px 0',color:'var(--text-muted)'}}>Loading…</div>
          ) : dashBans.length === 0 ? (
            <div style={{textAlign:'center',padding:'48px 0',color:'var(--text-faint)'}}><ShieldCheck size={32} style={{marginBottom:10,opacity:.4}}/><div>No users banned</div></div>
          ) : (
            <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10,overflow:'hidden'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                <thead>
                  <tr style={{borderBottom:'1px solid var(--border)',background:'rgba(0,0,0,.2)'}}>
                    {['User','Discord ID','Reason','Banned By','Banned At','Actions'].map(h=>(
                      <th key={h} style={{padding:'9px 12px',textAlign:'left',fontWeight:700,color:'var(--text-muted)',fontSize:10,textTransform:'uppercase',letterSpacing:'.06em',whiteSpace:'nowrap'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dashBans.map(b=>(
                    <tr key={b.id} className="data-row" style={{borderBottom:'1px solid rgba(255,255,255,.04)'}}>
                      <td style={{padding:'9px 12px',fontSize:13,fontWeight:600,color:'var(--text)'}}>{b.username||'—'}</td>
                      <td style={{padding:'9px 12px',fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:'var(--text-faint)'}}>{b.discord_id}</td>
                      <td style={{padding:'9px 12px',color:'var(--text-muted)',fontSize:12}}>{b.reason||'No reason given'}</td>
                      <td style={{padding:'9px 12px',color:'var(--text-faint)',fontSize:11}}>{b.banned_by||'—'}</td>
                      <td style={{padding:'9px 12px',color:'var(--text-faint)',fontSize:11}}>{fmtFull(b.banned_at)}</td>
                      <td style={{padding:'9px 12px'}}>
                        <button onClick={()=>handleUnban(b.discord_id)}
                          style={{display:'flex',alignItems:'center',gap:3,padding:'4px 9px',borderRadius:5,border:'1px solid var(--success)',background:'rgba(59,165,93,.1)',color:'var(--success)',cursor:'pointer',fontSize:11,fontWeight:600}}>
                          <ShieldCheck size={10}/> Unban
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Command Usage tab ───────────────────────────────────────────────── */}
      {tab === 'cmdlogs' && (
        <div>
          <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:12,flexWrap:'wrap'}}>
            <Terminal size={14} style={{color:'var(--primary)'}}/>
            <span style={{fontSize:13,fontWeight:600,color:'var(--text)'}}>Bot Command Usage</span>
            <div style={{marginLeft:'auto',display:'flex',gap:6}}>
              {['all',...(cmdStats?.byCommand.map(r=>r.command)||[])].map(cmd=>(
                <button key={cmd} onClick={()=>{setCmdFilter(cmd);loadCmdUsage(cmd);}} style={{padding:'4px 10px',borderRadius:6,border:'1px solid var(--border)',background:cmdFilter===cmd?'rgba(88,101,242,.25)':'transparent',color:cmdFilter===cmd?'var(--primary)':'var(--text-muted)',cursor:'pointer',fontSize:11,fontFamily:"'Lexend',sans-serif"}}>
                  {cmd==='all'?'All':`${CMD_ICONS[cmd]||'⚡'} ${cmd}`}
                </button>
              ))}
              <button className="btn btn-ghost btn-sm" onClick={()=>loadCmdUsage()} style={{display:'flex',alignItems:'center',gap:4}}><RefreshCw size={11}/></button>
            </div>
          </div>
          {cmdStats && (
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:14}}>
              <div style={{background:'var(--elevated)',border:'1px solid var(--border)',borderRadius:10,padding:'12px 14px'}}>
                <div style={{fontSize:10,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:8}}>By Command</div>
                {cmdStats.byCommand.map(r=>(
                  <div key={r.command} style={{display:'flex',alignItems:'center',gap:8,marginBottom:5}}>
                    <span style={{fontSize:12,color:'var(--text)',flex:1}}>{CMD_ICONS[r.command]||'⚡'} {r.command}</span>
                    <div style={{width:80,height:5,background:'rgba(255,255,255,.07)',borderRadius:3,overflow:'hidden'}}>
                      <div style={{width:`${(r.total_uses/(cmdStats.byCommand[0]?.total_uses||1))*100}%`,height:'100%',background:'var(--primary)',borderRadius:3}}/>
                    </div>
                    <span style={{fontSize:11,color:'var(--text-muted)',minWidth:28,textAlign:'right',fontFamily:"'JetBrains Mono',monospace"}}>{r.total_uses}</span>
                  </div>
                ))}
              </div>
              <div style={{background:'var(--elevated)',border:'1px solid var(--border)',borderRadius:10,padding:'12px 14px'}}>
                <div style={{fontSize:10,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:8}}>Top Users</div>
                {cmdStats.topUsers.map(u=>(
                  <div key={u.user_id} style={{display:'flex',alignItems:'center',gap:8,marginBottom:5}}>
                    <span style={{fontSize:12,color:'var(--text)',flex:1}}>{u.username}</span>
                    <span style={{fontSize:11,color:'var(--text-muted)',fontFamily:"'JetBrains Mono',monospace"}}>{u.uses}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {cmdLoading ? (
            <div style={{textAlign:'center',padding:'24px',color:'var(--text-muted)'}}>Loading…</div>
          ) : cmdLogs.length === 0 ? (
            <div style={{textAlign:'center',padding:'40px',color:'var(--text-faint)'}}><Terminal size={28} style={{marginBottom:10,opacity:.3}}/><div>No command logs yet</div><div style={{fontSize:11,marginTop:4}}>Make sure ADMIN_API_URL is set in your bot .env</div></div>
          ) : (
            <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10,overflow:'hidden'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
                <thead>
                  <tr style={{borderBottom:'1px solid var(--border)',background:'rgba(0,0,0,.2)'}}>
                    {['Time','User','Command','Details'].map(h=>(
                      <th key={h} style={{padding:'9px 12px',textAlign:'left',fontWeight:700,color:'var(--text-muted)',fontSize:10,textTransform:'uppercase',letterSpacing:'.06em',whiteSpace:'nowrap'}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cmdLogs.map((log,i)=>(
                    <tr key={log.id} className="data-row" style={{borderBottom:'1px solid rgba(255,255,255,.04)',background:i===0?'rgba(88,101,242,.03)':'transparent'}}>
                      <td style={{padding:'8px 12px',color:'var(--text-muted)',fontSize:11,fontFamily:"'JetBrains Mono',monospace",whiteSpace:'nowrap'}}>{fmtFull(log.used_at)}</td>
                      <td style={{padding:'8px 12px'}}>
                        <span style={{fontSize:12,color:'var(--text)',fontWeight:500}}>{log.username||log.user_id}</span>
                        <span style={{fontSize:10,color:'var(--text-faint)',display:'block',fontFamily:"'JetBrains Mono',monospace"}}>{log.user_id}</span>
                      </td>
                      <td style={{padding:'8px 12px'}}>
                        <span style={{background:'var(--primary-subtle)',color:'var(--primary)',borderRadius:5,padding:'2px 8px',fontSize:11,fontWeight:600}}>{CMD_ICONS[log.command]||'⚡'} {log.command}</span>
                      </td>
                      <td style={{padding:'8px 12px',color:'var(--text-muted)',fontSize:11,maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                        {Object.entries(log.metadata||{}).map(([k,v])=>`${k}: ${v}`).join(' · ')||'—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
