import { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { useParams } from 'react-router-dom';
import { Pencil, Check, X, Camera } from 'lucide-react';
import { useFeed }       from './hooks/useFeed';
import { FollowButton }  from './components/FollowButton';
import { PostCard }      from './components/PostCard';
import { SkeletonCard }  from './components/SkeletonCard';
import {
  getSharesProfile, updateSharesProfile, setCoverPhoto, avatarColor,
} from './services/sharesService';
import { uploadCoverPhoto, validateImageFile } from './services/storageService';

const BIO_MAX = 160;

export default function SharesProfile({ myUid, myDisplayName, myInitials }) {
  const { uid: paramUid } = useParams();
  const profileUid = paramUid || myUid;
  const isMe = profileUid === myUid;

  const [profile,        setProfile]        = useState(null);
  const [loading,        setLoading]        = useState(true);
  const [editing,        setEditing]        = useState(false);
  const [editBio,        setEditBio]        = useState('');
  const [coverUploading, setCoverUploading] = useState(false);
  const [coverError,     setCoverError]     = useState('');

  const coverInputRef = useRef(null);

  const { posts, loading: postsLoading, hasMore, loadMore, load, removePost } = useFeed('user', myUid, profileUid);

  useEffect(() => {
    setLoading(true);
    getSharesProfile(profileUid)
      .then(p => { setProfile(p); setEditBio(p?.bio || ''); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [profileUid]);

  // Trigger post load whenever the profile being viewed changes
  useEffect(() => {
    load();
  }, [profileUid]);

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

  async function handleCoverUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const err = validateImageFile(file);
    if (err) { setCoverError(err); return; }
    setCoverError('');
    setCoverUploading(true);
    try {
      const url = await uploadCoverPhoto(profileUid, file);
      await setCoverPhoto(profileUid, url);
      setProfile(prev => ({ ...prev, coverPhotoURL: url }));
    } catch {
      setCoverError('Cover upload failed. Please try again.');
    } finally {
      setCoverUploading(false);
      e.target.value = '';
    }
  }

  const bg = avatarColor(profileUid);

  if (loading) return (
    <div>
      <div className="sh-skeleton" style={{ height: 180, borderRadius: 0 }} />
      <div style={{ padding: '0 20px 20px' }}>
        <div className="sh-skeleton sh-skeleton-avatar sh-avatar sh-avatar--xl" style={{ marginTop: -48, marginBottom: 14, border: '4px solid #fff' }} />
        <div className="sh-skeleton" style={{ height: 22, width: '35%', marginBottom: 8 }} />
        <div className="sh-skeleton" style={{ height: 14, width: '55%' }} />
      </div>
    </div>
  );

  if (!profile) return (
    <div className="sh-empty" style={{ padding: '48px 16px' }}>
      <div className="sh-empty-title">Profile not found</div>
    </div>
  );

  return (
    <div>
      {/* ── Profile header card ──────────────────────────────────── */}
      <div className="sh-profile-header">

        {/* Banner / cover photo */}
        <div
          className="sh-profile-banner"
          style={profile.coverPhotoURL ? {
            backgroundImage: `url(${profile.coverPhotoURL})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          } : {}}
        >
          {isMe && (
            <>
              <button
                className="sh-cover-btn"
                onClick={() => coverInputRef.current?.click()}
                disabled={coverUploading}
                type="button"
              >
                <Camera size={13} />
                {coverUploading ? 'Uploading…' : profile.coverPhotoURL ? 'Change cover' : 'Add cover photo'}
              </button>
              <input
                ref={coverInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                style={{ display: 'none' }}
                onChange={handleCoverUpload}
              />
            </>
          )}
        </div>
        {coverError && (
          <div style={{ padding: '6px 20px', fontSize: 12, color: 'var(--sh-red)', background: '#fff5f5' }}>
            {coverError}
          </div>
        )}

        {/* Profile info area */}
        <div className="sh-profile-info">
          <div className="sh-profile-avatar-wrap">
            {/* Profile photo */}
            <div
              className="sh-avatar sh-avatar--xl"
              style={{ background: bg, color: '#fff', border: '4px solid #fff', boxShadow: '0 2px 12px rgba(0,0,0,0.12)' }}
            >
              {profile.photoURL
                ? <img src={profile.photoURL} alt={profile.displayName} />
                : profile.initials || 'T'}
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {isMe && (
                editing
                  ? <>
                      <button
                        className="sh-follow-btn sh-follow-btn--follow"
                        style={{ padding: '7px 14px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}
                        onClick={saveEdit}
                        type="button"
                      >
                        <Check size={13} /> Save
                      </button>
                      <button
                        className="sh-follow-btn sh-follow-btn--following"
                        style={{ padding: '7px 14px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}
                        onClick={() => setEditing(false)}
                        type="button"
                      >
                        <X size={13} /> Cancel
                      </button>
                    </>
                  : <button
                      className="sh-follow-btn sh-follow-btn--following"
                      style={{ display: 'flex', alignItems: 'center', gap: 5 }}
                      onClick={() => setEditing(true)}
                      type="button"
                    >
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

          {editing ? (
            <div style={{ marginBottom: 14 }}>
              <textarea
                className="sh-comment-input"
                style={{ borderRadius: 10, minHeight: 72, padding: '8px 12px' }}
                value={editBio}
                onChange={e => setEditBio(e.target.value.slice(0, BIO_MAX))}
                rows={3}
                placeholder="Write a short bio about yourself…"
                autoFocus
              />
              <div style={{ fontSize: 11, color: 'var(--sh-text-muted)', textAlign: 'right', marginTop: 3 }}>
                {BIO_MAX - editBio.length} chars left
              </div>
            </div>
          ) : (
            profile.bio && <p className="sh-profile-bio">{profile.bio}</p>
          )}

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

      {/* ── Posts ────────────────────────────────────────────────── */}
      {postsLoading ? (
        [...Array(3)].map((_, i) => <SkeletonCard key={i} />)
      ) : posts.length === 0 ? (
        <div className="sh-empty" style={{ marginTop: 24 }}>
          <div className="sh-empty-icon" style={{ fontSize: 40 }}>🖼️</div>
          <div className="sh-empty-title">No posts yet</div>
          {isMe && (
            <p className="sh-empty-text">Share your first classroom moment with the community!</p>
          )}
        </div>
      ) : (
        <>
          {posts.map(post => (
            <PostCard
              key={post.id}
              post={post}
              uid={myUid}
              displayName={myDisplayName}
              initials={myInitials}
              onDelete={async (id) => { removePost(id); }}
            />
          ))}
          {hasMore && (
            <button className="sh-load-more-btn" onClick={loadMore} type="button">
              Load more posts
            </button>
          )}
        </>
      )}
    </div>
  );
}

SharesProfile.propTypes = {
  myUid:         PropTypes.string.isRequired,
  myDisplayName: PropTypes.string.isRequired,
  myInitials:    PropTypes.string.isRequired,
};
