import { useState, useCallback } from 'react';
import { doc, collection } from 'firebase/firestore';
import { db } from '../../../firebase';
import { createPost, deletePost } from '../services/sharesService';
import { uploadPostPhotos } from '../services/storageService';

/**
 * Create and delete posts.
 * @param {string} uid
 */
export function usePost(uid) {
  const [uploading, setUploading] = useState(false);
  const [progress,  setProgress]  = useState({ uploaded: 0, total: 0 });
  const [error,     setError]     = useState(null);

  const publish = useCallback(async ({ files, title, caption, school, gradeLevel, subject }) => {
    if (!files.length || uploading) return null;
    setUploading(true);
    setError(null);
    setProgress({ uploaded: 0, total: files.length });
    try {
      // Pre-generate a postId so Storage paths align with the Firestore doc
      const postId = doc(collection(db, 'shares_posts')).id;
      const photoUrls = await uploadPostPhotos(uid, postId, files, (uploaded, total) => {
        setProgress({ uploaded, total });
      });
      await createPost(uid, { photoUrls, title, caption, school, gradeLevel, subject });
      return postId;
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setUploading(false);
      setProgress({ uploaded: 0, total: 0 });
    }
  }, [uid, uploading]);

  const remove = useCallback(async (postId) => {
    try {
      await deletePost(postId, uid);
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    }
  }, [uid]);

  return { uploading, progress, error, publish, remove };
}
