import { useEffect, useState } from 'react';
import {
  SERVICES, detectService, serviceOf, getUniversalAiStatus, saveUniversalAi, setUniversalAiEnabled,
  removeUniversalAi, listUniversalModels, testUniversalAi, universalAiHealth,
} from './universalAiConfig';

const box = { background: 'var(--kt-surface)', borderRadius: 12, padding: 18, border: '1px solid rgba(45,106,79,0.25)' };
const label = { display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--kt-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 };
const input = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1.5px solid rgba(45,106,79,0.2)', borderRadius: 8, fontSize: 13, background: 'var(--kt-input-bg)', color: 'var(--kt-text-primary)', outline: 'none', fontFamily: 'inherit' };
const mono = { ...input, fontFamily: '"DM Mono", monospace' };
const btn = (primary) => ({ background: primary ? '#2d6a4f' : 'var(--kt-surface)', color: primary ? '#fff' : 'var(--kt-text-primary)', border: primary ? 'none' : '1px solid rgba(45,106,79,0.25)', borderRadius: 8, padding: '9px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' });
const note = (bad) => ({ fontSize: 12, margin: 0, color: bad ? '#dc2626' : '#2d6a4f' });

/** Admin: one universal AI key for the whole system (any service). The Gemini chain stays as backup. */
export default function UniversalAiKeyCard({ adminUid }) {
  const [saved, setSaved] = useState(null);
  const [health, setHealth] = useState(null);
  const [key, setKey] = useState('');
  const [service, setService] = useState('gemini');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [models, setModels] = useState([]);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState({ text: '', bad: false });

  const readStatus = () => getUniversalAiStatus().catch(() => ({ enabled: false, hasKey: false, error: true }));
  const apply = (s) => {
    setSaved(s);
    if (s.provider) {
      const sv = serviceOf(s.provider, s.baseUrl, s.label);
      setService(sv?.id || 'other');
      setBaseUrl(s.baseUrl || sv?.baseUrl || '');
      setModel(s.model || '');
    }
    if (s.hasKey) universalAiHealth().then(setHealth).catch(() => {});
  };
  const load = async () => apply(await readStatus());
  useEffect(() => {
    let alive = true;
    readStatus().then((s) => { if (alive) apply(s); });
    return () => { alive = false; };
  }, []);

  const svc = SERVICES.find((s) => s.id === service) || SERVICES[0];
  const say = (text, bad = false) => setMsg({ text, bad });
  const pick = (id) => {
    const s = SERVICES.find((x) => x.id === id);
    setService(id);
    setBaseUrl(s?.baseUrl || '');
    setModels([]);
    setModel('');
  };
  const onKey = (v) => {
    setKey(v);
    const hit = detectService(v);
    if (hit && hit !== service) pick(hit);
  };
  const hasSomeKey = () => Boolean(key.trim() || saved?.hasKey || (svc.provider === 'openai' && baseUrl && svc.id === 'other'));

  const check = async () => {
    say('');
    if (!hasSomeKey()) { say('Paste the API key first.', true); return; }
    if (svc.provider === 'openai' && !/^https?:\/\//i.test(baseUrl.trim())) { say('Type the service\'s server address (it starts with https:// or http://).', true); return; }
    setBusy('models');
    const r = await listUniversalModels({ provider: svc.provider, baseUrl: svc.provider === 'openai' ? baseUrl.trim() : '', apiKey: key.trim() }).catch((e) => ({ ok: false, error: e.message }));
    setBusy('');
    if (!r?.ok) { say(r?.error || 'The key could not be checked.', true); return; }
    setModels(r.models || []);
    if (!model || !(r.models || []).includes(model)) setModel(r.suggested || '');
    say(r.models?.length ? `The key works. ${r.models.length} models found; choose one below.` : 'The key works, but no models were listed. Type the model name below.');
  };

  const save = async (enable) => {
    say('');
    if (!hasSomeKey()) { say('Paste the API key first.', true); return; }
    setBusy('save');
    try {
      await saveUniversalAi({ provider: svc.provider, baseUrl: svc.provider === 'openai' ? baseUrl : '', model, label: svc.label, enabled: enable, apiKey: key.trim() || undefined }, adminUid);
    } catch (e) {
      setBusy('');
      say(e.message || 'Could not save.', true);
      return;
    }
    setKey('');
    const t = await testUniversalAi().catch((e) => ({ ok: false, error: e.message }));
    setBusy('');
    await load();
    if (!t?.ok) say(`Saved, but the test request failed: ${t?.error || 'unknown error'} Until it works, Gemini keeps answering.`, true);
    else say(enable ? `Saved and tested (${t.ms} ms). Every AI request now goes to ${svc.label} first; Gemini answers if it ever fails.` : `Saved and tested (${t.ms} ms). It is off: turn it on to use it.`);
  };

  const toggle = async () => {
    setBusy('toggle');
    try {
      await setUniversalAiEnabled(!saved?.enabled, adminUid);
      await load();
      say(!saved?.enabled ? 'The universal key is on: it answers first.' : 'The universal key is off: Gemini answers everything.');
    } catch (e) { say(e.message || 'Could not change it.', true); }
    setBusy('');
  };

  const remove = async () => {
    if (!window.confirm('Remove the universal AI key? Gemini will answer everything again.')) return;
    setBusy('remove');
    try {
      await removeUniversalAi();
      setKey(''); setModels([]); setModel(''); setHealth(null);
      await load();
      say('Removed. Gemini answers everything again.');
    } catch (e) { say(e.message || 'Could not remove it.', true); }
    setBusy('');
  };

  const savedSvc = saved?.provider ? serviceOf(saved.provider, saved.baseUrl, saved.label) : null;

  return (
    <div style={box}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--kt-text-primary)' }}>Universal AI key</h3>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--kt-text-secondary)', maxWidth: 620 }}>
            Use any AI service for the whole system: Google Gemini, OpenAI, Anthropic Claude, OpenRouter, Groq, xAI, NVIDIA, DeepSeek, Mistral, or any OpenAI-compatible service.
            When it is on, it answers first for the website and KaTuroDesk; the Gemini key, Vertex AI and NVIDIA backups answer automatically if it ever fails.
          </p>
        </div>
        <span style={{ fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: 999, background: saved?.enabled ? '#2d6a4f' : 'var(--kt-card)', color: saved?.enabled ? '#fff' : 'var(--kt-text-secondary)', border: '1px solid rgba(45,106,79,0.25)' }}>
          {saved === null ? 'Loading…' : saved.enabled ? 'On' : 'Off'}
        </span>
      </div>

      {saved?.hasKey || saved?.provider ? (
        <p style={{ fontSize: 12, margin: '0 0 12px', color: 'var(--kt-text-primary)' }}>
          Saved: {savedSvc?.label || saved.label || saved.provider} key {saved.keyHint || '(none)'}, model <b>{saved.model || '(none)'}</b>.
          {health?.resting ? <span style={{ color: '#dc2626' }}> Resting after a problem: {health.lastProblem}</span> : null}
        </p>
      ) : null}

      <div style={{ display: 'grid', gap: 12 }}>
        <div>
          <label style={label}>API key</label>
          <input type="password" value={key} onChange={(e) => onKey(e.target.value)} placeholder={saved?.hasKey ? 'Paste a new key to replace the saved one' : 'Paste any AI API key here'} autoComplete="off" spellCheck={false} style={mono} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <div>
            <label style={label}>AI service</label>
            <select value={service} onChange={(e) => pick(e.target.value)} style={input}>
              {SERVICES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label style={label}>Model</label>
            <input list="universal-ai-models" value={model} onChange={(e) => setModel(e.target.value)} placeholder="Check the key to list models" spellCheck={false} style={mono} />
            <datalist id="universal-ai-models">{models.map((m) => <option key={m} value={m} />)}</datalist>
          </div>
        </div>
        {svc.provider === 'openai' && (
          <div>
            <label style={label}>Server address</label>
            <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="e.g. https://api.together.xyz/v1" spellCheck={false} style={mono} />
          </div>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button type="button" onClick={check} disabled={Boolean(busy)} style={btn(false)}>{busy === 'models' ? 'Checking…' : 'Check key and list models'}</button>
          <button type="button" onClick={() => save(true)} disabled={Boolean(busy)} style={btn(true)}>{busy === 'save' ? 'Saving and testing…' : 'Save, test and turn on'}</button>
          <button type="button" onClick={() => save(false)} disabled={Boolean(busy)} style={btn(false)}>Save only (off)</button>
          {saved?.provider && <button type="button" onClick={toggle} disabled={Boolean(busy)} style={btn(false)}>{saved.enabled ? 'Turn off' : 'Turn on'}</button>}
          {saved?.provider && <button type="button" onClick={remove} disabled={Boolean(busy)} style={{ ...btn(false), color: '#dc2626' }}>Remove</button>}
        </div>
        {msg.text && <p role="status" style={note(msg.bad)}>{msg.text}</p>}
        <p style={{ fontSize: 11, margin: 0, color: 'var(--kt-text-secondary)' }}>
          The key is stored in the admin-only settings and used only by KaTuro's servers; it is never sent to teachers' browsers. Daily limits per teacher still apply.
          Voice clips (KaTuroDesk dictation) use it only with Google Gemini; other services leave voice to Gemini. Images (slides pictures) and the persona voices are not affected.
          For learner data, prefer a paid key: free plans may let the service use what is sent to improve its products.
        </p>
      </div>
    </div>
  );
}
