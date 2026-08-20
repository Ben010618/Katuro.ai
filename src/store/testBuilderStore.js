import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { derivePreset, makeEmptyCompetency, EMPTY_TOS } from '../config/testBuilderConfig';

const defaultCompetencies = () => [makeEmptyCompetency(), makeEmptyCompetency(), makeEmptyCompetency()];

const INITIAL = {
  sessionId:        null,
  gradeLevel:       '',
  subject:          '',
  testType:         'ST1',
  itemCeilingOverride: null,
  terms:            [],
  questionFormats:  [],
  proficiencyLevel: '',
  contextNotes:     '',
  competencies:     defaultCompetencies(),
  cognitiveWeights: derivePreset('KS2'),
  tos:              EMPTY_TOS,
  generatedParts:   null, // { testBlocks, keyBlocks }
  status:           'draft',
};

export const useTestBuilderStore = create(
  persist(
    (set) => ({
      ...INITIAL,

      setField:           (key, val) => set({ [key]: val }),
      setCompetencies:    (comps)    => set({ competencies: comps }),
      setCognitiveWeights:(weights)  => set({ cognitiveWeights: weights }),
      setTos:             (tos)      => set({ tos }),
      setGeneratedParts:  (parts)    => set({ generatedParts: parts }),

      loadSession: (doc) => set({
        sessionId:        doc.id,
        gradeLevel:       doc.gradeLevel       || '',
        subject:          doc.subject          || '',
        testType:         doc.testType         || 'ST1',
        itemCeilingOverride: doc.itemCeilingOverride ?? null,
        terms:            doc.terms            || [],
        questionFormats:  doc.questionFormats  || [],
        proficiencyLevel: doc.proficiencyLevel || '',
        contextNotes:     doc.contextNotes     || '',
        competencies:     doc.competencies?.length ? doc.competencies : defaultCompetencies(),
        cognitiveWeights: doc.cognitiveWeights || derivePreset('KS2'),
        tos:              doc.tos              || EMPTY_TOS,
        generatedParts:   doc.generatedParts   || null,
        status:           doc.status           || 'draft',
      }),

      reset: () => set({ ...INITIAL, competencies: defaultCompetencies() }),
    }),
    {
      name: 'katuro-testbuilder-draft',
      partialize: (s) => ({
        sessionId:        s.sessionId,
        gradeLevel:       s.gradeLevel,
        subject:          s.subject,
        testType:         s.testType,
        itemCeilingOverride: s.itemCeilingOverride,
        terms:            s.terms,
        questionFormats:  s.questionFormats,
        proficiencyLevel: s.proficiencyLevel,
        contextNotes:     s.contextNotes,
        competencies:     s.competencies,
        cognitiveWeights: s.cognitiveWeights,
        tos:              s.tos,
        generatedParts:   s.generatedParts,
        status:           s.status,
      }),
    }
  )
);
