const VARIANTS = {
  error: 'border-danger/30 bg-danger/10 text-danger',
  success: 'border-accent/30 bg-accent/10 text-accent',
  info: 'border-info/30 bg-info/10 text-info',
};

export default function Alert({ variant = 'error', children }) {
  if (!children) return null;
  return (
    <div role={variant === 'error' ? 'alert' : 'status'} className={`rounded-xl border px-3.5 py-2.5 text-sm backdrop-blur ${VARIANTS[variant]}`}>
      {children}
    </div>
  );
}
