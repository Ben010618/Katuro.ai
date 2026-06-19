const CLOUD_NAME    = 'dr5fsrpu0';
const UPLOAD_PRESET = 'katuro_students';
const UPLOAD_URL    = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

// Shrink image to max 600×600 and re-encode as JPEG before upload.
// Reduces a typical 5 MB phone photo to ~60–100 KB.
function compressImage(file, maxSize = 600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale  = Math.min(1, maxSize / Math.max(img.width, img.height));
      const w      = Math.round(img.width  * scale);
      const h      = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width  = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Canvas compression failed')), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
    img.src = url;
  });
}

export async function uploadToCloudinary(file) {
  const compressed = await compressImage(file);

  const form = new FormData();
  form.append('file', compressed, 'photo.jpg');
  form.append('upload_preset', UPLOAD_PRESET);
  form.append('folder', 'katuro/students');

  const res  = await fetch(UPLOAD_URL, { method: 'POST', body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || 'Upload rejected by Cloudinary');
  return data.secure_url;
}

// Injects Cloudinary face-fill transformation for thumbnails
export function thumbUrl(url, size = 80) {
  if (!url) return '';
  return url.replace('/upload/', `/upload/c_fill,w_${size},h_${size},g_face/`);
}
