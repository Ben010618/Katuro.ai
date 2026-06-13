import { create } from 'zustand';

export const useDLLStore = create((set) => ({
  // Step 1 — basic info
  subject:       '',
  gradeLevel:    '',
  term:          '',
  teachingDates: '',
  section:       '',

  // Step 2 — standards
  contentStandards:     '',
  performanceStandards: '',

  // Step 2 — multi-MELC rows (BOW-style)
  melcList: [{ text: '', days: 1 }],  // [{ text: string, days: number }]

  // Step 2 — multi-content rows (BOW-style)
  contentList: [{ text: '', days: 1 }],  // [{ text: string, days: number }]

  // Backward-compat flat fields (derived on generate; kept for loadPlan)
  melc:         '',
  dailyContent: { mon: '', tue: '', wed: '', thu: '', fri: '' },

  // Generated output
  objectives: null,  // { monday: '...', tuesday: '...', ... }
  procedure:  null,  // { monday: {A,B,...J}, tuesday: {...}, ... }
  savedId:    null,

  setField:        (key, val) => set({ [key]: val }),
  setMelcList:     (list)     => set({ melcList: list }),
  setContentList:  (list)     => set({ contentList: list }),
  setProcedure:    (procedure) => set({ procedure }),
  setObjectives:   (objectives) => set({ objectives }),
  setSavedId:      (savedId)   => set({ savedId }),

  loadPlan: (doc) => {
    // Reconstruct melcList from legacy single-melc plans
    const melcList = doc.melcList
      || (doc.melc ? [{ text: doc.melc, days: 5 }] : [{ text: '', days: 1 }]);

    // Reconstruct contentList from legacy dailyContent map
    let contentList = doc.contentList;
    if (!contentList) {
      const dc = doc.dailyContent || {};
      const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri'];
      const entries = DAY_KEYS.filter(d => dc[d]?.trim()).map(d => ({ text: dc[d], days: 1 }));
      contentList = entries.length > 0 ? entries : [{ text: '', days: 1 }];
    }

    set({
      subject:              doc.subject              || '',
      gradeLevel:           doc.gradeLevel           || '',
      term:                 doc.term                 || '',
      teachingDates:        doc.teachingDates        || '',
      section:              doc.section              || '',
      contentStandards:     doc.contentStandards     || '',
      performanceStandards: doc.performanceStandards || '',
      melcList,
      contentList,
      melc:         doc.melc || doc.competencyText || '',
      dailyContent: doc.dailyContent || { mon: '', tue: '', wed: '', thu: '', fri: '' },
      objectives:   doc.objectives   || null,
      procedure:    doc.procedure    || null,
      savedId:      doc.id           || null,
    });
  },

  reset: () => set({
    subject: '', gradeLevel: '', term: '', teachingDates: '', section: '',
    contentStandards: '', performanceStandards: '',
    melcList:    [{ text: '', days: 1 }],
    contentList: [{ text: '', days: 1 }],
    melc: '',
    dailyContent: { mon: '', tue: '', wed: '', thu: '', fri: '' },
    objectives: null,
    procedure:  null,
    savedId:    null,
  }),
}));
