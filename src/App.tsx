import { useEffect, useState, useRef, useCallback } from 'react';
import {
  LayoutDashboard, Settings, Zap, Ticket, Shield, Tag, BarChart2, BookOpen,
  RefreshCw, Server, Search, ChevronDown, Database, Loader2, LogOut, Activity,
  ShieldBan, HelpCircle, Users, Swords, Monitor, ShieldCheck, Layers,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { discoverAllGuildIds, setSessionToken, clearSession, type DiscoveredGuild } from './lib/db';
import { useShowdownData } from './lib/engine_pokemon';
import Overview      from './pages/Overview';
import SettingsPage  from './pages/Settings';
import Triggers      from './pages/Triggers';
import Tickets       from './pages/Tickets';
import Moderation    from './pages/Moderation';
import Roles         from './pages/Roles';
import Votes         from './pages/Votes';
import InfoTopics    from './pages/InfoTopics';
import ActivityPage  from './pages/Activity';
import BlacklistPage from './pages/Blacklist';
import HelpPage      from './pages/Help';
import MembersPage   from './pages/Members';
import BossInfoPage  from './pages/BossInfo';
import ClientToolsPage from './pages/ClientTools';
import DamageCalcTool    from './pages/DamageCalcTool';
import WeaknessLookupTool from './pages/WeaknessLookupTool';
import CounterCalcTool   from './pages/CounterCalcTool';

export interface DiscordUser {
  discord_id: string; username: string; avatar_url: string | null;
  guild_id: string; is_admin: boolean;
  admin_guilds: { id: string; name: string; icon: string | null }[];
}
type AdminPage = 'overview'|'members'|'settings'|'triggers'|'tickets'|'moderation'|'roles'|'votes'|'info'|'activity'|'blacklist'|'help'|'bossinfo'|'clienttools';
type ToolPage  = 'damage'|'weakness'|'counter';
type Page      = AdminPage | ToolPage;

const ADMIN_NAV: { id: AdminPage; label: string; icon: LucideIcon }[] = [
  { id:'overview',    label:'Overview',     icon:LayoutDashboard },
  { id:'members',     label:'Members',      icon:Users           },
  { id:'settings',    label:'Settings',     icon:Settings        },
  { id:'triggers',    label:'Triggers',     icon:Zap             },
  { id:'tickets',     label:'Tickets',      icon:Ticket          },
  { id:'moderation',  label:'Moderation',   icon:Shield          },
  { id:'roles',       label:'Roles',        icon:Tag             },
  { id:'votes',       label:'Votes',        icon:BarChart2       },
  { id:'info',        label:'Info Topics',  icon:BookOpen        },
  { id:'activity',    label:'Activity',     icon:Activity        },
  { id:'blacklist',   label:'Blacklist',    icon:ShieldBan       },
  { id:'help',        label:'Help',         icon:HelpCircle      },
  { id:'bossinfo',    label:'BossInfo',     icon:Swords          },
  { id:'clienttools', label:'Client Tools', icon:Monitor         },
];
const TOOL_NAV: { id: ToolPage; label: string; icon: LucideIcon; desc: string }[] = [
  { id:'damage',   label:'Damage Calc',     icon:Zap,         desc:'Gen 9 damage formula' },
  { id:'weakness', label:'Weakness Lookup', icon:ShieldCheck, desc:'Type chart + stats'   },
  { id:'counter',  label:'Counter Calc',    icon:Swords,      desc:'Raid sim + Monte-Carlo' },
];

// ── Auth helpers ──────────────────────────────────────────────────────────────
const SESSION_KEY = 'hom_session';
function storedToken()        { try { return localStorage.getItem(SESSION_KEY)||''; } catch { return ''; } }
function saveToken(t:string)  { try { localStorage.setItem(SESSION_KEY,t); } catch {} }
function removeToken()        { try { localStorage.removeItem(SESSION_KEY); } catch {} }

// Returns { token, authError } from the URL, and strips both params from the address bar
function extractUrlParams(): { token: string; authError: string } {
  const p = new URLSearchParams(window.location.search);
  const token     = p.get('token')      || '';
  const authError = p.get('auth_error') || '';
  if (token || authError) {
    p.delete('token'); p.delete('auth_error');
    const qs = p.toString();
    window.history.replaceState({}, '', qs ? `?${qs}` : window.location.pathname);
  }
  return { token, authError: authError ? decodeURIComponent(authError) : '' };
}
// Kept for backward compat inside App
function extractUrlToken(): string { return extractUrlParams().token; }
async function verifySession(token:string):Promise<DiscordUser|null> {
  try {
    const r=await fetch(`/api/auth/me?token=${encodeURIComponent(token)}`,{signal:AbortSignal.timeout(8000)});
    const b=await r.json(); if(!b.ok) return null; return b as DiscordUser;
  } catch { return null; }
}
async function logoutSession(token:string) {
  try { await fetch('/api/auth/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})}); } catch {}
}

// ── User badge ────────────────────────────────────────────────────────────────
function UserBadge({user,onLogout}:{user:DiscordUser;onLogout:()=>void}) {
  return (
    <div style={{padding:'10px 12px',borderTop:'1px solid var(--border)',display:'flex',alignItems:'center',gap:10}}>
      {user.avatar_url ? (
        <img src={user.avatar_url} alt="" style={{width:30,height:30,borderRadius:'50%',flexShrink:0,objectFit:'cover'}}/>
      ) : (
        <div style={{width:30,height:30,borderRadius:'50%',background:'linear-gradient(135deg,#5865f2,#7c3aed)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:700,color:'#fff',flexShrink:0}}>
          {(user.username||'?')[0].toUpperCase()}
        </div>
      )}
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:12,fontWeight:600,color:'var(--text)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{user.username}</div>
        <div style={{fontSize:9,color:user.is_admin?'var(--success)':'var(--text-faint)',fontWeight:600,letterSpacing:'.04em'}}>
          {user.is_admin?'✓ SERVER ADMIN':'Battle Tools Access'}
        </div>
      </div>
      <button onClick={onLogout} title="Sign out" style={{background:'none',border:'none',cursor:'pointer',color:'var(--text-faint)',padding:4,display:'flex',borderRadius:6}}><LogOut size={13}/></button>
    </div>
  );
}

// ── Login Screen ──────────────────────────────────────────────────────────────
function LoginScreen({ initialError }: { initialError?: string }) {
  const [loading,       setLoading      ] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error,         setError        ] = useState(initialError || '');

  // Fix: when user clicks back from Discord/Google OAuth page the browser may
  // restore this page from the back-forward cache (bfcache) with loading=true.
  // Reset the spinner whenever the page becomes visible again.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) { setLoading(false); setGoogleLoading(false); }
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  const handleLogin = () => {
    setLoading(true);
    setError('');
    // Small delay so the spinner renders before navigation
    setTimeout(() => {
      window.location.href = `/api/auth/discord?return_to=${encodeURIComponent(window.location.origin)}`;
    }, 80);
  };

  const handleGoogleLogin = () => {
    setGoogleLoading(true);
    setError('');
    setTimeout(() => {
      window.location.href = `/api/auth/google?return_to=${encodeURIComponent(window.location.origin)}`;
    }, 80);
  };
  return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'var(--bg)',padding:24}}>
      <div style={{position:'fixed',top:'35%',left:'50%',transform:'translate(-50%,-50%)',width:700,height:700,borderRadius:'50%',pointerEvents:'none',background:'radial-gradient(circle,rgba(88,101,242,0.12) 0%,transparent 70%)'}}/>
      <div style={{width:'100%',maxWidth:420,position:'relative',zIndex:1}}>
        <div style={{textAlign:'center',marginBottom:36}}>
          <div style={{width:76,height:76,background:'linear-gradient(135deg,#5865f2,#7c3aed)',borderRadius:22,display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:38,marginBottom:18,boxShadow:'0 0 48px rgba(88,101,242,0.5),0 8px 32px rgba(0,0,0,0.4)'}}>⚔️</div>
          <div style={{fontSize:28,fontWeight:800,color:'#fff',letterSpacing:'-.02em',marginBottom:6}}>Homunculus</div>
          <div style={{fontSize:14,color:'var(--text-muted)'}}>Bot Management Dashboard</div>
        </div>
        <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:20,padding:'32px 28px',boxShadow:'0 24px 64px rgba(0,0,0,0.5)'}}>
          <div style={{fontSize:15,fontWeight:700,color:'var(--text)',marginBottom:10}}>Sign in to continue</div>
          <div style={{fontSize:13,color:'var(--text-muted)',lineHeight:1.75,marginBottom:22}}>
            Log in with Discord. <strong style={{color:'var(--text)'}}>Server admins</strong> (Manage Server permission) get full bot management. Everyone else accesses the <strong style={{color:'var(--text)'}}>Battle Tools</strong>.
          </div>
          <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:22}}>
            {['⚙️ Guild Management','🛡️ Moderation','🎟️ Tickets','⚡ Damage Calc','🛡 Weakness Lookup','👹 Counter Calc'].map(f=>(
              <span key={f} style={{fontSize:10,padding:'3px 9px',borderRadius:20,background:'var(--elevated)',border:'1px solid var(--border)',color:'var(--text-muted)',fontWeight:500}}>{f}</span>
            ))}
          </div>
          {error && (
            <div style={{marginBottom:16,padding:'10px 14px',borderRadius:8,background:'rgba(237,66,69,0.12)',border:'1px solid rgba(237,66,69,0.4)',color:'#f87171',fontSize:12,lineHeight:1.6}}>
              ⚠️ {error === 'access_denied'
                ? 'Authorization was cancelled. Please try again and click "Authorise" on the Discord screen.'
                : `Discord returned an error: ${error}. Please try again.`}
            </div>
          )}
          <button onClick={handleLogin} disabled={loading||googleLoading} style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:12,padding:'14px 20px',borderRadius:12,background:loading?'#4752c4':'#5865f2',border:'none',color:'#fff',fontSize:15,fontWeight:700,cursor:(loading||googleLoading)?'not-allowed':'pointer',fontFamily:"'Lexend',sans-serif",boxShadow:'0 4px 20px rgba(88,101,242,0.45)',transition:'all .15s',opacity:(loading||googleLoading)?0.8:1}}
            onMouseEnter={e=>{if(!loading&&!googleLoading){e.currentTarget.style.background='#4752c4';e.currentTarget.style.transform='translateY(-2px)';}}}
            onMouseLeave={e=>{if(!loading&&!googleLoading){e.currentTarget.style.background='#5865f2';e.currentTarget.style.transform='none';}}}>
            {loading ? (
              <>
                <div style={{width:18,height:18,border:'2.5px solid rgba(255,255,255,0.3)',borderTopColor:'#fff',borderRadius:'50%',animation:'spin 0.7s linear infinite',flexShrink:0}}/>
                Connecting to Discord…
              </>
            ) : (
              <>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>
                Continue with Discord
              </>
            )}
          </button>

          <div style={{display:'flex',alignItems:'center',gap:10,margin:'14px 0'}}>
            <div style={{flex:1,height:1,background:'var(--border)'}}/>
            <span style={{fontSize:11,color:'var(--text-faint)',fontWeight:500}}>OR</span>
            <div style={{flex:1,height:1,background:'var(--border)'}}/>
          </div>

          <button onClick={handleGoogleLogin} disabled={loading||googleLoading} style={{width:'100%',display:'flex',alignItems:'center',justifyContent:'center',gap:12,padding:'13px 20px',borderRadius:12,background:'var(--elevated)',border:'1px solid var(--border)',color:'var(--text)',fontSize:14,fontWeight:600,cursor:(loading||googleLoading)?'not-allowed':'pointer',fontFamily:"'Lexend',sans-serif",transition:'all .15s',opacity:(loading||googleLoading)?0.7:1}}
            onMouseEnter={e=>{if(!loading&&!googleLoading){e.currentTarget.style.background='rgba(255,255,255,0.07)';e.currentTarget.style.transform='translateY(-2px)';}}}
            onMouseLeave={e=>{if(!loading&&!googleLoading){e.currentTarget.style.background='var(--elevated)';e.currentTarget.style.transform='none';}}}>
            {googleLoading ? (
              <>
                <div style={{width:16,height:16,border:'2.5px solid rgba(255,255,255,0.3)',borderTopColor:'#fff',borderRadius:'50%',animation:'spin 0.7s linear infinite',flexShrink:0}}/>
                Connecting to Google…
              </>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                Continue with Google
              </>
            )}
          </button>

          <div style={{marginTop:14,fontSize:11,color:'var(--text-faint)',textAlign:'center',lineHeight:1.6}}>
            We request your username and profile info.<br/>No messages or private data are accessed.
          </div>
        </div>
        <div style={{textAlign:'center',marginTop:18,fontSize:11,color:'var(--text-faint)'}}>Homunculus · Discord &amp; Google OAuth 2.0</div>
      </div>
    </div>
  );
}

// ── Battle Tools View (regular users) ─────────────────────────────────────────
function BattleToolsDashboard({user,onLogout}:{user:DiscordUser;onLogout:()=>void}) {
  const sdState=useShowdownData();
  const [page,setPage]=useState<ToolPage>('damage');
  const cur=TOOL_NAV.find(t=>t.id===page)!;
  return (
    <div style={{display:'flex',height:'100vh',overflow:'hidden'}}>
      <aside style={{width:220,flexShrink:0,background:'#090a14',borderRight:'1px solid var(--border)',display:'flex',flexDirection:'column'}}>
        <div style={{padding:'18px 16px 14px',borderBottom:'1px solid var(--border)'}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <div style={{width:36,height:36,borderRadius:10,background:'linear-gradient(135deg,#5865f2,#7983f5)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:18}}>⚔️</div>
            <div>
              <div style={{fontSize:13,fontWeight:700,color:'var(--text)'}}>Homunculus</div>
              <div style={{fontSize:10,color:'var(--text-muted)'}}>Battle Tools</div>
            </div>
          </div>
        </div>
        <nav style={{flex:1,padding:'10px 8px'}}>
          <div style={{fontSize:9,fontWeight:700,color:'var(--text-faint)',textTransform:'uppercase',letterSpacing:'.08em',padding:'6px 8px',marginBottom:4}}>Tools</div>
          {TOOL_NAV.map(({id,label,icon:Icon,desc})=>{
            const active=page===id;
            return (
              <button key={id} onClick={()=>setPage(id)} style={{width:'100%',display:'flex',alignItems:'center',gap:9,padding:'9px 10px',borderRadius:7,border:'none',cursor:'pointer',textAlign:'left',background:active?'var(--primary-subtle)':'transparent',transition:'all .12s',marginBottom:2,fontFamily:"'Lexend',sans-serif"}}
                onMouseEnter={e=>{if(!active)e.currentTarget.style.background='rgba(255,255,255,.04)';}}
                onMouseLeave={e=>{if(!active)e.currentTarget.style.background='transparent';}}>
                <Icon size={14} style={{flexShrink:0,color:active?'#818cf8':'var(--text-faint)'}}/>
                <div>
                  <div style={{fontSize:12,fontWeight:active?700:500,color:active?'#e4e6ef':'var(--text-muted)'}}>{label}</div>
                  <div style={{fontSize:10,color:'var(--text-faint)',marginTop:1}}>{desc}</div>
                </div>
              </button>
            );
          })}
        </nav>
        <div style={{padding:'8px 12px',borderTop:'1px solid var(--border)'}}>
          <div style={{background:'rgba(0,0,0,.25)',borderRadius:7,padding:'6px 10px',display:'flex',alignItems:'center',gap:7}}>
            <div style={{width:6,height:6,borderRadius:'50%',flexShrink:0,background:sdState==='ready'?'var(--success)':sdState==='error'?'var(--danger)':'var(--warning)'}}/>
            <div style={{fontSize:10,color:'var(--text-muted)'}}>{sdState==='ready'?'Pokémon data ready':sdState==='loading'?'Loading data…':'Data load failed'}</div>
          </div>
        </div>
        <UserBadge user={user} onLogout={onLogout}/>
      </aside>
      <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
        <header style={{height:52,display:'flex',alignItems:'center',gap:12,padding:'0 24px',borderBottom:'1px solid var(--border)',background:'var(--surface)',flexShrink:0}}>
          <cur.icon size={15} style={{color:'var(--primary)'}}/>
          <span style={{fontSize:14,fontWeight:700,color:'var(--text)'}}>{cur.label}</span>
          {sdState==='loading'&&<div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:6,fontSize:11,color:'var(--text-muted)'}}><Loader2 size={11} style={{animation:'spin 1s linear infinite'}}/>Loading…</div>}
          {sdState==='ready'&&<div style={{marginLeft:'auto',fontSize:10,color:'var(--success)',display:'flex',alignItems:'center',gap:5}}><div style={{width:6,height:6,borderRadius:'50%',background:'var(--success)'}}/>Data ready</div>}
        </header>
        <main style={{flex:1,overflowY:'auto',padding:24}}>
          {page==='damage'  &&<DamageCalcTool sdState={sdState}/>}
          {page==='weakness'&&<WeaknessLookupTool/>}
          {page==='counter' &&<CounterCalcTool sdState={sdState} user={{username:user.username,discord_id:user.discord_id,avatar_url:user.avatar_url}}/>}
        </main>
      </div>
    </div>
  );
}

// ── Admin Dashboard ────────────────────────────────────────────────────────────
function AdminDashboard({user,onLogout}:{user:DiscordUser;onLogout:()=>void}) {
  const [page,setPage]=useState<Page>('overview');
  const [guildId,setGuildId]=useState(user.admin_guilds?.[0]?.id||'');
  const [dbGuilds,setDbGuilds]=useState<DiscoveredGuild[]>([]);
  const [discovering,setDiscovering]=useState(false);
  const [discoverErr,setDiscoverErr]=useState('');
  const [pickerOpen,setPickerOpen]=useState(false);
  const [pickerSearch,setPickerSearch]=useState('');
  const pickerRef=useRef<HTMLDivElement>(null);
  const sdState=useShowdownData();

  const discover=useCallback(()=>{
    setDiscovering(true);setDiscoverErr('');
    discoverAllGuildIds().then(list=>{setDbGuilds(list);if(list.length>0&&!guildId)setGuildId(list[0].guild_id);}).catch(e=>setDiscoverErr((e as Error).message)).finally(()=>setDiscovering(false));
  },[guildId]);
  useEffect(()=>{discover();},[]);
  useEffect(()=>{
    const fn=(e:MouseEvent)=>{if(pickerRef.current&&!pickerRef.current.contains(e.target as Node))setPickerOpen(false);};
    document.addEventListener('mousedown',fn); return ()=>document.removeEventListener('mousedown',fn);
  },[]);

  const oauthGuilds=user.admin_guilds||[];
  const fDbG=pickerSearch?dbGuilds.filter(g=>g.guild_id.includes(pickerSearch)):dbGuilds;
  const fOaG=pickerSearch?oauthGuilds.filter(g=>g.id.includes(pickerSearch)||g.name?.toLowerCase().includes(pickerSearch.toLowerCase())):oauthGuilds;
  const curAdminNav=ADMIN_NAV.find(n=>n.id===page);
  const curToolNav=TOOL_NAV.find(t=>t.id===page);
  const isAdminPage=!!curAdminNav;

  return (
    <div style={{display:'flex',height:'100vh',overflow:'hidden'}}>
      {/* Sidebar */}
      <aside style={{width:224,flexShrink:0,background:'#090a14',borderRight:'1px solid var(--border)',display:'flex',flexDirection:'column',overflow:'hidden'}}>
        <div style={{padding:'18px 16px 14px',borderBottom:'1px solid var(--border)'}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <div style={{width:36,height:36,borderRadius:10,background:'linear-gradient(135deg,#5865f2,#7983f5)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><Server size={17} color="white"/></div>
            <div>
              <div style={{fontSize:13,fontWeight:700,color:'var(--text)'}}>Bot Dashboard</div>
              <div style={{fontSize:10,color:'var(--text-muted)'}}>Admin Console</div>
            </div>
          </div>
        </div>
        <nav style={{flex:1,overflowY:'auto',padding:'8px'}}>
          <div style={{fontSize:9,fontWeight:700,color:'var(--text-faint)',textTransform:'uppercase',letterSpacing:'.08em',padding:'6px 10px 4px'}}>Management</div>
          {ADMIN_NAV.map(({id,label,icon:Icon})=>(
            <button key={id} onClick={()=>setPage(id)} className={page===id?'nav-active':''} style={{width:'100%',display:'flex',alignItems:'center',gap:9,padding:'8px 10px',borderRadius:8,border:'none',cursor:'pointer',background:'none',color:page===id?undefined:'var(--text-muted)',fontSize:12,fontFamily:'Lexend,sans-serif',fontWeight:500,marginBottom:1,textAlign:'left',transition:'background 0.1s'}}
              onMouseEnter={e=>{if(page!==id)(e.currentTarget as HTMLElement).style.background='rgba(255,255,255,0.04)';}}
              onMouseLeave={e=>{if(page!==id)(e.currentTarget as HTMLElement).style.background='none';}}><Icon size={13}/>{label}</button>
          ))}
          <div style={{fontSize:9,fontWeight:700,color:'var(--text-faint)',textTransform:'uppercase',letterSpacing:'.08em',padding:'10px 10px 4px'}}>Battle Tools</div>
          {TOOL_NAV.map(({id,label,icon:Icon})=>(
            <button key={id} onClick={()=>setPage(id)} className={page===id?'nav-active':''} style={{width:'100%',display:'flex',alignItems:'center',gap:9,padding:'8px 10px',borderRadius:8,border:'none',cursor:'pointer',background:'none',color:page===id?undefined:'var(--text-muted)',fontSize:12,fontFamily:'Lexend,sans-serif',fontWeight:500,marginBottom:1,textAlign:'left',transition:'background 0.1s'}}
              onMouseEnter={e=>{if(page!==id)(e.currentTarget as HTMLElement).style.background='rgba(255,255,255,0.04)';}}
              onMouseLeave={e=>{if(page!==id)(e.currentTarget as HTMLElement).style.background='none';}}><Icon size={13}/>{label}</button>
          ))}
        </nav>
        {/* Guild picker */}
        <div style={{padding:'10px 10px 8px',borderTop:'1px solid var(--border)'}}>
          <div style={{fontSize:10,fontWeight:600,color:'var(--text-faint)',letterSpacing:'0.08em',textTransform:'uppercase',marginBottom:6,paddingLeft:2}}>Active Guild</div>
          <div ref={pickerRef} style={{position:'relative'}}>
            <button onClick={()=>setPickerOpen(o=>!o)} style={{width:'100%',display:'flex',alignItems:'center',gap:6,padding:'8px 10px',borderRadius:8,border:'1px solid var(--border)',background:'var(--surface)',color:'var(--text)',cursor:'pointer',fontSize:11,fontFamily:'Lexend,sans-serif'}}>
              {(()=>{const og=oauthGuilds.find(g=>g.id===guildId);return og?.icon?<img src={`https://cdn.discordapp.com/icons/${og.id}/${og.icon}.png?size=20`} style={{width:15,height:15,borderRadius:3,flexShrink:0}} alt=""/>:<Database size={10} style={{color:'var(--text-muted)',flexShrink:0}}/>;})()}
              <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1,textAlign:'left'}}>
                {(()=>{const og=oauthGuilds.find(g=>g.id===guildId);return discovering?'Scanning…':og?.name||guildId||'Select guild…';})()}
              </span>
              {discovering?<Loader2 size={10} style={{color:'var(--text-faint)',flexShrink:0,animation:'spin 1s linear infinite'}}/>:<ChevronDown size={10} style={{color:'var(--text-muted)',flexShrink:0}}/>}
            </button>
            {pickerOpen&&(
              <div style={{position:'absolute',bottom:'calc(100% + 6px)',left:0,right:0,zIndex:50,background:'var(--elevated)',border:'1px solid var(--border)',borderRadius:10,padding:6,maxHeight:300,display:'flex',flexDirection:'column',boxShadow:'0 8px 32px rgba(0,0,0,0.7)'}}>
                <div style={{position:'relative',marginBottom:6}}>
                  <Search size={11} style={{position:'absolute',left:8,top:'50%',transform:'translateY(-50%)',color:'var(--text-faint)'}}/>
                  <input className="inp" autoFocus style={{paddingLeft:24,fontSize:11,borderRadius:6}} placeholder="Search or paste guild ID…" value={pickerSearch} onChange={e=>setPickerSearch(e.target.value)}
                    onKeyDown={e=>{if(e.key==='Enter'&&pickerSearch.trim()){setGuildId(pickerSearch.trim());setPickerSearch('');setPickerOpen(false);}}}/>
                </div>
                <div style={{overflowY:'auto',flex:1}}>
                  {fOaG.length>0&&(<>
                    <div style={{fontSize:9,fontWeight:700,color:'var(--text-faint)',textTransform:'uppercase',letterSpacing:'.07em',padding:'4px 8px 2px'}}>Your Servers</div>
                    {fOaG.map(g=>(
                      <button key={g.id} onClick={()=>{setGuildId(g.id);setPickerSearch('');setPickerOpen(false);}} style={{width:'100%',padding:'7px 8px',borderRadius:6,border:'none',background:g.id===guildId?'var(--primary-subtle)':'transparent',color:g.id===guildId?'#818cf8':'var(--text)',cursor:'pointer',textAlign:'left',marginBottom:2,display:'flex',alignItems:'center',gap:8}}>
                        {g.icon?<img src={`https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png?size=28`} style={{width:18,height:18,borderRadius:4,flexShrink:0}} alt=""/>:<div style={{width:18,height:18,borderRadius:4,background:'var(--border)',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:8,color:'var(--text-faint)'}}>{(g.name||'?')[0]}</div>}
                        <div><div style={{fontSize:11,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:130}}>{g.name||g.id}</div><div style={{fontSize:9,color:'var(--text-faint)',fontFamily:'JetBrains Mono,monospace'}}>{g.id}</div></div>
                      </button>
                    ))}
                  </>)}
                  {fDbG.length>0&&(<>
                    <div style={{fontSize:9,fontWeight:700,color:'var(--text-faint)',textTransform:'uppercase',letterSpacing:'.07em',padding:'6px 8px 2px'}}>In Database</div>
                    {fDbG.map(g=>(
                      <button key={g.guild_id} onClick={()=>{setGuildId(g.guild_id);setPickerSearch('');setPickerOpen(false);}} style={{width:'100%',padding:'7px 8px',borderRadius:6,border:'none',background:g.guild_id===guildId?'var(--primary-subtle)':'transparent',color:g.guild_id===guildId?'#818cf8':'var(--text)',cursor:'pointer',textAlign:'left',marginBottom:2}}>
                        <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:10}}>{g.guild_id}</div>
                        <div style={{fontSize:9,color:'var(--text-muted)'}}>{g.source} · {g.count} rows</div>
                      </button>
                    ))}
                  </>)}
                  {fDbG.length===0&&fOaG.length===0&&pickerSearch&&(
                    <button onClick={()=>{setGuildId(pickerSearch.trim());setPickerSearch('');setPickerOpen(false);}} style={{width:'100%',padding:'9px 10px',borderRadius:7,border:'none',background:'var(--primary-subtle)',color:'#818cf8',cursor:'pointer',fontSize:12,fontFamily:'Lexend,sans-serif',textAlign:'left'}}>Use "{pickerSearch}" →</button>
                  )}
                </div>
                <div style={{borderTop:'1px solid var(--border)',paddingTop:6,marginTop:4}}>
                  <button onClick={()=>{discover();setPickerOpen(false);}} style={{width:'100%',padding:'6px 10px',borderRadius:6,border:'none',background:'none',color:'var(--text-muted)',cursor:'pointer',fontSize:11,fontFamily:'Lexend,sans-serif',display:'flex',alignItems:'center',gap:5,justifyContent:'center'}}><RefreshCw size={10}/>Re-scan database</button>
                </div>
              </div>
            )}
          </div>
          {discoverErr&&<div style={{fontSize:10,color:'var(--danger)',marginTop:4,paddingLeft:2}}>{discoverErr}</div>}
        </div>
        <UserBadge user={user} onLogout={onLogout}/>
      </aside>
      {/* Main */}
      <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>
        <header style={{height:52,flexShrink:0,borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 24px',background:'var(--bg)'}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            {isAdminPage?(()=>{const Icon=curAdminNav!.icon;return<Icon size={14} style={{color:'var(--text-muted)'}}/>;})():(()=>{const Icon=curToolNav?.icon||Layers;return<Icon size={14} style={{color:'var(--primary)'}}/>;})()}
            <span style={{fontSize:14,fontWeight:700,color:'var(--text)'}}>{isAdminPage?curAdminNav!.label:curToolNav?.label}</span>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            {guildId&&isAdminPage&&<div style={{fontFamily:'JetBrains Mono,monospace',fontSize:10,color:'var(--text-faint)',background:'var(--elevated)',padding:'3px 9px',borderRadius:5,border:'1px solid var(--border)'}}>{guildId}</div>}
            <div style={{display:'flex',alignItems:'center',gap:5,fontSize:11,color:'var(--success)'}}><div style={{width:6,height:6,borderRadius:'50%',background:'var(--success)',boxShadow:'0 0 5px var(--success)'}}/>Admin</div>
          </div>
        </header>
        <main style={{flex:1,overflowY:'auto',padding:'22px 24px'}}>
          {page==='overview'   &&<Overview     guildId={guildId}/>}
          {page==='members'    &&<MembersPage  guildId={guildId}/>}
          {page==='settings'   &&<SettingsPage guildId={guildId}/>}
          {page==='triggers'   &&<Triggers     guildId={guildId}/>}
          {page==='tickets'    &&<Tickets      guildId={guildId}/>}
          {page==='moderation' &&<Moderation   guildId={guildId}/>}
          {page==='roles'      &&<Roles        guildId={guildId}/>}
          {page==='votes'      &&<Votes        guildId={guildId}/>}
          {page==='info'       &&<InfoTopics   guildId={guildId}/>}
          {page==='activity'   &&<ActivityPage guildId={guildId}/>}
          {page==='blacklist'  &&<BlacklistPage guildId={guildId}/>}
          {page==='help'       &&<HelpPage     guildId={guildId}/>}
          {page==='bossinfo'   &&<BossInfoPage  guildId={guildId}/>}
          {page==='clienttools'&&<ClientToolsPage guildId={guildId}/>}
          {page==='damage'  &&<DamageCalcTool sdState={sdState}/>}
          {page==='weakness'&&<WeaknessLookupTool/>}
          {page==='counter' &&<CounterCalcTool sdState={sdState} user={{username:user.username,discord_id:user.discord_id,avatar_url:user.avatar_url}}/>}
        </main>
      </div>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [user,setUser]        =useState<DiscordUser|null>(null);
  const [token,setToken]      =useState('');
  const [authChecked,setDone] =useState(false);
  const [loginError,setLoginError] =useState('');

  useEffect(()=>{
    let cancelled=false;
    async function init(){
      const { token: urlToken, authError } = extractUrlParams();
      if (authError) { setLoginError(authError); setDone(true); return; }
      const checkToken = urlToken || storedToken();
      if(checkToken){ saveToken(checkToken); setSessionToken(checkToken);
        const u=await verifySession(checkToken);
        if(!cancelled){if(u){setUser(u);setToken(checkToken);}else{removeToken();clearSession();}}
      }
      if(!cancelled)setDone(true);
    }
    init(); return()=>{cancelled=true;};
  },[]);

  const handleLogout=async()=>{await logoutSession(token);removeToken();clearSession();setUser(null);setToken('');};

  if(!authChecked)return<div style={{display:'flex',height:'100vh',alignItems:'center',justifyContent:'center',background:'var(--bg)'}}><Loader2 size={28} style={{animation:'spin 1s linear infinite',color:'var(--primary)'}}/></div>;
  if(!user)return<LoginScreen initialError={loginError}/>;
  if(user.is_admin)return<AdminDashboard user={user} onLogout={handleLogout}/>;
  return<BattleToolsDashboard user={user} onLogout={handleLogout}/>;
}
