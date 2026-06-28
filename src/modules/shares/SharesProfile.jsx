import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useParams } from 'react-router-dom';
import { Pencil, Check, X } from 'lucide-react';
import { useFeed }       from './hooks/useFeed';
import { FollowButton }  from './components/FollowButton';
import { PostCard }      from './components/PostCard';
import { PhotoLightbox } from './components/PhotoLightbox';
import { SkeletonCard }  from './components/SkeletonCard';
import {
  getSharesProfile, updateSharesProfile, avatarColor,
} from './services/sharesService';

const BIO_MAX = 160;

export default function SharesProfile({ myUid, myDisplayName, myInitials }) {
  const { uid: paramUid } = useParams();
  const profileUid = paramUid || myUid;
  const isMe = profileUid === myUid;

  const [profile,    setProfile]    = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [editing,    setEditing]    = useState(false);
  const [editBio,    setEditBio]    = useState('');
  const [lightboxPost, setLightboxPost] = useState(null);

  const { posts, loading: postsLoading, hasMore, loadMore, removePost } = useFeed('user', myUid, profileUid);

  useEffect(() => {
    setLoading(true);
    getSharesProfile(profileUid)
      .then(p => { setProfile(p); setEditBio(p?.bio || ''); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [profileUid]);

  // load posts on mount (via the hook's load function not returned — trigger via effect)
  const [triggerLoad, setTriggerLoad] = useState(0);

  async function saveEdit() {
    if (!profile) return;
    await updateSharesProfile(profileUid, {
      displayName: profile.displayName,
      school:      profile.school,
      gradeLevel:  profile.gradeLevel,
      subject:     profile.subject,
      bio:         editBio,
    });
    setProfile(prev => ({ ...prev, bio: editBio }));
    setEditing(false);
  }

  const bg = avatarColor(profileUid);

  if (loading) return (
    <div style={{ padding: '0 16px' }}>
      <div className="sh-skeleton" style={{ height: 120, borderRadius: '16px 16px 0 0', marginBottom: 0 }} />
      <div style={{ padding: 20 }}>
        <div className="sh-skeleton sh-skeleton-avatar sh-avatar sh-avatar--xl" style={{ marginTop: -44, marginBottom: 12 }} />
        <div className="sh-skeleton" style={{ height: 22, width: '40%', marginBottom: 8 }} />
        <div className="sh-skeleton" style={{ height: 14, width: '60%' }} />
      </div>
    </div>
  );

  if (!profile) return (
    <div className="sh-empty" style={{ padding: '48px 16px' }}>
      <div className="sh-empty-title">Profile not found</div>
    </div>
  );

  return (
    <div style={{ padding: '0 16px' }}>
      <div className="sh-profile-header">
        <div className="sh-profile-banner" />
        <div className="sh-profile-info">
          <div className="sh-profile-avatar-wrap">
            <div className="sh-avatar sh-avatar--xl" style={{ background: bg, color: '#fff', border: '4px solid #fff' }}>
              {profile.initials || 'T'}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {isMe && (
                editing
                  ? <>
                      <button className="sh-follow-btn sh-follow-btn--follow" style={{ padding: '7px 14px', fontSize: 12 }} onClick={saveEdit} type="button">
                        <Check size={13} style={{ marginRight: 4 }} /> Save
                      </button>
                      <button className="sh-follow-btn sh-follow-btn--following" style={{ padding: '7px 14px', fontSize: 12 }} onClick={() => setEditing(false)} type="button">
                        <X size={13} style={{ marginRight: 4 }} /> Cancel
                      </button>
                    </>
                  : <button className="sh-follow-btn sh-follow-btn--following" style={{ display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => setEditing(true)} type="button">
                      <Pencil size={13} /> Edit profile
                    </button>
              )}
              {!isMe && (
                <FollowButton myUid={myUid} targetUid={profileUid} myName={myDisplayName} />
              )}
            </div>
          </div>

          <h1 className="sh-profile-name">{profile.displayName}</h1>
          <p className="sh-profile-meta">
            {[profile.school, profile.gradeLevel, profile.subject].filter(Boolean).join(' · ')}
          </p>

          {editing
            ? (
              <div style={{ marginBottom: 14 }}>
                <textarea
                  style={{ width: '100%', border: '1.5px solid #534AB7', borderRadius: 10, padding: '8px 12px', fontSize: 14, fontFamily: 'inherit', resize: 'none' }}
                  value={editBio}
                  onChange={e => setEditBio(e.target.value.slice(0, BIO_MAX))}
                  rows={3}
                  placeholder="Write a short bio about yourself…"
                  autoFocus
                />
                <div style={{ fontSize: 11, color: 'var(--sh-text-muted)', textAlign: 'right' }}>
                  {BIO_MAX - editBio.length} chars left
                </div>
              </div>
            )
            : profile.bio && <p className="sh-profile-bio">{profile.bio}</p>
          }

          <div className="sh-profile-stats">
            <div className="sh-stat">
              <div className="sh-stat-value">{profile.postCount || 0}</div>
              <div className="sh-stat-label">Posts</div>
            </div>
            <div className="sh-stat">
              <div className="sh-stat-value">{profile.followerCount || 0}</div>
              <div className="sh-stat-label">Followers</div>
            </div>
            <div className="sh-stat">
              <div className="sh-stat-value">{profile.followingCount || 0}</div>
              <div className="sh-stat-label">Following</div>
            </div>
          </div>
        </div>
      </div>

      {/* Post grid */}
      {postsLoading ? (
        [...Array(3)].map((_, i) => <SkeletonCard key={i} />)
      ) : posts.length === 0 ? (
        <div className="sh-empty">
          <div className="sh-empty-icon" style={{ fontSize: 40 }}>🖼️</div>
          <div className="sh-empty-title">No posts yet</div>
        </div>
      ) : (
        <>
          <div className="sh-post-grid" style={{ borderRadius: 12, overflow: 'hidden', marginBottom: 16 }}>
            {posts.filter(p => p.photoUrls?.[0]).map(post => (
              <div key={post.id} className="sh-post-thumb" onClick={() => setLightboxPost(post)}>
                <img src={post.photoUrls[0]} alt="Post" className="sh-post-thumb-img" loading="lazy" />
                <div className="sh-post-thumb-overlay">
                  ❤️ {(post.reactions?.love || 0) + (post.reactions?.clap || 0)} · 💬 {post.commentCount || 0}
                </div>
              </div>
            ))}
          </div>

          {hasMore && (
            <button className="sh-load-more-btn" onClick={loadMore} type="button">
              Load more
            </button>
          )}
        </>
      )}

      {lightboxPost && (
        <PhotoLightbox
          urls={lightboxPost.photoUrls}
          caption={lightboxPost.caption}
          onClose={() => setLightboxPost(null)}
        />
      )}
    </div>
  );
}

SharesProfile.propTypes = {
  myUid:        PropTypes.string.isRequired,
  myDisplayName: PropTypes.string.isRequired,
  myInitials:   PropTypes.string.isRequired,
};
