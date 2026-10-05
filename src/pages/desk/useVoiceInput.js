import { useCallback, useEffect, useRef, useState } from 'react';
import { startRecording, transcribeAudio, VOICE_MAX_SECONDS } from '../../services/desk/voice/voiceInput';

/**
 * Push-to-talk voice input: start() → teacher speaks → stop() → onText(transcript).
 * status: 'idle' | 'starting' | 'listening' | 'transcribing'
 * transcribe: optional (wav) => Promise<string>, for another transcription format (spoken scores).
 */
export function useVoiceInput({ onText, transcribe }) {
  const [status, setStatus] = useState('idle');
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState('');
  const recRef = useRef(null);
  const timerRef = useRef(null);
  const onTextRef = useRef(onText);
  const transcribeRef = useRef(transcribe);
  const stopRef = useRef(null);

  useEffect(() => {
    onTextRef.current = onText;
    transcribeRef.current = transcribe;
  }, [onText, transcribe]);

  const clearTimer = () => {
    clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const stop = useCallback(async () => {
    const rec = recRef.current;
    if (!rec) return;
    recRef.current = null;
    clearTimer();
    setLevel(0);
    setStatus('transcribing');
    try {
      const wav = await rec.stop();
      const text = await (transcribeRef.current || transcribeAudio)(wav);
      if (text) onTextRef.current?.(text);
      else setError("I didn't catch any words. Please try again.");
    } catch (err) {
      setError(err?.message || 'Voice input failed.');
    } finally {
      setStatus('idle');
    }
  }, []);

  useEffect(() => {
    stopRef.current = stop;
  }, [stop]);

  const start = useCallback(async () => {
    if (recRef.current) return;
    setError('');
    setSeconds(0);
    setStatus('starting');
    try {
      recRef.current = await startRecording({
        onLevel: setLevel,
        onLimit: () => stopRef.current?.(), // 90 s reached: send what was said
      });
      setStatus('listening');
      const startedAt = Date.now();
      timerRef.current = setInterval(() => setSeconds(Math.min(VOICE_MAX_SECONDS, Math.floor((Date.now() - startedAt) / 1000))), 250);
    } catch (err) {
      recRef.current = null;
      setStatus('idle');
      setError(err?.message || 'The microphone could not be started.');
    }
  }, []);

  const cancel = useCallback(() => {
    recRef.current?.cancel();
    recRef.current = null;
    clearTimer();
    setLevel(0);
    setStatus('idle');
  }, []);

  // Leaving the page while recording releases the microphone.
  useEffect(() => () => {
    recRef.current?.cancel();
    clearInterval(timerRef.current);
  }, []);

  return { status, seconds, level, error, clearError: () => setError(''), start, stop, cancel };
}
