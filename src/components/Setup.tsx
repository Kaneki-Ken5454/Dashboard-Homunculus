import { useState } from 'react';
import { Database, ArrowRight, AlertCircle } from 'lucide-react';
import { setDatabaseUrl, testConnection } from '../lib/db';

interface Props { onConnect: () => void; }

export default function Setup({ onConnect }: Props) {
  const [url, setUrl] = useState('');
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');

  async function connect() {
    const trimmed = url.trim();
    if (!trimmed.startsWith('postgresql') && !trimmed.startsWith('postgres://')) {
      setError('Must start with postgresql:// or postgres://');
      return;
    }
    setTesting(true); setError('');
    try {
      await testConnection(trimmed);
      setDatabaseUrl(trimmed);
      onConnect();
    } catch (e) {
      setError(`Connection failed: ${(e as Error).message}`);
    } finally {
      setTesting(false);
    }
  }

  return (
    <div style={{ height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg)', padding:24 }}>
      <div style={{ width:'100%', maxWidth:480, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:16, padding:'36px 32px' }}>

        <div style={{ width:52, height:52, borderRadius:14, background:'linear-gradient(135deg,#5865f2,#7983f5)', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:20 }}>
          <Database size={24} color="white" />
        </div>

        <h1 style={{ fontSize:20, fontWeight:700, color:'var(--text)', margin:'0 0 8px' }}>
          Connect your NeonDB
        </h1>
        <p style={{ fontSize:13, color:'var(--text-muted)', margin:'0 0 28px', lineHeight:1.6 }}>
          Paste your NeonDB connection string below. It's saved to your browser's localStorage and sent only to NeonDB directly.
        </p>

        <label style={{ fontSize:12, fontWeight:500, color:'var(--text-muted)', display:'block', marginBottom:7 }}>
          Connection String
        </label>
        <input
          className="inp mono"
          style={{ fontSize:12, marginBottom:8 }}
          placeholder="postgresql://user:password@ep-xxx.region.aws.neon.tech/dbname?sslmode=require"
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && connect()}
          spellCheck={false}
        />

        {error && (
          <div style={{ display:'flex', alignItems:'flex-start', gap:8, background:'var(--danger-subtle)', border:'1px solid var(--danger)', borderRadius:8, padding:'10px 12px', marginBottom:16, fontSize:12, color:'var(--danger)' }}>
            <AlertCircle size={14} style={{ flexShrink:0, marginTop:1 }} />
            {error}
          </div>
        )}

        <button className="btn btn-primary" style={{ width:'100%', justifyContent:'center', marginTop:4 }} onClick={connect} disabled={testing || !url.trim()}>
          {testing ? 'Testing connection…' : <><ArrowRight size={14} /> Connect & Open Dashboard</>}
        </button>

        <div style={{ marginTop:20, padding:'14px 16px', background:'var(--elevated)', borderRadius:10, fontSize:12, color:'var(--text-muted)', lineHeight:1.7 }}>
          <strong style={{ color:'var(--text)' }}>Where to find it:</strong><br />
          NeonDB Console → Your Project → Dashboard → <strong>Connection string</strong><br />
          Use the <strong>pooled</strong> connection string for best performance.
        </div>
      </div>
    </div>
  );
}
