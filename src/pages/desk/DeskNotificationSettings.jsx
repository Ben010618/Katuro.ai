import { useEffect, useState } from 'react';
import { Volume2 } from 'lucide-react';
import { useDeskStore } from '../../store/deskStore';
import { playMessageTone } from './messageTone';

const isElectron = typeof window !== 'undefined' && Boolean(window.katuroDeskApi?.setBackground);

function Toggle({ checked, disabled, onChange, title, detail }) {
  return (
    <label className={`flex items-start gap-2.5 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 w-4 h-4 accent-emerald-600" />
      <span>
        <span className="text-xs font-semibold text-gray-800">{title}</span>
        <span className="block text-[11px] text-gray-500">{detail}</span>
      </span>
    </label>
  );
}

/**
 * Settings > Notifications: message notifications, the taskbar unread count, and
 * whether KaTuroDesk keeps running (in the tray) after the window is closed.
 */
export default function DeskNotificationSettings() {
  const { notifyMessages, setNotifyMessages, taskbarBadge, setTaskbarBadge, messageSound, setMessageSound } = useDeskStore();
  const [bg, setBg] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isElectron) return;
    window.katuroDeskApi.getBackground().then(setBg).catch(() => setBg(null));
  }, []);

  const saveBackground = async (next) => {
    setError('');
    try {
      setBg(await window.katuroDeskApi.setBackground(next));
    } catch (e) {
      setError(e?.message || 'Could not save this setting.');
    }
  };

  return (
    <div className="p-5 space-y-5 overflow-y-auto">
      <section className="space-y-2.5">
        <h3 className="text-xs font-bold text-gray-800">Messages</h3>
        <Toggle
          checked={notifyMessages}
          onChange={setNotifyMessages}
          title="Notify me of new messages and invites"
          detail="A Windows notification shows who wrote and the start of the message. Click it to open that chat. Muted chats never notify."
        />
        <div className="flex items-start justify-between gap-3">
          <Toggle
            checked={messageSound}
            disabled={!notifyMessages}
            onChange={setMessageSound}
            title="Play a sound for new messages and invites"
            detail="A short KaTuroDesk tone. Turn it off for silent notifications."
          />
          <button type="button" onClick={playMessageTone} title="Play the message tone"
            className="flex-shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg border border-gray-300 text-[11px] font-semibold text-gray-700 hover:bg-gray-50">
            <Volume2 size={12} /> Play
          </button>
        </div>
        <Toggle
          checked={taskbarBadge}
          onChange={setTaskbarBadge}
          title="Show the unread count on the taskbar icon"
          detail="A small number on the KaTuroDesk taskbar button: unread chats plus invites waiting for your answer."
        />
      </section>

      <section className="border-t border-gray-100 pt-4 space-y-2.5">
        <h3 className="text-xs font-bold text-gray-800">When the window is closed</h3>
        {!isElectron || !bg ? (
          <p className="text-[11px] text-gray-500">Notifications and scheduled tasks work while KaTuroDesk is open.</p>
        ) : (
          <>
            <Toggle
              checked={bg.keepRunning}
              onChange={(on) => saveBackground({ keepRunning: on, openAtLogin: on && bg.openAtLogin })}
              title="Keep running in the background when I close the window"
              detail="KaTuroDesk stays in the system tray (near the clock), so messages and scheduled tasks still arrive. Quit it from the tray icon."
            />
            <Toggle
              checked={bg.openAtLogin}
              disabled={!bg.keepRunning}
              onChange={(on) => saveBackground({ keepRunning: true, openAtLogin: on })}
              title="Start KaTuroDesk in the background when Windows starts"
              detail="So you get messages and tasks run even on days you do not open the app. Your classroom folder reopens automatically."
            />
            <p className="text-[11px] text-gray-500">Nothing arrives while the computer is off or asleep. Missed messages wait in Messages; a missed task runs once when KaTuroDesk is back.</p>
          </>
        )}
        {error && <p className="text-[11px] text-red-600">{error}</p>}
      </section>
    </div>
  );
}
