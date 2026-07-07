import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { X } from 'lucide-react';
import { getReactors, getSharesProfile, avatarColor, getInitials } from '../services/sharesService';

const REACTION_META = {
  love:    { emoji: '❤️', label: 'Love' },
  clap:    { emoji: '👏', label: 'Clap' },
  star:    { emoji: '⭐', label: 'Star' },
  insight: { emoji: '💡', label: 'Insight' },
};

export function ReactorsModal({ postId, onClose }) {
  const [reactors, setReactors] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState('all');

  useEffect(() => {
    let active = true;
    getReactors(postId)
      .then(async list => {
        const enriched = await Promise.all(list.map(async r => {
          const profile = await getSharesProfile(r.uid).catch(() => null);
          const displayName = profile?.displayName || 'Teacher';
          return {
            ...r,
            displayName,
            initials: profile?.initials || getInitials(displayName),
            photoURL: profile?.photoURL || null,
            school: profile?.school || '',
          };
        }));
        if (active) setReactors(enriched);
      })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [postId]);

  const counts = reactors.reduce((acc, r) => {
    acc[r.type] = (acc[r.type] || 0) + 1;
    return acc;
  }, {});
  const visibleTypes = Object.keys(REACTION_META).filter(type => counts[type] > 0);
  const filtered = filter === 'all' ? reactors : reactors.filter(r => r.type === filter);

  return (
    <div className="sh-reactors-overlay" onClick={onClose}>
      <div className="sh-reactors-modal" onClick={e => e.stopPropagation()}>
        <div className="sh-reactors-header">
          <div className="sh-reactors-tabs">
            <button
              className={`sh-reactors-tab ${filter === 'all' ? 'active' : ''}`}
              onClick={() => setFilter('all')}
              type="button"
            >
              All {reactors.length}
            </button>
            {visibleTypes.map(type => (
              <button
                key={type}
                className={`sh-reactors-tab ${filter === type ? 'active' : ''}`}
                onClick={() => setFilter(type)}
                type="button"
              >
                {REACTION_META[type].emoji} {counts[type]}
              </button>
            ))}
          </div>
          <button className="sh-reactors-close" onClick={onClose} type="button" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="sh-reactors-list">
          {loading ? (
            <div className="sh-reactors-status">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="sh-reactors-status">No reactions yet</div>
          ) : (
            filtered.map(r => (
              <div key={r.uid} className="sh-reactors-row">
                <div className="sh-avatar sh-avatar--sm" style={{ background: avatarColor(r.uid), color: '#fff' }}>
                  {r.photoURL ? <img src={r.photoURL} alt={r.displayName} /> : r.initials}
                </div>
                <div className="sh-reactors-info">
                  <span className="sh-reactors-name">{r.displayName}</span>
                  {r.school && <span className="sh-reactors-school">{r.school}</span>}
                </div>
                <span className="sh-reactors-emoji" title={REACTION_META[r.type]?.label}>
                  {REACTION_META[r.type]?.emoji}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

ReactorsModal.propTypes = {
  postId:  PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
};
