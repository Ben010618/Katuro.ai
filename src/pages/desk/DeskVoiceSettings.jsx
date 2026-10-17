import { useEffect, useState } from 'react';
import { useDeskStore } from '../../store/deskStore';
import { getPersona } from '../../services/desk/personas';
import { deskSpeaker } from '../../services/desk/voice/speech';
import { wakePhrases, normalizePhrase } from '../../services/desk/voice/wakeWord';
import { wakeSupported, subscribeWake, testWakePhrase } from './wakeController';

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

/** Settings > Assistant: how the persona speaks. */
export default function DeskVoiceSettings() {
  const { persona, speechSettings, setSpeechSettings } = useDeskStore();
  const v = speechSettings || { natural: true, replies: false, volume: 0.9 };
  const p = getPersona(persona);
  const [speaking, setSpeaking] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => deskSpeaker().subscribe((s) => setSpeaking(s.speaking)), []);

  const test = async () => {
    setNote('');
    const res = await deskSpeaker().say(`Hello! This is ${p.name}. I'm ready to help you today.`, { persona, natural: v.natural !== false, volume: v.volume });
    const u = deskSpeaker().getUsage();
    const used = u ? ` Natural voice used today: ${mmss(u.usedSeconds)} of ${mmss(u.limitSeconds)}.` : '';
    if (res.engine === 'natural') setNote(`That was ${p.name}'s natural voice.${used}`);
    else if (res.reason === 'limit') setNote(`Today's 5 minutes of natural voice are used up, so this computer's voice was used. It resets at midnight.${used}`);
    else if (res.reason === 'offline' || res.reason === 'unavailable') setNote("The natural voice could not be reached (no internet?), so this computer's voice was used.");
    else if (res.reason === 'off') setNote("That was this computer's voice.");
  };

  return (
    <section className="border-t border-gray-100 pt-4 space-y-2">
      <h3 className="text-xs font-bold text-gray-800">Voice</h3>
      <p className="text-[11px] text-gray-500">{p.name} can speak reminders, bubble answers and chat replies. The text is always shown too.</p>
      <label className="flex items-start gap-2 cursor-pointer">
        <input type="checkbox" checked={v.natural !== false} onChange={(e) => setSpeechSettings({ natural: e.target.checked })} className="mt-0.5 w-4 h-4 accent-emerald-600" />
        <span className="text-[11px] text-gray-700">
          <span className="font-semibold text-gray-800">Natural voice</span> (needs internet; up to 5 minutes a day). After that, or offline, {p.name} uses this computer's voice.
        </span>
      </label>
      <label className="flex items-start gap-2 cursor-pointer">
        <input type="checkbox" checked={Boolean(v.replies)} onChange={(e) => setSpeechSettings({ replies: e.target.checked })} className="mt-0.5 w-4 h-4 accent-emerald-600" />
        <span className="text-[11px] text-gray-700"><span className="font-semibold text-gray-800">Read chat replies aloud</span> (the first sentences of each reply).</span>
      </label>
      <label className="flex items-center gap-2 text-[11px] text-gray-700">
        Volume
        <input type="range" min="0" max="1" step="0.05" value={v.volume ?? 0.9} onChange={(e) => setSpeechSettings({ volume: Number(e.target.value) })} className="w-40 accent-emerald-600" aria-label="Voice volume" />
        <span className="tabular-nums text-gray-500">{Math.round((v.volume ?? 0.9) * 100)}%</span>
      </label>
      <div className="flex items-center gap-2">
        <button type="button" onClick={test} disabled={speaking} className="px-3 py-1.5 rounded-lg border border-emerald-600 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-40">Test the voice</button>
        {speaking && <button type="button" onClick={() => deskSpeaker().stop()} className="px-3 py-1.5 rounded-lg border border-gray-300 text-[11px] text-gray-700 hover:bg-gray-50">Stop</button>}
      </div>
      {note && <p className="text-[11px] text-gray-600" role="status">{note}</p>}
      <p className="text-[10.5px] text-gray-400">Bubble reminders are spoken only when "Say reminders out loud" is on in My classes &gt; Assistant.</p>
      {wakeSupported() && <WakeSettings />}
    </section>
  );
}

/** "Hello Matt": the wake phrase (desktop app). */
function WakeSettings() {
  const { persona, speechSettings, setSpeechSettings } = useDeskStore();
  const v = speechSettings || {};
  const p = getPersona(persona);
  const custom = v.wakeCustom || [];
  const [wake, setWake] = useState({ status: 'off', progress: 0, error: '', phrases: [] });
  const [draft, setDraft] = useState('');
  const [testing, setTesting] = useState(false);
  const [note, setNote] = useState('');
  useEffect(() => subscribeWake(setWake), []);
  const phrases = wakePhrases(p.name, custom);
  const quote = (list) => list.map((x) => `"${x.replace(/\b\w/g, (c) => c.toUpperCase())}"`).join(', ');

  const addPhrase = async () => {
    const phrase = normalizePhrase(draft);
    setNote('');
    if (!phrase) { setNote('Use 2 to 4 ordinary English words, for example "Okay Teacher Helper".'); return; }
    if (phrases.includes(phrase)) { setNote('That phrase is already on the list.'); return; }
    setTesting(true);
    try {
      setNote(`Say "${draft.trim()}" now…`);
      const ok = await testWakePhrase(phrase);
      if (ok) {
        setSpeechSettings({ wakeCustom: [...custom, phrase] });
        setDraft('');
        setNote(`Added. ${p.name} recognized it.`);
      } else {
        setNote(`${p.name} could not recognize it. Try again closer to the microphone, or choose other common English words (names it does not know will not work).`);
      }
    } catch (err) {
      setNote(err?.message || 'The phrase could not be tested.');
    } finally {
      setTesting(false);
    }
  };

  const status = wake.status === 'loading'
    ? `Getting the speech model ready (one time, about 41 MB)${wake.progress ? `: ${wake.progress}%` : '…'}`
    : wake.status === 'listening'
      ? `Listening for ${quote(wake.phrases)}.`
      : wake.status === 'error'
        ? wake.error
        : '';

  return (
    <div className="mt-3 space-y-2 rounded-lg border border-gray-200 bg-white p-3">
      <label className="flex items-start gap-2 cursor-pointer">
        <input type="checkbox" checked={v.wake === true} onChange={(e) => setSpeechSettings({ wake: e.target.checked })} className="mt-0.5 w-4 h-4 accent-emerald-600" />
        <span className="text-[11px] text-gray-700">
          <span className="font-semibold text-gray-800">Wake phrase:</span> say {quote(phrases)} and {p.name} answers, then listens for your request. No button needed.
        </span>
      </label>
      <p className="text-[10.5px] text-gray-500">The listening happens on this computer only. Nothing is recorded or sent anywhere until you say the wake phrase. Windows shows that the microphone is in use while this is on.</p>
      {status && <p className={`text-[11px] ${wake.status === 'error' ? 'text-red-700' : 'text-emerald-800'}`} role="status">{status}</p>}
      {v.wake === true && (
        <>
          <div className="flex flex-wrap gap-1.5">
            {custom.map((c) => (
              <span key={c} className="flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 pl-2 pr-1 py-0.5 text-[11px] text-gray-700">
                {c}
                <button type="button" onClick={() => setSpeechSettings({ wakeCustom: custom.filter((x) => x !== c) })} className="rounded-full px-1 text-gray-400 hover:text-red-600" title="Remove">x</button>
              </span>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add your own phrase, e.g. Okay Teacher Helper" maxLength={40} disabled={testing} className="min-w-0 flex-1 border border-gray-300 rounded px-2 py-1 text-[11px]" />
            <button type="button" onClick={addPhrase} disabled={testing || !draft.trim()} className="px-3 py-1 rounded-lg border border-emerald-600 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-40">{testing ? 'Listening…' : 'Test it and add'}</button>
          </div>
          {note && <p className="text-[11px] text-gray-600" role="status">{note}</p>}
          <p className="text-[10.5px] text-gray-400">Tip: say the wake phrase, wait for {p.name} to answer, then say your request. English words work best for the wake phrase; your request can be in English, Filipino or Taglish.</p>
        </>
      )}
    </div>
  );
}
