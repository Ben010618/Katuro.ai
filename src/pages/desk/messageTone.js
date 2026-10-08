import toneUrl from '../../assets/sounds/message-tone.wav';

/**
 * The KaTuroDesk message tone (Settings > Notifications can turn it off). One audio
 * element is reused; a sound that cannot play (no audio device) is skipped quietly.
 */
let audio = null;

export function playMessageTone() {
  if (typeof Audio === 'undefined') return;
  try {
    audio ||= new Audio(toneUrl);
    audio.volume = 0.8;
    audio.currentTime = 0;
    audio.play()?.catch?.(() => {});
  } catch {
    /* no audio: the notification still shows */
  }
}

/**
 * Calendar alarm: the same tone, repeated every 2.5 seconds until stopAlarmSound()
 * (Dismiss / Snooze) is called.
 */
let alarmAudio = null;
let alarmTimer = null;

export function startAlarmSound() {
  if (typeof Audio === 'undefined' || alarmTimer) return;
  const ring = () => {
    try {
      alarmAudio ||= new Audio(toneUrl);
      alarmAudio.volume = 1;
      alarmAudio.currentTime = 0;
      alarmAudio.play()?.catch?.(() => {});
    } catch {
      /* no audio device: the alarm window and notification still show */
    }
  };
  ring();
  alarmTimer = setInterval(ring, 2500);
}

export function stopAlarmSound() {
  if (alarmTimer) clearInterval(alarmTimer);
  alarmTimer = null;
  try { alarmAudio?.pause(); } catch { /* nothing playing */ }
}

export function isAlarmSounding() {
  return Boolean(alarmTimer);
}
