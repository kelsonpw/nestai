/** Tiny presentational primitives used across views. */
import type { PropsWithChildren, ReactNode } from 'react';

export function Card({
  title,
  subtitle,
  actions,
  children,
}: PropsWithChildren<{
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}>) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div>
            {title && <h2 className="text-sm font-semibold text-ink">{title}</h2>}
            {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

const TONES: Record<string, string> = {
  slate: 'bg-slate-100 text-slate-700',
  blue: 'bg-blue-100 text-blue-700',
  green: 'bg-green-100 text-green-700',
  amber: 'bg-amber-100 text-amber-800',
  red: 'bg-red-100 text-red-700',
  violet: 'bg-violet-100 text-violet-700',
};

export function Badge({
  children,
  tone = 'slate',
}: PropsWithChildren<{ tone?: keyof typeof TONES | string }>) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        TONES[tone] ?? TONES.slate
      }`}
    >
      {children}
    </span>
  );
}

export function Button({
  children,
  onClick,
  variant = 'default',
  disabled,
  type = 'button',
  title,
}: PropsWithChildren<{
  onClick?: () => void;
  variant?: 'default' | 'primary' | 'success' | 'danger' | 'ghost';
  disabled?: boolean;
  type?: 'button' | 'submit';
  title?: string;
}>) {
  const styles: Record<string, string> = {
    default: 'bg-white text-ink border border-slate-300 hover:bg-slate-50',
    primary: 'bg-blue-600 text-white hover:bg-blue-700',
    success: 'bg-green-600 text-white hover:bg-green-700',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    ghost: 'bg-transparent text-slate-600 hover:bg-slate-100',
  };
  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center rounded-md px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]}`}
    >
      {children}
    </button>
  );
}

export function EmptyState({ children }: PropsWithChildren) {
  return <p className="py-6 text-center text-sm text-slate-400">{children}</p>;
}
