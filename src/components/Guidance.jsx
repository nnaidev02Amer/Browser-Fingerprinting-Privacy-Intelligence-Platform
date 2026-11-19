import { Button } from './ui';

/** A short explanation in everyday words, shown next to the technical result. */
export function PlainBox({ title = 'In plain English', children, testId }) {
  return (
    <div data-testid={testId} className="rounded-2xl border border-slate-700 border-l-2 border-l-clay-400 bg-slate-900 p-5 text-[15px] leading-relaxed text-slate-200">
      <p className="eyebrow text-clay-400">{title}</p>
      <div className="mt-2 space-y-2">{children}</div>
    </div>
  );
}

/**
 * "What to do next": one to three clear actions. Each step is a real button, so keyboard users can reach it.
 * @param {{label: string, hint: string, onClick: () => void, primary?: boolean}[]} steps
 */
export function NextSteps({ steps, title = 'What to do next' }) {
  if (!steps.length) return null;
  return (
    <section aria-label={title} className="surface rounded-2xl p-5 sm:p-7" data-testid="next-steps">
      <h2 className="eyebrow text-slate-400">{title}</h2>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((s, i) => (
          <li key={s.label} className={`flex flex-col items-start gap-3 rounded-xl border p-5 text-sm text-slate-300 transition-colors hover:border-slate-500 ${s.primary ? 'border-cyan-800 bg-cyan-950' : 'border-slate-700 bg-slate-950'}`}>
            <span aria-hidden="true" className="font-display text-2xl font-bold leading-none tracking-[-0.03em] text-clay-400">{String(i + 1).padStart(2, '0')}</span>
            <span className="flex-1">{s.hint}</span>
            <Button variant={s.primary ? 'primary' : 'secondary'} onClick={s.onClick}>{s.label}</Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
