import { useEffect, useState } from 'react';
import { Smartphone } from 'lucide-react';

/**
 * The top bar's phone button. Until a phone is linked it stands out (bright, with a pulsing
 * dot): "Connect your phone". After that it is a quiet "Phone linked". Opens Settings → Phones.
 * Desktop app only (the phone link runs in KaTuroDesk).
 */
export default function ConnectPhoneButton({ onOpen }) {
  const api = typeof window !== 'undefined' ? window.katuroDeskApi : undefined;
  const [phones, setPhones] = useState(null); // null until KaTuroDesk answers
  useEffect(() => {
    if (!api?.linkStatus) return undefined;
    let alive = true;
    api.linkStatus().then((st) => alive && setPhones(st?.devices?.length || 0)).catch(() => {});
    const off = api.onLinkChanged?.((st) => setPhones(st?.devices?.length || 0));
    return () => { alive = false; off?.(); };
  }, [api]);
  if (!api?.linkStatus) return null;

  if (phones > 0) {
    return (
      <button
        type="button"
        data-tour="phone"
        onClick={onOpen}
        title={`${phones} phone${phones > 1 ? 's' : ''} linked. Link another, or choose what your phone may see.`}
        className="flex items-center gap-1.5 px-2 py-0.5 rounded-md hover:bg-[#25352a] text-[#a4baa9] hover:text-white border border-transparent hover:border-[#2d3e33] transition"
      >
        <span className="relative"><Smartphone size={14} /><span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-emerald-500" /></span>
        <span className="text-[11px] font-semibold hidden sm:inline">Phone linked</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      data-tour="phone"
      onClick={onOpen}
      title="Link the KaTuro App on your phone: scores, attendance, your schedule, your files and your assistant, over the same Wi-Fi."
      className="kt-phone-cta relative flex items-center gap-1.5 rounded-full px-3 py-1 text-[11.5px] font-bold transition"
    >
      <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75 motion-reduce:hidden" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-400" />
      </span>
      <Smartphone size={14} /> Connect your phone
    </button>
  );
}
