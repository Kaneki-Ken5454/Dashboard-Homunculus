interface Props {
  label: string;
  variant?: 'success' | 'danger' | 'warning' | 'primary' | 'muted';
}

const styles: Record<string, React.CSSProperties> = {
  success: { background: 'var(--success-subtle)', color: '#3ba55d' },
  danger:  { background: 'var(--danger-subtle)',  color: 'var(--danger)' },
  warning: { background: 'var(--warning-subtle)', color: 'var(--warning)' },
  primary: { background: 'var(--primary-subtle)', color: '#818cf8' },
  muted:   { background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' },
};

export default function Badge({ label, variant = 'muted' }: Props) {
  return (
    <span style={{
      ...styles[variant],
      padding: '2px 9px', borderRadius: 20,
      fontSize: 11, fontWeight: 600, letterSpacing: '0.04em',
      textTransform: 'uppercase', whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}
