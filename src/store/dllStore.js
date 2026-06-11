import { create } from 'zustand';

export const useDLLStore = create((set) => ({
  // Step 1 — basic info
  subject:       '',
  gradeLevel:    '',
  term:          '',
  teachingDates: '',
  section:       '',

  // Step 2 — standards + daily content
  contentStandards:     '',
  performanceStandards: '',
  melc:                 '',
  dailyContent: { mon: '', tue: '', wed: '', thu: '', fri: '' },

  // Generated output (null until AI returns)
  procedure: null,   // { monday:{A,B,...J}, tuesday:{...}, ... }
  savedId: null,     // Firestore doc ID once saved

  setField:        (key, val) => set({ [key]: val }),
  setDailyContent: (day, val) => set(s => ({ dailyContent: { ...s.dailyContent, [day]: val } })),
  setProcedure:    (procedure) => set({ procedure }),
  setSavedId:      (savedId) => set({ savedId }),

  loadPlan: (doc) => set({
    subject:              doc.subject              || '',
    gradeLevel:           doc.gradeLevel           || '',
    term:                 doc.term                 || '',
    teachingDates:        doc.teachingDates        || '',
    section:              doc.section              || '',
    contentStandards:     doc.contentStandards     || '',
    performanceStandards: doc.performanceStandards || '',
    melc:                 doc.melc || doc.competencyText || '',
    dailyContent:         doc.dailyContent || { mon: '', tue: '', wed: '', thu: '', fri: '' },
    procedure:            doc.procedure || null,
    savedId:              doc.id || null,
  }),

  reset: () => set({
    subject: '', gradeLevel: '', term: '', teachingDates: '', section: '',
    contentStandards: '', performanceStandards: '', melc: '',
    dailyContent: { mon: '', tue: '', wed: '', thu: '', fri: '' },
    procedure: null, savedId: null,
  }),
}));
