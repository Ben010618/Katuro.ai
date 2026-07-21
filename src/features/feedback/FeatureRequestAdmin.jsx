import { useState, useEffect } from 'react';
import {
  collection, query, orderBy, onSnapshot,
  addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import { Lightbulb, Plus, Trash2, Pencil, X, Loader2 } from 'lucide-react';
import { db } from '../../firebase';

const card = {
  background: 'var(--kt-card)', borderRadius: 14,
  border: '1px solid var(--kt-border)', padding: '20px 22px',
};
const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  padding: '10px 12px', border: '1.5px solid rgba(45,106,79,0.2)',
  borderRadius: 8, fontSize: 14, background: 'var(--kt-input-bg)',
  color: 'var(--kt-text-primary)', outline: 'none', fontFamily: 'inherit',
};
const labelStyle = {
  display: 'block', fontSize: 11, fontWeight: 700,
  color: 'var(--kt-text-secondary)', textTransform: 'uppercase',
  letterSpacing: '0.07em', marginBottom: 6,
};
const btnPrimary = {
  background: '#2d6a4f', color: '#fff', border: 'none',
  borderRadius: 8, padding: '10px 20px', fontSize: 13,
  fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  display: 'flex', alignItems: 'center', gap: 6,
};
const btnSecondary = {
  background: 'var(--kt-surface)', color: '#1a3d2b', border: '1px solid rgba(45,106,79,0.2)',
  borderRadius: 8, padding: '6px 12px', fontSize: 11,
  fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  display: 'flex', alignItems: 'center', gap: 5,
};

const STATUSES = ['Approved', 'In Progress', 'Added'];
const EMPTY_FORM = { title: '', description: '', requestedBy: '', status: 'Approved', version: '', order: '' };

function FormModal({ initial, onClose, onSaved }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const isEdit = !!initial?.id;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.title.trim() || !form.description.trim() || !form.requestedBy.trim()) {
      setErr('Title, description, and requested-by are required.');
      return;
    }
    setSaving(true);
    setErr('');
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        requestedBy: form.requestedBy.trim(),
        status: form.status,
        version: form.version.trim(),
        order: form.order === '' ? null : Number(form.order),
        updatedAt: serverTimestamp(),
      };
      if (isEdit) {
        await updateDoc(doc(db, 'feature_requests', initial.id), payload);
      } else {
        await addDoc(collection(db, 'feature_requests'), { ...payload, createdAt: serverTimestamp() });
      }
      onSaved();
    } catch {
      setErr("Couldn't save this entry. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(13,34,24,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }} onClick={onClose}>
      <form onSubmit={handleSubmit} onClick={(e) => e.stopPropagation()} style={{
        background: 'var(--kt-card)', borderRadius: 16, padding: '28px 28px 24px',
        width: '100%', maxWidth: 480, boxShadow: '0 20px 60px rgba(13,34,24,0.18)',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--kt-text-primary)' }}>{isEdit ? 'Edit' : 'New'} Feature Request</h3>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--kt-text-secondary)', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        <label style={labelStyle}>Title</label>
        <input style={{ ...inputStyle, marginBottom: 14 }} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />

        <label style={labelStyle}>Description</label>
        <textarea rows={3} style={{ ...inputStyle, marginBottom: 14, resize: 'vertical' }} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />

        <label style={labelStyle}>Requested By (name, typed manually)</label>
        <input style={{ ...inputStyle, marginBottom: 14 }} placeholder="e.g. Teacher Ana R. — Batangas" value={form.requestedBy} onChange={(e) => setForm({ ...form, requestedBy: e.target.value })} />

        <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Status</label>
            <select style={inputStyle} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Version</label>
            <input style={inputStyle} placeholder="v1.4" value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Order</label>
            <input style={inputStyle} type="number" value={form.order} onChange={(e) => setForm({ ...form, order: e.target.value })} />
          </div>
        </div>

        {err && <p style={{ margin: '0 0 14px', fontSize: 12, color: '#c0392b' }}>{err}</p>}

        <button type="submit" disabled={saving} style={{ ...btnPrimary, width: '100%', justifyContent: 'center', opacity: saving ? 0.6 : 1 }}>
          {saving ? <Loader2 size={14} style={{ animation: 'kt-spin 0.8s linear infinite' }} /> : (isEdit ? 'Save Changes' : 'Add Entry')}
        </button>
      </form>
    </div>
  );
}

export default function FeatureRequestAdmin() {
  const [items,   setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null = closed, {} = new, {...} = edit

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'feature_requests'), orderBy('createdAt', 'desc')),
      (snap) => {
        setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, []);

  async function remove(item) {
    if (!window.confirm(`Delete "${item.title}"?`)) return;
    await deleteDoc(doc(db, 'feature_requests', item.id)).catch(() => {});
  }

  return (
    <div style={{ ...card, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: '#f5faf7', display: 'grid', placeItems: 'center' }}>
            <Lightbulb size={16} color="#2d6a4f" />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--kt-text-primary)' }}>Feature Requests</h3>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--kt-text-secondary)' }}>Curated entries shown on the public Request Feature board.</p>
          </div>
        </div>
        <button onClick={() => setEditing({})} style={{ ...btnSecondary, fontSize: 12 }}>
          <Plus size={13} /> New Entry
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 20 }}><Loader2 size={18} style={{ animation: 'kt-spin 0.8s linear infinite' }} /></div>
      ) : items.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12, color: '#9bb8a5', textAlign: 'center', padding: 16 }}>No entries yet. Add one for teachers to see.</p>
      ) : (
        items.map((item) => (
          <div key={item.id} style={{
            display: 'flex', gap: 10, alignItems: 'flex-start',
            padding: '10px 12px', borderRadius: 8, marginBottom: 6,
            background: 'var(--kt-surface)', border: '1px solid var(--kt-border)',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 3, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 10, fontWeight: 700, background: '#e8f7ee', color: '#2d6a4f', borderRadius: 4, padding: '1px 6px' }}>{item.status}</span>
                {item.version && <span style={{ fontSize: 10, color: '#9bb8a5' }}>{item.version}</span>}
              </div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--kt-text-primary)' }}>{item.title}</p>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--kt-text-secondary)', wordBreak: 'break-word' }}>{item.description}</p>
              <p style={{ margin: '3px 0 0', fontSize: 10, color: '#9bb8a5' }}>Requested by: {item.requestedBy}</p>
            </div>
            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
              <button onClick={() => setEditing(item)} title="Edit" style={{ ...btnSecondary, padding: '4px 8px' }}>
                <Pencil size={11} />
              </button>
              <button onClick={() => remove(item)} title="Delete" style={{ ...btnSecondary, padding: '4px 8px', color: '#c0392b', borderColor: 'rgba(224,92,92,0.3)' }}>
                <Trash2 size={11} />
              </button>
            </div>
          </div>
        ))
      )}

      {editing !== null && (
        <FormModal initial={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={() => setEditing(null)} />
      )}
    </div>
  );
}
