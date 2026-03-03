import { useState, useEffect } from 'react';
import { Database, ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react';
import { setDatabaseUrl, testConnection } from '../lib/db';

interface Props { onConnect: () => void; }

export default function Setup({ onConnect }: Props) {
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  const [autoTrying, setAutoTrying] = useState(true);

  // On mount, try auto-connecting via the Express server (no URL needed from user)
  useEffect(() => {
    async function tryAuto() {
      try {
        await testConnection('');
        // Server is up and connected — store a sentinel value so isConfigured() returns true
        setDatabaseUrl('postgresql://connected-via-server');
        onConnect();
      } catch {
        setAutoTrying(false);
      }
    }
    tryAuto();
  }, []);

  async function connect() {
    setTesting(true); setError('');
    try {
      await testConnection('');
      setDatabaseUrl('postgresql://connected-via-server');
      onConnect();
    } catch (e) {
      setError(`Connection failed: ${(e as Error).message}`);
    } finally {
      setTesting(false);
    }
  }

  if (autoTrying) {
    return (
      <div style={{ height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg)' }}>
        <div style={{ textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>
          <div style={{ marginBottom:12 }}>Connecting to database…</div>
          <div style={{ width:24, height:24, border:'2px solid var(--border)', borderTopColor:'#5865f2', borderRadius:'50%', animation:'spin 0.8s linear infinite', margin:'0 auto' }} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg)', padding:24 }}>
      <div style={{ width:'100%', maxWidth:480, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:16, padding:'36px 32px' }}>

        <div style={{ width:52, height:52, borderRadius:14, background:'linear-gradient(135deg,#5865f2,#7983f5)', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:20 }}>
          <Database size={24} color="white" />
        </div>

        <h1 style={{ fontSize:20, fontWeight:700, color:'var(--text)', margin:'0 0 8px' }}>
          Connect to Database
        </h1>
        <p style={{ fontSize:13, color:'var(--text-muted)', margin:'0 0 28px', lineHeight:1.6 }}>
          The dashboard connects through the local API server — your connection string stays in <code style={{ background:'var(--elevated)', padding:'1px 5px', borderRadius:4, fontSize:12 }}>.env</code> and never touches the browser.
        </p>

        <div style={{ background:'var(--elevated)', border:'1px solid var(--border)', borderRadius:10, padding:'14px 16px', marginBottom:20, fontSize:12, color:'var(--text-muted)', lineHeight:1.8 }}>
          <strong style={{ color:'var(--text)' }}>Make sure the server is running:</strong><br />
          <code style={{ color:'#818cf8' }}>node server/index.js</code>
          <br /><br />
          <strong style={{ color:'var(--text)' }}>And your <code style={{ fontSize:12 }}>.env</code> contains:</strong><br />
          <code style={{ color:'#818cf8' }}>NEON_DATABASE_URL=postgresql://...</code>
        </div>

        {error && (
          <div style={{ display:'flex', alignItems:'flex-start', gap:8, background:'var(--danger-subtle)', border:'1px solid var(--danger)', borderRadius:8, padding:'10px 12px', marginBottom:16, fontSize:12, color:'var(--danger)' }}>
            <AlertCircle size={14} style={{ flexShrink:0, marginTop:1 }} />
            {error}
          </div>
        )}

        <button className="btn btn-primary" style={{ width:'100%', justifyContent:'center', marginTop:4 }} onClick={connect} disabled={testing}>
          {testing ? 'Connecting…' : <><ArrowRight size={14} /> Connect & Open Dashboard</>}
        </button>

        <div style={{ marginTop:16, padding:'12px 14px', background:'var(--elevated)', borderRadius:10, fontSize:11, color:'var(--text-faint)', lineHeight:1.7 }}>
          <CheckCircle2 size={12} style={{ display:'inline', marginRight:5, color:'var(--success)', verticalAlign:'middle' }} />
          Your credentials are never sent to the browser — all queries go through <code>server/index.js</code>.
        </div>
      </div>
    </div>
  );
}
