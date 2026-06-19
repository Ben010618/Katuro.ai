const CLOUD_NAME    = 'dr5fsrpu0';
const UPLOAD_PRESET = 'katuro_students';
const UPLOAD_URL    = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;

export async function uploadToCloudinary(file) {
  const form = new FormData();
  form.append('file', file);
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
