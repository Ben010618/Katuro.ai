import { useEffect, useState } from 'react';
import { KT_LOGO } from './phoneLogo';

const INTRO_MS = 10000;
const STEPS = [
  'Signing you in…',
  'Waking up your assistant…',
  'Getting your classes ready…',
  'Looking for KaTuroDesk on this Wi-Fi…',
  'Setting up your schedule and alerts…',
  'Almost there…',
];

/**
 * The welcome after signing in: the KaTuro logo glowing in a ring that fills in 10 seconds,
 * dots circling it, and what is being prepared. Tap Skip to go straight in. Phones set to
 * reduce motion get the same screen without the moving parts.
 */
export default function PhoneIntro({ name, onDone }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const every = INTRO_MS / STEPS.length;
    const tick = setInterval(() => setStep((s) => Math.min(STEPS.length - 1, s + 1)), every);
    const done = setTimeout(onDone, INTRO_MS);
    return () => { clearInterval(tick); clearTimeout(done); };
  }, [onDone]);

  return (
    <div className="kt-intro fixed inset-0 z-[80] flex flex-col items-center justify-center">
      <div className="kt-intro-aurora" aria-hidden="true" />
      <div className="relative grid h-72 w-72 place-items-center" aria-hidden="true">
        <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 120 120">
          <defs>
            <linearGradient id="kt-intro-grad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#34d399" />
              <stop offset="55%" stopColor="#1d6b48" />
              <stop offset="100%" stopColor="#f2b705" />
            </linearGradient>
          </defs>
          <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(29,107,72,0.12)" strokeWidth="3" />
          <circle className="kt-intro-ring" cx="60" cy="60" r="54" fill="none" stroke="url(#kt-intro-grad)" strokeWidth="3.5" strokeLinecap="round" pathLength="100" style={{ animationDuration: `${INTRO_MS}ms` }} />
        </svg>
        <div className="kt-intro-orbit absolute inset-3"><span /><span /><span /></div>
        <div className="kt-intro-pulse absolute inset-12 rounded-full" />
        <img src={KT_LOGO} alt="" className="kt-intro-logo relative h-36 w-36" />
      </div>
      <p className="kt-intro-hello mt-8 text-2xl font-semibold">{name ? `Welcome, ${name}` : 'Welcome'}</p>
      <p className="nm-muted mt-2 h-5 text-sm" role="status" aria-live="polite"><span key={step} className="kt-intro-step inline-block">{STEPS[step]}</span></p>
      <button type="button" onClick={onDone} className="nm-muted absolute bottom-10 text-xs font-medium underline-offset-4 hover:underline" style={{ marginBottom: 'env(safe-area-inset-bottom)' }}>Skip</button>
    </div>
  );
}
