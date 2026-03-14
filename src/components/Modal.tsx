import { type ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: number | string;
}

export default function Modal({ title, onClose, children, width = '560px' }: Props) {
  const maxWidth = typeof width === 'number' ? `${width}px` : width;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
        overflowY: 'auto',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: maxWidth,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          display: 'flex',
          flexDirection: 'column',
          maxHeight: 'calc(100dvh - 32px)',
          margin: 'auto',
        }}
        className="animate-fade"
      >
        <div style={{
          padding: '18px 20px 16px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
          background: 'var(--surface)',
          borderRadius: '14px 14px 0 0',
        }}>
          <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)' }}>{title}</span>
          <button onClick={onClose} className="btn btn-ghost btn-sm" style={{ padding: '4px 6px' }}>
            <X size={15} />
          </button>
        </div>
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
          {children}
        </div>
      </div>
    </div>
  );
}
