import { useState, useRef } from 'react';
import { TC_COLORS, LBL } from './engine_pokemon';

// ── TypeBadge ─────────────────────────────────────────────────────────────────
export function TypeBadge({ t }: { t: string }) {
  return (
    <span style={{background:TC_COLORS[t]||'#555',color:'#fff',borderRadius:4,padding:'2px 8px',fontSize:11,fontWeight:700,flexShrink:0,display:'inline-block'}}>
      {t}
    </span>
  );
}

// ── AutoInput ─────────────────────────────────────────────────────────────────
export function AutoInput({ label, value, onChange, searchFn, placeholder }: {
  label?: string; value: string; onChange: (v:string)=>void;
  searchFn: (q:string)=>string[]; placeholder?: string;
}) {
  const [opts, setOpts] = useState<string[]>([]);
  const [show, setShow] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>|null>(null);

  const search = (v: string) => {
    onChange(v);
    if (timer.current) clearTimeout(timer.current);
    if (v.length < 2) { setOpts([]); setShow(false); return; }
    timer.current = setTimeout(() => {
      const r = searchFn(v); setOpts(r); setShow(r.length > 0);
    }, 80);
  };

  return (
    <div style={{position:'relative'}}>
      {label && <label style={LBL}>{label}</label>}
      <input className="inp" value={value}
        onChange={e => search(e.target.value)}
        onBlur={() => setTimeout(() => setShow(false), 140)}
        onFocus={() => opts.length > 0 && setShow(true)}
        placeholder={placeholder||label||''}
        style={{fontSize:13}}
      />
      {show && opts.length > 0 && (
        <div style={{position:'absolute',top:'100%',left:0,right:0,background:'#181a28',
          border:'1px solid var(--border)',borderRadius:8,zIndex:400,maxHeight:170,overflowY:'auto',
          marginTop:2,boxShadow:'0 8px 32px rgba(0,0,0,.65)'}}>
          {opts.map(x => (
            <div key={x} onMouseDown={() => { onChange(x); setShow(false); setOpts([]); }}
              style={{padding:'7px 13px',cursor:'pointer',fontSize:13,color:'var(--text)'}}
              onMouseEnter={e => (e.currentTarget.style.background='rgba(88,101,242,.18)')}
              onMouseLeave={e => (e.currentTarget.style.background='')}>
              {x}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
