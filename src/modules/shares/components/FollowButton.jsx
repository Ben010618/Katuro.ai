import PropTypes from 'prop-types';
import { useFollow } from '../hooks/useFollow';

export function FollowButton({ myUid, targetUid, myName }) {
  const { following, loading, working, toggle } = useFollow(myUid, targetUid, myName);

  if (!myUid || !targetUid || myUid === targetUid) return null;
  if (loading) return (
    <div style={{ width: 80, height: 33, borderRadius: 20, background: '#e8e5ff', flexShrink: 0 }} />
  );

  return (
    <button
      className={`sh-follow-btn ${following ? 'sh-follow-btn--following' : 'sh-follow-btn--follow'}`}
      onClick={toggle}
      disabled={working}
      type="button"
    >
      {following ? 'Following' : 'Follow'}
    </button>
  );
}

FollowButton.propTypes = {
  myUid:    PropTypes.string.isRequired,
  targetUid: PropTypes.string.isRequired,
  myName:   PropTypes.string,
};
