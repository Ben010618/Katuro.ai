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
      competencies:        [{ text: '', days: 1 }], // multi-competency rows [{ text, days }]
      competencyText:      '',     // combined text (for Step 3 context + backwards compat)
      content:             '',     // subject matter / content topic
      contentStandards:    '',     // DepEd content standards statement
      learningContext:     '',     // teacher's school/classroom/community context (optional)
      lessonName:          '',
      declarationOfAIUse:  DEFAULT_DECLARATION,
      competencyCeiling:   '',     // e.g. "Apply"
      fullLadder:          [],     // e.g. ["Remember","Understand","Apply"]
      unpackedSessions:    [],     // [{ day, date, bloomsLevel, objective, keyContentFocus, activityType, competencyIndex, competencyText }]

      // ── Output ──────────────────────────────────────────
      generatedPlan: null,
      planId:        null,
      status:        'idle',
      // 'idle' | 'saved' | 'failed' -- whether generatedPlan has been
      // confirmed written to Firestore. 'failed' means this plan only
      // exists on this device right now (see OutputPage's save banner).
      saveStatus:    'idle',

      // ── Actions ─────────────────────────────────────────
      setStep1: (data) => set({
        ...data,
        sessionCount: (data.selectedDays || []).length,
      }),

      setStep2: (data) => set(data),

      setCompetencies:     (comps)    => set({ competencies: comps }),
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
        competencies:       doc.competencies       || (doc.competencyText ? [{ text: doc.competencyText, days: (doc.selectedDays || []).length || 1 }] : [{ text: '', days: 1 }]),
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
        // Loaded straight from Firestore, so by definition it's saved.
        saveStatus:         'saved',
      }),

      setStatus: (status) => set({ status }),
      setSaveStatus: (saveStatus) => set({ saveStatus }),

      setGeneratedPlan: (plan) => set({
        generatedPlan: plan,
        planId: plan.planId ?? 'mock-001',
        status: 'generated',
        saveStatus: plan.planId ? 'saved' : 'idle',
      }),

      reset: () => set({
        subject: '', gradeLevel: '', term: '', weekNumber: '',
        selectedDays: [], sessionCount: 0,
        selectedCompetency: null, competencies: [{ text: '', days: 1 }], competencyText: '', content: '', contentStandards: '', learningContext: '', lessonName: '', declarationOfAIUse: DEFAULT_DECLARATION,
        competencyCeiling: '', fullLadder: [], unpackedSessions: [],
        generatedPlan: null, planId: null, status: 'idle', saveStatus: 'idle',
      }),
    }),
    {
      name: 'katuro-lesson-gen-draft',
      // Persists the generated plan + save status too (not just step data) so
      // a refresh, or the browser reclaiming the tab, doesn't lose a plan that
      // hasn't been confirmed saved to Firestore yet.
      partialize: (s) => ({
        subject:             s.subject,
        gradeLevel:          s.gradeLevel,
        term:                s.term,
        weekNumber:          s.weekNumber,
        selectedDays:        s.selectedDays,
        sessionCount:        s.sessionCount,
        selectedCompetency:  s.selectedCompetency,
        competencies:        s.competencies,
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
        saveStatus:          s.saveStatus,
      }),
    }
  )
);
