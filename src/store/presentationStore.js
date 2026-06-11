import { create } from 'zustand';

export const usePresentationStore = create((set, get) => ({
  // Navigation
  source: null,   // 'lesson' | 'scratch' | null
  lesson: null,   // selected lesson plan object

  // User inputs
  subject:      '',
  gradeLevel:   '',
  melcCode:     '',
  topic:        '',
  slideCount:   12,
  style:        'Academic',
  includeNotes: true,
  schoolName:   localStorage.getItem('pptSchoolName')  ?? '',
  schoolEmail:  localStorage.getItem('pptSchoolEmail') ?? '',

  // Stage 1 result — slide outline
  outline: null,          // Slide[] from generateOutline

  // Stage 2 result — fully expanded slides
  expandedSlides: null,   // ExpandedSlide[] from expandSlides

  // Status
  status: 'idle',
  // idle | generating-outline | outline-ready | expanding | done | error
  error: null,

  // ── Actions ──────────────────────────────────────────────────────────────────
  setSource: (source) => set({ source }),

  setLesson: (lesson) => set({
    lesson,
    topic:        lesson.lessonName     || '',
    subject:      lesson.subject        || '',
    gradeLevel:   lesson.gradeLevel     || '',
    melcCode:     lesson.competencyText || lesson.melc || '',
  }),

  setField: (key, val) => {
    set({ [key]: val });
    if (key === 'schoolName')  localStorage.setItem('pptSchoolName',  val);
    if (key === 'schoolEmail') localStorage.setItem('pptSchoolEmail', val);
  },

  setOutline:       (outline) => set({ outline, status: 'outline-ready', error: null }),
  setExpandedSlides: (slides) => set({ expandedSlides: slides, status: 'done', error: null }),
  setStatus:        (status)  => set({ status }),
  setError:         (error)   => set({ error, status: 'error' }),

  updateOutlineSlide: (id, changes) => set(s => ({
    outline: (s.outline || []).map(sl => sl.id === id ? { ...sl, ...changes } : sl),
  })),

  removeOutlineSlide: (id) => set(s => {
    const updated = (s.outline || []).filter(sl => sl.id !== id);
    return { outline: updated };
  }),

  reset: () => set({
    source: null, lesson: null,
    subject: '', gradeLevel: '', melcCode: '', topic: '',
    slideCount: 12, style: 'Academic', includeNotes: true,
    outline: null, expandedSlides: null,
    status: 'idle', error: null,
  }),
}));
