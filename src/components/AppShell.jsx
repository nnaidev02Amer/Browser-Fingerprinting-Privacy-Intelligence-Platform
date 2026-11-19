import { NAV_GROUP_LABELS, PROJECT_NAME, navSections } from '../config/navigation';

function Icon({ path }) {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

function BrandMark() {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-600 bg-slate-800" aria-hidden="true">
      <svg viewBox="0 0 24 24" className="h-5 w-5 text-cyan-300" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" />
        <path d="M9 11a3 3 0 016 0v2m-3-1v3a3 3 0 01-.6 1.8M9.2 14.5c0 1 .2 1.8.6 2.5" />
      </svg>
    </span>
  );
}

function NavItem({ id, label, icon, active, onTab }) {
  return (
    <button
      key={id}
      type="button"
      aria-current={active ? 'page' : undefined}
      onClick={() => onTab(id)}
      className={`flex shrink-0 items-center gap-3 whitespace-nowrap rounded-full border px-3.5 py-2 text-left text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 ${
        active ? 'border-slate-600 bg-white/[0.07] font-medium text-slate-50' : 'border-transparent text-slate-400 hover:bg-white/5 hover:text-slate-100'
      }`}
    >
      <span className={active ? 'text-clay-400' : ''}><Icon path={icon} /></span>
      {label}
    </button>
  );
}

/**
 * Sidebar on large screens; on tablet/mobile the same landmark becomes a compact top bar with a
 * horizontally scrolling navigation. `status` shows real facts about the current session only.
 */
export default function AppShell({ tab, onTab, showTabs, status, children }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
      <header className="border-b border-slate-700 bg-slate-950 lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-3 px-4 py-3 lg:px-6 lg:pb-6 lg:pt-7">
          <BrandMark />
          <div className="min-w-0">
            <h1 className="font-display text-[15px] font-bold leading-snug tracking-[-0.02em] text-slate-50">{PROJECT_NAME}</h1>
            <p className="eyebrow mt-1 text-clay-400">Research prototype</p>
          </div>
        </div>

        {showTabs && (
          <nav aria-label="Sections" className="flex gap-1 overflow-x-auto px-2 pb-2 lg:flex-col lg:overflow-visible lg:px-4 lg:pb-0">
            {navSections().map((section) => (section.group ? (
              <div key={section.group} role="group" aria-label={section.label} className="flex gap-1 lg:flex-col">
                <p aria-hidden="true" className="eyebrow hidden px-3.5 pb-2 pt-6 text-slate-400 lg:block">{NAV_GROUP_LABELS[section.group]}</p>
                {section.items.map((item) => <NavItem key={item.id} {...item} active={tab === item.id} onTab={onTab} />)}
              </div>
            ) : section.items.map((item) => <NavItem key={item.id} {...item} active={tab === item.id} onTab={onTab} />)))}
          </nav>
        )}

        <ul aria-label="Session status" className="mt-auto flex flex-wrap gap-2 border-t border-slate-700 px-4 py-3 text-xs text-slate-400 lg:flex-col lg:gap-2.5 lg:px-6 lg:py-5">
          <li className="flex items-center gap-2">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Processed locally
          </li>
          <li className="flex items-center gap-2">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Fingerprint data uploaded: never
          </li>
          {status && (
            <>
              <li className="hidden items-center gap-2 lg:flex">
                <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${status.thirdPartyRequests ? 'bg-amber-400' : 'bg-slate-500'}`} />
                Third-party requests (last run): <span className="tabular-nums text-slate-100">{status.thirdPartyRequests}</span>
              </li>
              <li className="hidden items-center gap-2 lg:flex">
                <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${status.optionalOn ? 'bg-cyan-400' : 'bg-slate-500'}`} />
                Optional collectors on: <span className="tabular-nums text-slate-100">{status.optionalOn} of {status.optionalTotal}</span>
              </li>
            </>
          )}
        </ul>
      </header>

      <div className="min-w-0">{children}</div>
    </div>
  );
}
