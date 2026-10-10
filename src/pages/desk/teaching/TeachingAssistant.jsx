/**
 * TeachingAssistant — starts the teaching assistant's background loop (assistantEngine.js)
 * while the KaTuroDesk page is open. Renders nothing.
 */
import { useEffect, useRef } from 'react';
import { startTeachingAssistant } from './assistantEngine';

export default function TeachingAssistant({ user, profile, onOpenClasses }) {
  const latest = useRef({ user, profile, onOpenClasses });
  useEffect(() => {
    latest.current = { user, profile, onOpenClasses };
  });
  useEffect(() => startTeachingAssistant(() => latest.current), []);
  return null;
}
