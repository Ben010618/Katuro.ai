/**
 * Upload a file to Firebase Storage under teachers/{uid}/uploads/.
 * onProgress(pct) is called with 0-100 as the upload proceeds.
 * Returns { storagePath, downloadURL }.
 */
export async function uploadFile(uid, file, onProgress) {
  const { getStorage, ref, uploadBytesResumable, getDownloadURL } = await import("firebase/storage");
  const app = (await import("../firebase")).default;
  const storage = getStorage(app);

  const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const storagePath = `teachers/${uid}/uploads/${safeName}`;
  const storageRef = ref(storage, storagePath);
  const task = uploadBytesResumable(storageRef, file);

  return new Promise((resolve, reject) => {
    task.on(
      "state_changed",
      (snap) => {
        const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
        onProgress?.(pct);
      },
      reject,
      async () => {
        const downloadURL = await getDownloadURL(task.snapshot.ref);
        resolve({ storagePath, downloadURL });
      }
    );
  });
}

export async function deleteFile(storagePath) {
  const { getStorage, ref, deleteObject } = await import("firebase/storage");
  const app = (await import("../firebase")).default;
  const storage = getStorage(app);
  const storageRef = ref(storage, storagePath);
  await deleteObject(storageRef);
}
