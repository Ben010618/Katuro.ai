import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

export const AVATAR_PRESETS = [
  { id: 'dan_default', label: 'Sir Dan (Barong / Classic)', url: 'https://api.dicebear.com/7.x/notionists/svg?seed=Dan&beardProbability=0&glassesProbability=100' },
  { id: 'joy_default', label: "Ma'am Joy (Glasses / Formal)", url: 'https://api.dicebear.com/7.x/notionists/svg?seed=Joy&glassesProbability=100' },
  { id: 'grader_bot', label: 'GraderBot (Tech Mascot)', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=GraderBot&colors=emerald,teal,cyan' },
  { id: 'slide_craft', label: 'SlideCraft (Creative Arts)', url: 'https://api.dicebear.com/7.x/notionists/svg?seed=Art&beardProbability=0' },
  { id: 'dr_ben', label: 'Dr. Ben (Academic Scholar)', url: 'https://api.dicebear.com/7.x/notionists/svg?seed=Ben&glassesProbability=100' },
  { id: 'maria_classic', label: "Ma'am Maria (Traditional)", url: 'https://api.dicebear.com/7.x/notionists/svg?seed=Maria' },
  { id: 'carlos_polo', label: 'Sir Carlos (Polo Uniform)', url: 'https://api.dicebear.com/7.x/notionists/svg?seed=Carlos' },
  { id: 'grace_young', label: 'Teacher Grace (Energetic)', url: 'https://api.dicebear.com/7.x/notionists/svg?seed=Grace' },
  { id: 'ramon_vet', label: 'Sir Ramon (Veteran Mentor)', url: 'https://api.dicebear.com/7.x/notionists/svg?seed=Ramon' },
  { id: 'anna_glasses', label: "Ma'am Anna (Sharp / Focus)", url: 'https://api.dicebear.com/7.x/notionists/svg?seed=Anna&glassesProbability=100' },
  { id: 'robot_green', label: 'RoboTeacher Green', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=RoboGreen&colors=green' },
  { id: 'owl_wise', label: 'Wise Owl Mascot', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=WiseOwl' },
];

export const DEFAULT_FACULTY = {
  dll: {
    id: 'dll',
    defaultName: 'Sir Dan',
    customName: 'Sir Dan',
    role: 'Lesson Plan & DLL Specialist',
    description: 'Generates DepEd-compliant Daily Lesson Logs (DLL) & COT lesson plans with downloadable Word .docx files in seconds.',
    tagline: 'Tapos ang lesson log bago mag-bell.',
    avatar: 'https://api.dicebear.com/7.x/notionists/svg?seed=Dan&beardProbability=0&glassesProbability=100',
    tone: 'DepEd Official & Practical',
    route: '/dll-gen',
    badge: 'Curriculum',
    color: '#059669', // Emerald
  },
  tos: {
    id: 'tos',
    defaultName: "Ma'am Joy",
    customName: "Ma'am Joy",
    role: 'TOS & Test Builder Architect',
    description: "Computes balanced Bloom's Taxonomy percentages, item distributions, and generates complete exams with Answer Keys.",
    tagline: '100% mathematically balanced Table of Specifications.',
    avatar: 'https://api.dicebear.com/7.x/notionists/svg?seed=Joy&glassesProbability=100',
    tone: 'Analytical & Methodical',
    route: '/test-builder',
    badge: 'Assessment',
    color: '#2563eb', // Cobalt Blue
  },
  grader: {
    id: 'grader',
    defaultName: 'GraderBot',
    customName: 'GraderBot',
    role: 'Instant Camera Paper Checker',
    description: 'Uses mobile or laptop camera to scan student bubble answer sheets and grades 50 test papers in 2 minutes.',
    tagline: 'Paalam, manual checking na may red ballpen.',
    avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=GraderBot&colors=emerald,teal,cyan',
    tone: 'Fast & Instant Results',
    route: '/assessment',
    badge: 'Optical AI',
    color: '#0284c7', // Sky Blue
  },
  slides: {
    id: 'slides',
    defaultName: 'SlideCraft',
    customName: 'SlideCraft',
    role: 'PowerPoint Slide Deck Generator',
    description: 'Generates structured, visual, and editable PowerPoint (.pptx) presentation decks ready for classroom TVs and projectors.',
    tagline: 'Buhay at visual ang klase gamit ang instant slides.',
    avatar: 'https://api.dicebear.com/7.x/notionists/svg?seed=Art&beardProbability=0',
    tone: 'Visual & Engaging',
    route: '/lesson-gen',
    badge: 'Classroom Media',
    color: '#d97706', // Amber
  },
  research: {
    id: 'research',
    defaultName: 'Dr. Ben',
    customName: 'Dr. Ben',
    role: 'Action Research (CAR) Advisor',
    description: 'Guides you through all 6 phases of Classroom Action Research proposals and completions for DepEd BERF and ranking.',
    tagline: 'Mula Context & Rationale hanggang Work Plan at Cost.',
    avatar: 'https://api.dicebear.com/7.x/notionists/svg?seed=Ben&glassesProbability=100',
    tone: 'Scholarly & Encouraging',
    route: '/action-research/phase-1',
    badge: 'Professional Growth',
    color: '#7c3aed', // Purple
  },
};

export const useFacultyStore = create(
  persist(
    (set, get) => ({
      faculty: DEFAULT_FACULTY,

      updateCoTeacher: (id, updates) => {
        set((state) => {
          const current = state.faculty[id] || DEFAULT_FACULTY[id];
          return {
            faculty: {
              ...state.faculty,
              [id]: {
                ...current,
                ...updates,
                customName: updates.customName?.trim() || current.customName || current.defaultName,
              },
            },
          };
        });
      },

      resetCoTeacher: (id) => {
        set((state) => ({
          faculty: {
            ...state.faculty,
            [id]: { ...DEFAULT_FACULTY[id] },
          },
        }));
      },

      resetAllFaculty: () => {
        set({ faculty: { ...DEFAULT_FACULTY } });
      },

      syncWithFirestore: async (uid) => {
        if (!uid) return;
        try {
          const ref = doc(db, 'teachers', uid);
          const snap = await getDoc(ref);
          if (snap.exists() && snap.data().customFaculty) {
            const remoteFaculty = snap.data().customFaculty;
            set((state) => ({
              faculty: {
                ...state.faculty,
                ...remoteFaculty,
              },
            }));
          }
        } catch (err) {
          console.warn('[kaTuro] Failed to fetch custom faculty from Firestore:', err);
        }
      },

      saveToFirestore: async (uid) => {
        if (!uid) return;
        try {
          const ref = doc(db, 'teachers', uid);
          await updateDoc(ref, {
            customFaculty: get().faculty,
            facultyUpdatedAt: new Date().toISOString(),
          });
        } catch (err) {
          console.warn('[kaTuro] Failed to save custom faculty to Firestore:', err);
        }
      },
    }),
    {
      name: 'katuro-faculty-storage',
    }
  )
);
