import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const ALL_INDICATORS = [
  {
    id: 'ppst-1-1-2', code: 'PPST 1.1.2', num: '1', kra: 'KRA 1',
    description: 'Applied knowledge of content within and across curriculum teaching areas',
  },
  {
    id: 'ppst-1-2-2', code: 'PPST 1.2.2', num: '2', kra: 'KRA 1',
    description: 'Used research-based knowledge and principles of teaching and learning to enhance professional practice',
  },
  {
    id: 'ppst-1-3-2', code: 'PPST 1.3.2', num: '3', kra: 'KRA 1',
    description: 'Displayed proficiency in Mother Tongue, Filipino and English; ensured positive use of ICT',
  },
  {
    id: 'ppst-1-4-2', code: 'PPST 1.4.2', num: '4', kra: 'KRA 1',
    description: 'Used a range of teaching strategies that enhance learner achievement in literacy and numeracy skills',
  },
  {
    id: 'ppst-1-5-2', code: 'PPST 1.5.2', num: '5', kra: 'KRA 1',
    description: 'Applied a range of teaching strategies to develop critical and creative thinking and other higher-order thinking skills',
  },
  {
    id: 'ppst-2-1-2', code: 'PPST 2.1.2', num: '6', kra: 'KRA 2',
    description: "Established a learner-centered culture by using teaching strategies that respond to learners' linguistic, cultural, socio-economic and religious backgrounds",
  },
  {
    id: 'ppst-2-4-2', code: 'PPST 2.4.2', num: '7', kra: 'KRA 2',
    description: 'Maintained supportive learning environments that nurture and inspire learners to participate, cooperate and collaborate in continued learning',
  },
  {
    id: 'ppst-3-1-2', code: 'PPST 3.1.2', num: '8', kra: 'KRA 3',
    description: 'Managed classroom structure to engage learners, individually or in groups, in meaningful exploration, discovery and hands-on activities',
  },
  {
    id: 'ppst-3-3-2', code: 'PPST 3.3.2', num: '9', kra: 'KRA 3',
    description: "Used differentiated, developmentally appropriate learning experiences to address learners' gender, needs, strengths, interests and experiences",
  },
  {
    id: 'ppst-3-4-2', code: 'PPST 3.4.2', num: '10', kra: 'KRA 3',
    description: 'Managed learner behavior constructively by applying positive and non-violent discipline to ensure learning-focused environments',
  },
  {
    id: 'ppst-4-5-2', code: 'PPST 4.5.2', num: '11', kra: 'KRA 4',
    description: 'Selected, developed and organized teaching and learning resources, including ICT, to address learning goals',
  },
  {
    id: 'ppst-5-1-2', code: 'PPST 5.1.2', num: '12', kra: 'KRA 5',
    description: 'Designed, selected, organized and used diagnostic, formative and summative assessment strategies consistent with curriculum requirements',
  },
];

const DEFAULT_SELECTED = ALL_INDICATORS.map(i => i.id);

export const useCotStore = create(
  persist(
    (set) => ({
      // ── Step 1 ──────────────────────────────────────────
      teacherName:          '',
      school:               '',
      subject:              '',
      grade:                '',
      quarter:              '',
      topic:                '',
      melc:                 '',
      materials:            '',
      objectives:           '',
      teachingDate:         '',
      // Extra context pre-filled when coming from DLL
      contentStandards:     '',
      performanceStandards: '',

      // ── Step 2 ──────────────────────────────────────────
      selectedIndicators: DEFAULT_SELECTED,

      // ── Output ──────────────────────────────────────────
      generatedPlan: null,
      planId:        null,
      status:        'idle',

      // ── Actions ─────────────────────────────────────────
      setStep1: (data) => set(data),

      setSelectedIndicators: (ids) => set({ selectedIndicators: ids }),

      setGeneratedPlan: (plan) => set({
        generatedPlan: plan,
        planId:        plan.planId ?? null,
        status:        'generated',
      }),

      setStatus: (status) => set({ status }),

      loadPlan: (data) => set({
        teacherName:          data.teacherName          || '',
        school:               data.school               || '',
        subject:              data.subject              || '',
        grade:                data.grade                || '',
        quarter:              data.quarter              || '',
        topic:                data.topic                || '',
        melc:                 data.melc                 || '',
        materials:            data.materials            || '',
        objectives:           data.objectives           || '',
        teachingDate:         data.teachingDate         || '',
        contentStandards:     data.contentStandards     || '',
        performanceStandards: data.performanceStandards || '',
        selectedIndicators:   data.selectedIndicators   || DEFAULT_SELECTED,
        generatedPlan:      data.plan               || null,
        planId:             data.id                 || null,
        status:             'generated',
      }),

      reset: () => set({
        teacherName: '', school: '', subject: '', grade: '', quarter: '',
        topic: '', melc: '', materials: '', objectives: '', teachingDate: '',
        contentStandards: '', performanceStandards: '',
        selectedIndicators: DEFAULT_SELECTED,
        generatedPlan: null, planId: null, status: 'idle',
      }),
    }),
    {
      name: 'katuro-cot-draft',
      partialize: (s) => ({
        teacherName:        s.teacherName,
        school:             s.school,
        subject:            s.subject,
        grade:              s.grade,
        quarter:            s.quarter,
        topic:              s.topic,
        melc:               s.melc,
        materials:          s.materials,
        objectives:         s.objectives,
        teachingDate:       s.teachingDate,
        selectedIndicators: s.selectedIndicators,
        generatedPlan:      s.generatedPlan,
        planId:             s.planId,
      }),
    }
  )
);
