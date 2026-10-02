import { useEffect } from 'react';
import { X, Check, ShieldCheck, Settings } from 'lucide-react';
import { useDeskStore } from '../../store/deskStore';
import { PERSONAS } from '../../services/desk/personas';
import { KaTuroAIAvatar } from './DeskAvatar';

/** KaTuroDesk Settings: assistant persona (Matt / Luna) and privacy. */
export default function DeskSettingsModal({ open, onClose }) {
  const { persona, setPersona, privacyMode, setPrivacyMode } = useDeskStore();

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="desk-settings-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between bg-[#f6f8f7]">
          <h2 id="desk-settings-title" className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <Settings size={15} className="text-emerald-700" /> KaTuroDesk Settings
          </h2>
          <button onClick={onClose} title="Close" className="p-1 rounded hover:bg-gray-200 text-gray-500">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <section>
            <h3 className="text-xs font-bold text-gray-800 mb-0.5">Assistant persona</h3>
            <p className="text-[11px] text-gray-500 mb-3">Choose who you want to work with. This changes how the assistant talks in chat; your documents always stay formal DepEd style.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Object.values(PERSONAS).map((p) => {
                const selected = persona === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => setPersona(p.id)}
                    aria-pressed={selected}
                    className={`relative text-left rounded-xl border-2 p-3 transition ${
                      selected ? 'border-emerald-600 bg-emerald-50/60 shadow-sm' : 'border-gray-200 hover:border-emerald-300 bg-white'
                    }`}
                  >
                    {selected && (
                      <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center">
                        <Check size={12} />
                      </span>
                    )}
                    <div className="flex items-center gap-3 mb-2">
                      <KaTuroAIAvatar persona={p.id} size={64} />
                      <div>
                        <p className="text-sm font-bold text-gray-900">{p.name}</p>
                        <p className="text-[11px] text-emerald-800 font-medium">{p.tagline}</p>
                      </div>
                    </div>
                    <p className="text-[11px] text-gray-700 bg-white border border-gray-200 rounded-lg rounded-tl-none px-2.5 py-1.5 italic">“{p.sample}”</p>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="border-t border-gray-100 pt-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={privacyMode} onChange={(e) => setPrivacyMode(e.target.checked)} className="mt-0.5 w-4 h-4 accent-emerald-600" />
              <span>
                <span className="text-xs font-bold text-gray-800 flex items-center gap-1">
                  <ShieldCheck size={13} className="text-emerald-700" /> Protect learner names
                </span>
                <span className="block text-[11px] text-gray-500">
                  Learner names in file text are replaced with codes (Learner 01…) before going to the AI, then restored in your files. Photos and scans are sent as they are.
                </span>
              </span>
            </label>
          </section>
        </div>

        <div className="px-5 py-3 border-t border-gray-200 flex justify-end bg-[#f6f8f7]">
          <button onClick={onClose} className="px-4 py-1.5 rounded-lg bg-[#2d6a4f] hover:bg-[#235841] text-white text-xs font-semibold">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
