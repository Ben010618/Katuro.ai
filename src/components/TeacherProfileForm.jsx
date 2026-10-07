import { useEffect, useMemo, useState } from 'react';
import { Loader2, Save, CheckCircle2 } from 'lucide-react';
import { updateTeacherProfile } from '../services/db';
import { HONORIFICS, SIGNATORY_ROLES, PROFILE_FIELDS, teacherInfo } from '../services/teacherInfo';
import { listDivisions } from '../services/messages/chatService';

/**
 * Teacher profile + signatories form. Shared by Settings (web) and KaTuroDesk → Settings.
 * Every field is optional; blank fields are simply left out of generated documents.
 */

const labelStyle = { display: 'block', marginBottom: 5, fontSize: 11, fontWeight: 700, color: 'var(--kt-form-label, #4a6357)', textTransform: 'uppercase', letterSpacing: '0.8px' };
const hintStyle = { margin: '3px 0 0', fontSize: 11, color: 'var(--kt-form-label, #6b7f74)' };
const inputStyle = { width: '100%', boxSizing: 'border-box', padding: '8px 10px', fontSize: 13, borderRadius: 8, border: '1px solid var(--kt-form-input-border, #cfd8d3)', background: 'var(--kt-form-input-bg, #fff)', color: 'var(--kt-form-title, #0d2218)', fontFamily: 'inherit' };
const sectionTitle = { margin: '0 0 2px', fontSize: 14, fontWeight: 700, color: 'var(--kt-form-title, #0d2218)' };
const sectionHint = { margin: '0 0 10px', fontSize: 12, color: 'var(--kt-form-label, #4a6357)' };
const grid = (cols) => ({ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${cols}px, 1fr))`, gap: 12 });

function Field({ label, hint, children }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={labelStyle}>{label}</span>
      {children}
      {hint && <p style={hintStyle}>{hint}</p>}
    </label>
  );
}

function toForm(profile, user) {
  const t = teacherInfo(profile, user);
  const form = {
    userName: t.userName, name: t.name, honorific: t.honorific,
    school: t.school, schoolId: t.schoolId, district: t.district, division: t.division, region: t.region, designation: t.designation,
    advisoryClass: t.advisoryClass, teachingLoad: t.teachingLoad,
  };
  for (const r of SIGNATORY_ROLES) {
    form[`${r.key}Name`] = t.signatories[r.key].name;
    form[`${r.key}Position`] = t.signatories[r.key].position;
  }
  return form;
}

export default function TeacherProfileForm({ uid, profile, user, onSaved, compact = false }) {
  const initial = useMemo(() => toForm(profile, user), [profile, user]);
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  // Division names other teachers already use (so teachers of one division match in Messages).
  const [divisions, setDivisions] = useState([]);
  const loadDivisions = () => { if (!divisions.length) listDivisions().then(setDivisions).catch(() => {}); };

  // Load the saved profile when it arrives, unless the teacher is mid-edit.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- re-syncs the form from the live Firestore profile while untouched
    if (!dirty) setForm(initial);
  }, [initial, dirty]);

  const set = (key) => (e) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setDirty(true);
    setSaved(false);
  };

  async function handleSubmit(e) {
    e.preventDefault();
    if (!uid) return;
    setSaving(true);
    setError('');
    try {
      const payload = {};
      for (const k of PROFILE_FIELDS) payload[k] = String(form[k] ?? '').replace(/\s+/g, ' ').trim();
      // Older lesson-plan exports read supervisorName/supervisorPosition — keep them in step with the Master Teacher.
      payload.supervisorName = payload.masterTeacherName;
      payload.supervisorPosition = payload.masterTeacherPosition;
      await updateTeacherProfile(uid, payload);
      setDirty(false);
      setSaved(true);
      onSaved?.(payload);
    } catch (err) {
      setError(err?.message || 'Could not save your profile. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: compact ? 16 : 22 }}>
      <section>
        <h3 style={sectionTitle}>About you</h3>
        <p style={sectionHint}>All fields are optional. Anything you leave blank will not appear on your documents.</p>
        <div style={grid(compact ? 150 : 200)}>
          <Field label="User name" hint="What KaTuro calls you, e.g. Ben">
            <input style={inputStyle} value={form.userName} onChange={set('userName')} placeholder="Ben" autoComplete="nickname" />
          </Field>
          <Field label="Title / honorific" hint="Sir, Ma'am, Mr., Mrs., Dr., Prof.">
            <input style={inputStyle} value={form.honorific} onChange={set('honorific')} placeholder="Sir" list="kt-honorifics" />
            <datalist id="kt-honorifics">
              {HONORIFICS.map((h) => <option key={h} value={h} />)}
            </datalist>
          </Field>
        </div>
        <div style={{ ...grid(compact ? 150 : 200), marginTop: 12 }}>
          <Field label="Full name" hint="As printed on documents">
            <input style={inputStyle} value={form.name} onChange={set('name')} placeholder="Ben Mark Joy A. Cuvinar" autoComplete="name" />
          </Field>
          <Field label="Position / designation">
            <input style={inputStyle} value={form.designation} onChange={set('designation')} placeholder="Teacher VI" />
          </Field>
        </div>
      </section>

      <section>
        <h3 style={sectionTitle}>School</h3>
        <div style={grid(compact ? 150 : 200)}>
          <Field label="School">
            <input style={inputStyle} value={form.school} onChange={set('school')} placeholder="Dayap National High School" />
          </Field>
          <Field label="School ID">
            <input style={inputStyle} value={form.schoolId} onChange={set('schoolId')} placeholder="301234" inputMode="numeric" />
          </Field>
        </div>
        <div style={{ ...grid(compact ? 140 : 180), marginTop: 12 }}>
          <Field label="District">
            <input style={inputStyle} value={form.district} onChange={set('district')} placeholder="Calauan District" />
          </Field>
          <Field label="Division">
            <input style={inputStyle} value={form.division} onChange={set('division')} onFocus={loadDivisions} list="kt-division-suggestions" autoComplete="off" placeholder="Schools Division of Laguna" />
            <datalist id="kt-division-suggestions">
              {divisions.map((d) => <option key={d.name} value={d.name} />)}
            </datalist>
          </Field>
          <Field label="Region">
            <input style={inputStyle} value={form.region} onChange={set('region')} placeholder="Region IV-A (CALABARZON)" />
          </Field>
        </div>
      </section>

      <section>
        <h3 style={sectionTitle}>My classes (this school year)</h3>
        <p style={sectionHint}>Helps KaTuro understand "my class" and "my grades" without guessing. Leave blank what does not apply.</p>
        <div style={grid(compact ? 150 : 220)}>
          <Field label="Advisory class" hint="e.g. Grade 5 – Rizal. Leave blank if you are not a class adviser.">
            <input style={inputStyle} value={form.advisoryClass} onChange={set('advisoryClass')} placeholder="Grade 5 – Rizal" />
          </Field>
          <Field label="Teaching load" hint="Subjects and sections you teach, e.g. Science 7 – A, B; Math 8 – C">
            <input style={inputStyle} value={form.teachingLoad} onChange={set('teachingLoad')} placeholder="Science 7 – A, B; Math 8 – C" />
          </Field>
        </div>
      </section>

      <section>
        <h3 style={sectionTitle}>Signatories (optional)</h3>
        <p style={sectionHint}>Saved once, added to your DLL, lesson plans, COT and KaTuroDesk documents automatically. Leave a person blank and their signature line won't appear.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {SIGNATORY_ROLES.map((r) => (
            <div key={r.key} style={{ border: '1px solid var(--kt-form-card-border, #e1e8e4)', borderRadius: 10, padding: '10px 12px', background: 'var(--kt-form-card-bg, #fafcfb)' }}>
              <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: 'var(--kt-green-ink, #2d6a4f)' }}>
                {r.role} <span style={{ fontWeight: 500, color: 'var(--kt-form-label, #6b7f74)' }}>· signs as “{r.label.replace(':', '')}”</span>
              </p>
              <div style={grid(compact ? 150 : 200)}>
                <Field label="Name">
                  <input style={inputStyle} value={form[`${r.key}Name`]} onChange={set(`${r.key}Name`)} placeholder={r.example} />
                </Field>
                <Field label="Position">
                  <input style={inputStyle} value={form[`${r.key}Position`]} onChange={set(`${r.key}Position`)} placeholder={r.examplePosition} />
                </Field>
              </div>
            </div>
          ))}
        </div>
      </section>

      {error && <p role="alert" style={{ margin: 0, fontSize: 12, color: '#c0392b' }}>{error}</p>}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
        {saved && !dirty && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--kt-green-ink, #2d6a4f)', fontWeight: 600 }}>
            <CheckCircle2 size={14} /> Saved
          </span>
        )}
        <button
          type="submit"
          disabled={saving || !uid}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 9, border: 'none', background: '#2d6a4f', color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'wait' : 'pointer', opacity: saving || !uid ? 0.7 : 1, fontFamily: 'inherit' }}
        >
          {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />}
          {saving ? 'Saving…' : 'Save profile'}
        </button>
      </div>
    </form>
  );
}
