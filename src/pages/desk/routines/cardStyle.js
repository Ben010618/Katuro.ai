/**
 * cardStyle.js — the Routine Builder's look: one icon per card (catalog.js names) and one
 * color per kind (purple When, blue Get, green Do, yellow Ask me first, orange Save / send).
 */
import {
  Play, CalendarClock, CalendarDays, FolderInput, Sheet, BookOpenCheck, FolderOpen,
  UserX, BarChart3, Calculator, FileBadge, BookOpen, ScanLine, PencilLine,
  Combine, ShieldCheck, FileDown, Package, NotebookPen, Hand, FolderDown, BellRing, Workflow,
} from 'lucide-react';

const ICONS = {
  Play, CalendarClock, CalendarDays, FolderInput, Sheet, BookOpenCheck, FolderOpen,
  UserX, BarChart3, Calculator, FileBadge, BookOpen, ScanLine, PencilLine,
  Combine, ShieldCheck, FileDown, Package, NotebookPen, Hand, FolderDown, BellRing,
};
export const iconFor = (name) => ICONS[name] || Workflow;

/*
 * The five card colors. Inline styles, not Tailwind classes: the Desk's light/dark theme
 * (neumorphism.css) re-skins color classes, but a card is a picture and keeps its color in every
 * theme (a purple When card is purple everywhere), with its own dark text on its light color.
 */
export const KIND_COLOR = {
  when: { bg: '#f5f3ff', border: '#c4b5fd', icon: '#7c3aed', chip: '#ede9fe', chipText: '#5b21b6', text: '#4c1d95', edge: '#7c3aed' },
  get: { bg: '#f0f9ff', border: '#7dd3fc', icon: '#0284c7', chip: '#e0f2fe', chipText: '#075985', text: '#0c4a6e', edge: '#0284c7' },
  do: { bg: '#ecfdf5', border: '#6ee7b7', icon: '#059669', chip: '#d1fae5', chipText: '#065f46', text: '#064e3b', edge: '#059669' },
  ask: { bg: '#fffbeb', border: '#fcd34d', icon: '#b45309', chip: '#fef3c7', chipText: '#92400e', text: '#78350f', edge: '#d97706' },
  save: { bg: '#fff7ed', border: '#fdba74', icon: '#c2410c', chip: '#ffedd5', chipText: '#9a3412', text: '#7c2d12', edge: '#ea580c' },
};
export const CARD_TEXT_2 = '#4b5563'; // the second line on a card

// The Routines screens' words (English / Filipino) and their main green button.
export const T = (lang, en, fil) => (lang === 'fil' ? fil : en);
export const primaryBtn = 'inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50';
const kc = (kind) => KIND_COLOR[kind] || KIND_COLOR.do;
export const cardColors = (kind) => ({ background: kc(kind).bg, borderColor: kc(kind).border });
export const iconColors = (kind) => ({ background: kc(kind).icon, color: '#ffffff' });
export const chipColors = (kind) => ({ background: kc(kind).chip, color: kc(kind).chipText });
export const textColor = (kind) => ({ color: kc(kind).text });

/** A run step's light: color + words. */
export const STATUS_LIGHT = {
  pending: { dot: 'bg-gray-300', en: 'Not yet', fil: 'Hindi pa' },
  running: { dot: 'bg-emerald-500 animate-pulse', en: 'Working…', fil: 'Ginagawa…' },
  done: { dot: 'bg-emerald-600', en: 'Done', fil: 'Tapos' },
  approved: { dot: 'bg-emerald-600', en: 'Approved', fil: 'Inaprubahan' },
  waiting: { dot: 'bg-amber-500 animate-pulse', en: 'Waiting for your OK', fil: 'Hinihintay ang OK mo' },
  rejected: { dot: 'bg-gray-500', en: 'Not approved', fil: 'Hindi inaprubahan' },
  skipped: { dot: 'bg-gray-400', en: 'Skipped', fil: 'Nilaktawan' },
  needs_info: { dot: 'bg-red-500', en: 'Needs your input', fil: 'Kailangan ng sagot mo' },
  error: { dot: 'bg-red-600', en: 'Did not finish', fil: 'Hindi natapos' },
};

/** Stops anything being read aloud. */
export function stopSpeaking() {
  try { window.speechSynthesis?.cancel(); } catch { /* no voice on this computer */ }
}

/** Reads a sentence aloud with the computer's own voice (Filipino when the teacher chose it). */
export function speak(text, lang = 'en') {
  try {
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
    if (!synth || !text) return false;
    synth.cancel();
    const u = new window.SpeechSynthesisUtterance(String(text).slice(0, 600));
    const want = lang === 'fil' ? ['fil', 'tl'] : ['en-PH', 'en'];
    const voice = synth.getVoices().find((v) => want.some((w) => v.lang?.toLowerCase().startsWith(w.toLowerCase())));
    if (voice) u.voice = voice;
    u.lang = voice?.lang || (lang === 'fil' ? 'fil-PH' : 'en-PH');
    synth.speak(u);
    return true;
  } catch {
    return false;
  }
}
