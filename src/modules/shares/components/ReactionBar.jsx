import PropTypes from 'prop-types';
import { useReactions } from '../hooks/useReactions';

const REACTIONS = [
  { type: 'love',    emoji: '❤️', label: 'Love' },
  { type: 'clap',    emoji: '👏', label: 'Clap' },
  { type: 'star',    emoji: '⭐', label: 'Star' },
  { type: 'insight', emoji: '💡', label: 'Insight' },
];

export function ReactionBar({ postId, uid, initialReactions, postAuthorUid }) {
  const { reactions, myReaction, toggle } = useReactions(postId, uid, initialReactions, postAuthorUid);

  return (
    <div className="sh-reactions">
      {REACTIONS.map(({ type, emoji, label }) => {
        const count  = reactions[type] || 0;
        const active = myReaction === type;
        return (
          <button
            key={type}
            className={`sh-reaction-btn sh-reaction-btn--${type} ${active ? 'active' : ''}`}
            onClick={() => toggle(type)}
            title={label}
            type="button"
            aria-pressed={active}
            aria-label={`${label}: ${count}`}
          >
            <span className="sh-reaction-emoji">{emoji}</span>
            {count > 0 && <span className="sh-reaction-count">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}

ReactionBar.propTypes = {
  postId:          PropTypes.string.isRequired,
  uid:             PropTypes.string.isRequired,
  initialReactions: PropTypes.shape({
    love:    PropTypes.number,
    clap:    PropTypes.number,
    star:    PropTypes.number,
    insight: PropTypes.number,
  }),
  postAuthorUid: PropTypes.string,
};

ReactionBar.defaultProps = { initialReactions: {}, postAuthorUid: '' };
