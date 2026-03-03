import { useState, useEffect, useCallback, useRef } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────

interface BossStats { hp:number; atk:number; def:number; spa:number; spd:number; spe:number }
interface BossWeakness { quad:string[]; double:string[]; half:string[]; quarter:string[]; immune:string[] }
interface BossMove { level?:number; name:string; type:string; category:string; base_power:number; accuracy:string|number|boolean; stab?:boolean; z_power?:number; score?:number }
interface BossAnalysis {
  name:string; types:string[]; stats:BossStats; bst:number; abilities:string[];
  tier:string; role:string; weaknesses:BossWeakness; tera_weaknesses?:BossWeakness; tera_type?:string;
  level_moves:BossMove[]; top_moves:BossMove[]; atk_stat:number; spa_stat:number;
}
interface DamageResult {
  error?:string|null; immune?:boolean;
  min_pct:number; max_pct:number; min_dmg:number; max_dmg:number; defender_hp:number;
  effectiveness:number; stab:boolean; ohko:boolean; two_hko:boolean;
  hits_to_ko:[number,number]; category:string; move_type:string;
  attacker_speed:number; defender_speed:number; is_z:boolean;
}
interface CounterResult {
  error?:string|null; verdict:string; verdict_desc:string; faster:string;
  attacker_speed:number; defender_speed:number;
  atk_move:string; atk_min_pct:number; atk_max_pct:number;
  def_move:string; def_min_pct:number; def_max_pct:number;
  def_survives_1:boolean; def_survives_2:boolean;
  attacker:string; defender:string;
}
interface BestCounter extends CounterResult { candidate:string; score:number }

// ── Constants ────────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string,string> = {
  Fire:'#FF4422',Water:'#3399FF',Grass:'#33CC44',Electric:'#FFCC00',Ice:'#66CCFF',
  Fighting:'#CC3300',Poison:'#993399',Ground:'#CCAA55',Flying:'#88AAFF',Psychic:'#FF5599',
  Bug:'#AABB22',Rock:'#BBAA66',Ghost:'#664477',Dragon:'#7744FF',Dark:'#554433',
  Steel:'#AAAABB',Fairy:'#FFAACC',Normal:'#AAAA88',
};
const VALID_TYPES = Object.keys(TYPE_COLORS);
const TABS = ['Stats','Weaknesses','Level Moves','Top Moves'] as const;
type Tab = typeof TABS[number];

function formatAccuracy(accuracy: string | number | boolean) {
  return accuracy === 'always' || accuracy === true ? 'always' : `${accuracy}%`;
}

// ── API helpers ──────────────────────────────────────────────────────────────

async function apiFetch(path: string): Promise<any> {
  const r = await fetch(`/api${path}`);
  return r.json();
}

// ── Small components ─────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: string }) {
  const bg = TYPE_COLORS[type] || '#666';
  return (
    <span style={{ background: bg, color: '#fff', borderRadius: 4, padding: '2px 8px', fontSize: 12, fontWeight: 600 }}>
      {type}
    </span>
  );
}

function StatBar({ label, value, max = 255 }: { label: string; value: number; max?: number }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  const color = pct > 70 ? '#3BA55D' : pct > 40 ? '#FAA81A' : '#ED4245';
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
      <span style={{ width:32, fontSize:12, color:'#aaa', textAlign:'right' }}>{label}</span>
      <div style={{ flex:1, height:10, background:'#1e2124', borderRadius:5, overflow:'hidden' }}>
        <div style={{ width:`${pct}%`, height:'100%', background:color, borderRadius:5, transition:'width 0.3s' }} />
      </div>
      <span style={{ width:30, fontSize:12, color:'#fff', textAlign:'right', fontWeight:600 }}>{value}</span>
    </div>
  );
}

function DmgBar({ pct }: { pct: number }) {
  const color = pct >= 100 ? '#ED4245' : pct >= 50 ? '#FAA81A' : '#5865F2';
  return (
    <div style={{ height:8, background:'#1e2124', borderRadius:4, overflow:'hidden', marginTop:4 }}>
      <div style={{ width:`${Math.min(100,pct)}%`, height:'100%', background:color, transition:'width 0.3s' }} />
    </div>
  );
}

function VerdictBadge({ verdict }: { verdict: string }) {
  const colors: Record<string,string> = {
    'Strong Counter':'#3BA55D','Soft Check':'#FAA81A','Speed Check':'#5865F2','Bad Matchup':'#ED4245',
  };
  return (
    <span style={{ background: colors[verdict] || '#666', color:'#fff', borderRadius:4, padding:'3px 10px', fontWeight:700, fontSize:13 }}>
      {verdict}
    </span>
  );
}

function Spinner() {
  return <div style={{ display:'inline-block', width:20, height:20, border:'3px solid #444', borderTopColor:'#5865F2', borderRadius:'50%', animation:'spin 0.7s linear infinite' }} />;
}

// ── Autocomplete input ────────────────────────────────────────────────────────

function AutoInput({ label, value, onChange, placeholder }: { label:string; value:string; onChange:(v:string)=>void; placeholder?:string }) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [show, setShow] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>|null>(null);

  const handleChange = (v: string) => {
    onChange(v);
    if (timer.current) clearTimeout(timer.current);
    if (v.length < 2) { setSuggestions([]); return; }
    timer.current = setTimeout(async () => {
      const data = await apiFetch(`/bossinfo/search?q=${encodeURIComponent(v)}`);
      setSuggestions(data.results || []);
      setShow(true);
    }, 250);
  };

  return (
    <div style={{ position:'relative', flex:1 }}>
      <label style={{ display:'block', fontSize:12, color:'#aaa', marginBottom:4 }}>{label}</label>
      <input
        value={value}
        onChange={e => handleChange(e.target.value)}
        onBlur={() => setTimeout(() => setShow(false), 150)}
        onFocus={() => suggestions.length > 0 && setShow(true)}
        placeholder={placeholder}
        style={{ width:'100%', padding:'8px 10px', background:'#1e2124', border:'1px solid #3f4147', borderRadius:6, color:'#fff', fontSize:14, boxSizing:'border-box' }}
      />
      {show && suggestions.length > 0 && (
        <div style={{ position:'absolute', top:'100%', left:0, right:0, background:'#2b2d31', border:'1px solid #3f4147', borderRadius:6, zIndex:100, maxHeight:200, overflowY:'auto' }}>
          {suggestions.map(s => (
            <div key={s}
              onMouseDown={() => { onChange(s); setShow(false); setSuggestions([]); }}
              style={{ padding:'7px 12px', cursor:'pointer', fontSize:13 }}
              onMouseEnter={e => (e.currentTarget.style.background='#383a40')}
              onMouseLeave={e => (e.currentTarget.style.background='transparent')}
            >{s}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Stats tab ─────────────────────────────────────────────────────────────────

function StatsTab({ data }: { data: BossAnalysis }) {
  const primary = data.types[0];
  const border = TYPE_COLORS[primary] || '#5865F2';
  return (
    <div style={{ display:'flex', gap:20, flexWrap:'wrap' }}>
      <div style={{ flex:1, minWidth:220, background:'#1e2124', borderLeft:`4px solid ${border}`, borderRadius:8, padding:16 }}>
        <div style={{ fontSize:13, color:'#aaa', marginBottom:8 }}>Base Stats  <span style={{ color:'#fff', fontWeight:700 }}>BST {data.bst}</span></div>
        <StatBar label="HP"  value={data.stats.hp} />
        <StatBar label="Atk" value={data.stats.atk} />
        <StatBar label="Def" value={data.stats.def} />
        <StatBar label="SpA" value={data.stats.spa} />
        <StatBar label="SpD" value={data.stats.spd} />
        <StatBar label="Spe" value={data.stats.spe} />
      </div>
      <div style={{ flex:1, minWidth:200, display:'flex', flexDirection:'column', gap:12 }}>
        <div style={{ background:'#1e2124', borderRadius:8, padding:16 }}>
          <div style={{ fontSize:13, color:'#aaa', marginBottom:8 }}>Types</div>
          <div style={{ display:'flex', gap:6 }}>
            {data.types.map(t => <TypeBadge key={t} type={t} />)}
          </div>
        </div>
        <div style={{ background:'#1e2124', borderRadius:8, padding:16 }}>
          <div style={{ fontSize:13, color:'#aaa', marginBottom:6 }}>Tier / Role</div>
          <div style={{ fontWeight:700 }}>{data.tier}</div>
          <div style={{ fontSize:13, color:'#aaa', marginTop:4 }}>{data.role}</div>
        </div>
        <div style={{ background:'#1e2124', borderRadius:8, padding:16 }}>
          <div style={{ fontSize:13, color:'#aaa', marginBottom:6 }}>Abilities</div>
          {data.abilities.map(a => <div key={a} style={{ fontSize:13, marginBottom:2 }}>{a}</div>)}
        </div>
      </div>
    </div>
  );
}

// ── Weakness tab ──────────────────────────────────────────────────────────────

function WeaknessTab({ data, teraType }: { data: BossAnalysis; teraType?: string }) {
  const chart = teraType && data.tera_weaknesses ? data.tera_weaknesses : data.weaknesses;
  const sections: {key:keyof BossWeakness; label:string; color:string}[] = [
    { key:'quad',   label:'4x Weak',        color:'#ED4245' },
    { key:'double', label:'2x Weak',        color:'#FAA81A' },
    { key:'half',   label:'Resists (0.5x)', color:'#3BA55D' },
    { key:'quarter',label:'Resists (0.25x)',color:'#23a55a' },
    { key:'immune', label:'Immune',         color:'#4f545c' },
  ];
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      {teraType && <div style={{ background:'#383a40', borderRadius:6, padding:'8px 12px', fontSize:13 }}>
        Showing Tera: <TypeBadge type={teraType} /> type matchups
      </div>}
      {sections.map(s => chart[s.key]?.length > 0 && (
        <div key={s.key} style={{ background:'#1e2124', borderRadius:8, padding:14 }}>
          <div style={{ fontSize:12, color:s.color, fontWeight:700, marginBottom:8 }}>{s.label}</div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
            {chart[s.key].map(t => <TypeBadge key={t} type={t} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Level Moves tab ───────────────────────────────────────────────────────────

function LevelMovesTab({ data }: { data: BossAnalysis }) {
  const moves = data.level_moves;
  if (!moves?.length) return <div style={{ color:'#aaa', padding:20 }}>No level-up moves found in Showdown learnset.</div>;
  return (
    <div style={{ overflowX:'auto' }}>
      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
        <thead>
          <tr style={{ background:'#1e2124' }}>
            {['Level','Move','Type','Category','BP','Accuracy'].map(h => (
              <th key={h} style={{ padding:'8px 12px', textAlign:'left', color:'#aaa', fontWeight:600 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {moves.map((m, i) => (
            <tr key={i} style={{ background: i%2===0 ? '#2b2d31' : '#313338', borderBottom:'1px solid #1e2124' }}>
              <td style={{ padding:'7px 12px', color:'#aaa' }}>Lv {m.level}</td>
              <td style={{ padding:'7px 12px', fontWeight:600 }}>{m.name}</td>
              <td style={{ padding:'7px 12px' }}><TypeBadge type={m.type} /></td>
              <td style={{ padding:'7px 12px' }}>{m.category}</td>
              <td style={{ padding:'7px 12px' }}>{m.base_power || '-'}</td>
              <td style={{ padding:'7px 12px' }}>{formatAccuracy(m.accuracy)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Top Moves tab ─────────────────────────────────────────────────────────────

function TopMovesTab({ data }: { data: BossAnalysis }) {
  const moves = data.top_moves;
  if (!moves?.length) return <div style={{ color:'#aaa', padding:20 }}>No qualifying moves found.</div>;
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      <div style={{ fontSize:13, color:'#aaa' }}>
        Atk @ 252 EVs: <strong>{data.atk_stat}</strong>  |  SpA @ 252 EVs: <strong>{data.spa_stat}</strong>
        <span style={{ marginLeft:12, color:'#555' }}>Ranked by BP x STAB x Attacking Stat</span>
      </div>
      {moves.map((m, i) => (
        <div key={i} style={{ background:'#1e2124', borderRadius:8, padding:14, display:'flex', gap:16, alignItems:'center' }}>
          <div style={{ fontSize:22, color:'#5865F2', fontWeight:800, width:28, textAlign:'center' }}>#{i+1}</div>
          <div style={{ flex:1 }}>
            <div style={{ fontWeight:700, marginBottom:4 }}>
              {m.name}
              {m.stab && <span style={{ marginLeft:8, fontSize:11, background:'#5865F2', color:'#fff', borderRadius:3, padding:'1px 6px' }}>STAB</span>}
            </div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', fontSize:12 }}>
              <TypeBadge type={m.type} />
              <span style={{ color:'#aaa' }}>{m.category}</span>
              <span style={{ color:'#aaa' }}>BP: <strong style={{color:'#fff'}}>{m.base_power}</strong></span>
              <span style={{ color:'#aaa' }}>Z: <strong style={{color:'#fff'}}>{m.z_power}</strong></span>
              <span style={{ color:'#aaa' }}>Acc: <strong style={{color:'#fff'}}>{formatAccuracy(m.accuracy)}</strong></span>
            </div>
          </div>
          <div style={{ textAlign:'right', fontSize:12 }}>
            <div style={{ color:'#aaa' }}>Score</div>
            <div style={{ fontWeight:700, fontSize:16 }}>{m.score?.toFixed(0)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Damage section ────────────────────────────────────────────────────────────

function DamageSection() {
  const [atk, setAtk]   = useState('');
  const [def, setDef]   = useState('');
  const [mv,  setMv]    = useState('');
  const [zmove, setZ]   = useState(false);
  const [res, setRes]   = useState<DamageResult|null>(null);
  const [loading, setL] = useState(false);
  const [err, setErr]   = useState('');

  const run = async () => {
    if (!atk || !def || !mv) return setErr('All three fields required');
    setL(true); setErr(''); setRes(null);
    const q = `/bossinfo/damage?attacker=${encodeURIComponent(atk)}&defender=${encodeURIComponent(def)}&move=${encodeURIComponent(mv)}&zmove=${zmove}`;
    const data = await apiFetch(q);
    setL(false);
    if (data.error) setErr(data.error);
    else setRes(data);
  };

  const ko = res ? (res.min_pct >= 100 ? 'Guaranteed OHKO' : res.max_pct >= 100 ? 'Possible OHKO' : res.min_pct >= 50 ? 'Guaranteed 2HKO' : res.max_pct >= 50 ? 'Possible 2HKO' : '3HKO+') : '';

  return (
    <div>
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:16, alignItems:'flex-end' }}>
        <AutoInput label="Attacker" value={atk} onChange={setAtk} placeholder="e.g. Garchomp" />
        <AutoInput label="Defender" value={def} onChange={setDef} placeholder="e.g. Blissey" />
        <AutoInput label="Move" value={mv} onChange={setMv} placeholder="e.g. Earthquake" />
        <div>
          <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, color:'#aaa', cursor:'pointer', paddingTop:20 }}>
            <input type="checkbox" checked={zmove} onChange={e => setZ(e.target.checked)} />
            Z-Move
          </label>
        </div>
        <button onClick={run} disabled={loading} style={{ height:38, padding:'0 20px', background:'#5865F2', color:'#fff', border:'none', borderRadius:6, cursor:'pointer', fontWeight:600, alignSelf:'flex-end' }}>
          {loading ? 'Calc...' : 'Calculate'}
        </button>
      </div>
      {err && <div style={{ color:'#ED4245', fontSize:13, marginBottom:12 }}>{err}</div>}
      {res && !res.immune && (
        <div style={{ background:'#1e2124', borderRadius:8, padding:16 }}>
          <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
            <div style={{ flex:1, minWidth:160 }}>
              <div style={{ fontSize:12, color:'#aaa', marginBottom:4 }}>Damage Range</div>
              <div style={{ fontSize:20, fontWeight:800 }}>{res.min_pct.toFixed(1)}% – {res.max_pct.toFixed(1)}%</div>
              <DmgBar pct={res.max_pct} />
              <div style={{ fontSize:12, color:'#aaa', marginTop:4 }}>{res.min_dmg}–{res.max_dmg} HP (Def HP: {res.defender_hp})</div>
            </div>
            <div style={{ flex:1, minWidth:160 }}>
              <div style={{ fontSize:12, color:'#aaa', marginBottom:4 }}>KO Assessment</div>
              <div style={{ fontWeight:700, color: res.ohko ? '#ED4245' : res.two_hko ? '#FAA81A' : '#3BA55D' }}>{ko}</div>
              <div style={{ fontSize:12, color:'#aaa', marginTop:4 }}>Hits to KO: {res.hits_to_ko[0]}–{res.hits_to_ko[1]}</div>
            </div>
            <div style={{ flex:1, minWidth:160 }}>
              <div style={{ fontSize:12, color:'#aaa', marginBottom:4 }}>Move Info</div>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:4 }}>
                <TypeBadge type={res.move_type} />
                <span style={{ fontSize:12 }}>{res.category}</span>
              </div>
              <div style={{ fontSize:12, color:'#aaa' }}>
                Eff: <strong style={{color:'#fff'}}>{res.effectiveness}x</strong>  |  STAB: <strong style={{color:'#fff'}}>{res.stab ? 'yes' : 'no'}</strong>
              </div>
            </div>
            <div style={{ flex:1, minWidth:160 }}>
              <div style={{ fontSize:12, color:'#aaa', marginBottom:4 }}>Speed</div>
              <div style={{ fontSize:13, fontWeight:600 }}>
                {res.attacker_speed > res.defender_speed ? 'Attacker goes first' : res.defender_speed > res.attacker_speed ? 'Defender goes first' : 'Speed tie'}
              </div>
              <div style={{ fontSize:12, color:'#aaa' }}>Atk: {res.attacker_speed}  |  Def: {res.defender_speed}</div>
            </div>
          </div>
        </div>
      )}
      {res?.immune && (
        <div style={{ background:'#1e2124', borderRadius:8, padding:16, color:'#aaa' }}>
          {def} is <strong>immune</strong> to {res.move_type}-type moves.
        </div>
      )}
    </div>
  );
}

// ── Counter section ───────────────────────────────────────────────────────────

function CounterSection() {
  const [atk,setAtk]    = useState('');
  const [def,setDef]    = useState('');
  const [res,setRes]    = useState<CounterResult|null>(null);
  const [best,setBest]  = useState<BestCounter[]|null>(null);
  const [loadM,setLM]   = useState(false);
  const [loadB,setLB]   = useState(false);
  const [err,setErr]    = useState('');

  const runManual = async () => {
    if (!atk || !def) return setErr('Both fields required');
    setLM(true); setErr(''); setRes(null);
    const data = await apiFetch(`/bossinfo/counter?attacker=${encodeURIComponent(atk)}&defender=${encodeURIComponent(def)}`);
    setLM(false);
    if (data.error) setErr(data.error);
    else setRes(data);
  };

  const runBest = async () => {
    if (!atk) return setErr('Enter an attacker Pokemon first');
    setLB(true); setErr(''); setBest(null);
    const data = await apiFetch(`/bossinfo/bestcounters?pokemon=${encodeURIComponent(atk)}`);
    setLB(false);
    if (data.error) setErr(data.error);
    else setBest(data.counters || []);
  };

  return (
    <div>
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:16, alignItems:'flex-end' }}>
        <AutoInput label="Attacker" value={atk} onChange={setAtk} placeholder="e.g. Garchomp" />
        <AutoInput label="Potential Counter" value={def} onChange={setDef} placeholder="e.g. Skarmory" />
        <button onClick={runManual} disabled={loadM} style={{ height:38, padding:'0 18px', background:'#5865F2', color:'#fff', border:'none', borderRadius:6, cursor:'pointer', fontWeight:600, alignSelf:'flex-end' }}>
          {loadM ? '...' : 'Check Matchup'}
        </button>
        <button onClick={runBest} disabled={loadB} style={{ height:38, padding:'0 18px', background:'#383a40', color:'#fff', border:'1px solid #4f545c', borderRadius:6, cursor:'pointer', fontWeight:600, alignSelf:'flex-end' }}>
          {loadB ? 'Searching...' : 'Find Best Counters'}
        </button>
      </div>
      {err && <div style={{ color:'#ED4245', fontSize:13, marginBottom:12 }}>{err}</div>}

      {res && !res.error && (
        <div style={{ background:'#1e2124', borderRadius:8, padding:16, marginBottom:16 }}>
          <div style={{ display:'flex', gap:12, alignItems:'center', marginBottom:12 }}>
            <span style={{ fontWeight:700, fontSize:15 }}>{res.attacker} vs {res.defender}</span>
            <VerdictBadge verdict={res.verdict} />
          </div>
          <div style={{ fontSize:13, color:'#ccc', marginBottom:12 }}>{res.verdict_desc}</div>
          <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
            <div style={{ flex:1, minWidth:180, background:'#2b2d31', borderRadius:6, padding:12 }}>
              <div style={{ fontSize:12, color:'#aaa', marginBottom:4 }}>Attacker uses {res.atk_move}</div>
              <div style={{ fontWeight:700 }}>{res.atk_min_pct.toFixed(1)}% – {res.atk_max_pct.toFixed(1)}%</div>
              <DmgBar pct={res.atk_max_pct} />
            </div>
            <div style={{ flex:1, minWidth:180, background:'#2b2d31', borderRadius:6, padding:12 }}>
              <div style={{ fontSize:12, color:'#aaa', marginBottom:4 }}>Defender uses {res.def_move}</div>
              <div style={{ fontWeight:700 }}>{res.def_min_pct.toFixed(1)}% – {res.def_max_pct.toFixed(1)}%</div>
              <DmgBar pct={res.def_max_pct} />
            </div>
            <div style={{ flex:1, minWidth:140, background:'#2b2d31', borderRadius:6, padding:12 }}>
              <div style={{ fontSize:12, color:'#aaa', marginBottom:4 }}>Speed</div>
              <div style={{ fontSize:13 }}>{res.faster === 'attacker' ? `${res.attacker} faster` : res.faster === 'defender' ? `${res.defender} faster` : 'Tie'}</div>
              <div style={{ fontSize:12, color:'#aaa' }}>{res.attacker_speed} vs {res.defender_speed}</div>
            </div>
          </div>
        </div>
      )}

      {best && (
        <div>
          <div style={{ fontSize:14, fontWeight:700, marginBottom:10 }}>Best Counters vs {atk}</div>
          {best.length === 0 && <div style={{ color:'#aaa', fontSize:13 }}>No strong counters found in the OU/UU meta pool.</div>}
          {best.map((c, i) => (
            <div key={i} style={{ background:'#1e2124', borderRadius:8, padding:14, marginBottom:10 }}>
              <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:8 }}>
                <span style={{ fontSize:18, color:'#5865F2', fontWeight:800 }}>#{i+1}</span>
                <span style={{ fontWeight:700, fontSize:15 }}>{c.candidate}</span>
                <VerdictBadge verdict={c.verdict} />
                <span style={{ marginLeft:'auto', fontSize:12, color:'#aaa' }}>Score: {c.score.toFixed(1)}</span>
              </div>
              <div style={{ display:'flex', gap:12, flexWrap:'wrap', fontSize:12 }}>
                <span>Survives: <strong>{c.def_survives_2 ? '2 hits' : c.def_survives_1 ? '1 hit' : 'unlikely'}</strong></span>
                <span>Deals back: <strong>{c.def_min_pct.toFixed(1)}%–{c.def_max_pct.toFixed(1)}%</strong></span>
                <span>Speed: <strong>{c.defender_speed}</strong> vs <strong>{c.attacker_speed}</strong></span>
              </div>
              <DmgBar pct={c.def_max_pct} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main BossInfo page ────────────────────────────────────────────────────────

interface Props { guildId: string }

export default function BossInfoPage({ guildId }: Props) {
  const [pokemon, setPokemon]     = useState('');
  const [tera, setTera]           = useState('');
  const [analysis, setAnalysis]   = useState<BossAnalysis|null>(null);
  const [loading, setLoading]     = useState(false);
  const [err, setErr]             = useState('');
  const [tab, setTab]             = useState<Tab>('Stats');
  const [section, setSection]     = useState<'analyze'|'damage'|'counter'>('analyze');

  const runAnalysis = async () => {
    if (!pokemon.trim()) return setErr('Enter a Pokemon name');
    setLoading(true); setErr(''); setAnalysis(null);
    const q = `/bossinfo/analyze?pokemon=${encodeURIComponent(pokemon)}` + (tera ? `&tera=${encodeURIComponent(tera)}` : '');
    const data = await apiFetch(q);
    setLoading(false);
    if (data.error) setErr(data.error);
    else { setAnalysis(data); setTab('Stats'); }
  };

  const sections: {id:typeof section; label:string}[] = [
    {id:'analyze',label:'Analyze'},
    {id:'damage', label:'Damage Calc'},
    {id:'counter',label:'Counter Finder'},
  ];

  return (
    <div style={{ padding:24, maxWidth:900, color:'#dcddde' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Section tabs */}
      <div style={{ display:'flex', gap:4, marginBottom:20, borderBottom:'1px solid #3f4147', paddingBottom:0 }}>
        {sections.map(s => (
          <button key={s.id} onClick={() => setSection(s.id)} style={{
            padding:'8px 20px', background:'none', border:'none', cursor:'pointer',
            color: section === s.id ? '#fff' : '#aaa',
            borderBottom: section === s.id ? '2px solid #5865F2' : '2px solid transparent',
            fontWeight: section === s.id ? 700 : 400, fontSize:14, transition:'all 0.15s',
          }}>{s.label}</button>
        ))}
      </div>

      {section === 'analyze' && (
        <>
          {/* Search bar */}
          <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:20, alignItems:'flex-end' }}>
            <AutoInput label="Pokemon" value={pokemon} onChange={setPokemon} placeholder="e.g. Garchomp" />
            <div style={{ width:140 }}>
              <label style={{ display:'block', fontSize:12, color:'#aaa', marginBottom:4 }}>Tera Type (optional)</label>
              <select value={tera} onChange={e => setTera(e.target.value)}
                style={{ width:'100%', padding:'8px 10px', background:'#1e2124', border:'1px solid #3f4147', borderRadius:6, color: tera ? '#fff' : '#aaa', fontSize:14 }}>
                <option value="">None</option>
                {VALID_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <button onClick={runAnalysis} disabled={loading} style={{ height:38, padding:'0 20px', background:'#5865F2', color:'#fff', border:'none', borderRadius:6, cursor:'pointer', fontWeight:700, alignSelf:'flex-end' }}>
              {loading ? <Spinner /> : 'Analyze'}
            </button>
          </div>
          {err && <div style={{ color:'#ED4245', fontSize:13, marginBottom:16 }}>{err}</div>}

          {analysis && (
            <div>
              {/* Header */}
              <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:16, flexWrap:'wrap' }}>
                <h2 style={{ margin:0, fontSize:22 }}>{analysis.name}</h2>
                {analysis.types.map(t => <TypeBadge key={t} type={t} />)}
                {analysis.tera_type && <>
                  <span style={{ color:'#aaa', fontSize:13 }}>Tera:</span>
                  <TypeBadge type={analysis.tera_type} />
                </>}
                <span style={{ marginLeft:'auto', background:'#383a40', borderRadius:6, padding:'4px 12px', fontSize:13 }}>{analysis.tier}</span>
                <span style={{ background:'#383a40', borderRadius:6, padding:'4px 12px', fontSize:13 }}>{analysis.role}</span>
              </div>

              {/* Page tabs */}
              <div style={{ display:'flex', gap:2, marginBottom:16, background:'#1e2124', borderRadius:8, padding:4 }}>
                {TABS.map(t => (
                  <button key={t} onClick={() => setTab(t)} style={{
                    flex:1, padding:'7px 4px', background: tab===t ? '#5865F2' : 'none',
                    border:'none', borderRadius:6, cursor:'pointer', color: tab===t ? '#fff' : '#aaa',
                    fontWeight: tab===t ? 700 : 400, fontSize:13, transition:'all 0.15s',
                  }}>{t}</button>
                ))}
              </div>

              {/* Tab content */}
              {tab === 'Stats'       && <StatsTab data={analysis} />}
              {tab === 'Weaknesses'  && <WeaknessTab data={analysis} teraType={analysis.tera_type} />}
              {tab === 'Level Moves' && <LevelMovesTab data={analysis} />}
              {tab === 'Top Moves'   && <TopMovesTab data={analysis} />}
            </div>
          )}
        </>
      )}

      {section === 'damage'  && <DamageSection />}
      {section === 'counter' && <CounterSection />}
    </div>
  );
}
