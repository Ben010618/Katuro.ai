import { useState } from 'react';
import { Delete, Download, KeyRound, Loader2, Lock, LogOut, RefreshCw, ShieldCheck, Unlink, UserX, X } from 'lucide-react';
import { checkPin, setPin, validPin } from '../../services/link/appLock';

/**
 * The PIN screen. mode 'set': choose a PIN (typed twice); 'unlock': type it.
 * onDone() when set / unlocked; onForgot() signs out (clears the teacher's data from the phone);
 * onCancel() (changing an existing PIN only) keeps the old one.
 */
export function LockScreen({ mode, onDone, onForgot, onCancel }) {
  const [pin, setPinText] = useState('');
  const [first, setFirst] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const setting = mode === 'set';
  const title = setting ? (first ? 'Type the PIN again' : 'Choose a PIN for KaTuro') : 'Type your KaTuro PIN';

  const submit = async (value) => {
    setBusy(true);
    try {
      if (setting) {
        if (!first) { setFirst(value); setPinText(''); setNote(''); return; }
        if (value !== first) { setFirst(''); setPinText(''); setNote('The two PINs were different. Choose again.'); return; }
        await setPin(value);
        onDone();
        return;
      }
      const r = await checkPin(value);
      if (r.ok) { onDone(); return; }
      setPinText('');
      setNote(r.waitMs ? `Too many wrong PINs. Wait ${Math.ceil(r.waitMs / 1000)} seconds.` : `Wrong PIN. ${r.left} tr${r.left === 1 ? 'y' : 'ies'} left before a short wait.`);
    } catch (err) {
      setNote(err.message);
    } finally {
      setBusy(false);
    }
  };
  const press = (d) => {
    if (busy) return;
    const next = (pin + d).slice(0, 6);
    setPinText(next);
    setNote('');
  };

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-[#1f3a2c] px-6 text-white" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <Lock size={36} className="mb-3 text-emerald-200" />
      <p className="text-lg font-bold">{title}</p>
      {setting && <p className="mt-1 text-center text-xs text-emerald-100">4 to 6 numbers. It protects your class lists and records on this phone.</p>}
      <div className="my-5 flex gap-3" aria-label={`${pin.length} digits typed`}>
        {[0, 1, 2, 3, 4, 5].map((i) => <span key={i} className={`h-3.5 w-3.5 rounded-full ${i < pin.length ? 'bg-white' : 'bg-white/25'}`} />)}
      </div>
      <p className="min-h-[20px] text-center text-sm text-amber-200">{note}</p>
      <div className="mt-3 grid w-full max-w-[280px] grid-cols-3 gap-3">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} type="button" onClick={() => press(d)} className="h-16 rounded-2xl bg-white/10 text-2xl font-semibold active:bg-white/20">{d}</button>
        ))}
        <button type="button" aria-label="Erase" onClick={() => setPinText(pin.slice(0, -1))} className="flex h-16 items-center justify-center rounded-2xl active:bg-white/10"><Delete size={24} /></button>
        <button type="button" onClick={() => press('0')} className="h-16 rounded-2xl bg-white/10 text-2xl font-semibold active:bg-white/20">0</button>
        <button type="button" disabled={!validPin(pin) || busy} onClick={() => submit(pin)} className="h-16 rounded-2xl bg-emerald-500 text-sm font-bold disabled:opacity-30">{busy ? <Loader2 size={20} className="mx-auto animate-spin" /> : 'OK'}</button>
      </div>
      {!setting && <button type="button" onClick={onForgot} className="mt-6 text-sm text-emerald-100 underline">Forgot the PIN? Sign out</button>}
      {setting && onCancel && <button type="button" onClick={onCancel} className="mt-6 text-sm text-emerald-100 underline">Cancel (keep my PIN)</button>}
    </div>
  );
}

/** The app menu (top right): version, updates, PIN, account. */
export function PhoneMenu({ version, linked, onClose, onCheckUpdate, onChangePin, onUnlink, onSignOut }) {
  const [deleteInfo, setDeleteInfo] = useState(false);
  const row = 'flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-left text-sm font-semibold text-gray-900 active:bg-gray-50';
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full rounded-t-2xl bg-white p-3" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
        <div className="flex items-center justify-between px-2 pb-2">
          <p className="text-xs text-gray-500">KaTuro App {version ? `v${version}` : ''}</p>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1"><X size={20} /></button>
        </div>
        <button type="button" onClick={onCheckUpdate} className={row}><RefreshCw size={20} className="text-emerald-700" /> Check for updates</button>
        {linked && <button type="button" onClick={onChangePin} className={row}><KeyRound size={20} className="text-emerald-700" /> Change my PIN</button>}
        {linked && <button type="button" onClick={onUnlink} className={row}><Unlink size={20} className="text-gray-500" /> Unlink from KaTuroDesk</button>}
        <button type="button" onClick={() => setDeleteInfo((v) => !v)} className={row}><UserX size={20} className="text-gray-500" /> Delete my account</button>
        {deleteInfo && <p className="mx-4 mb-2 rounded-lg bg-gray-50 p-3 text-xs text-gray-700">Ask your KaTuro admin to delete your account. Your records on KaTuroDesk stay on your computer; this phone&apos;s copy is cleared when you sign out.</p>}
        <button type="button" onClick={onSignOut} className={row}><LogOut size={20} className="text-red-600" /> Sign out</button>
        <p className="flex items-center gap-1.5 px-4 pt-2 text-[11px] text-gray-500"><ShieldCheck size={13} className="text-emerald-700" /> Your class records stay on your computer and this phone only.</p>
      </div>
    </div>
  );
}

/** A newer version is ready: notes, size, Update. */
export function UpdateSheet({ update, state, onUpdate, onClose }) {
  const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={state.busy ? undefined : onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full rounded-t-2xl bg-white p-4 space-y-3" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
        <p className="text-base font-bold text-gray-900 flex items-center gap-2"><Download size={20} className="text-emerald-700" /> KaTuro App v{update.version} is ready</p>
        {update.notes && <p className="whitespace-pre-wrap text-sm text-gray-700">{update.notes}</p>}
        <p className="text-xs text-gray-500">{update.size ? `${mb(update.size)} · ` : ''}Your class lists, kept files and PIN stay. Android will ask you to confirm the update.</p>
        {state.progress && <div className="h-2 overflow-hidden rounded-full bg-gray-100"><div className="h-full bg-emerald-600" style={{ width: `${Math.min(100, Math.round((state.progress.received / (state.progress.total || update.size || 1)) * 100))}%` }} /></div>}
        {state.note && <p className="text-sm text-amber-800">{state.note}</p>}
        <div className="flex gap-2">
          <button type="button" disabled={state.busy} onClick={onClose} className="flex-1 rounded-xl border border-gray-300 py-3 font-semibold disabled:opacity-50">Later</button>
          <button type="button" disabled={state.busy} onClick={onUpdate} className="flex-[2] flex items-center justify-center gap-2 rounded-xl bg-emerald-700 py-3 font-bold text-white disabled:opacity-60">{state.busy ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />} Update now</button>
        </div>
      </div>
    </div>
  );
}
