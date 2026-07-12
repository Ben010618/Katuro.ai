import PropTypes from 'prop-types';

/** Skeuomorphic 3D on/off switch — used for the ambient auto-scroll control. */
export function AutoScrollToggle({ checked, onChange, label = 'Auto-scroll' }) {
  return (
    <button
      type="button"
      className={`sh-3d-toggle-wrap ${checked ? 'on' : ''}`}
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
      aria-label={`${label}: ${checked ? 'on' : 'off'}`}
      title={`${label} ${checked ? 'on' : 'off'}`}
    >
      <span className="sh-3d-toggle-label">{label}</span>
      <span className="sh-3d-toggle-track">
        <span className="sh-3d-toggle-knob" />
      </span>
    </button>
  );
}

AutoScrollToggle.propTypes = {
  checked:  PropTypes.bool.isRequired,
  onChange: PropTypes.func.isRequired,
  label:    PropTypes.string,
};
