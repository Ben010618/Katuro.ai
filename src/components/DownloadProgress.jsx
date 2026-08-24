import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';

/**
 * Progress overlay shown while a document is being built and downloaded.
 *
 * Drive it from the `downloading` / `exporting` boolean the page already has:
 *
 *   <DownloadProgress active={downloading} label="Daily Lesson Log" />
 *
 * When `active` goes false the bar completes to 100%, holds briefly so the
 * finish actually registers, then fades out — a bar that vanishes mid-travel
 * reads as a failure even when the file downloaded fine.
 *
 * NOTE ON THE ANIMATION: assembling a DOCX is synchronous CPU work that blocks
 * the main thread, so setState-driven progress would sit frozen for the whole
 * export. The bar and the phase captions are therefore animated purely by CSS
 * transform/opacity (see .kt-progress-* in index.css), which the browser runs
 * on the compositor thread and keeps moving regardless. Nothing here ticks on
 * a timer while the work is in flight.
 */

const DEFAULT_PHASES = [
  'Preparing your document…',
  'Laying out tables and formatting…',
  'Applying DepEd page setup…',
  'Packaging the file…',
  'Almost ready…',
];

const HOLD_AFTER_DONE_MS = 900;

export default function DownloadProgress({
  active,
  label = 'your file',
  phases = DEFAULT_PHASES,
}) {
  // 'hidden' -> 'working' -> 'done' -> 'hidden'
  const [phase, setPhase] = useState('hidden');
  // Bumping this remounts the bar so its CSS animation restarts from zero
  // instead of resuming wherever the previous download left off.
  const [runId, setRunId] = useState(0);

  // Derived during render rather than in an effect: reacting to an `active`
  // flip is a state adjustment, not a side effect, and doing it here avoids the
  // extra render pass an effect would cost on every single download.
  const [prevActive, setPrevActive] = useState(active);
  if (prevActive !== active) {
    setPrevActive(active);
    if (active) {
      setRunId(r => r + 1);
      setPhase('working');
    } else if (phase === 'working') {
      // The work finished — complete the bar rather than yanking it away
      // mid-travel, which reads as a failure even on a successful download.
      setPhase('done');
    }
  }

  useEffect(() => {
    if (phase !== 'done') return undefined;
    const t = setTimeout(() => setPhase('hidden'), HOLD_AFTER_DONE_MS);
    return () => clearTimeout(t);
  }, [phase]);

  const done = phase === 'done';

  if (phase === 'hidden') return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        background: 'rgba(13, 34, 24, 0.42)',
        backdropFilter: 'blur(2px)',
      }}
    >
      <div
        className="animate-fade-up"
        style={{
          width: '100%',
          maxWidth: 380,
          background: '#fff',
          border: '1px solid rgba(45,106,79,0.12)',
          borderRadius: 14,
          padding: '22px 24px',
          boxShadow: '0 18px 40px rgba(13,34,24,0.18)',
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '1.2px',
            color: 'var(--kt-text-secondary)',
          }}
        >
          {done ? 'Download ready' : 'Preparing download'}
        </p>

        <h3
          style={{
            margin: '6px 0 16px',
            fontSize: 17,
            fontWeight: 600,
            color: 'var(--kt-text-primary)',
            lineHeight: 1.35,
          }}
        >
          {label}
        </h3>

        <div className="kt-progress-track">
          <div
            key={runId}
            className="kt-progress-fill"
            data-done={done ? 'true' : 'false'}
          />
          {!done && <div className="kt-progress-sheen" />}
        </div>

        {/* Stacked in one grid cell so the captions cross-fade in place
            without the card changing height. */}
        <div
          style={{
            display: 'grid',
            marginTop: 12,
            minHeight: 18,
            fontSize: 13,
            color: 'var(--kt-text-secondary)',
          }}
        >
          {done ? (
            <span style={{ gridArea: '1 / 1', color: 'var(--kt-green-primary)', fontWeight: 600 }}>
              Saved to your downloads.
            </span>
          ) : (
            phases.map((text, i) => (
              <span
                key={text}
                className="kt-phase"
                style={{ animationDelay: `${i * 4.5}s` }}
              >
                {text}
              </span>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

DownloadProgress.propTypes = {
  active: PropTypes.bool,
  label:  PropTypes.string,
  phases: PropTypes.arrayOf(PropTypes.string),
};
