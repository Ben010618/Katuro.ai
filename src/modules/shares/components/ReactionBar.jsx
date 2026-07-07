import { useState } from 'react';
import PropTypes from 'prop-types';
import { useReactions } from '../hooks/useReactions';
import { ReactorsModal } from './ReactorsModal';

const REACTIONS = [
  { type: 'love',    emoji: '❤️', label: 'Love' },
  { type: 'clap',    emoji: '👏', label: 'Clap' },
  { type: 'star',    emoji: '⭐', label: 'Star' },
  { type: 'insight', emoji: '💡', label: 'Insight' },
];

export function ReactionBar({ postId, uid, initialReactions, postAuthorUid }) {
  const { reactions, myReaction, toggle } = useReactions(postId, uid, initialReactions, postAuthorUid);
  const [showReactors, setShowReactors] = useState(false);

  const total = REACTIONS.reduce((sum, { type }) => sum + (reactions[type] || 0), 0);
  const usedEmojis = REACTIONS.filter(({ type }) => reactions[type] > 0).map(({ emoji }) => emoji);

  return (
    <>
      {total > 0 && (
        <button className="sh-reactors-summary" onClick={() => setShowReactors(true)} type="button">
          <span className="sh-reactors-summary-emojis">{usedEmojis.join('')}</span>
          {total} {total === 1 ? 'reaction' : 'reactions'}
        </button>
      )}

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

      {showReactors && <ReactorsModal postId={postId} onClose={() => setShowReactors(false)} />}
    </>
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
