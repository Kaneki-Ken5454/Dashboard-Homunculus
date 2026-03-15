import { useEffect, useState, useMemo, useRef } from 'react';
import {
  BookOpen, Plus, Pencil, Trash2, ChevronDown, ChevronRight,
  Eye, EyeOff, Download, Upload, History, ClipboardList,
  FolderEdit, AlertCircle, CheckCircle, RotateCcw,
  Link, Search, X, Tag,
} from 'lucide-react';
import {
  getInfoTopics, createInfoTopic, updateInfoTopic, deleteInfoTopic,
  updateInfoSection, updateInfoSubcategory,
  setTopicPublished, getTopicHistory, restoreTopicVersion,
  getInfoAuditLog, exportInfoTopics, importInfoTopics,
  type InfoTopic, type TopicHistoryEntry, type InfoAuditEntry,
} from '../lib/db';
import Modal from '../components/Modal';

interface Props { guildId: string; }

function ago(s: string) {
  const d = Date.now() - new Date(s).getTime();
  const m = Math.floor(d / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(s).toLocaleDateString();
}

function detectLinks(text: string) { return /https?:\/\/[^\s<>"]+/.test(text); }

// ── Field wrapper ─────────────────────────────────────────────────────────────
function F({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 5, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
        {label}{hint && <span style={{ fontWeight: 400, marginLeft: 6, color: 'var(--text-faint)', textTransform: 'none', fontSize: 11 }}>{hint}</span>}
      </label>
      {children}
    </div>
  );
}

// ── Emoji picker ──────────────────────────────────────────────────────────────
const EMOJI_PICKS = [
  '📁','📂','📋','📌','📍','🔖','🏷️','🗂️','📑','📎',
  '🎯','⚡','🔥','✨','💫','🌟','⭐','🎖️','🏆','🎗️',
  '🔧','⚙️','🛠️','🔨','💡','🔍','📡','🖥️','📢','💬',
  '👥','👤','🤝','🎮','🎲','📊','📈','💰','🎁','🎨',
  '🔒','🔓','🛡️','⚠️','❓','ℹ️','🚨','🎵','🌐','🏠',
];
function EmojiPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <div style={{ width: 40, height: 40, background: 'var(--elevated)', border: '1px solid var(--border)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
          {value || <span style={{ color: 'var(--text-faint)', fontSize: 14 }}>?</span>}
        </div>
        <input className="inp" style={{ fontSize: 18, flex: 1 }} placeholder="Type or paste emoji" value={value} onChange={e => onChange(e.target.value)} />
        {value && <button onClick={() => onChange('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 16, padding: '0 4px' }}>✕</button>}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
        {EMOJI_PICKS.map(e => (
          <button key={e} onClick={() => onChange(e)} style={{ width: 30, height: 30, background: value === e ? 'var(--primary-subtle)' : 'var(--elevated)', border: `1px solid ${value === e ? '#818cf8' : 'var(--border)'}`, borderRadius: 5, cursor: 'pointer', fontSize: 14 }}>{e}</button>
        ))}
      </div>
    </div>
  );
}

// ── Card preview — mirrors embed_renderer.py v4 exactly ───────────────────────

// Colour helpers (match Python exactly)
function _hexToRgb(hex: string): [number,number,number] {
  const h = (hex || '#5865f2').replace('#', '');
  return [parseInt(h.slice(0,2),16)||88, parseInt(h.slice(2,4),16)||101, parseInt(h.slice(4,6),16)||242];
}
function _mixT(a:[number,number,number], b:[number,number,number], t:number):[number,number,number] {
  return [Math.round(a[0]+(b[0]-a[0])*t), Math.round(a[1]+(b[1]-a[1])*t), Math.round(a[2]+(b[2]-a[2])*t)];
}
function _lightT(c:[number,number,number], n=40):[number,number,number] {
  return [Math.min(255,c[0]+n), Math.min(255,c[1]+n), Math.min(255,c[2]+n)];
}
function _darkT(c:[number,number,number], n=30):[number,number,number] {
  return [Math.max(0,c[0]-n), Math.max(0,c[1]-n), Math.max(0,c[2]-n)];
}
function _css(c:[number,number,number], a=1):string {
  return a<1 ? `rgba(${c[0]},${c[1]},${c[2]},${a})` : `rgb(${c[0]},${c[1]},${c[2]})`;
}
function _grad(a:[number,number,number], b:[number,number,number]):string {
  return `linear-gradient(to right, ${_css(a)}, ${_css(b)})`;
}

// Constants matching Python
const _CARD  :[number,number,number] = [18,18,24];
const _PANEL :[number,number,number] = [26,26,34];
const _PAN2  :[number,number,number] = [32,32,42];
const _SEP   :[number,number,number] = [50,50,64];
const _BODY  :[number,number,number] = [212,210,224];
const _MUTED :[number,number,number] = [128,126,148];
const _GOLD  :[number,number,number] = [252,182,22];
const _GOLD_C:[number,number,number] = [220,168,30];
const _WHITE :[number,number,number] = [255,255,255];
const _CFG   :[number,number,number] = [220,178,80];
const _CBG   :[number,number,number] = [20,20,28];

const CM_MOVE_COLS:[number,number,number][] = [
  [200,65,30], [55,115,195], [96,96,38], [185,148,15], [200,65,30], [140,60,160], [45,145,80],
];
const CM_TYPE_COLS:Record<string,[number,number,number]> = {
  fire:[196,50,30], rock:[105,75,35], water:[40,100,185], grass:[48,140,48],
  electric:[185,155,20], ice:[68,160,190], fighting:[160,48,30], poison:[128,48,140],
  ground:[160,120,48], flying:[98,108,180], psychic:[185,38,100], bug:[98,140,18],
  ghost:[78,58,140], dragon:[68,38,180], dark:[52,42,42], steel:[98,108,128],
  fairy:[195,108,155], normal:[108,108,98],
};

// ── Inline markdown renderer ──────────────────────────────────────────────────
type ISpan = { text:string; bold?:boolean; italic?:boolean; code?:boolean; accent?:boolean };
function _inlineRuns(text:string): ISpan[] {
  const out:ISpan[] = [];
  const re = /\*\*\*([^*]+?)\*\*\*|\*\*([^*]+?)\*\*|__([^_]+?)__|`([^`]+?)`|\[([^\]]+?)\]\([^)]+?\)|\*([^*]+?)\*|_([^_]+?)_/g;
  let last=0, m:RegExpExecArray|null;
  while ((m=re.exec(text))!==null) {
    if (m.index>last) out.push({text:text.slice(last,m.index)});
    if      (m[1]) out.push({text:m[1],bold:true,italic:true});
    else if (m[2]) out.push({text:m[2],bold:true,accent:true});
    else if (m[3]) out.push({text:m[3],bold:true,accent:true});
    else if (m[4]) out.push({text:m[4],code:true});
    else if (m[5]) out.push({text:m[5],accent:true});
    else if (m[6]) out.push({text:m[6],italic:true});
    else if (m[7]) out.push({text:m[7],italic:true});
    last = m.index+m[0].length;
  }
  if (last<text.length) out.push({text:text.slice(last)});
  return out.length ? out : [{text}];
}
function IText({text,acc}:{text:string;acc:string}) {
  return <>{_inlineRuns(text).map((r,i)=>(
    <span key={i} style={{
      fontWeight:r.bold?700:undefined, fontStyle:r.italic?'italic':undefined,
      background:r.code?_css(_CBG):undefined, color:r.code?_css(_CFG):r.accent?acc:_css(_BODY),
      padding:r.code?'1px 3px':undefined, borderRadius:r.code?3:undefined,
      fontFamily:r.code?'monospace':undefined, fontSize:r.code?'0.9em':undefined,
    }}>{r.text}</span>
  ))}</>;
}

// ── Shared card chrome (L-brackets + top stripe + header gradient) ────────────
function CardChrome({accent,accD,accB,children,height}:{
  accent:[number,number,number]; accD:[number,number,number]; accB:[number,number,number];
  children:React.ReactNode; height?:number;
}) {
  const CL=17, CT=2;
  const stripeGrad = `linear-gradient(to right, ${_css(accent)}, ${_css(_GOLD)} 50%, ${_css(accD)})`;
  return (
    <div style={{position:'relative', background:_css(_CARD), border:`1px solid ${_css(_mixT(accent,[50,50,64],0.5),0.22)}`, fontSize:12}}>
      {/* Top stripe accent→gold→acc_dark */}
      <div style={{height:4, background:stripeGrad, flexShrink:0}}/>
      {/* L-brackets */}
      <div style={{position:'absolute',top:0,left:0,width:CL,height:CT,background:_css(accent),zIndex:2}}/>
      <div style={{position:'absolute',top:0,left:0,width:CT,height:CL,background:_css(accent),zIndex:2}}/>
      <div style={{position:'absolute',top:0,right:0,width:CL,height:CT,background:_css(accent),opacity:0.78,zIndex:2}}/>
      <div style={{position:'absolute',top:0,right:0,width:CT,height:CL,background:_css(accent),opacity:0.78,zIndex:2}}/>
      <div style={{position:'absolute',bottom:0,left:0,width:CL,height:CT,background:_css(accD),opacity:0.70,zIndex:2}}/>
      <div style={{position:'absolute',bottom:0,left:0,width:CT,height:CL,background:_css(accD),opacity:0.70,zIndex:2}}/>
      <div style={{position:'absolute',bottom:0,right:0,width:CL,height:CT,background:_css(accD),opacity:0.63,zIndex:2}}/>
      <div style={{position:'absolute',bottom:0,right:0,width:CT,height:CL,background:_css(accD),opacity:0.63,zIndex:2}}/>
      {children}
    </div>
  );
}

// ── Thumbnail circle (glow + double ring) ─────────────────────────────────────
function ThumbCircle({url,acc,size=58}:{url?:string;acc:[number,number,number];size?:number}) {
  return (
    <div style={{position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',zIndex:10}}>
      {/* Glow */}
      <div style={{position:'absolute',inset:-12,borderRadius:'50%',background:`radial-gradient(circle, ${_css(acc,0.28)} 0%, transparent 70%)`,filter:'blur(5px)',pointerEvents:'none'}}/>
      {/* Outer ring dim */}
      <div style={{position:'absolute',inset:-5,borderRadius:'50%',border:`3px solid ${_css(acc,0.14)}`}}/>
      {/* Inner ring bright */}
      <div style={{position:'absolute',inset:-2,borderRadius:'50%',border:`2px solid ${_css(acc,0.85)}`}}/>
      {/* Circle */}
      <div style={{width:size,height:size,borderRadius:'50%',overflow:'hidden',background:_css(_darkT(acc,40)),flexShrink:0,position:'relative',display:'flex',alignItems:'center',justifyContent:'center'}}>
        {url
          ? <img src={url} alt="sprite" crossOrigin="anonymous" style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover',display:'block'}} onError={e=>{e.currentTarget.style.display='none';}}/>
          : <span style={{fontSize:9,color:_css(_MUTED),textAlign:'center',lineHeight:1.4,zIndex:1}}>{'Sprite\nHere'}</span>
        }
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// CARD MODE
// ══════════════════════════════════════════════════════════════════════════════

type CBlock = {kind:'section'|'stat'|'move'|'note'|'blank'; text?:string; label?:string; value?:string; index?:number; isBullet?:boolean};

function _parseCardMeta(desc:string):Record<string,string> {
  const meta:Record<string,string>={};
  for (const ln of desc.split('\n')) {
    const s=ln.trim();
    for (const k of ['SUBTITLE','TYPES','Z-CRYSTAL','Z_CRYSTAL']) {
      if (s.toUpperCase().startsWith(k+':')) { meta[k.replace('_','-')]=s.slice(k.length+1).trim(); break; }
    }
    if (s==='===LEFT===') break;
  }
  return meta;
}
function _parseCardCols(desc:string):[string,string] {
  const left:string[]=[],right:string[]=[];
  let target:string[]|null=null;
  for (const ln of desc.split('\n')) {
    if (ln.trim()==='===LEFT===')  {target=left; continue;}
    if (ln.trim()==='===RIGHT===') {target=right;continue;}
    if (target) target.push(ln);
  }
  return [left.join('\n'),right.join('\n')];
}
function _parseCardCol(raw:string):CBlock[] {
  const out:CBlock[]=[];
  for (const ln of raw.split('\n')) {
    const s=ln.trim();
    if (!s){out.push({kind:'blank'});continue;}
    const hm=s.match(/^#{1,6}\s+(.+)$/);
    if (hm){out.push({kind:'section',text:hm[1].toUpperCase()});continue;}
    const bm=s.match(/^[-*•]\s+(.+)/);
    if (bm){
      const lm=bm[1].match(/\*\*(.+?)\*\*\s*:?\s*(.*)/);
      if (lm){out.push({kind:'stat',label:lm[1].endsWith(':')?lm[1]:lm[1]+':',value:lm[2].trim(), isBullet: true});continue;}
      out.push({kind:'stat',text:bm[1].replace(/\*{1,3}([^*]+)\*{1,3}/g,'$1'), isBullet: true});continue;
    }
    const nm=s.match(/^(\d+)\.\s+(.+)/);
    if (nm){out.push({kind:'move',index:+nm[1],text:nm[2].replace(/\*{1,3}([^*]+)\*{1,3}/g,'$1')});continue;}
    if (s.startsWith('>')){out.push({kind:'note',text:s.slice(1).trim().replace(/\*{1,3}([^*]+)\*{1,3}/g,'$1')});continue;}
    const lm2=s.match(/\*\*(.+?)\*\*\s*:?\s*(.*)/);
    if (lm2){out.push({kind:'stat',label:lm2[1].endsWith(':')?lm2[1]:lm2[1]+':',value:lm2[2].trim()});continue;}
    out.push({kind:'stat',text:s.replace(/\*{1,3}([^*]+)\*{1,3}/g,'$1')});
  }
  return out;
}

// ── Auto raid-guide detection & conversion ────────────────────────────────────
// Mirrors Python _is_raid_guide / _parse_raid_guide exactly

function _plain(s:string):string {
  return s.replace(/\*{1,3}([^*]+)\*{1,3}/g,'$1').replace(/`([^`]+)`/g,'$1').trim();
}

function _isRaidGuide(desc:string):boolean {
  if (desc.includes('===LEFT===')) return false;
  // Strip markdown formatting before testing
  const stripped = desc.replace(/\*{1,3}([^*]+)\*{1,3}/g,'$1').replace(/__([^_]+)__/g,'$1');
  const hasMoves = /Top\s*\d*\s*Moves?\s*:?\s*$/im.test(stripped) || /^\d+\.\s+\S/m.test(stripped);
  // Also detect > prefixed lines as moves
  const hasBlockquoteMoves = /^>\s*\S/m.test(desc);
  const hasTopMovesHeader = /Top\s*\d*\s*Moves?/im.test(stripped);
  const hasBulletMoves = /^[-*•]\s+\S/m.test(desc);
  return hasMoves || hasBlockquoteMoves || (hasTopMovesHeader && hasBulletMoves);
}

type RaidGuideResult = { meta:Record<string,string>; left:CBlock[]; right:CBlock[] } | null;

function _parseRaidGuide(desc:string): RaidGuideResult {
  const lines = desc.replace(/\r\n/g,'\n').split('\n');
  const meta:Record<string,string> = {};
  const contentLines:string[] = [];

  // Extract Type / Z-Crystal meta lines
  for (const ln of lines) {
    const s = ln.trim();
    const tm = s.match(/^\*?\*?Type\*?\*?\s*:\s*(.+)/i);
    if (tm) { meta['TYPES'] = _plain(tm[1]); continue; }
    const zm = s.match(/^\*?\*?Z[-_\s]?Crystal\*?\*?\s*:\s*(.+)/i);
    if (zm) { meta['Z-CRYSTAL'] = _plain(zm[1]); continue; }
    contentLines.push(ln);
  }

  // Find moves section
  let movesStart = -1;
  let movesLabel = 'TOP MOVES';
  for (let i=0; i<contentLines.length; i++) {
    const s = contentLines[i].trim();
    const mm = _plain(s).match(/^(Top\s*\d*\s*Moves?(?:\s+\([^)]*\))?)\s*:?\s*$/i);
    if (mm) { movesStart=i; movesLabel=mm[1].toUpperCase(); break; }
    const hm = s.match(/^#{1,6}\s+(.*(?:Move|Moves).*)/i);
    if (hm) { movesStart=i; movesLabel=_plain(hm[1]).toUpperCase(); break; }
  }
  // If no explicit moves header found, look for first > line as implicit moves start
  if (movesStart < 0) {
    for (let i=0; i<contentLines.length; i++) {
      const s = contentLines[i].trim();
      if (s.startsWith('>')) {
        // Insert a virtual moves header just before the first > line
        movesStart = i - 1;
        if (movesStart < 0) movesStart = 0;
        // Use the line before as a potential label or default
        const prevLine = movesStart > 0 ? _plain(contentLines[movesStart].trim()) : '';
        if (prevLine && !prevLine.includes(':') && prevLine.length < 40) {
          movesLabel = prevLine.toUpperCase();
        }
        break;
      }
    }
  }
  if (movesStart < 0) return null;

  // Find end of moves section
  // Moves are > prefixed lines, numbered lines, bullet lines, or plain text
  // Stop when we hit a bold-label stat or header that isn't a move
  let movesEnd = movesStart + 1;
  while (movesEnd < contentLines.length) {
    const s = contentLines[movesEnd].trim();
    if (!s) { movesEnd++; continue; }
    const isBoldLabel = /^\*\*[^*]+\*\*\s*:/.test(s) && !s.startsWith('-');
    const isHeader    = /^#{1,6}\s+/.test(s);
    if (isBoldLabel || isHeader) break;
    movesEnd++;
  }

  const beforeLines = contentLines.slice(0, movesStart);
  const moveLines   = contentLines.slice(movesStart+1, movesEnd);
  const afterLines  = contentLines.slice(movesEnd);

  // Parse lines into CBlock[]
  function toBlocks(rawLines:string[]): CBlock[] {
    const out:CBlock[] = [];
    for (const ln of rawLines) {
      const s = ln.trim();
      if (!s) { out.push({kind:'blank'}); continue; }
      const hm2 = s.match(/^#{1,6}\s+(.+)$/);
      if (hm2) { out.push({kind:'section',text:_plain(hm2[1]).toUpperCase()}); continue; }
      // Bold-only header line **Section:**
      const bh = s.match(/^\*\*([^*]+)\*\*\s*:?\s*$/);
      if (bh) { out.push({kind:'section',text:bh[1].toUpperCase()}); continue; }
      // Bullet
      const bm = s.match(/^[-*•]\s+(.+)/);
      if (bm) {
        const lm = bm[1].match(/\*\*(.+?)\*\*\s*:?\s*(.*)/);
        if (lm) {
          const lbl = lm[1].endsWith(':') ? lm[1] : lm[1]+':';
          out.push({kind:'stat',label:lbl,value:_plain(lm[2]), isBullet: true}); continue;
        }
        out.push({kind:'stat',text:_plain(bm[1]), isBullet: true}); continue;
      }
      // Blockquote (> lines) — treated as notes in stat columns
      if (s.startsWith('>')) { out.push({kind:'note',text:_plain(s.replace(/^>\s?/,''))}); continue; }
      // Bold-colon stat
      const lm2 = s.match(/\*\*(.+?)\*\*\s*:?\s*(.*)/);
      if (lm2) {
        const lbl = lm2[1].endsWith(':') ? lm2[1] : lm2[1]+':';
        out.push({kind:'stat',label:lbl,value:_plain(lm2[2])}); continue;
      }
      out.push({kind:'stat',text:_plain(s)});
    }
    return out;
  }

  const left = toBlocks(beforeLines);

  // After-moves → NATURE & BUILD section appended to left
  if (afterLines.length > 0) {
    const firstNonBlank = afterLines.find(l=>l.trim())?.trim()||'';
    const alreadyHeaded = /^#{1,6}\s+/.test(firstNonBlank) || /^\*\*[^*]+\*\*\s*:?\s*$/.test(firstNonBlank);
    if (!alreadyHeaded && firstNonBlank) {
      left.push({kind:'blank'});
      left.push({kind:'section',text:'NATURE & BUILD'});
    }
    left.push(...toBlocks(afterLines));
  }

  // Right: moves section header + numbered moves
  // Lines starting with > are always moves; also numbered, bulleted, and plain text lines
  const right:CBlock[] = [{kind:'section',text:movesLabel}];
  let moveIdx = 0;
  for (const ln of moveLines) {
    const s = ln.trim();
    if (!s) continue;
    // > prefixed lines are moves
    if (s.startsWith('>')) {
      moveIdx++;
      right.push({kind:'move',index:moveIdx,text:_plain(s.replace(/^>\s?/,''))});
      continue;
    }
    const nm = s.match(/^(\d+)\.\s+(.+)/);
    if (nm) { right.push({kind:'move',index:+nm[1],text:_plain(nm[2])}); continue; }
    const bm = s.match(/^[-*•]\s+(.+)/);
    if (bm) { moveIdx++; right.push({kind:'move',index:moveIdx,text:_plain(bm[1])}); continue; }
    if (s && !/^#{1,6}\s+/.test(s)) { moveIdx++; right.push({kind:'move',index:moveIdx,text:_plain(s)}); }
  }

  return {meta, left, right};
}

function CardColBlock({b,acc,isRight}:{b:CBlock;acc:[number,number,number];isRight:boolean}) {
  const accCss = _css(acc);
  if (b.kind==='blank') return <div style={{height:7}}/>;

  if (b.kind==='section') {
    const isNatureAndBuild = b.text === 'NATURE & BUILD' || b.text === 'NATURE AND BUILD';
    const barL = isNatureAndBuild ? _css(_mixT(_GOLD_C,[200,165,25],0.8)) : isRight ? _css(_mixT(_GOLD_C,[200,165,25],0)) : _css(_mixT(acc,[20,10,5],0.12));
    const barR = isNatureAndBuild ? 'rgb(90,75,30)' : isRight ? 'rgb(78,62,22)' : 'rgb(52,32,24)';
    const textC = isNatureAndBuild ? _css(_mixT(_GOLD,[255,255,255],0.5)) : _css(_lightT(acc,50));
    const leftBorderC = isNatureAndBuild ? _css(_GOLD_C) : accCss;
    
    return (
      <div style={{background:`linear-gradient(to right,${barL},${barR})`,borderRadius:3,padding:'4px 10px 4px 14px',marginBottom:5,position:'relative'}}>
        <div style={{position:'absolute',left:0,top:0,bottom:0,width:3,background:leftBorderC,borderRadius:'3px 0 0 3px'}}/>
        <span style={{fontSize:10,fontWeight:700,color:textC,letterSpacing:'0.07em'}}>{b.text}</span>
      </div>
    );
  }
  if (b.kind==='stat') {
    const labelC = _css(_mixT(acc,_GOLD_C,0.55));
    const leftBorderCss = b.isBullet ? `2px solid ${_css(acc,0.38)}` : '2px solid transparent';
    return (
      <div style={{display:'flex',alignItems:'flex-start',gap:4,padding:'2px 2px 2px 6px',marginBottom:3,borderLeft:leftBorderCss}}>
        {b.label && <span style={{fontSize:11,fontWeight:700,color:labelC,whiteSpace:'nowrap',flexShrink:0}}>{b.label}</span>}
        <span style={{fontSize:11,color:_css(_BODY,0.88)}}>{b.label ? b.value : b.text}</span>
      </div>
    );
  }
  if (b.kind==='move') {
    const mc  = CM_MOVE_COLS[((b.index||1)-1) % CM_MOVE_COLS.length];
    const mcL = _lightT(mc,45);
    return (
      <div style={{display:'flex',alignItems:'center',gap:6,background:_grad(_mixT(mc,_CARD,0.88),_mixT(mc,_PAN2,0.80)),borderRadius:20,padding:'4px 8px 4px 5px',marginBottom:5}}>
        <div style={{width:20,height:20,borderRadius:'50%',background:_css(mc),display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,border:'1px solid rgba(255,255,255,0.18)'}}>
          <span style={{fontSize:10,fontWeight:700,color:'#fff'}}>{b.index}</span>
        </div>
        <span style={{fontSize:12,fontWeight:600,color:'#fff',flex:1}}>{b.text}</span>
        <div style={{width:10,height:10,borderRadius:'50%',background:_css(mcL),flexShrink:0}}/>
      </div>
    );
  }
  if (b.kind==='note') {
    const noteC = _css(_mixT(acc,_GOLD_C,0.52));
    return (
      <div style={{
        fontSize:11,color:noteC,padding:'4px 8px 4px 10px',marginBottom:5,marginTop:5,
        background:`linear-gradient(to right, ${_css(_mixT(acc,[20,10,5],0.12))}, rgb(32,22,14))`,
        borderLeft:`3px solid ${_css(_GOLD)}`, borderRadius: '0 3px 3px 0'
      }}>
        + {b.text}
      </div>
    );
  }
  return null;
}

function CardModePreview({topic,desc,acc,accD,accB,overrideMeta,overrideLeft,overrideRight}:{topic:Partial<InfoTopic>;desc:string;acc:[number,number,number];accD:[number,number,number];accB:[number,number,number];overrideMeta?:Record<string,string>;overrideLeft?:CBlock[];overrideRight?:CBlock[]}) {
  const meta    = overrideMeta  ?? _parseCardMeta(desc);
  const lBlocks = overrideLeft  ?? (() => { const [l]=_parseCardCols(desc); return _parseCardCol(l); })();
  const rBlocks = overrideRight ?? (() => { const [,r]=_parseCardCols(desc); return _parseCardCol(r); })();
  const types   = meta['TYPES'] ? meta['TYPES'].split(/\s*[|,/]\s*/) : [];
  const zCryst  = meta['Z-CRYSTAL']||meta['Z_CRYSTAL']||'';
  const subtitle= meta['SUBTITLE']||'';
  const title   = topic.embed_title||'';
  const accentCss = _css(acc);
  const accDCss   = _css(accD);

  // Header gradient matching Python hdr_l/hdr_r
  const hdrL = _css(_mixT(_mixT(acc,[180,80,20],0.42),[12,8,5],0.30));
  const hdrR = _css(_mixT(_darkT(acc,50),[8,6,4],0.62));

  return (
    <>
      <div style={{position: 'relative', zIndex: 1}}>
        {/* Header */}
        <div style={{background:`linear-gradient(to right,${hdrL},${hdrR})`,padding:'12px 100px 10px 14px',position:'relative',minHeight:68}}>
          {/* Diagonal slash */}
          <div style={{position:'absolute',inset:0,background:'linear-gradient(105deg,transparent 40%,rgba(255,255,255,0.04) 50%,transparent 60%)',pointerEvents:'none'}}/>
          {/* Title */}
          <div style={{fontSize:18,fontWeight:700,color:'#fff',textShadow:'1px 2px 3px rgba(0,0,0,0.8)',lineHeight:1.3,position:'relative'}}>
            {title||<span style={{color:'#555',fontStyle:'italic'}}>No title…</span>}
          </div>
          {subtitle && <div style={{fontSize:11,color:_css(_mixT(acc,[200,130,40],0.28),0.86),marginTop:3,position:'relative'}}>{subtitle}</div>}
        </div>

        {/* Badge row */}
        {(types.length>0||zCryst) && (
          <div style={{background:_css(_mixT(_CARD,[10,8,6],0.35)),padding:'7px 14px',display:'flex',flexWrap:'wrap',gap:6,alignItems:'center'}}>
            {types.map(tp=>{
              const tc=CM_TYPE_COLS[tp.trim().toLowerCase()]||acc;
              return <span key={tp} style={{background:_css(tc),color:'#fff',fontSize:10,fontWeight:700,padding:'3px 10px',borderRadius:5, letterSpacing: '0.05em'}}>{tp.trim().toUpperCase()}</span>;
            })}
            {zCryst && (
              <span style={{background:_css(_darkT(acc,40)),color:_css(_GOLD),border:`1px solid ${_css(_darkT(acc, 20))}`,fontSize:10,fontWeight:700,padding:'3px 10px',borderRadius:5, letterSpacing: '0.05em'}}>+ {zCryst}</span>
            )}
          </div>
        )}

        {/* Header bottom glow */}
        <div style={{height:4,background:`linear-gradient(to right,${accentCss},${_css(_GOLD)} 67%,${accDCss})`,opacity:0.9}}/>

        {/* Sprite circle — always rendered */}
        <ThumbCircle url={topic.thumbnail} acc={acc} size={84}/>
      </div>

      {/* Two-column body (Moves Left, Stats Right) */}
      <div style={{display:'grid',gridTemplateColumns:'290fr 454fr',gap:'0 12px',padding:'10px 12px 12px'}}>
        <div>{rBlocks.map((b,i)=><CardColBlock key={i} b={b} acc={acc} isRight={false}/>)}</div>
        <div>{lBlocks.map((b,i)=><CardColBlock key={i} b={b} acc={acc} isRight={true}/>)}</div>
      </div>

      {/* Large image (if present) */}
      {topic.image && (
        <div style={{padding:'0 12px 10px'}}>
          <div style={{height:3,background:`linear-gradient(to right,${accentCss},${_css(_GOLD)} 67%,${accDCss})`,opacity:0.55,borderRadius:'3px 3px 0 0'}}/>
          <div style={{borderRadius:'0 0 5px 5px',overflow:'hidden',border:`1px solid ${_css(acc,0.22)}`}}>
            <img src={topic.image} alt="" crossOrigin="anonymous" style={{width:'100%',display:'block',maxHeight:300,objectFit:'contain',background:_css(_CARD)}} onError={e=>{(e.currentTarget as HTMLImageElement).style.display='none';}}/>
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{borderTop:`1px solid ${_css(_SEP,0.28)}`,padding:'5px 12px',display:'flex',justifyContent:'space-between'}}>
        <span style={{fontSize:10,color:_css(_MUTED,0.6)}}>{topic.footer||''}</span>
        <span style={{fontSize:10,color:_css(_MUTED,0.6)}}>{title}{types.length?` · ${meta['TYPES']}`:''}</span>
      </div>
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// STANDARD MODE
// ══════════════════════════════════════════════════════════════════════════════

type SBlock = {kind:string; text:string; numLabel?:string};
function _parseStdBlocks(raw:string):SBlock[] {
  const out:SBlock[]=[]; const lines=raw.replace(/\r\n/g,'\n').split('\n'); let i=0;
  while(i<lines.length){
    const ln=lines[i];
    if(/^```/.test(ln.trim())){
      const code:string[]=[]; i++;
      while(i<lines.length&&!lines[i].trim().startsWith('```')){code.push(lines[i]);i++;}
      out.push({kind:'code',text:code.join('\n')}); i++; continue;
    }
    if(/^(\-{3,}|\*{3,}|_{3,})\s*$/.test(ln.trim())){out.push({kind:'rule',text:''});i++;continue;}
    if(!ln.trim()){out.push({kind:'blank',text:''});i++;continue;}
    const hm=ln.match(/^(#{1,6})\s+(.+)$/);
    if(hm){out.push({kind:hm[1].length<=2?'h2':'h3',text:hm[2]});i++;continue;}
    if(ln.startsWith('>')){out.push({kind:'quote',text:ln.replace(/^>\s?/,'')});i++;continue;}
    const bm=ln.match(/^[-*•]\s+(.+)/);
    if(bm){out.push({kind:'bullet',text:bm[1]});i++;continue;}
    const nm=ln.match(/^(\d+)\.\s+(.+)/);
    if(nm){out.push({kind:'num',text:nm[2],numLabel:nm[1]});i++;continue;}
    out.push({kind:'body',text:ln}); i++;
  }
  return out;
}

function StdBlock({b,acc,accB}:{b:SBlock;acc:[number,number,number];accB:[number,number,number]}) {
  const accCss=_css(acc), accBCss=_css(accB);
  const sectL=_css(_mixT(acc,_PANEL,0.28)), sectR=_css(_mixT(acc,_PAN2,0.72));
  const pillL=_css(_mixT(acc,_CARD,0.42)),  pillR=_css(_mixT(acc,_PAN2,0.75));
  const pillCirc=_css(_lightT(acc,30));
  if(b.kind==='blank') return <div style={{height:7}}/>;
  if(b.kind==='rule')  return <div style={{height:14,display:'flex',alignItems:'center'}}><div style={{flex:1,height:1,background:`linear-gradient(to right,transparent,${_css(_SEP)},transparent)`}}/></div>;
  if(b.kind==='h2') return (
    <div style={{background:`linear-gradient(to right,${sectL},${sectR})`,borderRadius:5,margin:'8px 0 5px',padding:'5px 10px 5px 14px',position:'relative'}}>
      <div style={{position:'absolute',left:0,top:0,bottom:0,width:4,background:accCss,borderRadius:'5px 0 0 5px'}}/>
      <span style={{fontSize:10,fontWeight:700,color:accBCss,letterSpacing:'0.07em'}}>{b.text.toUpperCase()}</span>
    </div>
  );
  if(b.kind==='h3') return (
    <div style={{margin:'5px 0 3px'}}>
      <span style={{fontSize:12,fontWeight:600,color:accBCss}}>{b.text}</span>
      <div style={{width:50,height:1,background:_css(acc,0.35),marginTop:2}}/>
    </div>
  );
  if(b.kind==='code') return (
    <div style={{background:_css(_CBG),borderRadius:4,borderLeft:`4px solid ${accCss}`,padding:'6px 10px',margin:'5px 0',fontFamily:'monospace',fontSize:11,color:_css(_CFG),whiteSpace:'pre-wrap'}}>{b.text}</div>
  );
  if(b.kind==='quote') return (
    <div style={{background:`linear-gradient(to right,${_css(_mixT(acc,_PANEL,0.72))},${_css(_PAN2)})`,borderLeft:`4px solid ${accCss}`,padding:'5px 10px',margin:'4px 0',fontSize:11,color:_css(_MUTED),borderRadius:'0 4px 4px 0'}}>
      <IText text={b.text} acc={accCss}/>
    </div>
  );
  if(b.kind==='bullet'||b.kind==='num') {
    const idx = b.kind==='num' ? parseInt(b.numLabel||'1') : undefined;
    return (
      <div style={{display:'flex',alignItems:'center',gap:7,background:`linear-gradient(to right,${pillL},${pillR})`,borderRadius:20,padding:'4px 8px 4px 5px',margin:'4px 0'}}>
        <div style={{width:20,height:20,borderRadius:'50%',background:pillCirc,border:'1px solid rgba(255,255,255,0.2)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
          {idx!==undefined
            ? <span style={{fontSize:10,fontWeight:700,color:'#fff'}}>{idx}</span>
            : <span style={{fontSize:8,fontWeight:700,color:'#fff'}}>•</span>}
        </div>
        <span style={{fontSize:12,fontWeight:600,color:'#fff',flex:1}}><IText text={b.text} acc={accCss}/></span>
        <div style={{width:9,height:9,borderRadius:'50%',background:pillCirc,flexShrink:0}}/>
      </div>
    );
  }
  // body
  const boldStart=b.text.startsWith('**');
  return (
    <div style={{display:'flex',alignItems:'flex-start',gap:5,margin:'2px 0',paddingLeft:2}}>
      {boldStart && <div style={{width:3,height:13,borderRadius:1,background:_css(acc,0.50),flexShrink:0,marginTop:3}}/>}
      <span style={{fontSize:12,color:_css(_BODY),paddingLeft:boldStart?0:5}}><IText text={b.text.replace(/\*{1,3}([^*]+)\*{1,3}/g,'$1')} acc={accCss}/></span>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN EmbedPreview
// ══════════════════════════════════════════════════════════════════════════════

function EmbedPreview({ topic }: { topic: Partial<InfoTopic> }) {
  const desc      = topic.embed_description || '';
  const title     = topic.embed_title || '';
  const hasLinks  = detectLinks(desc);
  const acc       = _hexToRgb(topic.embed_color || '#5865F2');
  const accD      = _darkT(acc, 30);
  const accB      = _lightT(acc, 55);
  const accentCss = _css(acc);
  const accDCss   = _css(accD);

  // Determine layout mode (mirrors Python render_info_embed priority)
  const isExplicitCard = desc.includes('===LEFT===') && desc.includes('===RIGHT===');
  const raidGuide      = (!isExplicitCard && _isRaidGuide(desc)) ? _parseRaidGuide(desc) : null;
  const isCard         = isExplicitCard || raidGuide !== null;

  // Standard-mode header gradient
  const hdrL = _css(_mixT(accD,[14,12,18],0.40));
  const hdrR = _css(_mixT(_darkT(acc,50),[14,12,18],0.58));

  // Resolve card data (explicit OR auto-converted)
  let cardMeta:   Record<string,string> = {};
  let cardLeft:   CBlock[] = [];
  let cardRight:  CBlock[] = [];
  if (isExplicitCard) {
    cardMeta  = _parseCardMeta(desc);
    const [lRaw,rRaw] = _parseCardCols(desc);
    cardLeft  = _parseCardCol(lRaw);
    cardRight = _parseCardCol(rRaw);
  } else if (raidGuide) {
    cardMeta  = raidGuide.meta;
    cardLeft  = raidGuide.left;
    cardRight = raidGuide.right;
  }

  return (
    <div>
      <CardChrome accent={acc} accD={accD} accB={accB}>
        {isCard
          ? <CardModePreview
              topic={topic} desc={desc}
              acc={acc} accD={accD} accB={accB}
              overrideMeta={cardMeta} overrideLeft={cardLeft} overrideRight={cardRight}
            />
          : <>
              {/* Standard header */}
              <div style={{background:`linear-gradient(to right,${hdrL},${hdrR})`,padding:'12px 90px 10px 14px',position:'relative',minHeight:52,display:'flex',alignItems:'center'}}>
                <div style={{position:'absolute',inset:0,background:'linear-gradient(105deg,transparent 40%,rgba(255,255,255,0.04) 50%,transparent 60%)',pointerEvents:'none'}}/>
                <div style={{position:'relative',zIndex:1}}>
                  <div style={{fontSize:14,fontWeight:700,color:'#fff',textShadow:'1px 2px 3px rgba(0,0,0,0.8)'}}>
                    {title||<span style={{color:'#555',fontStyle:'italic'}}>No title…</span>}
                  </div>
                </div>
                {/* Thumbnail */}
                {topic.thumbnail && <ThumbCircle url={topic.thumbnail} acc={acc} size={52}/>}
              </div>

              {/* Header bottom glow */}
              <div style={{height:4,background:`linear-gradient(to right,${accentCss},${_css(_GOLD)} 67%,${accDCss})`,opacity:0.9}}/>

              {/* Standard body */}
              <div style={{padding:'10px 16px 12px'}}>
                {desc
                  ? _parseStdBlocks(desc).map((b,i)=><StdBlock key={i} b={b} acc={acc} accB={accB}/>)
                  : <span style={{fontSize:12,color:'#555',fontStyle:'italic'}}>No description…</span>}
                {/* Large image */}
                {topic.image && (
                  <div style={{marginTop:10}}>
                    <div style={{height:3,background:`linear-gradient(to right,${accentCss},${_css(_GOLD)} 67%,${accDCss})`,opacity:0.55,borderRadius:'3px 3px 0 0'}}/>
                    <div style={{borderRadius:'0 0 5px 5px',overflow:'hidden',border:`1px solid ${_css(acc,0.22)}`}}>
                      <img src={topic.image} alt="" crossOrigin="anonymous" style={{width:'100%',display:'block',maxHeight:300,objectFit:'contain',background:_css(_CARD)}} onError={e=>{(e.currentTarget as HTMLImageElement).style.display='none';}}/>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              {topic.footer && (
                <>
                  <div style={{height:1,background:`linear-gradient(to right,transparent,${_css(_SEP)},transparent)`,margin:'0 16px'}}/>
                  <div style={{padding:'5px 16px 10px'}}>
                    <span style={{fontSize:10,color:_css(_MUTED,0.6)}}>{topic.footer}</span>
                  </div>
                </>
              )}
            </>
        }
      </CardChrome>

      {hasLinks && (
        <div style={{marginTop:5,display:'flex',gap:5,alignItems:'center',fontSize:11,color:'#faa81a'}}>
          <Link size={11}/> Raw URL — use <code style={{background:'rgba(255,255,255,0.1)',padding:'0 3px',borderRadius:3}}>[text](url)</code>
        </div>
      )}
      {desc.length>3500 && (
        <div style={{marginTop:5,display:'flex',gap:5,alignItems:'center',fontSize:11,color:'#ed4245'}}>
          <AlertCircle size={11}/> Too long ({desc.length}/4000)
        </div>
      )}
    </div>
  );
}


// ── Topic card (RaidBoss style) ───────────────────────────────────────────────
function TopicCard({ topic, onEdit, onDelete, onTogglePublish, onHistory, isExpanded, onToggleExpand }: {
  topic: InfoTopic;
  onEdit: () => void; onDelete: () => void; onTogglePublish: () => void;
  onHistory: () => void; isExpanded: boolean; onToggleExpand: () => void;
}) {
  const hex = topic.embed_color || '#5865F2';
  return (
    <div style={{ background: 'var(--surface)', border: `1px solid ${isExpanded ? 'rgba(129,140,248,0.35)' : 'var(--border)'}`, borderRadius: 12, overflow: 'hidden', transition: 'border-color 0.15s' }}>
      {/* Card header — always visible */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', cursor: 'pointer', background: isExpanded ? 'var(--primary-subtle)' : 'var(--elevated)', transition: 'background 0.15s' }}
        onClick={onToggleExpand}
        onMouseEnter={e => { if (!isExpanded)(e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'; }}
        onMouseLeave={e => { if (!isExpanded)(e.currentTarget as HTMLElement).style.background = 'var(--elevated)'; }}
      >
        <div style={{ width: 4, height: 32, borderRadius: 2, background: hex, flexShrink: 0 }} />
        <span style={{ fontSize: 18, flexShrink: 0 }}>{topic.emoji || '📄'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{topic.name}</span>
            {!topic.is_published && (
              <span style={{ fontSize: 10, fontWeight: 700, background: 'rgba(250,168,26,0.15)', color: '#faa81a', padding: '1px 6px', borderRadius: 4, letterSpacing: '0.04em' }}>DRAFT</span>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 1, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <span className="mono">/info {topic.topic_id}</span>
            {topic.subcategory && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Tag size={9} />{topic.section} › {topic.subcategory}</span>}
            {topic.views > 0 && <span>👁 {topic.views} views</span>}
            <span style={{ color: 'var(--text-faint)' }}>Updated {ago(topic.updated_at)}</span>
          </div>
        </div>
        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          <button className="btn btn-ghost btn-sm" style={{ padding: '4px 7px' }} onClick={onTogglePublish} title={topic.is_published ? 'Unpublish' : 'Publish'}>
            {topic.is_published ? <Eye size={11} /> : <EyeOff size={11} style={{ color: '#faa81a' }} />}
          </button>
          <button className="btn btn-ghost btn-sm" style={{ padding: '4px 7px' }} onClick={onHistory} title="History"><History size={11} /></button>
          <button className="btn btn-ghost btn-sm" style={{ padding: '4px 7px' }} onClick={onEdit} title="Edit"><Pencil size={11} /></button>
          <button className="btn btn-danger btn-sm" style={{ padding: '4px 7px' }} onClick={onDelete} title="Delete"><Trash2 size={11} /></button>
        </div>
        {isExpanded ? <ChevronDown size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} /> : <ChevronRight size={13} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />}
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div style={{ padding: '14px 16px', borderTop: '1px solid var(--border)' }}>
          <EmbedPreview topic={topic} />
        </div>
      )}
    </div>
  );
}

// ── Section group ─────────────────────────────────────────────────────────────
function SectionGroup({ section, subcats, emojiMap, expandedIds, onToggleExpand, onEdit, onDelete, onTogglePublish, onHistory, onEditSection, onEditSub }: {
  section: string; subcats: Record<string, InfoTopic[]>;
  emojiMap: Map<string,string>; expandedIds: Set<number>;
  onToggleExpand: (id: number) => void;
  onEdit: (t: InfoTopic) => void; onDelete: (t: InfoTopic) => void;
  onTogglePublish: (t: InfoTopic) => void; onHistory: (t: InfoTopic) => void;
  onEditSection: (s: string) => void; onEditSub: (sec: string, sub: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const catEmoji = emojiMap.get(section);
  const total = Object.values(subcats).flat().length;

  return (
    <div style={{ marginBottom: 8 }}>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', marginBottom: 6 }}>
        <button onClick={() => setOpen(o => !o)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, padding: 0, flex: 1, color: 'var(--text)' }}>
          {open ? <ChevronDown size={13} style={{ color: 'var(--text-muted)' }} /> : <ChevronRight size={13} style={{ color: 'var(--text-muted)' }} />}
          {catEmoji && <span style={{ fontSize: 15 }}>{catEmoji}</span>}
          <span style={{ fontSize: 13, fontWeight: 700, textTransform: 'capitalize', letterSpacing: '0.02em' }}>{section}</span>
          <span style={{ background: 'var(--primary-subtle)', color: '#818cf8', borderRadius: 8, padding: '0 6px', fontSize: 10, fontWeight: 700 }}>{total}</span>
        </button>
        <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => onEditSection(section)}>
          <FolderEdit size={10} /> Edit Section
        </button>
      </div>

      {open && Object.entries(subcats).map(([sub, items]) => (
        <div key={sub} style={{ marginBottom: 10 }}>
          {/* Subcategory label */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 8px', marginBottom: 5, marginLeft: 18 }}>
            {emojiMap.get(`${section}::${sub}`) && <span style={{ fontSize: 12 }}>{emojiMap.get(`${section}::${sub}`)}</span>}
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{sub}</span>
            <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>({items.length})</span>
            <button className="btn btn-ghost btn-sm" style={{ padding: '1px 6px', fontSize: 10 }} onClick={() => onEditSub(section, sub)}>
              <Pencil size={8} /> Edit
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginLeft: 18 }}>
            {items.map(t => (
              <TopicCard key={t.id} topic={t}
                isExpanded={expandedIds.has(t.id)}
                onToggleExpand={() => onToggleExpand(t.id)}
                onEdit={() => onEdit(t)} onDelete={() => onDelete(t)}
                onTogglePublish={() => onTogglePublish(t)} onHistory={() => onHistory(t)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '60px 20px', textAlign: 'center' }}>
      <BookOpen size={40} style={{ color: 'var(--text-faint)', display: 'block', margin: '0 auto 14px', opacity: 0.5 }} />
      <div style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 18 }}>No info topics yet.</div>
      <button className="btn btn-primary" onClick={onAdd}><Plus size={14} /> Create First Topic</button>
    </div>
  );
}

const EMPTY: Partial<InfoTopic> = {
  section: 'general', subcategory: 'General', topic_id: '', name: '',
  embed_title: '', embed_description: '', embed_color: '#5865F2', emoji: '📄',
  image: '', thumbnail: '', footer: '', category_emoji_id: '', is_published: true,
};
type ModalType = 'create' | 'edit' | 'section' | 'subcategory' | 'history' | 'import' | null;
type SearchFilter = 'all' | 'published' | 'draft';

export default function InfoTopicsPage({ guildId }: Props) {
  const [topics, setTopics]       = useState<InfoTopic[]>([]);
  const [loading, setLoading]     = useState(true);
  const [tab, setTab]             = useState<'topics' | 'audit'>('topics');
  const [modal, setModal]         = useState<ModalType>(null);
  const [form, setForm]           = useState<Partial<InfoTopic>>(EMPTY);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');
  const [search, setSearch]       = useState('');
  const [statusFilter, setFilter] = useState<SearchFilter>('all');
  const [expandedIds, setExpanded]= useState<Set<number>>(new Set());

  // Section/sub edit state
  const [sectionTarget, setSectionTarget] = useState('');
  const [sectionName, setSectionName]     = useState('');
  const [sectionEmoji, setSectionEmoji]   = useState('');
  const [subcatTarget, setSubcatTarget]   = useState<{section:string;name:string}>({section:'',name:''});
  const [subcatName, setSubcatName]       = useState('');
  const [subcatEmoji, setSubcatEmoji]     = useState('');

  // History
  const [history, setHistory]     = useState<TopicHistoryEntry[]>([]);
  const [historyFor, setHistoryFor] = useState<InfoTopic | null>(null);
  const [histLoading, setHistLoad]= useState(false);

  // Audit
  const [audit, setAudit]         = useState<InfoAuditEntry[]>([]);
  const [auditLoading, setAuditLoad] = useState(false);

  // Import
  const [importJson, setImportJson]     = useState('');
  const [importMode, setImportMode]     = useState<'merge'|'replace'>('merge');
  const [importResult, setImportResult] = useState<{imported:number;skipped:number}|null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => {
    if (!guildId) return;
    setLoading(true);
    getInfoTopics(guildId).then(t => setTopics(t)).catch(e => setError(e.message)).finally(() => setLoading(false));
  };
  useEffect(() => { load(); setExpanded(new Set()); }, [guildId]);

  const loadAudit = () => {
    setAuditLoad(true);
    getInfoAuditLog(guildId).then(setAudit).catch(() => {}).finally(() => setAuditLoad(false));
  };
  useEffect(() => { if (tab === 'audit') loadAudit(); }, [tab, guildId]);

  const emojiMap = useMemo(() => {
    const m = new Map<string,string>();
    for (const t of topics) {
      if (t.category_emoji_id && !m.has(t.section)) m.set(t.section, t.category_emoji_id);
      const k = `${t.section}::${t.subcategory}`;
      if (t.subcategory_emoji && !m.has(k)) m.set(k, t.subcategory_emoji);
    }
    return m;
  }, [topics]);

  const filtered = useMemo(() => {
    let list = topics;
    if (statusFilter === 'published') list = list.filter(t => t.is_published);
    if (statusFilter === 'draft')     list = list.filter(t => !t.is_published);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(t => t.name.toLowerCase().includes(q) || t.topic_id?.toLowerCase().includes(q) || t.embed_description?.toLowerCase().includes(q));
    }
    return list;
  }, [topics, statusFilter, search]);

  const grouped = useMemo(() => filtered.reduce<Record<string,Record<string,InfoTopic[]>>>((acc, t) => {
    const sec = t.section || 'general', sub = t.subcategory || 'General';
    if (!acc[sec]) acc[sec] = {};
    if (!acc[sec][sub]) acc[sec][sub] = [];
    acc[sec][sub].push(t);
    return acc;
  }, {}), [filtered]);

  const pubCount   = topics.filter(t => t.is_published).length;
  const draftCount = topics.filter(t => !t.is_published).length;

  // ── Actions ──
  const openCreate  = () => { setForm({ ...EMPTY }); setModal('create'); setError(''); };
  const openEdit    = (t: InfoTopic) => { setForm({ ...t }); setModal('edit'); setError(''); };
  const openEditSec = (s: string) => { setSectionTarget(s); setSectionName(s); setSectionEmoji(emojiMap.get(s) || ''); setModal('section'); setError(''); };
  const openEditSub = (sec: string, sub: string) => { setSubcatTarget({ section: sec, name: sub }); setSubcatName(sub); setSubcatEmoji(emojiMap.get(`${sec}::${sub}`) || ''); setModal('subcategory'); setError(''); };
  const openHistory = async (t: InfoTopic) => {
    setHistoryFor(t); setModal('history'); setHistLoad(true);
    try { setHistory(await getTopicHistory(t.id)); } catch { setHistory([]); } finally { setHistLoad(false); }
  };
  const toggleExpand = (id: number) => setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const submitTopic = async () => {
    if (!form.name?.trim()) { setError('Name is required.'); return; }
    setSaving(true); setError('');
    try {
      if (modal === 'create') await createInfoTopic(guildId, form);
      else if (modal === 'edit' && form.id) await updateInfoTopic(form.id, form);
      setModal(null); load();
    } catch(e) { setError((e as Error).message); } finally { setSaving(false); }
  };
  const submitSection = async () => {
    if (!sectionName.trim()) { setError('Name cannot be empty.'); return; }
    setSaving(true); setError('');
    try {
      await updateInfoSection(guildId, sectionTarget, sectionName.trim().toLowerCase().replace(/\s+/g, '_'), sectionEmoji.trim() || undefined);
      setModal(null); load();
    } catch(e) { setError((e as Error).message); } finally { setSaving(false); }
  };
  const submitSub = async () => {
    if (!subcatName.trim()) { setError('Name cannot be empty.'); return; }
    setSaving(true); setError('');
    try {
      await updateInfoSubcategory(guildId, subcatTarget.section, subcatTarget.name, subcatName.trim(), subcatEmoji.trim() || undefined);
      setModal(null); load();
    } catch(e) { setError((e as Error).message); } finally { setSaving(false); }
  };
  const del = async (t: InfoTopic) => {
    if (!confirm(`Delete "${t.name}"?`)) return;
    try { await deleteInfoTopic(t.id); setTopics(p => p.filter(x => x.id !== t.id)); }
    catch(e) { setError((e as Error).message); }
  };
  const togglePublish = async (t: InfoTopic) => {
    const next = !t.is_published;
    setTopics(p => p.map(x => x.id === t.id ? { ...x, is_published: next } : x));
    await setTopicPublished(t.id, next).catch(() => load());
  };
  const doRestore = async (entry: TopicHistoryEntry) => {
    if (!historyFor || !confirm('Restore this version?')) return;
    await restoreTopicVersion(entry.id, historyFor.id);
    setModal(null); load();
  };
  const doExport = async () => {
    const data = await exportInfoTopics(guildId);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `info_topics_${guildId}_${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); URL.revokeObjectURL(url);
  };
  const doImport = async () => {
    setSaving(true); setImportResult(null);
    try {
      const parsed = JSON.parse(importJson);
      const ts = parsed.topics ?? (Array.isArray(parsed) ? parsed : []);
      const r = await importInfoTopics(guildId, ts, importMode);
      setImportResult(r); load();
    } catch(e) { setError((e as Error).message); } finally { setSaving(false); }
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
      <div style={{ width: 32, height: 32, border: '2px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  );

  return (
    <div className="animate-fade" style={{ maxWidth: 860 }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 3 }}>
          {(['topics', 'audit'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: '6px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: tab === t ? 'var(--primary-subtle)' : 'var(--elevated)', color: tab === t ? '#818cf8' : 'var(--text-muted)', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>
              {t === 'topics' ? <><BookOpen size={11} /> Topics</> : <><ClipboardList size={11} /> Audit</>}
            </button>
          ))}
        </div>

        {tab === 'topics' && <>
          <div style={{ position: 'relative', flex: '1 1 160px', minWidth: 130 }}>
            <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)', pointerEvents: 'none' }} />
            <input className="inp" style={{ paddingLeft: 26, fontSize: 12, height: 30 }} placeholder="Search topics…" value={search} onChange={e => setSearch(e.target.value)} />
            {search && <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', padding: 0 }}><X size={11} /></button>}
          </div>
          <div style={{ display: 'flex', gap: 3 }}>
            {([['all', 'All'], ['published', 'Live'], ['draft', 'Draft']] as [SearchFilter, string][]).map(([v, l]) => (
              <button key={v} onClick={() => setFilter(v)} style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${statusFilter === v ? '#818cf8' : 'var(--border)'}`, background: statusFilter === v ? 'var(--primary-subtle)' : 'var(--elevated)', color: statusFilter === v ? '#818cf8' : 'var(--text-muted)', cursor: 'pointer', fontSize: 11, fontWeight: statusFilter === v ? 700 : 400 }}>{l}</button>
            ))}
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>
            {pubCount} live{draftCount > 0 && <span style={{ color: '#faa81a' }}> · {draftCount} draft</span>}
          </span>
        </>}

        <div style={{ display: 'flex', gap: 5, marginLeft: 'auto' }}>
          {tab === 'topics' && <>
            <button className="btn btn-ghost btn-sm" onClick={doExport} title="Export JSON"><Download size={12} /></button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setImportJson(''); setImportResult(null); setModal('import'); }} title="Import JSON"><Upload size={12} /></button>
          </>}
          <button className="btn btn-primary" style={{ fontSize: 12, padding: '5px 14px' }} onClick={openCreate}><Plus size={12} /> New Topic</button>
        </div>
      </div>

      {error && !modal && <div style={{ background: 'var(--danger-subtle)', border: '1px solid var(--danger)', borderRadius: 10, padding: '10px 14px', color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</div>}

      {/* ── AUDIT TAB ── */}
      {tab === 'audit' && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Edit History</span>
            <button className="btn btn-ghost btn-sm" onClick={loadAudit}>Refresh</button>
          </div>
          {auditLoading ? <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>
            : audit.length === 0 ? <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No audit events yet.</div>
            : <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr style={{ background: 'var(--elevated)', borderBottom: '1px solid var(--border)' }}>
                  {['Action', 'Topic', 'By', 'When'].map(h => <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>)}
                </tr></thead>
                <tbody>{audit.map(a => (
                  <tr key={a.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 14px' }}><span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: a.action === 'create' ? 'rgba(59,165,93,0.15)' : a.action === 'delete' ? 'rgba(237,66,69,0.15)' : a.action === 'publish' ? 'rgba(88,101,242,0.15)' : 'rgba(255,255,255,0.07)', color: a.action === 'create' ? '#3ba55d' : a.action === 'delete' ? '#ed4245' : a.action === 'publish' ? '#818cf8' : 'var(--text-muted)' }}>{a.action}</span></td>
                    <td style={{ padding: '8px 14px', fontSize: 13 }}>{a.topic_name || '—'} {a.topic_id && <span className="mono" style={{ fontSize: 11, color: 'var(--text-faint)' }}>({a.topic_id})</span>}</td>
                    <td style={{ padding: '8px 14px', fontSize: 12, color: 'var(--text-muted)' }}>{a.changed_by}</td>
                    <td style={{ padding: '8px 14px', fontSize: 12, color: 'var(--text-faint)' }}>{ago(a.created_at)}</td>
                  </tr>
                ))}</tbody>
              </table>}
        </div>
      )}

      {/* ── TOPICS TAB ── */}
      {tab === 'topics' && (
        filtered.length === 0 ? (
          search || statusFilter !== 'all'
            ? <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No topics match your filter.</div>
            : <EmptyState onAdd={openCreate} />
        ) : (
          <div>
            {Object.entries(grouped).map(([section, subcats]) => (
              <SectionGroup key={section} section={section} subcats={subcats}
                emojiMap={emojiMap} expandedIds={expandedIds}
                onToggleExpand={toggleExpand}
                onEdit={openEdit} onDelete={del}
                onTogglePublish={togglePublish} onHistory={openHistory}
                onEditSection={openEditSec} onEditSub={openEditSub} />
            ))}
          </div>
        )
      )}

      {/* ── MODALS ── */}

      {/* Create / Edit topic */}
      {(modal === 'create' || modal === 'edit') && (
        <Modal title={modal === 'create' ? '➕ New Info Topic' : '✏️ Edit Topic'} onClose={() => setModal(null)} width={680}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
            <F label="Name *"><input className="inp" value={form.name || ''} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Display name" /></F>
            <F label="Topic ID *" hint="used in /info command"><input className="inp" value={form.topic_id || ''} onChange={e => setForm(p => ({ ...p, topic_id: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') }))} placeholder="e.g. how_to_join" style={{ fontFamily: 'var(--font-mono)' }} /></F>
            <F label="Section"><input className="inp" value={form.section || ''} onChange={e => setForm(p => ({ ...p, section: e.target.value }))} placeholder="e.g. general" /></F>
            <F label="Subcategory"><input className="inp" value={form.subcategory || ''} onChange={e => setForm(p => ({ ...p, subcategory: e.target.value }))} placeholder="e.g. Getting Started" /></F>
            <F label="Embed Color"><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="color" value={form.embed_color || '#5865F2'} onChange={e => setForm(p => ({ ...p, embed_color: e.target.value }))} style={{ width: 40, height: 32, borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer', padding: 2 }} /><input className="inp" value={form.embed_color || ''} onChange={e => setForm(p => ({ ...p, embed_color: e.target.value }))} style={{ fontFamily: 'var(--font-mono)' }} /></div></F>
            <F label="Emoji"><input className="inp" value={form.emoji || ''} onChange={e => setForm(p => ({ ...p, emoji: e.target.value }))} placeholder="📄" style={{ fontSize: 20 }} /></F>
          </div>
          <F label="Embed Title"><input className="inp" value={form.embed_title || ''} onChange={e => setForm(p => ({ ...p, embed_title: e.target.value }))} placeholder="Title shown in Discord embed" /></F>
          <F label="Embed Description" hint={`${(form.embed_description?.length ?? 0)}/4000 chars · supports markdown`}>
            <textarea className="inp" rows={6} value={form.embed_description || ''} onChange={e => setForm(p => ({ ...p, embed_description: e.target.value }))} placeholder="Main content of the embed. Supports **bold**, _italic_, [links](url)" style={{ resize: 'vertical', lineHeight: 1.5, maxHeight: 220 }} />
          </F>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <F label="Image URL" hint="big image at bottom"><input className="inp" value={form.image || ''} onChange={e => setForm(p => ({ ...p, image: e.target.value }))} placeholder="https://…" /></F>
            <F label="Thumbnail URL" hint="small top-right"><input className="inp" value={form.thumbnail || ''} onChange={e => setForm(p => ({ ...p, thumbnail: e.target.value }))} placeholder="https://…" /></F>
          </div>
          <F label="Footer"><input className="inp" value={form.footer || ''} onChange={e => setForm(p => ({ ...p, footer: e.target.value }))} placeholder="Footer text" /></F>

          <div style={{ background: 'var(--elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, margin: '12px 0', maxHeight: 380, overflowY: 'auto' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Preview — matches bot output</div>
            <EmbedPreview topic={form} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, flexWrap: 'wrap', gap: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" className="toggle" checked={form.is_published ?? true} onChange={e => setForm(p => ({ ...p, is_published: e.target.checked }))} />
              Published (visible to users)
            </label>
            {error && <div style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={submitTopic} disabled={saving}>{saving ? 'Saving…' : modal === 'create' ? 'Create Topic' : 'Save Changes'}</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit section */}
      {modal === 'section' && (
        <Modal title="✏️ Edit Section" onClose={() => setModal(null)} width={400}>
          <F label="Section Name"><input className="inp" value={sectionName} onChange={e => setSectionName(e.target.value)} /></F>
          <F label="Category Emoji / Icon"><EmojiPicker value={sectionEmoji} onChange={setSectionEmoji} /></F>
          {error && <div style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 8 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={submitSection} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </Modal>
      )}

      {/* Edit subcategory */}
      {modal === 'subcategory' && (
        <Modal title="✏️ Edit Subcategory" onClose={() => setModal(null)} width={400}>
          <F label="Subcategory Name"><input className="inp" value={subcatName} onChange={e => setSubcatName(e.target.value)} /></F>
          <F label="Emoji"><EmojiPicker value={subcatEmoji} onChange={setSubcatEmoji} /></F>
          {error && <div style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 8 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={submitSub} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </Modal>
      )}

      {/* History */}
      {modal === 'history' && historyFor && (
        <Modal title={`📜 History: ${historyFor.name}`} onClose={() => setModal(null)} width={580}>
          {histLoading ? <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
            : history.length === 0 ? <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>No history yet.</div>
            : history.map(h => (
              <div key={h.id} style={{ background: 'var(--elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{ago(h.created_at)} by {h.changed_by}</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => doRestore(h)}><RotateCcw size={10} /> Restore</button>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500, marginBottom: 3 }}>{h.snapshot?.embed_title || '(no title)'}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'pre-wrap', maxHeight: 80, overflow: 'hidden' }}>{h.snapshot?.embed_description || ''}</div>
              </div>
            ))}
        </Modal>
      )}

      {/* Import */}
      {modal === 'import' && (
        <Modal title="⬆️ Import Topics" onClose={() => setModal(null)} width={520}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {(['merge', 'replace'] as const).map(m => (
              <button key={m} onClick={() => setImportMode(m)} style={{ flex: 1, padding: '8px', borderRadius: 7, border: `1px solid ${importMode === m ? '#818cf8' : 'var(--border)'}`, background: importMode === m ? 'var(--primary-subtle)' : 'var(--elevated)', color: importMode === m ? '#818cf8' : 'var(--text-muted)', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>
                {m === 'merge' ? '🔀 Merge (add missing)' : '♻️ Replace (clear all)'}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()}>📁 Choose file</button>
            <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (!f) return; new FileReader().onload = ev => setImportJson(ev.target?.result as string ?? ''); }} />
            <span style={{ fontSize: 12, color: 'var(--text-faint)', alignSelf: 'center' }}>or paste JSON below</span>
          </div>
          <textarea className="inp" rows={8} value={importJson} onChange={e => setImportJson(e.target.value)} placeholder='{"topics": [...]}' style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }} />
          {importResult && <div style={{ marginTop: 8, padding: '8px 12px', background: 'rgba(59,165,93,0.1)', border: '1px solid rgba(59,165,93,0.3)', borderRadius: 7, fontSize: 12, color: '#3ba55d' }}>✓ Imported {importResult.imported}, skipped {importResult.skipped}</div>}
          {error && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 8 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
            <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={doImport} disabled={saving || !importJson.trim()}>{saving ? 'Importing…' : 'Import'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}