import { Suspense, lazy, useMemo, useRef, useState } from 'react';
import { X, Plus, Play, Pencil, Trash2, Upload, Download, Hand, Check, Wand2, Languages, Copy, Home } from 'lucide-react';
import { useDeskStore, workspaceIdOf } from '../../../store/deskStore';
import { useRoutineStore, routinesFor } from '../../../store/routineStore';
import { flattenFileTree, writeFileToDirectory } from '../../../services/localFileSystem';
import { cardDef, say } from '../../../services/desk/routines/catalog';
import { checkRoutine, cleanRoutine, describeRoutine, exportRoutineText, importRoutineText, newRoutine } from '../../../services/desk/routines/routine';
import { nextFireAt } from '../../../services/desk/routines/triggers';
import { TEMPLATES, fromTemplate } from '../../../services/desk/routines/templates';
import { talkToRoutine } from '../../../services/desk/routines/talk';
import { pilotSummary, pilotText } from '../../../services/desk/routines/pilot';
import { formatWhen } from '../../../services/desk/schedule/schedule';
import { callDeskLLM } from '../../../services/desk/agent/llm';
import { SYSTEM_DIRS } from '../../../services/desk/systemFolders';
import { STATUS_LIGHT } from './cardStyle';
import { answerRun, filesForStart, startRoutine } from './routineEngine';

// The Builder (React Flow) loads only when a routine is opened, not with KaTuroDesk.
const RoutineBuilder = lazy(() => import('./RoutineBuilder'));
const btn = 'inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50';
const primary = 'inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50';
const LANG_KEY = 'katuro-routines-lang';
const T = (lang, en, fil) => (lang === 'fil' ? fil : en);
const readLang = () => { try { return localStorage.getItem(LANG_KEY) === 'fil' ? 'fil' : 'en'; } catch { return 'en'; } };
const saveLang = (l) => { try { localStorage.setItem(LANG_KEY, l); } catch { /* a convenience */ } };

function folderLists(tree) {
  const files = flattenFileTree(tree).map((f) => f.path).filter((p) => !SYSTEM_DIRS.test(p)).sort();
  const folders = [];
  const walk = (list) => {
    for (const e of list || []) {
      if (e.kind === 'directory') {
        if (!SYSTEM_DIRS.test(e.path)) folders.push(e.path);
        walk(e.children);
      }
    }
  };
  walk(tree);
  return { files, folders: folders.sort() };
}

/** The lights of one run, card by card. */
function RunLights({ run, lang }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {run.routine.cards.filter((c) => run.steps[c.id]).map((c) => {
        const st = run.steps[c.id];
        const light = STATUS_LIGHT[st.status] || STATUS_LIGHT.pending;
        return (
          <span key={c.id} title={`${say(cardDef(c.type)?.label, lang)}: ${light[lang] || light.en}${st.summary ? ` — ${st.summary}` : ''}`} className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] text-gray-700">
            <span className={`h-2 w-2 rounded-full ${light.dot}`} aria-hidden="true" />
            {say(cardDef(c.type)?.label, lang)}
          </span>
        );
      })}
    </div>
  );
}

/** Routines: my routines, ready-made, talk to build, waiting for my OK, history. */
export default function RoutinesModal({ open, onClose, user, profile }) {
  const workspace = useDeskStore((s) => s.workspace);
  const isGenerating = useDeskStore((s) => s.isGenerating);
  const refreshFiles = useDeskStore((s) => s.refreshFiles);
  const { routines, meta, runs, saveRoutine, setEnabled, deleteRoutine, clearHistory } = useRoutineStore();
  const [tab, setTab] = useState('mine');
  const [lang, setLangState] = useState(readLang);
  const [editing, setEditing] = useState(null); // a routine open in the Builder
  const [notice, setNotice] = useState({ text: '', bad: false });
  const [busy, setBusy] = useState('');
  const [talkText, setTalkText] = useState('');
  const fileInput = useRef(null);

  const wsId = workspaceIdOf(workspace);
  const mine = useMemo(() => routinesFor(routines, wsId), [routines, wsId]);
  const waiting = useMemo(() => runs.filter((r) => r.status === 'waiting' && mine.some((m) => m.id === r.routineId)), [runs, mine]);
  const history = useMemo(() => runs.filter((r) => mine.some((m) => m.id === r.routineId)), [runs, mine]);
  const lists = useMemo(() => folderLists(workspace?.files || []), [workspace]);
  const [openedAt] = useState(() => Date.now()); // "on for 2+ weeks" is counted from when this window opened
  const going = useMemo(() => pilotText(pilotSummary(mine, history, meta, openedAt, lang), lang), [mine, history, meta, openedAt, lang]);

  if (!open) return null;
  const setLang = (l) => { setLangState(l); saveLang(l); };
  const say2 = (text, bad = false) => setNotice({ text, bad });
  const canWrite = Boolean(workspace?.handle);

  const save = async (draft) => {
    try {
      const flatFiles = await filesForStart(draft);
      const { routine, dropped, problems } = saveRoutine(draft, { workspaceId: wsId, workspaceName: workspace?.name || '', flatFiles });
      setEditing(routine);
      const parts = [problems.length ? T(lang, 'Saved. Fix the red cards, then switch it on in the list.', 'Na-save. Ayusin ang mga pulang card, saka paandarin sa listahan.') : T(lang, 'Saved. Switch it on in the list when you are ready.', 'Na-save. Paandarin ito sa listahan kapag handa ka na.')];
      if (dropped.length) parts.push(`${T(lang, 'Changed', 'Binago')}: ${dropped.slice(0, 3).join('; ')}.`);
      return { ok: true, message: parts.join(' ') };
    } catch (err) {
      return { ok: false, message: err.message };
    }
  };

  const toggle = async (r) => {
    try {
      setEnabled(r.id, !r.enabled, { flatFiles: r.enabled ? [] : await filesForStart(r) });
      say2(r.enabled ? T(lang, `"${r.name}" is off.`, `Naka-off ang "${r.name}".`) : T(lang, `"${r.name}" is on. It runs while KaTuroDesk is open.`, `Naka-on ang "${r.name}". Tatakbo ito habang bukas ang KaTuroDesk.`));
    } catch (err) {
      say2(err.message, true);
    }
  };

  const runNow = async (r) => {
    setBusy(r.id);
    say2('');
    try {
      const run = await startRoutine(r.id, { user, profile });
      if (!run) say2(T(lang, 'KaTuroDesk is busy with another request. Try again in a moment.', 'Abala pa ang KaTuroDesk. Subukan ulit mamaya.'), true);
      else if (run.status === 'waiting') { setTab('inbox'); say2(T(lang, 'It is waiting for your OK.', 'Hinihintay nito ang OK mo.')); }
      else say2(run.status === 'done' ? T(lang, 'Finished. See the chat for what it made.', 'Tapos na. Tingnan sa chat ang ginawa nito.') : T(lang, 'It stopped. See History.', 'Huminto ito. Tingnan sa History.'), run.status !== 'done');
    } catch (err) {
      say2(err.message, true);
    } finally {
      setBusy('');
    }
  };

  const answer = async (run, approve) => {
    setBusy(run.id);
    try {
      const out = await answerRun(run.id, approve, { user, profile, by: 'KaTuroDesk' });
      if (!out) say2(T(lang, 'KaTuroDesk is busy. Try again in a moment.', 'Abala pa ang KaTuroDesk. Subukan ulit mamaya.'), true);
      else say2(approve ? T(lang, 'Approved. The routine went on.', 'Inaprubahan. Tumuloy ang routine.') : T(lang, 'Not approved: nothing after it was done.', 'Hindi inaprubahan: walang ginawa pagkatapos nito.'));
    } catch (err) {
      say2(err.message, true);
    } finally {
      setBusy('');
    }
  };

  const exportOne = async (r) => {
    if (!canWrite) return;
    const name = `${r.name.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Routine'}.katuro-routine.json`;
    try {
      await writeFileToDirectory(workspace.handle, `KaTuro Routines/${name}`, exportRoutineText(r), 'application/json');
      await refreshFiles();
      say2(T(lang, `Saved for sharing: KaTuro Routines/${name}`, `Na-save para maibahagi: KaTuro Routines/${name}`));
    } catch (err) {
      say2(err.message, true);
    }
  };

  const importFile = async (file) => {
    if (!file) return;
    try {
      const { routine, dropped } = importRoutineText(await file.text());
      setEditing(routine);
      say2(dropped.length ? `${T(lang, 'Opened. Left out', 'Nabuksan. Hindi isinama')}: ${dropped.slice(0, 3).join('; ')}.` : '');
    } catch (err) {
      say2(err.message, true);
    }
  };

  const ask = (system, prompt) => callDeskLLM({ system, prompt, json: true, kind: 'task', tier: 'fast', maxTokens: 4096, temperature: 0.2 });
  const talk = async (text, current) => talkToRoutine(text, current, ask, lists);
  const talkNew = async () => {
    if (!talkText.trim()) return;
    setBusy('talk');
    say2('');
    try {
      const out = await talk(talkText.trim(), null);
      setEditing(out.routine);
      setTalkText('');
      say2(out.message);
    } catch (err) {
      say2(err.message, true);
    } finally {
      setBusy('');
    }
  };

  if (editing) {
    return (
      <Suspense fallback={<div className="kt-layer z-[60] flex items-center justify-center bg-white text-xs text-gray-600">{T(lang, 'Opening the Routine Builder…', 'Binubuksan ang Routine Builder…')}</div>}>
      <RoutineBuilder
        key={editing.id}
        initial={cleanRoutine(editing).routine}
        files={lists.files}
        folders={lists.folders}
        initialLang={lang}
        onSave={save}
        onClose={() => setEditing(null)}
        onExit={() => { setEditing(null); onClose(); }}
        talk={(text, draft) => talk(text, draft)}
      />
      </Suspense>
    );
  }

  const tabs = [
    ['mine', T(lang, 'My routines', 'Mga routine ko')],
    ['gallery', T(lang, 'Ready-made', 'Handa na')],
    ['inbox', `${T(lang, 'Waiting for your OK', 'Hinihintay ang OK mo')}${waiting.length ? ` (${waiting.length})` : ''}`],
    ['history', T(lang, 'History', 'Kasaysayan')],
  ];

  return (
    <div className="kt-layer z-[55] flex items-center justify-center bg-black/40 p-2 sm:p-4" role="dialog" aria-modal="true" aria-label="Routines">
      <div className="flex max-h-full w-full max-w-3xl flex-col rounded-2xl border border-gray-200 bg-white shadow-2xl">
        <div className="flex items-center gap-2 border-b border-gray-200 px-5 pb-3 pt-4">
          <h2 className="flex-1 text-sm font-bold text-gray-900">{T(lang, 'Routines: KaTuro does the repeated work for you', 'Routines: ang KaTuro ang gagawa ng paulit-ulit na trabaho')}</h2>
          <button type="button" onClick={() => setLang(lang === 'fil' ? 'en' : 'fil')} className={btn}><Languages size={12} /> {lang === 'fil' ? 'English' : 'Filipino'}</button>
          <button type="button" onClick={onClose} className={btn} title={T(lang, 'Back to the KaTuroDesk screen', 'Bumalik sa KaTuroDesk')}><Home size={12} /> {T(lang, 'Back to KaTuroDesk', 'Bumalik sa KaTuroDesk')}</button>
        </div>

        <div className="flex flex-wrap gap-1 border-b border-gray-100 px-5 py-2" role="tablist">
          {tabs.map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
              className={`rounded-full px-3 py-1 text-[11px] font-semibold ${tab === id ? 'bg-emerald-700 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'} ${id === 'inbox' && waiting.length && tab !== id ? '!bg-amber-100 !text-amber-900' : ''}`}>
              {label}
            </button>
          ))}
        </div>

        {notice.text ? <p className={`mx-5 mt-3 rounded-lg px-3 py-2 text-[11px] ${notice.bad ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-900'}`} role="status">{notice.text}</p> : null}

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {tab === 'mine' && (
            <div className="space-y-3">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                <label className="block text-[11px] font-semibold text-emerald-900" htmlFor="routine-talk">{T(lang, 'Say what you want KaTuro to do, and it draws the cards:', 'Sabihin kung ano ang gusto mong gawin ng KaTuro, at iguguhit nito ang mga card:')}</label>
                <div className="mt-1 flex gap-2">
                  <input id="routine-talk" value={talkText} onChange={(e) => setTalkText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') talkNew(); }} maxLength={400}
                    placeholder={T(lang, 'e.g. Every Friday, check my SF2 and make notices for 3 absences in a row', 'hal. Tuwing Biyernes, i-check ang SF2 ko at gumawa ng notice para sa 3 sunod-sunod na liban')}
                    className="flex-1 rounded-lg border border-emerald-200 bg-white px-2 py-1.5 text-xs" />
                  <button type="button" onClick={talkNew} disabled={busy === 'talk' || !talkText.trim()} className={primary}><Wand2 size={13} /> {busy === 'talk' ? T(lang, 'Drawing…', 'Iginuguhit…') : T(lang, 'Draw it', 'Iguhit')}</button>
                </div>
                <p className="mt-1 text-[10px] text-emerald-800">{T(lang, 'You see the cards first; nothing runs until you save it and switch it on.', 'Makikita mo muna ang mga card; walang tatakbo hangga\'t hindi mo sine-save at pinapaandar.')}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setEditing(newRoutine(T(lang, 'My routine', 'Aking routine')))} className={primary}><Plus size={13} /> {T(lang, 'New routine', 'Bagong routine')}</button>
                <button type="button" onClick={() => setTab('gallery')} className={btn}>{T(lang, 'Start from a ready-made one', 'Magsimula sa handa na')}</button>
                <button type="button" onClick={() => fileInput.current?.click()} className={btn}><Upload size={12} /> {T(lang, 'Open a shared routine', 'Buksan ang ibinahaging routine')}</button>
                <input ref={fileInput} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { importFile(e.target.files?.[0]); e.target.value = ''; }} />
              </div>

              {!mine.length ? <p className="py-6 text-center text-xs text-gray-500">{T(lang, 'No routines yet in this folder. Start from a ready-made one, or say what you want above.', 'Wala pang routine sa folder na ito. Magsimula sa handa na, o sabihin sa itaas ang gusto mo.')}</p> : null}
              <ul className="space-y-2">
                {mine.map((r) => {
                  const problems = checkRoutine(r);
                  const next = nextFireAt(r, meta[r.id] || {});
                  const last = runs.find((x) => x.routineId === r.id);
                  return (
                    <li key={r.id} className="rounded-xl border border-gray-200 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <button type="button" role="switch" aria-checked={r.enabled} onClick={() => toggle(r)} disabled={!r.enabled && problems.length > 0}
                          title={problems.length ? problems[0].text : ''}
                          className="relative h-5 w-9 flex-none rounded-full transition disabled:opacity-50" style={{ background: r.enabled ? '#059669' : '#9ca3af' }}>
                          <span className={`absolute top-0.5 h-4 w-4 rounded-full shadow transition ${r.enabled ? 'left-[18px]' : 'left-0.5'}`} style={{ background: '#ffffff' }} />
                          <span className="sr-only">{r.enabled ? T(lang, 'On', 'Naka-on') : T(lang, 'Off', 'Naka-off')}</span>
                        </button>
                        <p className="min-w-0 flex-1 truncate text-xs font-semibold text-gray-900">{r.name}</p>
                        {r.cards.some((c) => c.type === 'when.newFiles') ? null : <button type="button" onClick={() => runNow(r)} disabled={Boolean(busy) || isGenerating || problems.length > 0} className={btn}><Play size={12} /> {busy === r.id ? T(lang, 'Running…', 'Tumatakbo…') : T(lang, 'Run now', 'Patakbuhin')}</button>}
                        <button type="button" onClick={() => setEditing(r)} className={btn}><Pencil size={12} /> {T(lang, 'Edit', 'Baguhin')}</button>
                        <button type="button" onClick={() => exportOne(r)} disabled={!canWrite} className={btn} title={T(lang, 'Save a copy to share (KaTuro Routines folder)', 'Mag-save ng kopya para ibahagi (folder na KaTuro Routines)')}><Download size={12} /></button>
                        <button type="button" onClick={() => { if (window.confirm(T(lang, `Delete "${r.name}"?`, `Burahin ang "${r.name}"?`))) deleteRoutine(r.id); }} className={btn} aria-label={T(lang, 'Delete', 'Burahin')}><Trash2 size={12} /></button>
                      </div>
                      <p className="mt-1 text-[11px] text-gray-600">{describeRoutine(r, lang)}</p>
                      {problems.length ? <p className="mt-1 text-[11px] text-red-700">{T(lang, 'To fix', 'Ayusin')}: {problems[0].text}{problems.length > 1 ? ` (+${problems.length - 1})` : ''}</p> : null}
                      {r.enabled && next ? <p className="mt-1 text-[11px] text-emerald-800">{T(lang, 'Next', 'Susunod')}: {formatWhen(next)}</p> : null}
                      {r.cards.some((c) => c.type === 'when.newFiles') ? (
                        <p className="mt-1 text-[11px] text-emerald-800">{r.enabled ? T(lang, 'Watching for new files (it runs when they arrive)', 'Nagbabantay ng bagong file (tatakbo kapag may dumating)') : T(lang, 'Runs when new files arrive in its folder: switch it on.', 'Tatakbo kapag may bagong file sa folder nito: i-on ito.')}</p>
                      ) : null}
                      {last ? <div className="mt-2"><RunLights run={last} lang={lang} /></div> : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {tab === 'gallery' && (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {TEMPLATES.map((t) => (
                <li key={t.id} className="flex flex-col rounded-xl border border-gray-200 p-3">
                  <p className="text-xs font-bold text-gray-900">{t.name[lang] || t.name.en}</p>
                  <p className="mt-1 flex-1 text-[11px] text-gray-600">{t.about[lang] || t.about.en}</p>
                  <p className="mt-1 text-[10px] text-amber-800">{t.choose[lang] || t.choose.en}</p>
                  <button type="button" onClick={() => setEditing(fromTemplate(t.id, lang))} className={`${primary} mt-2 self-start`}><Check size={13} /> {T(lang, 'Use this', 'Gamitin ito')}</button>
                </li>
              ))}
            </ul>
          )}

          {tab === 'inbox' && (
            <div className="space-y-2">
              {!waiting.length ? <p className="py-6 text-center text-xs text-gray-500">{T(lang, 'Nothing is waiting for you.', 'Walang naghihintay sa iyo.')}</p> : null}
              {waiting.map((run) => (
                <div key={run.id} className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <p className="flex items-center gap-1 text-xs font-bold text-amber-900"><Hand size={14} /> {run.routineName}</p>
                  {run.waiting?.note ? <p className="mt-1 text-[11px] text-amber-900">{run.waiting.note}</p> : null}
                  {(run.waiting?.preview || []).length ? (
                    <ul className="mt-1 list-disc pl-5 text-[11px] text-gray-700">{run.waiting.preview.map((p) => <li key={p}>{p}</li>)}</ul>
                  ) : null}
                  <div className="mt-2"><RunLights run={run} lang={lang} /></div>
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={() => answer(run, true)} disabled={Boolean(busy) || isGenerating} className={primary}><Check size={13} /> {busy === run.id ? T(lang, 'Going on…', 'Tumutuloy…') : T(lang, 'Approve and go on', 'Aprubahan at ituloy')}</button>
                    <button type="button" onClick={() => answer(run, false)} disabled={Boolean(busy) || isGenerating} className={btn}><X size={12} /> {T(lang, 'Do not do it', 'Huwag gawin')}</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'history' && (
            <div className="space-y-2">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <div className="flex items-center gap-2">
                  <p className="flex-1 text-xs font-bold text-emerald-900">{T(lang, 'How it is going', 'Kumusta na')}</p>
                  <button type="button" onClick={() => { navigator.clipboard?.writeText(going).then(() => say2(T(lang, 'Copied (counts only, no names).', 'Nakopya (bilang lamang, walang pangalan).')), () => {}); }} className={btn}><Copy size={12} /> {T(lang, 'Copy', 'Kopyahin')}</button>
                </div>
                <pre className="mt-1 whitespace-pre-wrap font-sans text-[11px] text-emerald-900">{going}</pre>
              </div>
              {!history.length ? <p className="py-6 text-center text-xs text-gray-500">{T(lang, 'No runs yet.', 'Wala pang takbo.')}</p> : (
                <button type="button" onClick={clearHistory} className={btn}><Trash2 size={12} /> {T(lang, 'Clear history', 'Burahin ang kasaysayan')}</button>
              )}
              {history.map((run) => (
                <div key={run.id} className="rounded-xl border border-gray-200 p-3">
                  <p className="text-xs font-semibold text-gray-900">{run.routineName} <span className="font-normal text-gray-500">· {formatWhen(run.startedAt)}</span></p>
                  {run.problem ? <p className="mt-1 text-[11px] text-red-700">{run.problem}</p> : null}
                  <div className="mt-1"><RunLights run={run} lang={lang} /></div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
