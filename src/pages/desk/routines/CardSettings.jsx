import { Trash2, Volume2 } from 'lucide-react';
import { KIND_STYLE, say } from '../../../services/desk/routines/catalog';
import { fieldShown } from '../../../services/desk/routines/routine';
import { DAY_NAMES } from '../../../services/desk/schedule/schedule';
import { chipColors, iconColors, speak } from './cardStyle';
import CardIcon from './CardIcon';
import { cardSentence, FIL_DAYS } from './routineLayout';

const input = 'w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-800 focus:border-emerald-500 focus:outline-none';
const label = 'block text-[11px] font-semibold text-gray-700 mb-0.5';
const shortPath = (p) => {
  const parts = String(p).split('/');
  return parts.length > 2 ? `${parts.at(-1)}  ·  ${parts.slice(0, -1).join(' › ')}` : parts.join(' › ');
};

/** One setting of a card, as a simple control (never a code box). */
function Field({ field, value, onChange, lang, files, folders }) {
  const name = say(field.label, lang);
  switch (field.kind) {
    case 'choice':
      return (
        <label className="block"><span className={label}>{name}</span>
          <select value={String(value ?? '')} onChange={(e) => onChange(field.options.find((o) => String(o.value) === e.target.value)?.value ?? '')} className={input}>
            {field.options.map((o) => <option key={String(o.value)} value={String(o.value)}>{say(o.label, lang)}</option>)}
          </select>
        </label>
      );
    case 'days': {
      const on = new Set(Array.isArray(value) ? value : []);
      return (
        <fieldset><legend className={label}>{name}</legend>
          <div className="flex flex-wrap gap-1">
            {field.options.map((d) => (
              <button key={d} type="button" aria-pressed={on.has(d)} onClick={() => { const n = new Set(on); if (n.has(d)) n.delete(d); else n.add(d); onChange([...n].sort()); }}
                className={`min-w-[2.6rem] rounded-lg border px-1.5 py-1 text-[11px] font-semibold ${on.has(d) ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'}`}>
                {lang === 'fil' ? FIL_DAYS[d] : DAY_NAMES[d].slice(0, 3)}
              </button>
            ))}
          </div>
        </fieldset>
      );
    }
    case 'time':
      return <label className="block"><span className={label}>{name}</span><input type="time" value={value || ''} onChange={(e) => onChange(e.target.value)} className={input} /></label>;
    case 'number':
    case 'offset':
      return <label className="block"><span className={label}>{name}</span><input type="number" inputMode="numeric" min={field.min} max={field.max} step={1} value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={input} /></label>;
    case 'file': {
      const list = files.filter((p) => (field.accept ? field.accept.test(p) : true));
      return (
        <label className="block"><span className={label}>{name}</span>
          <select value={value || ''} onChange={(e) => onChange(e.target.value)} className={input}>
            <option value="">{lang === 'fil' ? '— Pumili —' : '— Choose —'}</option>
            {value && !list.includes(value) ? <option value={value}>{shortPath(value)} {lang === 'fil' ? '(wala na)' : '(not found)'}</option> : null}
            {list.map((p) => <option key={p} value={p}>{shortPath(p)}</option>)}
          </select>
          {!list.length ? <span className="mt-0.5 block text-[10px] text-gray-500">{lang === 'fil' ? 'Walang ganitong file sa folder na ito.' : 'There is no file like this in the folder yet.'}</span> : null}
        </label>
      );
    }
    case 'folder':
      return (
        <label className="block"><span className={label}>{name}</span>
          <select value={value || ''} onChange={(e) => onChange(e.target.value)} className={input}>
            <option value="">{lang === 'fil' ? '— Pumili —' : '— Choose —'}</option>
            {value && !folders.includes(value) ? <option value={value}>{shortPath(value)} {lang === 'fil' ? '(wala na)' : '(not found)'}</option> : null}
            {folders.map((p) => <option key={p} value={p}>{p.split('/').join(' › ')}</option>)}
          </select>
        </label>
      );
    default:
      return <label className="block"><span className={label}>{name}</span><input type="text" maxLength={field.max || 300} value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={input} /></label>;
  }
}

/** The right-hand panel: the chosen card's settings, its problems, read aloud, remove. */
export default function CardSettings({ card, def, lang, files, folders, problems, onChange, onRemove }) {
  if (!card || !def) {
    return <p className="p-4 text-xs text-gray-500">{lang === 'fil' ? 'Pumili ng card para makita ang mga setting nito.' : 'Choose a card to see its settings.'}</p>;
  }
  return (
    <div className="space-y-3 p-4">
      <div className="flex items-start gap-2">
        <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl" style={iconColors(def.kind)}><CardIcon name={def.icon} size={22} /></div>
        <div className="min-w-0 flex-1">
          <span className="inline-block rounded-full px-1.5 py-px text-[10px] font-bold uppercase" style={chipColors(def.kind)}>{say(KIND_STYLE[def.kind].label, lang)}</span>
          <h3 className="text-sm font-bold leading-tight text-gray-900">{say(def.label, lang)}</h3>
        </div>
        <button type="button" onClick={() => speak(cardSentence(card, lang), lang)} title={lang === 'fil' ? 'Basahin nang malakas' : 'Read aloud'} aria-label={lang === 'fil' ? 'Basahin nang malakas' : 'Read aloud'} className="rounded-lg p-1.5 text-gray-600 hover:bg-gray-100"><Volume2 size={16} /></button>
      </div>
      <p className="text-[11px] leading-snug text-gray-600">{say(def.help, lang)}</p>
      {def.fields.filter((f) => fieldShown(f, card.settings)).map((f) => (
        <Field key={f.key} field={f} value={card.settings?.[f.key]} lang={lang} files={files} folders={folders} onChange={(v) => onChange({ [f.key]: v })} />
      ))}
      {!def.fields.length ? <p className="text-[11px] text-gray-500">{lang === 'fil' ? 'Walang kailangang setting.' : 'Nothing to set.'}</p> : null}
      {problems.length ? (
        <ul className="space-y-1 rounded-lg border border-red-200 bg-red-50 p-2 text-[11px] text-red-800">
          {problems.map((p) => <li key={p}>{p}</li>)}
        </ul>
      ) : null}
      <button type="button" onClick={onRemove} className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50"><Trash2 size={12} /> {lang === 'fil' ? 'Alisin ang card' : 'Remove card'}</button>
    </div>
  );
}
