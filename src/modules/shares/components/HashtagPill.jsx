import PropTypes from 'prop-types';
import { Hash } from 'lucide-react';

export function HashtagPill({ tag, onClick }) {
  return (
    <button
      className="sh-hashtag-pill"
      onClick={() => onClick?.(tag)}
      type="button"
    >
      <Hash size={11} />
      {tag}
    </button>
  );
}

HashtagPill.propTypes = {
  tag:     PropTypes.string.isRequired,
  onClick: PropTypes.func,
};
