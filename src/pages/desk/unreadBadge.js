/**
 * The number on the KaTuroDesk taskbar button (Windows overlay icon): drawn here as a
 * small PNG, since Windows shows an image there, not a number.
 */

/** "1"–"9", then "9+" (the overlay is only 16 pixels wide). '' for nothing unread. */
export function badgeLabel(count) {
  const n = Math.floor(Number(count) || 0);
  if (n <= 0) return '';
  return n > 9 ? '9+' : String(n);
}

/** PNG data URL of a red dot with the label, or '' (no canvas / nothing unread). */
export function badgeDataUrl(count) {
  const label = badgeLabel(count);
  if (!label || typeof document === 'undefined') return '';
  try {
    const size = 32;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    ctx.fillStyle = '#c62828';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${label.length > 1 ? 16 : 20}px Segoe UI, Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, size / 2, size / 2 + 1);
    return canvas.toDataURL('image/png');
  } catch {
    return '';
  }
}
