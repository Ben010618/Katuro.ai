import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Camera, X } from 'lucide-react';

/**
 * Reads a QR code from an image source (video frame or photo) → text or null. `crop` (0–1):
 * only the middle square, where the frame on screen is, at full sharpness (a code on a laptop
 * screen read from arm's length is small in the picture).
 */
function readQr(source, w, h, canvas, crop = 1) {
  if (!w || !h) return null;
  const side = Math.min(w, h) * crop;
  const sx = crop < 1 ? (w - side) / 2 : 0;
  const sy = crop < 1 ? (h - side) / 2 : 0;
  const sw = crop < 1 ? side : w;
  const sh = crop < 1 ? side : h;
  const scale = Math.min(1, 900 / Math.max(sw, sh));
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  const g = canvas.getContext('2d', { willReadFrequently: true });
  g.drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  const img = g.getImageData(0, 0, canvas.width, canvas.height);
  return jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })?.data || null;
}

/** Android's own QR reader (fast, in the system) when this phone has it; else null. */
async function systemReader() {
  try {
    const Detector = typeof window !== 'undefined' ? window.BarcodeDetector : undefined;
    if (!Detector) return null;
    const formats = await Detector.getSupportedFormats?.();
    return formats?.includes('qr_code') ? new Detector({ formats: ['qr_code'] }) : null;
  } catch {
    return null;
  }
}

const SCAN_EVERY_MS = 90;

/**
 * Live camera QR scanner (the back camera). When the camera can't be used, the teacher can
 * take a photo of the code instead. onResult(text) for every code read; onClose() to leave.
 */
export default function QrScanner({ onResult, onClose }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [cameraError, setCameraError] = useState('');
  const doneRef = useRef(false);
  // The latest callback, so a parent re-render never restarts the camera.
  const resultRef = useRef(onResult);
  useEffect(() => { resultRef.current = onResult; }, [onResult]);

  useEffect(() => {
    let stream = null;
    let timer = 0;
    let alive = true;
    let detector = null;
    let round = 0;
    const found = (text) => {
      doneRef.current = true;
      navigator.vibrate?.(40);
      resultRef.current(text);
    };
    // A few times a second (not every frame: the phone stays smooth). Android's own reader when
    // there is one; otherwise the middle of the picture, and now and then the whole picture.
    const tick = async () => {
      const v = videoRef.current;
      if (!alive || doneRef.current) return;
      if (v && v.readyState >= 2) {
        let text = null;
        try {
          if (detector) text = (await detector.detect(v))?.[0]?.rawValue || null;
          else text = readQr(v, v.videoWidth, v.videoHeight, canvasRef.current, round % 3 === 2 ? 1 : 0.7);
        } catch {
          // Android's reader is there but does not work on this phone: read the picture ourselves.
          detector = null;
        }
        round += 1;
        if (text && alive && !doneRef.current) { found(text); return; }
      }
      if (alive) timer = setTimeout(tick, SCAN_EVERY_MS);
    };
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('no camera');
        // A sharp picture: HD from the back camera, focusing by itself.
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (!alive) {
          // The scanner closed while the camera was starting: turn the camera off again.
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        stream.getVideoTracks()[0]?.applyConstraints?.({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
        const v = videoRef.current;
        v.srcObject = stream;
        await v.play();
        detector = await systemReader();
        tick();
      } catch {
        if (alive) setCameraError('The camera could not start. Allow KaTuro to use the camera in your phone settings, or take a photo of the code below.');
      }
    })();
    return () => {
      alive = false;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const fromPhoto = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      const text = readQr(im, im.naturalWidth, im.naturalHeight, canvasRef.current);
      URL.revokeObjectURL(url);
      if (text) onResult(text);
      else setCameraError('No QR code was found in that photo. Hold the phone straight in front of the code and try again.');
    };
    im.onerror = () => URL.revokeObjectURL(url);
    im.src = url;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 text-white" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        <p className="text-sm font-semibold">Point at the code on KaTuroDesk</p>
        <button type="button" onClick={onClose} aria-label="Close the scanner" className="p-2 -mr-2"><X size={22} /></button>
      </div>
      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="h-64 w-64 rounded-2xl border-4 border-white/80" />
        </div>
      </div>
      <canvas ref={canvasRef} className="hidden" />
      <div className="p-4 space-y-3 bg-black" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
        {cameraError && <p className="text-sm text-amber-300">{cameraError}</p>}
        <label className="flex items-center justify-center gap-2 w-full rounded-xl bg-white/10 py-3 text-white text-sm font-semibold">
          <Camera size={18} /> Take a photo of the code
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={fromPhoto} />
        </label>
      </div>
    </div>
  );
}
