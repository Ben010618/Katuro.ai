import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import app from '../../../firebase';
import imageCompression from 'browser-image-compression';

const storage = getStorage(app);

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const COMPRESSION_OPTIONS = {
  maxSizeMB: 1,
  maxWidthOrHeight: 1920,
  useWebWorker: true,
  fileType: 'image/jpeg',
};

/**
 * Validate that a file is an allowed image type.
 * @returns {string|null} error message or null if valid
 */
export function validateImageFile(file) {
  if (!ALLOWED_TYPES.has(file.type)) {
    return `"${file.name}" is not a supported image. Please use JPEG, PNG, or WebP.`;
  }
  if (file.size > 15 * 1024 * 1024) {
    return `"${file.name}" is too large (max 15 MB before compression).`;
  }
  return null;
}

/**
 * Compress and upload a single post photo.
 * @param {string} uid — uploader's Firebase uid
 * @param {string} postId — Firestore post document id
 * @param {File}   file — raw image file from input
 * @param {number} index — photo index within the post (0-based)
 * @returns {Promise<string>} Firebase Storage download URL
 */
export async function uploadPostPhoto(uid, postId, file, index) {
  const compressed = await imageCompression(file, COMPRESSION_OPTIONS);
  const path = `shares/${uid}/${postId}/${index}.jpg`;
  const storageRef = ref(storage, path);
  const snap = await uploadBytes(storageRef, compressed, { contentType: 'image/jpeg' });
  return getDownloadURL(snap.ref);
}

/**
 * Upload all photos for a post, returning array of download URLs.
 * @param {string}   uid
 * @param {string}   postId
 * @param {File[]}   files — max 4 files
 * @param {Function} onProgress — called with (uploaded, total) after each file
 */
export async function uploadPostPhotos(uid, postId, files, onProgress) {
  const urls = [];
  for (let i = 0; i < files.length; i++) {
    const url = await uploadPostPhoto(uid, postId, files[i], i);
    urls.push(url);
    if (onProgress) onProgress(i + 1, files.length);
  }
  return urls;
}

/**
 * Delete all photos for a post from Firebase Storage.
 * Silently ignores missing files.
 */
export async function deletePostPhotos(uid, postId, count) {
  const deletions = [];
  for (let i = 0; i < count; i++) {
    const path = `shares/${uid}/${postId}/${i}.jpg`;
    deletions.push(deleteObject(ref(storage, path)).catch(() => {}));
  }
  await Promise.all(deletions);
}

/**
 * Create a local preview URL for a File object.
 * Caller is responsible for revoking via URL.revokeObjectURL.
 */
export function createPreviewUrl(file) {
  return URL.createObjectURL(file);
}
