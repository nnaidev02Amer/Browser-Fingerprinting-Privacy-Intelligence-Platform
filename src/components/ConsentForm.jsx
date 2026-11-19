import { ESSENTIAL, OPTIONAL_CATEGORIES } from '../config/consentCategories';

function Details({ category }) {
  return (
    <details className="mt-2 text-xs text-slate-400">
      <summary className="cursor-pointer text-cyan-300">
        What, why and where
        <span className="sr-only"> for {category.title}</span>
      </summary>
      <div className="mt-2 space-y-2">
        <div>
          <p className="font-semibold text-slate-300">What is collected</p>
          <ul className="list-disc pl-5">
            {category.what.map((line) => <li key={line}>{line}</li>)}
          </ul>
        </div>
        <p><span className="font-semibold text-slate-300">Why: </span>{category.why}</p>
        <p><span className="font-semibold text-slate-300">Where it is processed: </span>{category.where}</p>
        <p>
          <span className="font-semibold text-slate-300">Third parties contacted: </span>
          {category.thirdParties.length
            ? category.thirdParties.map((t) => t.host).join(', ')
            : 'none'}
        </p>
      </div>
    </details>
  );
}

/**
 * The consent choices. Essential signals are explained but not a toggle; each
 * optional category is a switch that is OFF unless the user turns it on, and
 * turning it off again revokes it immediately.
 */
export default function ConsentForm({ choices, onChange }) {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-slate-700 bg-slate-950 p-3">
        <p className="text-sm font-semibold text-slate-100">{ESSENTIAL.title}</p>
        <p className="mt-1 text-xs text-slate-400">{ESSENTIAL.summary}</p>
        <Details category={ESSENTIAL} />
      </div>

      {OPTIONAL_CATEGORIES.map((category) => {
        const inputId = `consent-${category.id}`;
        const checked = choices[category.id] === true;
        return (
          <div key={category.id} className="rounded-lg border border-slate-700 bg-slate-950 p-3">
            <div className="flex items-start gap-3">
              <input
                id={inputId}
                type="checkbox"
                role="switch"
                className="mt-1 h-4 w-4 shrink-0 accent-cyan-400"
                checked={checked}
                onChange={(e) => onChange(category.id, e.target.checked)}
              />
              <div className="min-w-0">
                <label htmlFor={inputId} className="cursor-pointer text-sm font-semibold text-slate-100">
                  {category.title}
                  {/* Visual state hint only: the switch role already announces on/off, so keep it out of the name. */}
                  <span aria-hidden="true" className="ml-2 text-xs font-normal text-slate-400">{checked ? 'On' : 'Off'}</span>
                </label>
                <p className="mt-1 text-xs text-slate-400">{category.summary}</p>
                {category.thirdParties.length > 0 && (
                  <p className="mt-1 text-xs text-amber-300">
                    Contacts a third party: {category.thirdParties.map((t) => t.host).join(', ')}
                  </p>
                )}
              </div>
            </div>
            <Details category={category} />
          </div>
        );
      })}
    </div>
  );
}
