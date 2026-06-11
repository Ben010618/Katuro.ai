import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const DEFAULT_DECLARATION =
  'This lesson plan was formulated with the assistance of kaTuro AI, an AI-powered lesson planning tool for Filipino public school teachers. The teacher reviewed and edited all AI-generated content to ensure alignment with learner needs and local context. Ref: DepEd DO 3, 2026 Annex A.';

export const useLessonGenStore = create(
  persist(
    (set) => ({
      // ── Step 1 ──────────────────────────────────────────
      subject:      '',
      gradeLevel:   '',
      term:         '',
      weekNumber:   '',
      selectedDays: [],
      sessionCount: 0,

      // ── Step 2 ──────────────────────────────────────────
      selectedCompetency:  null,   // kept for backwards compat
      competencyText:      '',     // raw textarea value
      content:             '',     // subject matter / content topic
      contentStandards:    '',     // DepEd content standards statement
      learningContext:     '',     // teacher's school/classroom/community context (optional)
      lessonName:          '',
      declarationOfAIUse:  DEFAULT_DECLARATION,
      competencyCeiling:   '',     // e.g. "Apply"
      fullLadder:          [],     // e.g. ["Remember","Understand","Apply"]
      unpackedSessions:    [],     // [{ day, date, bloomsLevel, objective }]

      // ── Output ──────────────────────────────────────────
      generatedPlan: null,
      planId:        null,
      status:        'idle',

      // ── Actions ─────────────────────────────────────────
      setStep1: (data) => set({
        ...data,
        sessionCount: (data.selectedDays || []).length,
      }),

      setStep2: (data) => set(data),

      setCompetencyText:   (text)     => set({ competencyText: text }),
      setContent:          (text)     => set({ content: text }),
      setContentStandards: (text)     => set({ contentStandards: text }),
      setLearningContext:  (text)     => set({ learningContext: text }),
      setLessonName:       (name)     => set({ lessonName: name }),
      setCompetencyCeiling:(level)    => set({ competencyCeiling: level }),
      setFullLadder:       (ladder)   => set({ fullLadder: ladder }),
      setUnpackedSessions: (sessions) => set({ unpackedSessions: sessions }),

      // Restore all store fields from a Firestore lesson plan document (used by My Lessons viewer)
      loadPlan: (doc) => set({
        subject:            doc.subject            || '',
        gradeLevel:         doc.gradeLevel         || '',
        term:               doc.term               || '',
        weekNumber:         doc.weekNumber         || '',
        selectedDays:       doc.selectedDays       || [],
        sessionCount:       (doc.selectedDays      || []).length,
        competencyText:     doc.competencyText     || '',
        content:            doc.content            || '',
        contentStandards:   doc.contentStandards   || '',
        learningContext:    doc.learningContext     || '',
        lessonName:         doc.lessonName         || '',
        declarationOfAIUse: doc.declarationOfAIUse || DEFAULT_DECLARATION,
        competencyCeiling:  doc.competencyCeiling  || '',
        fullLadder:         doc.fullLadder         || [],
        unpackedSessions:   doc.sessions           || [],
        generatedPlan:      { sessions: doc.sessions || [], planId: doc.id },
        planId:             doc.id,
        status:             'generated',
      }),

      setStatus: (status) => set({ status }),

      setGeneratedPlan: (plan) => set({
        generatedPlan: plan,
        planId: plan.planId ?? 'mock-001',
        status: 'generated',
      }),

      reset: () => set({
        subject: '', gradeLevel: '', term: '', weekNumber: '',
        selectedDays: [], sessionCount: 0,
        selectedCompetency: null, competencyText: '', content: '', contentStandards: '', learningContext: '', lessonName: '', declarationOfAIUse: DEFAULT_DECLARATION,
        competencyCeiling: '', fullLadder: [], unpackedSessions: [],
        generatedPlan: null, planId: null, status: 'idle',
      }),
    }),
    {
      name: 'katuro-lesson-gen-draft',
      // Only persist the step data — not the generated plan or status
      partialize: (s) => ({
        subject:             s.subject,
        gradeLevel:          s.gradeLevel,
        term:                s.term,
        weekNumber:          s.weekNumber,
        selectedDays:        s.selectedDays,
        sessionCount:        s.sessionCount,
        selectedCompetency:  s.selectedCompetency,
        competencyText:      s.competencyText,
        content:             s.content,
        contentStandards:    s.contentStandards,
        learningContext:     s.learningContext,
        lessonName:          s.lessonName,
        declarationOfAIUse:  s.declarationOfAIUse,
        competencyCeiling:   s.competencyCeiling,
        fullLadder:          s.fullLadder,
        unpackedSessions:    s.unpackedSessions,
        generatedPlan:       s.generatedPlan,
        planId:              s.planId,
      }),
    }
  )
);
