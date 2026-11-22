import { useEffect, useRef, useState } from 'react';
import { Check, Moon, Smartphone, Sun, X } from 'lucide-react';
import { DISPLAY_SIZES, TEXT_SIZES, THEMES, loadLook, saveLook, startPhoneLook } from '../../services/link/phoneLook';

const THEME_ICON = { system: Smartphone, light: Sun, dark: Moon };

/** One row of choices (a radio group): the chosen one is the green one. */
function Choices({ label, options, value, onChange, render }) {
  return (
    <fieldset className="space-y-2">
      <legend className="nm-muted px-1 pb-2 text-xs font-semibold uppercase tracking-wide">{label}</legend>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }} role="radiogroup" aria-label={label}>
        {options.map((o) => {
          const on = o.id === value;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(o.id)}
              className={`flex min-h-[3.25rem] min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2 text-center ${on ? 'nm-accent' : 'nm-sm nm-press'}`}
            >
              {render(o, on)}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * Menu → Settings: text size, display size and light / dark. Each change shows at once and is
 * kept on the phone.
 */
export default function PhoneSettings({ onClose }) {
  const [look, setLook] = useState(() => loadLook());
  const closeRef = useRef(null);
  useEffect(() => { closeRef.current?.focus(); }, []);
  const change = (key) => (id) => {
    const next = saveLook({ ...look, [key]: id });
    setLook(next);
    startPhoneLook(next);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={onClose} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
        className="nm w-full space-y-6 rounded-t-3xl px-5 pt-4"
        style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-center justify-between">
          <p className="text-lg font-semibold">Settings</p>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close settings" className="nm-sm nm-press grid h-10 w-10 place-items-center rounded-full"><X size={20} /></button>
        </div>

        <Choices
          label="Text size"
          options={TEXT_SIZES}
          value={look.text}
          onChange={change('text')}
          render={(o) => (
            <>
              <span aria-hidden="true" className="font-semibold leading-none" style={{ fontSize: `${o.scale * 1.15}rem` }}>Aa</span>
              <span className="text-[11px] leading-tight">{o.label}</span>
            </>
          )}
        />

        <Choices
          label="Display size"
          options={DISPLAY_SIZES}
          value={look.display}
          onChange={change('display')}
          render={(o) => (
            <>
              <span aria-hidden="true" className="grid place-items-center" style={{ height: '1.4rem' }}>
                <span className="block rounded-[4px] border-2 border-current" style={{ width: `${o.scale * 0.9}rem`, height: `${o.scale * 1.25}rem` }} />
              </span>
              <span className="text-[11px] leading-tight">{o.label}</span>
            </>
          )}
        />
        <p className="nm-muted -mt-3 px-1 text-xs">Display size makes everything larger: text, buttons and spacing.</p>

        <Choices
          label="Theme"
          options={THEMES}
          value={look.theme}
          onChange={change('theme')}
          render={(o) => {
            const Icon = THEME_ICON[o.id];
            return (
              <>
                <Icon size={20} aria-hidden="true" />
                <span className="text-[11px] leading-tight">{o.label}</span>
              </>
            );
          }}
        />

        <div className="nm-in space-y-1 rounded-3xl px-5 py-4" aria-label="Preview">
          <p className="text-base font-semibold">Grade 7 – Rizal · 8:00 AM</p>
          <p className="nm-muted text-sm">This is how text looks in KaTuro.</p>
          <p className="nm-green flex items-center gap-1.5 text-xs font-semibold"><Check size={14} /> Saved on this phone</p>
        </div>
      </div>
    </div>
  );
}
