import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { AlertTriangle } from 'lucide-react';
import { KIND_STYLE, say } from '../../../services/desk/routines/catalog';
import { CARD_TEXT_2, STATUS_LIGHT, cardColors, chipColors, iconColors, textColor } from './cardStyle';
import CardIcon from './CardIcon';

// The plugs (fixed colors: the card is a picture, the same in every theme).
const PLUG_IN = { width: 16, height: 16, border: '2px solid #6b7280', background: '#ffffff' };
const PLUG_OUT = { width: 16, height: 16, border: '2px solid #6b7280', background: '#a7f3d0' };

/** One picture card on the Routine Builder canvas (React Flow node). */
function CardNode({ data, selected }) {
  const { def, line, lang, problem, status } = data;
  const light = status ? STATUS_LIGHT[status] : null;
  return (
    <div
      className={`relative w-[240px] h-[108px] rounded-2xl border-2 shadow-sm ${selected ? 'ring-4 ring-emerald-400/60' : ''}`}
      style={{ ...cardColors(def.kind), ...(problem ? { borderColor: '#dc2626' } : {}) }}
      title={say(def.help, lang)}
    >
      {def.kind !== 'when' && (
        <Handle type="target" position={Position.Left} style={PLUG_IN} aria-label={lang === 'fil' ? 'Saksakan ng papasok' : 'Plug in'} />
      )}
      <div className="flex h-full items-start gap-2.5 p-3">
        <div className="flex h-11 w-11 flex-none items-center justify-center rounded-xl" style={iconColors(def.kind)}>
          <CardIcon name={def.icon} size={24} />
        </div>
        <div className="min-w-0 flex-1">
          <span className="inline-block rounded-full px-1.5 py-px text-[10px] font-bold uppercase tracking-wide" style={chipColors(def.kind)}>{say(KIND_STYLE[def.kind].label, lang)}</span>
          <p className="mt-0.5 line-clamp-2 text-[13px] font-semibold leading-tight" style={textColor(def.kind)}>{say(def.label, lang)}</p>
          {line ? <p className="mt-0.5 truncate text-[11px]" style={{ color: CARD_TEXT_2 }}>{line}</p> : null}
        </div>
      </div>
      {light ? (
        <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold shadow-sm" style={{ background: '#ffffff', color: '#374151' }}>
          <span className={`h-2.5 w-2.5 rounded-full ${light.dot}`} aria-hidden="true" />
          {light[lang] || light.en}
        </span>
      ) : null}
      {problem ? (
        <span className="absolute -bottom-2.5 left-3 flex items-center gap-1 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow" title={problem}>
          <AlertTriangle size={11} aria-hidden="true" /> {lang === 'fil' ? 'Ayusin' : 'Fix me'}
        </span>
      ) : null}
      {def.gives ? (
        <Handle type="source" position={Position.Right} style={PLUG_OUT} aria-label={lang === 'fil' ? 'Saksakan ng palabas' : 'Plug out'} />
      ) : null}
    </div>
  );
}

export default memo(CardNode);
