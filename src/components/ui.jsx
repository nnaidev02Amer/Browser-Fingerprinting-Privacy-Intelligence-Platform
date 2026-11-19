import { STATUS_LABEL } from '../collectors/runner';
import { formatValue } from '../utils/reportView';

/** Shared presentational building blocks (the app's small design system). */

export function Card({ title, subtitle, actions, children, id, className = '', focusable = false }) {
  return (
    <section
      id={id}
      // `focusable` lets code move keyboard focus here (e.g. after a result appears or a dialog closes).
      tabIndex={focusable ? -1 : undefined}
      className={`surface rounded-2xl p-5 sm:p-7 ${focusable ? 'focus:outline-none' : ''} ${className}`}
      aria-labelledby={id && title ? `${id}-title` : undefined}
    >
      {(title || actions) && (
        <header className="mb-5 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 id={id ? `${id}-title` : undefined} className="font-display text-lg font-semibold leading-snug tracking-[-0.02em] text-slate-50">
              {title}
            </h2>
            {subtitle && <p className="mt-1 text-[13px] leading-relaxed text-slate-400">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

/** Title block at the top of each view. Uses h2 (the app name is the single h1). */
export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-700 pb-6 pt-4">
      <div className="min-w-0">
        <span aria-hidden="true" className="mb-4 block h-px w-10 bg-clay-400" />
        <h2 className="font-display text-4xl font-bold tracking-[-0.035em] text-slate-50 sm:text-5xl">{title}</h2>
        {subtitle && <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const BUTTON_STYLES = {
  primary: 'bg-slate-50 text-slate-950 hover:bg-slate-200 disabled:bg-slate-700 disabled:text-slate-400',
  secondary: 'border border-slate-600 bg-transparent text-slate-100 hover:border-slate-400 hover:bg-white/5 disabled:border-slate-700 disabled:text-slate-400',
  danger: 'bg-red-600 text-white hover:bg-red-500 disabled:bg-slate-700',
  ghost: 'text-cyan-300 hover:bg-white/5 disabled:text-slate-400',
};

export function Button({ variant = 'secondary', className = '', ...props }) {
  return (
    <button
      type="button"
      className={`rounded-full px-4 py-2 text-sm font-medium transition duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:cursor-not-allowed ${BUTTON_STYLES[variant]} ${className}`}
      {...props}
    />
  );
}

// Status is always shown as text AND colour, never colour alone.
const BADGE_STYLES = {
  ok: 'bg-emerald-950 text-emerald-300 border-emerald-800',
  unsupported: 'bg-slate-800 text-slate-300 border-slate-600',
  timeout: 'bg-amber-950 text-amber-300 border-amber-800',
  error: 'bg-red-950 text-red-300 border-red-800',
  disabled: 'bg-slate-900 text-slate-400 border-slate-700',
};

export function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${BADGE_STYLES[status] ?? BADGE_STYLES.disabled}`}>
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

const PILL_TONES = {
  neutral: 'border-slate-600 bg-slate-800 text-slate-200',
  cyan: 'border-cyan-800 bg-cyan-950 text-cyan-200',
  emerald: 'border-emerald-800 bg-emerald-950 text-emerald-200',
  amber: 'border-amber-800 bg-amber-950 text-amber-200',
  rose: 'border-red-800 bg-red-950 text-red-200',
};

/** Small label chip (stable/variable, exposure class, counts). Always carries text. */
export function Pill({ tone = 'neutral', children, className = '' }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${PILL_TONES[tone]} ${className}`}>{children}</span>;
}

/** Headline number with a label and an optional explanation. */
export function StatTile({ label, value, hint, tone = 'neutral' }) {
  const valueTone = { neutral: 'text-slate-50', good: 'text-emerald-300', warn: 'text-amber-300', accent: 'text-cyan-300' }[tone];
  const dot = { neutral: 'bg-slate-500', good: 'bg-emerald-400', warn: 'bg-amber-400', accent: 'bg-cyan-500' }[tone];
  return (
    <div className="surface min-w-0 rounded-2xl p-5">
      <p className="eyebrow flex items-center gap-2 text-slate-400"><span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${dot}`} />{label}</p>
      <p className={`mt-3 truncate font-display text-4xl font-bold tracking-[-0.03em] tabular-nums ${valueTone}`}>{value}</p>
      {hint && <p className="mt-1 text-xs leading-snug text-slate-400">{hint}</p>}
    </div>
  );
}

/** Definition list of label/value pairs. */
export function KeyValue({ items }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
      {items.map(({ label, value }) => (
        <div key={label} className="min-w-0">
          <dt className="eyebrow text-slate-400">{label}</dt>
          <dd className="break-words text-slate-100">{formatValue(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Explains why a card has no data, based on the collector's status. */
export function Unavailable({ status, reason }) {
  const text = {
    unsupported: 'Not available in this browser.',
    timeout: 'The collector did not finish in time.',
    error: 'The collector failed.',
    disabled: 'Disabled: not collected.',
  }[status] ?? 'No data.';
  return (
    <p className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
      <StatusBadge status={status} />
      <span>{text}</span>
      {reason && <span className="text-xs text-slate-400">({reason})</span>}
    </p>
  );
}

/** Placeholder block while data is loading (respects reduced motion via CSS). */
export function Skeleton({ className = 'h-4 w-full' }) {
  return <div aria-hidden="true" className={`skeleton rounded ${className}`} />;
}

/** Friendly empty state with an optional call to action. */
export function EmptyState({ title, children, action, icon = '◌' }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-600 px-6 py-12 text-center">
      <p aria-hidden="true" className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-slate-600 bg-slate-800 text-2xl text-slate-300">{icon}</p>
      <p className="mt-4 font-display text-2xl font-bold tracking-[-0.03em] text-slate-50">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-xl text-sm leading-relaxed text-slate-400">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Error state: always announced to assistive technology. */
export function ErrorState({ title = 'Something went wrong', children, action }) {
  return (
    <div role="alert" className="rounded-2xl border border-red-800 border-l-4 bg-red-950/60 p-5 text-sm text-red-100">
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-1 leading-relaxed">{children}</div>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
