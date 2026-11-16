// Which shell is running the shared React code: KaTuroDesk (Electron), the phone app
// (Capacitor, Katuro_App/) or the website. Detected from globals only, so src/ does not
// depend on Capacitor: the native shell injects window.Capacitor itself.
export function getPlatform() {
  const w = typeof window === 'undefined' ? undefined : window;
  if (!w) return 'web';
  if (w.katuroDeskApi) return 'desk';
  try {
    if (w.Capacitor?.isNativePlatform?.()) return 'mobile';
  } catch {
    // A broken bridge is treated as the website.
  }
  return 'web';
}

export const isDesk = () => getPlatform() === 'desk';
export const isMobile = () => getPlatform() === 'mobile';
export const isWeb = () => getPlatform() === 'web';
