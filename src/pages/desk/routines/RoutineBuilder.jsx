import { useCallback, useEffect, useMemo, useState } from 'react';
import { ReactFlow, ReactFlowProvider, Background, Controls, MarkerType, useReactFlow } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { X, Save, Play, LayoutList, Network, Wand2, Volume2, ArrowDown, Languages, Check } from 'lucide-react';
import { KIND_STYLE, cardDef, say } from '../../../services/desk/routines/catalog';
import { checkRoutine, describeRoutine, runOrder, shelf } from '../../../services/desk/routines/routine';
import CardNode from './CardNode';
import CardSettings from './CardSettings';
import { KIND_COLOR, CARD_TEXT_2, cardColors, iconColors, textColor, speak } from './cardStyle';
import CardIcon from './CardIcon';
import { addCard, arrange, canConnect, cardLine, cardSentence, connect, disconnect, removeCard, setSettings, CARD_W, CARD_H } from './routineLayout';

const nodeTypes = { card: CardNode };
const DRAG_TYPE = 'application/katuro-card';
const TRY_MS = 1400;
// The canvas opens at the start of the routine (top left), at a size the cards are easy to read.
const START_VIEW = { x: 24, y: 40, zoom: 0.95 };
const btn = 'inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50';
const primary = 'inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50';
const T = (lang, en, fil) => (lang === 'fil' ? fil : en);

/** The card shelf: tap to add after the chosen card, or drag onto the canvas. */
function Shelf({ lang, onAdd }) {
  const groups = shelf();
  return (
    <div className="space-y-3 p-3">
      {Object.entries(groups).map(([kind, cards]) => (
        <section key={kind}>
          {/* The heading text follows the theme (readable in dark mode); the color square names the kind. */}
          <h3 className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-700">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: KIND_COLOR[kind].icon }} aria-hidden="true" />
            {say(KIND_STYLE[kind].label, lang)}
          </h3>
          <div className="space-y-1">
            {cards.map((c) => {
              return (
                <button
                  key={c.type}
                  type="button"
                  draggable
                  onDragStart={(e) => { e.dataTransfer.setData(DRAG_TYPE, c.type); e.dataTransfer.effectAllowed = 'move'; }}
                  onClick={() => onAdd(c.type)}
                  title={say(c.help, lang)}
                  className="flex w-full items-center gap-2 rounded-xl border-2 px-2 py-1.5 text-left hover:brightness-95"
                  style={cardColors(kind)}
                >
                  <span className="flex h-7 w-7 flex-none items-center justify-center rounded-lg" style={iconColors(kind)}><CardIcon name={c.icon} size={16} /></span>
                  <span className="text-[11px] font-semibold leading-tight" style={textColor(kind)}>{say(c.label, lang)}</span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

/** The same routine as a simple top-to-bottom list (also easier on small screens). */
function ListView({ draft, lang, selectedId, onSelect, statuses }) {
  const order = runOrder(draft);
  const joined = new Set(order.map((c) => c.id));
  const loose = draft.cards.filter((c) => !joined.has(c.id));
  const row = (c) => {
    const def = cardDef(c.type);
    return (
      <button key={c.id} type="button" onClick={() => onSelect(c.id)} className={`flex w-full max-w-md items-center gap-3 rounded-2xl border-2 p-3 text-left ${selectedId === c.id ? 'ring-4 ring-emerald-400/60' : ''}`} style={cardColors(def.kind)}>
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl" style={iconColors(def.kind)}><CardIcon name={def.icon} size={22} /></span>
        <span className="min-w-0">
          <span className="block text-[13px] font-semibold" style={textColor(def.kind)}>{say(def.label, lang)}</span>
          <span className="block truncate text-[11px]" style={{ color: CARD_TEXT_2 }}>{cardLine(c, lang)}</span>
        </span>
        {statuses[c.id] ? <Check size={18} className="ml-auto" style={{ color: KIND_COLOR.do.text }} aria-label="done" /> : null}
      </button>
    );
  };
  return (
    <div className="flex h-full flex-col items-center gap-1 overflow-y-auto p-6">
      {order.map((c, i) => (
        <div key={c.id} className="flex w-full flex-col items-center gap-1">
          {i > 0 ? <ArrowDown size={18} className="text-gray-400" aria-hidden="true" /> : null}
          {row(c)}
        </div>
      ))}
      {loose.length ? (
        <div className="mt-6 w-full max-w-md">
          <p className="mb-1 text-[11px] font-semibold text-red-700">{T(lang, 'Not joined yet (open the card view to join them):', 'Hindi pa nakakabit (buksan ang card view para ikabit):')}</p>
          <div className="space-y-1">{loose.map(row)}</div>
        </div>
      ) : null}
    </div>
  );
}

function Builder({ initial, files, folders, onSave, onClose, initialLang = 'en', talk = null }) {
  const [draft, setDraft] = useState(() => arrange(initial));
  const [selectedId, setSelectedId] = useState(initial.cards[0]?.id || null);
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [lang, setLang] = useState(initialLang);
  const [view, setView] = useState('cards');
  const [notice, setNotice] = useState('');
  const [trying, setTrying] = useState(null); // { index } while "Try" walks the cards
  const [dirty, setDirty] = useState(false);
  const [talkText, setTalkText] = useState('');
  const [talkBusy, setTalkBusy] = useState(false);
  const flow = useReactFlow();
  // The canvas follows the Desk's theme (its dots and zoom buttons).
  const [dark] = useState(() => typeof document !== 'undefined' && document.querySelector('.kt-neu')?.getAttribute('data-neu') === 'dark');

  const update = useCallback((next) => {
    setDraft(next);
    setDirty(true);
  }, []);

  const problems = useMemo(() => checkRoutine(draft, lang), [draft, lang]);
  const problemsByCard = useMemo(() => {
    const m = new Map();
    for (const p of problems) if (p.cardId) m.set(p.cardId, [...(m.get(p.cardId) || []), p.text]);
    return m;
  }, [problems]);
  const order = useMemo(() => runOrder(draft), [draft]);
  const tryStatuses = useMemo(() => {
    if (!trying) return {};
    return Object.fromEntries(order.map((c, i) => [c.id, i < trying.index ? 'done' : i === trying.index ? 'running' : 'pending']));
  }, [trying, order]);

  // "Try": light the cards one by one and say what each will do. Nothing runs, nothing changes.
  useEffect(() => {
    if (!trying) return undefined;
    const card = order[trying.index];
    if (!card) {
      const t = setTimeout(() => setTrying(null), TRY_MS);
      return () => clearTimeout(t);
    }
    if (trying.aloud) speak(cardSentence(card, lang), lang);
    const t = setTimeout(() => setTrying((x) => (x ? { ...x, index: x.index + 1 } : x)), TRY_MS);
    return () => clearTimeout(t);
  }, [trying, order, lang]);

  const nodes = useMemo(() => draft.cards.map((c) => ({
    id: c.id,
    type: 'card',
    position: { x: c.x, y: c.y },
    // Cards have one fixed size: given, so React Flow does not measure every card again on each change.
    width: CARD_W,
    height: CARD_H,
    measured: { width: CARD_W, height: CARD_H },
    selected: c.id === selectedId,
    data: { def: cardDef(c.type), line: cardLine(c, lang), lang, problem: problemsByCard.get(c.id)?.[0] || '', status: tryStatuses[c.id] || null },
  })), [draft.cards, selectedId, lang, problemsByCard, tryStatuses]);

  const edges = useMemo(() => draft.wires.map((w) => {
    const from = draft.cards.find((c) => c.id === w.from);
    const color = (KIND_COLOR[cardDef(from?.type)?.kind] || KIND_COLOR.do).edge;
    const id = `${w.from}>${w.to}`;
    return { id, source: w.from, target: w.to, type: 'smoothstep', selected: id === selectedEdge, animated: Boolean(trying), style: { stroke: color, strokeWidth: id === selectedEdge ? 5 : 3 }, markerEnd: { type: MarkerType.ArrowClosed, color } };
  }), [draft.wires, draft.cards, selectedEdge, trying]);

  const onNodesChange = useCallback((changes) => {
    let next = null;
    for (const ch of changes) {
      if (ch.type === 'position' && ch.position) {
        next = next || { ...draft, cards: [...draft.cards] };
        next.cards = next.cards.map((c) => (c.id === ch.id ? { ...c, x: Math.round(ch.position.x), y: Math.round(ch.position.y) } : c));
      } else if (ch.type === 'select' && ch.selected) {
        setSelectedId(ch.id);
        setSelectedEdge(null);
      } else if (ch.type === 'remove') {
        next = removeCard(next || draft, ch.id);
        if (selectedId === ch.id) setSelectedId(null);
      }
    }
    if (next) update(next);
  }, [draft, selectedId, update]);

  const onEdgesChange = useCallback((changes) => {
    // Several wires removed at once (multi-select + Delete) are all removed: fold into one change.
    let next = null;
    for (const ch of changes) {
      if (ch.type === 'select') setSelectedEdge(ch.selected ? ch.id : null);
      if (ch.type === 'remove') {
        const [from, to] = ch.id.split('>');
        next = disconnect(next || draft, from, to);
      }
    }
    if (next) {
      update(next);
      setSelectedEdge(null);
    }
  }, [draft, update]);

  const onConnect = useCallback(({ source, target }) => {
    const ok = canConnect(draft, source, target, lang);
    if (!ok.ok) {
      setNotice(ok.reason);
      return;
    }
    setNotice('');
    update(arrange(connect(draft, source, target)));
  }, [draft, lang, update]);

  const isValidConnection = useCallback((c) => canConnect(draft, c.source, c.target).ok, [draft]);

  const add = useCallback((type, dropAt = null) => {
    const { routine, card, joined } = addCard(draft, type, selectedId);
    if (!card) return;
    let next = routine;
    if (!joined && dropAt) next = { ...next, cards: next.cards.map((c) => (c.id === card.id ? { ...c, x: Math.round(dropAt.x), y: Math.round(dropAt.y) } : c)) };
    update(next);
    setSelectedId(card.id);
    const def = cardDef(type);
    if (def.kind === 'when') setNotice(T(lang, 'The routine now starts with this card.', 'Magsisimula na ang routine sa card na ito.'));
    else if (joined) setNotice('');
    else setNotice(T(lang, 'Placed, but not joined: it does not fit after the chosen card. Drag from the right dot of a card that fits to its left dot.', 'Nailagay, pero hindi nakakabit: hindi ito bagay sa piniling card. I-drag mula sa kanang tuldok ng card na bagay papunta sa kaliwang tuldok nito.'));
  }, [draft, selectedId, update, lang]);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    const type = e.dataTransfer.getData(DRAG_TYPE);
    if (!cardDef(type)) return;
    add(type, flow.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
  }, [add, flow]);

  const selected = draft.cards.find((c) => c.id === selectedId) || null;
  const close = () => {
    if (dirty && !window.confirm(T(lang, 'Close without saving your changes?', 'Isara nang hindi sine-save ang mga binago?'))) return;
    onClose();
  };
  const save = async () => {
    const res = await onSave(draft);
    if (res?.ok) setDirty(false);
    setNotice(res?.message || '');
  };
  const askTalk = async () => {
    if (!talk || !talkText.trim()) return;
    setTalkBusy(true);
    setNotice('');
    try {
      const out = await talk(talkText.trim(), draft, lang);
      if (out?.routine) {
        update(arrange(out.routine));
        setSelectedId(out.routine.cards[0]?.id || null);
        setTalkText('');
      }
      setNotice(out?.message || '');
    } catch (err) {
      setNotice(err?.message || String(err));
    } finally {
      setTalkBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-white" role="dialog" aria-modal="true" aria-label={T(lang, 'Routine Builder', 'Routine Builder')}>
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 px-4 py-2">
        <input value={draft.name} maxLength={80} onChange={(e) => update({ ...draft, name: e.target.value })} aria-label={T(lang, 'Routine name', 'Pangalan ng routine')} className="min-w-[12rem] flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm font-semibold text-gray-900" />
        <button type="button" onClick={() => setLang(lang === 'fil' ? 'en' : 'fil')} className={btn} title="English / Filipino"><Languages size={13} /> {lang === 'fil' ? 'English' : 'Filipino'}</button>
        <button type="button" onClick={() => setView(view === 'cards' ? 'list' : 'cards')} className={btn}>{view === 'cards' ? <><LayoutList size={13} /> {T(lang, 'Simple list', 'Simpleng listahan')}</> : <><Network size={13} /> {T(lang, 'Cards', 'Mga card')}</>}</button>
        <button type="button" onClick={() => { update(arrange(draft)); setTimeout(() => flow.setViewport(START_VIEW, { duration: 200 }), 0); }} className={btn}><Wand2 size={13} /> {T(lang, 'Tidy up', 'Ayusin')}</button>
        <button type="button" onClick={() => setTrying({ index: 0, aloud: false })} disabled={!order.length || Boolean(trying)} className={btn} title={T(lang, 'Shows each step in order. Nothing runs and no file changes.', 'Ipinapakita ang bawat hakbang. Walang tatakbo at walang file na mababago.')}><Play size={13} /> {T(lang, 'Try', 'Subukan')}</button>
        <button type="button" onClick={() => setTrying({ index: 0, aloud: true })} disabled={!order.length || Boolean(trying)} className={btn}><Volume2 size={13} /> {T(lang, 'Try aloud', 'Subukan nang malakas')}</button>
        <button type="button" onClick={save} className={primary}><Save size={13} /> {T(lang, 'Save', 'I-save')}</button>
        <button type="button" onClick={close} aria-label={T(lang, 'Close', 'Isara')} className="rounded p-1 text-gray-500 hover:bg-gray-100"><X size={18} /></button>
      </div>

      {talk ? (
        <div className="flex items-center gap-2 border-b border-gray-100 bg-emerald-50/60 px-4 py-2">
          <input value={talkText} onChange={(e) => setTalkText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') askTalk(); }} maxLength={400}
            placeholder={T(lang, 'Change it by typing, e.g. "make it Thursday" or "also tell me when done"', 'Baguhin sa pag-type, hal. "gawing Huwebes" o "sabihan din ako kapag tapos"')}
            className="flex-1 rounded-lg border border-emerald-200 bg-white px-2 py-1.5 text-xs" aria-label={T(lang, 'Change the routine by typing', 'Baguhin ang routine sa pag-type')} />
          <button type="button" onClick={askTalk} disabled={talkBusy || !talkText.trim()} className={primary}><Wand2 size={13} /> {talkBusy ? T(lang, 'Changing…', 'Binabago…') : T(lang, 'Change it', 'Baguhin')}</button>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        <aside className="w-56 flex-none overflow-y-auto border-r border-gray-200 bg-gray-50" aria-label={T(lang, 'Cards you can add', 'Mga card na puwedeng idagdag')}>
          <Shelf lang={lang} onAdd={(t) => add(t)} />
        </aside>
        <main className="relative min-w-0 flex-1" onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }} onDrop={onDrop}>
          {view === 'cards' ? (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              isValidConnection={isValidConnection}
              onPaneClick={() => { setSelectedId(null); setSelectedEdge(null); }}
              defaultViewport={START_VIEW}
              colorMode={dark ? 'dark' : 'light'}
              minZoom={0.3}
              maxZoom={1.6}
              proOptions={{ hideAttribution: true }}
              deleteKeyCode={['Delete', 'Backspace']}
            >
              <Background gap={24} size={1.5} />
              <Controls showInteractive={false} />
            </ReactFlow>
          ) : (
            <ListView draft={draft} lang={lang} selectedId={selectedId} onSelect={setSelectedId} statuses={tryStatuses} />
          )}
          {trying && order[trying.index] ? (
            <div className="pointer-events-none absolute inset-x-4 bottom-4 mx-auto max-w-xl rounded-xl bg-emerald-800 px-4 py-2 text-center text-xs text-white shadow-lg" role="status">
              {trying.index + 1}/{order.length} · {cardSentence(order[trying.index], lang)}
            </div>
          ) : null}
          {notice ? (
            <div className="absolute inset-x-4 top-3 mx-auto flex max-w-xl items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900 shadow" role="status">
              <span className="flex-1">{notice}</span>
              <button type="button" onClick={() => setNotice('')} aria-label={T(lang, 'Close', 'Isara')} className="text-amber-700"><X size={13} /></button>
            </div>
          ) : null}
        </main>
        <aside className="w-72 flex-none overflow-y-auto border-l border-gray-200" aria-label={T(lang, 'Card settings', 'Mga setting ng card')}>
          <CardSettings
            card={selected}
            def={selected ? cardDef(selected.type) : null}
            lang={lang}
            files={files}
            folders={folders}
            problems={selected ? problemsByCard.get(selected.id) || [] : []}
            onChange={(patch) => update(setSettings(draft, selected.id, patch))}
            onRemove={() => { update(removeCard(draft, selected.id)); setSelectedId(null); }}
          />
        </aside>
      </div>

      <div className={`border-t px-4 py-2 text-[11px] ${problems.length ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`} role="status">
        {problems.length ? (
          <details>
            <summary className="cursor-pointer font-semibold">{T(lang, `${problems.length} thing(s) to fix before it can be switched on`, `${problems.length} bagay na aayusin bago ito mapaandar`)}</summary>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {problems.map((p, i) => <li key={`${p.cardId || ''}${i}`}><button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => p.cardId && setSelectedId(p.cardId)}>{p.text}</button></li>)}
            </ul>
          </details>
        ) : (
          <span className="font-semibold">{T(lang, 'Ready to switch on: ', 'Handa nang paandarin: ')}<span className="font-normal">{describeRoutine(draft, lang)}</span></span>
        )}
      </div>
    </div>
  );
}

/** The Routine Builder (full screen). onSave(routine) → { ok, message }. talk(text, routine, lang) → { routine?, message }. */
export default function RoutineBuilder(props) {
  return (
    <ReactFlowProvider>
      <Builder {...props} />
    </ReactFlowProvider>
  );
}
