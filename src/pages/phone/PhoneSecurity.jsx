import { useState } from 'react';
import { Delete, Download, KeyRound, Loader2, LogOut, RefreshCw, Unlink, UserX } from 'lucide-react';
import { checkPin, setPin, validPin } from '../../services/link/appLock';
import { KT_LOGO } from './phoneLogo';

/**
 * The PIN screen. mode 'set': choose a PIN (typed twice); 'unlock': type it.
 * onDone() when set / unlocked; onForgot() signs out (clears the teacher's data from the phone);
 * onLockedOut() does the same without asking, after too many wrong PINs;
 * onCancel() (changing an existing PIN only) keeps the old one.
 */
export function LockScreen({ mode, onDone, onForgot, onLockedOut, onCancel }) {
  const [pin, setPinText] = useState('');
  const [first, setFirst] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const setting = mode === 'set';
  const title = setting ? (first ? 'Once more' : 'Choose a PIN') : 'Enter your PIN';

  const submit = async (value) => {
    setBusy(true);
    try {
      if (setting) {
        if (!first) { setFirst(value); setPinText(''); setNote(''); return; }
        if (value !== first) { setFirst(''); setPinText(''); setNote('They did not match. Again.'); return; }
        await setPin(value);
        onDone();
        return;
      }
      const r = await checkPin(value);
      if (r.ok) { onDone(); return; }
      if (r.wipe) {
        // 50 wrong PINs: the class lists leave this phone (KaTuroDesk still has everything).
        setNote('Too many wrong PINs. Signing out and clearing KaTuro from this phone…');
        await onLockedOut();
        return;
      }
      setPinText('');
      setNote(r.waitMs ? `Wait ${Math.ceil(r.waitMs / 1000)} seconds.` : `Wrong PIN · ${r.left} more before a wait`);
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
    <div className="kt-phone fixed inset-0 z-[60] flex flex-col items-center justify-center px-6" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <img src={KT_LOGO} alt="" className="kt-logo mb-2 h-32 w-32" />
      <p className="text-lg font-semibold">{title}</p>
      <div className="my-6 flex gap-3" aria-label={`${pin.length} digits typed`}>
        {[0, 1, 2, 3, 4, 5].map((i) => <span key={i} className={`h-3.5 w-3.5 rounded-full ${i < pin.length ? 'nm-accent' : 'nm-in'}`} />)}
      </div>
      <p className="min-h-[20px] text-center text-sm text-amber-700">{note}</p>
      <div className="mt-4 grid grid-cols-3 gap-5">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} type="button" onClick={() => press(d)} className="nm-sm nm-press h-[72px] w-[72px] rounded-full text-2xl font-medium">{d}</button>
        ))}
        <button type="button" aria-label="Erase" onClick={() => setPinText(pin.slice(0, -1))} className="nm-muted nm-press grid h-[72px] w-[72px] place-items-center rounded-full"><Delete size={24} /></button>
        <button type="button" onClick={() => press('0')} className="nm-sm nm-press h-[72px] w-[72px] rounded-full text-2xl font-medium">0</button>
        <button type="button" disabled={!validPin(pin) || busy} onClick={() => submit(pin)} className="nm-accent nm-press grid h-[72px] w-[72px] place-items-center rounded-full text-sm font-semibold disabled:opacity-30">{busy ? <Loader2 size={20} className="animate-spin" /> : 'OK'}</button>
      </div>
      {setting && !first && <p className="nm-muted mt-6 text-xs">4 to 6 numbers</p>}
      {!setting && <button type="button" onClick={onForgot} className="nm-muted mt-8 text-sm">Forgot PIN? <span className="nm-green font-semibold">Sign out</span></button>}
      {setting && onCancel && <button type="button" onClick={onCancel} className="nm-muted mt-6 text-sm">Cancel</button>}
    </div>
  );
}

/** The app menu (top right): version, updates, PIN, account. */
export function PhoneMenu({ version, linked, onClose, onCheckUpdate, onChangePin, onUnlink, onSignOut }) {
  const [deleteInfo, setDeleteInfo] = useState(false);
  const row = 'nm-press flex w-full items-center gap-4 rounded-2xl px-4 py-4 text-left text-[15px] font-medium';
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/30" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full rounded-t-2xl bg-white px-4 pt-3" style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}>
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-gray-300" />
        <button type="button" onClick={onCheckUpdate} className={row}><RefreshCw size={20} className="nm-green" /> Updates</button>
        {linked && <button type="button" onClick={onChangePin} className={row}><KeyRound size={20} className="nm-green" /> Change PIN</button>}
        {linked && <button type="button" onClick={onUnlink} className={row}><Unlink size={20} className="nm-muted" /> Unlink computer</button>}
        <button type="button" onClick={() => setDeleteInfo((v) => !v)} className={row}><UserX size={20} className="nm-muted" /> Delete account</button>
        {deleteInfo && <p className="nm-in nm-muted mx-2 mb-2 rounded-2xl p-3 text-xs">Ask your KaTuro admin. Your records stay on your computer.</p>}
        <button type="button" onClick={onSignOut} className={row}><LogOut size={20} className="text-red-600" /> Sign out</button>
        <p className="nm-muted pt-3 text-center text-[11px]">KaTuro App {version ? `v${version}` : ''}</p>
      </div>
    </div>
  );
}

/** A newer version is ready: notes, size, Update. */
export function UpdateSheet({ update, state, onUpdate, onClose }) {
  const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={state.busy ? undefined : onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full rounded-t-2xl bg-white p-5 space-y-4" style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}>
        <p className="flex items-center gap-2 text-base font-semibold"><Download size={20} className="nm-green" /> Version {update.version}</p>
        {update.notes && <p className="nm-muted whitespace-pre-wrap text-sm">{update.notes}</p>}
        <p className="nm-muted text-xs">{update.size ? `${mb(update.size)} · ` : ''}Your data stays.</p>
        {state.progress && <div className="nm-in h-2.5 overflow-hidden rounded-full"><div className="nm-accent h-full rounded-full" style={{ width: `${Math.min(100, Math.round((state.progress.received / (state.progress.total || update.size || 1)) * 100))}%` }} /></div>}
        {state.note && <p className="text-sm text-amber-800">{state.note}</p>}
        <div className="flex gap-2">
          <button type="button" disabled={state.busy} onClick={onClose} className="nm-sm nm-press flex-1 rounded-2xl py-3.5 font-medium disabled:opacity-50">Later</button>
          <button type="button" disabled={state.busy} onClick={onUpdate} className="nm-accent nm-press flex flex-[2] items-center justify-center gap-2 rounded-2xl py-3.5 font-semibold disabled:opacity-60">{state.busy ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />} Update</button>
        </div>
      </div>
    </div>
  );
}
