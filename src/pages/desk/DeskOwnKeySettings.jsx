import { useEffect, useState } from 'react';
import { ownBrainStatus, setOwnBrainStatus, lastOwnBrainResult } from '../../services/desk/brain/ownBrain';

/** Services the teacher can pick; "other" = any OpenAI-compatible service (server address needed). */
const SERVICES = [
  { id: 'gemini', label: 'Google Gemini', provider: 'gemini' },
  { id: 'openai', label: 'OpenAI', provider: 'openai', baseUrl: 'https://api.openai.com/v1' },
  { id: 'claude', label: 'Anthropic Claude', provider: 'claude' },
  { id: 'openrouter', label: 'OpenRouter', provider: 'openai', baseUrl: 'https://openrouter.ai/api/v1' },
  { id: 'groq', label: 'Groq', provider: 'openai', baseUrl: 'https://api.groq.com/openai/v1' },
  { id: 'xai', label: 'xAI', provider: 'openai', baseUrl: 'https://api.x.ai/v1' },
  { id: 'nvidia', label: 'NVIDIA', provider: 'openai', baseUrl: 'https://integrate.api.nvidia.com/v1' },
  { id: 'other', label: 'Other service (OpenAI-compatible)', provider: 'openai', baseUrl: '' },
];

const serviceFor = (provider, baseUrl = '', label = '') => {
  if (provider !== 'openai') return SERVICES.find((s) => s.id === provider) || null;
  return SERVICES.find((s) => s.provider === 'openai' && s.baseUrl && s.baseUrl === baseUrl) || (label ? SERVICES.find((s) => s.label === label) : null) || SERVICES.find((s) => s.id === 'other');
};

const timeText = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/** Hidden tab (4 clicks on the Settings gear): the teacher's own AI key, used first for every AI request. */
export default function DeskOwnKeySettings() {
  const api = typeof window !== 'undefined' ? window.katuroDeskApi?.brain : null;
  const [saved, setSaved] = useState(null);
  const [key, setKey] = useState('');
  const [service, setService] = useState('gemini');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [models, setModels] = useState([]);
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState({ text: '', bad: false });
  const last = lastOwnBrainResult();

  useEffect(() => {
    ownBrainStatus(true).then((s) => {
      setSaved(s);
      if (s?.provider) {
        const sv = serviceFor(s.provider, s.baseUrl, s.label);
        setService(sv?.id || 'other');
        setBaseUrl(s.baseUrl || sv?.baseUrl || '');
        setModel(s.model || '');
        setEnabled(s.enabled !== false);
      }
    });
  }, []);

  if (!api) return <p className="text-[11px] text-gray-500">This works in the KaTuroDesk desktop app only.</p>;

  const svc = SERVICES.find((s) => s.id === service) || SERVICES[0];
  const say = (text, bad = false) => setNote({ text, bad });

  const pickService = (id) => {
    const s = SERVICES.find((x) => x.id === id);
    setService(id);
    setBaseUrl(s?.baseUrl ?? '');
    setModels([]);
    setModel('');
  };

  /** Paste a key: the service is recognized from its shape when possible. */
  const onKey = async (value) => {
    setKey(value);
    const v = value.trim();
    if (v.length < 12) return;
    const hit = await api.detect(v).catch(() => null);
    if (hit?.provider) {
      const s = serviceFor(hit.provider, hit.baseUrl, hit.label);
      if (s && s.id !== service) pickService(s.id);
      if (s?.id === 'other' && hit.baseUrl) setBaseUrl(hit.baseUrl);
    }
  };

  const loadModels = async () => {
    say('');
    if (!key.trim() && !saved?.hasKey && !(svc.provider === 'openai' && baseUrl)) { say('Paste your API key first.', true); return; }
    if (svc.id === 'other' && !/^https?:\/\//i.test(baseUrl.trim())) { say('Type the service\'s server address (it starts with https:// or http://).', true); return; }
    setBusy('models');
    const res = await api.models({ provider: svc.provider, baseUrl: svc.provider === 'openai' ? baseUrl.trim() : '', key: key.trim() || undefined }).catch((e) => ({ error: e.message }));
    setBusy('');
    if (res?.error) { say(res.error, true); return; }
    setModels(res.models || []);
    if (!model || !(res.models || []).includes(model)) setModel(res.suggested || '');
    say(res.models?.length ? `Your key works. ${res.models.length} models found; choose one below.` : 'Your key works, but no models were listed. Type the model name below.');
  };

  const save = async () => {
    say('');
    if (!key.trim() && !saved?.hasKey && !(svc.provider === 'openai' && baseUrl)) { say('Paste your API key first.', true); return; }
    if (!model.trim()) { say('Choose or type a model first (use "Check key and list models").', true); return; }
    setBusy('save');
    const s = await api.save({ provider: svc.provider, baseUrl: svc.provider === 'openai' ? baseUrl.trim() : '', model: model.trim(), label: svc.label, enabled, ...(key.trim() ? { key: key.trim() } : {}) }).catch((e) => ({ error: e.message }));
    if (s?.error) { setBusy(''); say(s.error, true); return; }
    setSaved(s);
    setOwnBrainStatus(s);
    setKey('');
    const t = await api.test().catch((e) => ({ error: e.message }));
    setBusy('');
    if (t?.error) say(`Saved, but the test request failed: ${t.error} Until it works, the KaTuro AI keeps answering.`, true);
    else say(enabled ? `Saved and tested. KaTuroDesk now uses your ${svc.label} key first; the KaTuro AI answers if your key ever fails.` : 'Saved and tested. Your key is off; tick "Use my key" to turn it on.');
  };

  const toggle = async (on) => {
    setEnabled(on);
    if (!saved?.hasKey && !(saved?.provider === 'openai' && saved?.baseUrl)) return;
    const s = await api.save({ enabled: on }).catch(() => null);
    if (s && !s.error) { setSaved(s); setOwnBrainStatus(s); say(on ? 'Your key is on.' : 'Your key is off. The KaTuro AI answers everything.'); }
  };

  const remove = async () => {
    const s = await api.remove().catch(() => null);
    setSaved(s);
    setOwnBrainStatus(s);
    setKey('');
    setModels([]);
    setModel('');
    say('Your key was removed from this computer. The KaTuro AI answers everything.');
  };

  const savedService = saved?.provider ? serviceFor(saved.provider, saved.baseUrl, saved.label) : null;

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-xs font-bold text-gray-800">Your own AI key</h3>
        <p className="text-[11px] text-gray-500 mt-0.5">Use any AI service you have a key for. KaTuroDesk sends every request to your key first, with no daily limit. If your key fails (wrong key, no credit, offline), the KaTuro AI answers instead.</p>
      </div>

      {saved?.hasKey || (saved?.provider === 'openai' && saved?.baseUrl) ? (
        <p className="text-[11px] text-emerald-800 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
          Saved: {savedService?.label || saved.label || saved.provider} key {saved.keyHint || ''}, model {saved.model || '(none)'}{saved.enabled ? '' : ' (off)'}.
          {last.at ? (last.ok ? ` Last answer from your key at ${timeText(last.at)}.` : ` At ${timeText(last.at)} your key failed (${last.message}), so the KaTuro AI answered.`) : ''}
        </p>
      ) : null}

      <label className="block text-[11px] text-gray-700">
        <span className="font-semibold text-gray-800">API key</span>
        <input
          type="password"
          value={key}
          onChange={(e) => onKey(e.target.value)}
          placeholder={saved?.hasKey ? 'Paste a new key to replace the saved one' : 'Paste your AI API key here'}
          autoComplete="off"
          spellCheck={false}
          className="mt-1 w-full border border-gray-300 rounded px-2 py-1.5 text-[11px] font-mono"
        />
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="block text-[11px] text-gray-700">
          <span className="font-semibold text-gray-800">AI service</span>
          <select value={service} onChange={(e) => pickService(e.target.value)} className="mt-1 w-full border border-gray-300 rounded px-2 py-1.5 text-[11px]">
            {SERVICES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <label className="block text-[11px] text-gray-700">
          <span className="font-semibold text-gray-800">Model</span>
          <input list="own-ai-models" value={model} onChange={(e) => setModel(e.target.value)} placeholder="Check the key to list models" className="mt-1 w-full border border-gray-300 rounded px-2 py-1.5 text-[11px] font-mono" />
          <datalist id="own-ai-models">{models.map((m) => <option key={m} value={m} />)}</datalist>
        </label>
      </div>

      {svc.provider === 'openai' && (
        <label className="block text-[11px] text-gray-700">
          <span className="font-semibold text-gray-800">Server address</span>
          <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="e.g. https://api.deepseek.com/v1 or http://localhost:11434/v1" spellCheck={false} className="mt-1 w-full border border-gray-300 rounded px-2 py-1.5 text-[11px] font-mono" />
        </label>
      )}

      <label className="flex items-start gap-2 cursor-pointer">
        <input type="checkbox" checked={enabled} onChange={(e) => toggle(e.target.checked)} className="mt-0.5 w-4 h-4 accent-emerald-600" />
        <span className="text-[11px] text-gray-700"><span className="font-semibold text-gray-800">Use my key</span> for every KaTuroDesk request (chat, files, documents, photos, lesson prep).</span>
      </label>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={loadModels} disabled={Boolean(busy)} className="px-3 py-1.5 rounded-lg border border-gray-300 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40">{busy === 'models' ? 'Checking…' : 'Check key and list models'}</button>
        <button type="button" onClick={save} disabled={Boolean(busy)} className="px-3 py-1.5 rounded-lg border border-emerald-600 text-[11px] font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-40">{busy === 'save' ? 'Saving and testing…' : 'Save and test'}</button>
        {(saved?.hasKey || saved?.provider) && <button type="button" onClick={remove} disabled={Boolean(busy)} className="px-3 py-1.5 rounded-lg border border-gray-300 text-[11px] text-red-700 hover:bg-red-50 disabled:opacity-40">Remove key</button>}
      </div>
      {note.text && <p className={`text-[11px] ${note.bad ? 'text-red-700' : 'text-emerald-800'}`} role="status">{note.text}</p>}

      <p className="text-[10.5px] text-gray-400">Your key is encrypted on this computer and is never sent to KaTuro. Requests, including the content of files you ask about, go straight to the service you chose under your own account and its terms; "Protect learner names" still applies. Voice dictation uses your key only with Google Gemini; with other services the KaTuro AI handles voice. The voices that speak replies are not affected.</p>
    </section>
  );
}
