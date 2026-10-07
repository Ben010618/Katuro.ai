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
