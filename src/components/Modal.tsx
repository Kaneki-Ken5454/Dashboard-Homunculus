import { type ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: string;
}

export default function Modal({ title, onClose, children, width = 'max-w-lg' }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className={`w-full ${width} animate-fade`}
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14 }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '18px 20px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 600, fontSize: 15, color: 'var(--text)' }}>{title}</span>
          <button onClick={onClose} className="btn btn-ghost btn-sm" style={{ padding: '4px 6px' }}>
            <X size={15} />
          </button>
        </div>
        {/* Body */}
        <div style={{ padding: '20px' }}>
          {children}
        </div>
      </div>
    </div>
  );
}
