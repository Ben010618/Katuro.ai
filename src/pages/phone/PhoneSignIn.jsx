import { useRef, useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { auth } from '../../firebase';
import { SIGNUP_URL } from '../../services/emailCode';
import { authErrorText } from '../../utils/authError';
import { KT_LOGO } from './phoneLogo';
import { markJustSignedIn, clearJustSignedIn } from '../../services/link/phoneIntro';
import './phone.css';

/**
 * The KaTuro App's sign-in: the same KaTuro account as the website and KaTuroDesk, on one quiet
 * screen. The logo is the centre; tapping it goes to the email field. New accounts are made on
 * the website (it emails a code to confirm the address), like KaTuroDesk.
 */
export default function PhoneSignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const emailRef = useRef(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      markJustSignedIn();
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      clearJustSignedIn();
      setError(authErrorText(err, 'Could not sign in. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="kt-phone flex flex-col items-center px-8" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <button type="button" onClick={() => emailRef.current?.focus()} aria-label="KaTuro" className="kt-logo-btn mt-[10vh]">
        <img src={KT_LOGO} alt="" className="kt-logo h-[216px] w-[216px]" />
      </button>

      <form onSubmit={submit} className="mt-6 w-full max-w-sm space-y-5">
        <input
          ref={emailRef}
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-2xl px-5 py-4 text-base outline-none"
        />
        <div className="relative">
          <input
            type={show ? 'text' : 'password'}
            autoComplete="current-password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-2xl px-5 py-4 pr-14 text-base outline-none"
          />
          <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'} className="nm-muted absolute right-3 top-1/2 -translate-y-1/2 p-2">
            {show ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        </div>
        {error && <p className="text-center text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={busy || !email.trim() || !password} className="nm-accent nm-press flex w-full items-center justify-center rounded-2xl py-4 text-base font-semibold disabled:opacity-50">
          {busy ? <Loader2 size={22} className="animate-spin" /> : 'Sign in'}
        </button>
      </form>

      <a href={SIGNUP_URL} className="nm-muted mt-auto mb-8 pt-10 text-sm">New here? <span className="nm-green font-semibold">Create an account</span></a>
    </div>
  );
}
