import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

export const AVATAR_CATEGORIES = [
  { id: 'all', label: 'All Avatars' },
  { id: 'deped_female', label: 'Female Teachers' },
  { id: 'deped_male', label: 'Male Teachers' },
  { id: 'ai_mascot', label: 'AI Mascots & Bots' },
  { id: 'modern_creative', label: 'Creative & Modern' },
];

export const AVATAR_PRESETS = [
  // --- DepEd Female Educators ---
  { id: 'joy_default', category: 'deped_female', label: "Ma'am Joy (Assessment Master Teacher)", url: 'https://api.dicebear.com/7.x/notionists/svg?seed=Joy&glassesProbability=100' },
  { id: 'maria_classic', category: 'deped_female', label: "Ma'am Maria (Filipiniana / Traditional)", url: 'https://api.dicebear.com/7.x/notionists/svg?seed=Maria' },
  { id: 'grace_young', category: 'deped_female', label: "Teacher Grace (Energetic Elementary)", url: 'https://api.dicebear.com/7.x/notionists/svg?seed=Grace' },
  { id: 'anna_glasses', category: 'deped_female', label: "Ma'am Anna (High School / Focus & Rigor)", url: 'https://api.dicebear.com/7.x/notionists/svg?seed=Anna&glassesProbability=100' },
  { id: 'fatima_mindanao', category: 'deped_female', label: "Teacher Fatima (Mindanao / Inclusive)", url: 'https://api.dicebear.com/7.x/notionists/svg?seed=Fatima' },
  { id: 'liza_reading', category: 'deped_female', label: "Ma'am Liza (Reading & English Head)", url: 'https://api.dicebear.com/7.x/notionists/svg?seed=Liza' },
  { id: 'carmen_principal', category: 'deped_female', label: "Ma'am Carmen (Principal / School Head)", url: 'https://api.dicebear.com/7.x/notionists/svg?seed=Carmen' },
  { id: 'rowena_math', category: 'deped_female', label: "Ma'am Rowena (Mathematics Coordinator)", url: 'https://api.dicebear.com/7.x/notionists/svg?seed=Rowena' },
  { id: 'bea_sped', category: 'deped_female', label: "Teacher Bea (Early Childhood / SpEd)", url: 'https://api.dicebear.com/7.x/notionists/svg?seed=Bea' },
  { id: 'elena_filipino', category: 'deped_female', label: "Ma'am Elena (Wika at Panitikan)", url: 'https://api.dicebear.com/7.x/notionists/svg?seed=Elena' },

  // --- DepEd Male Educators ---
  { id: 'dan_default', category: 'deped_male', label: "Sir Dan (Barong Tagalog / Classic)", url: 'https://api.dicebear.com/7.x/notionists/svg?seed=Dan&beardProbability=0&glassesProbability=100' },
  { id: 'carlos_polo', category: 'deped_male', label: "Sir Carlos (DepEd Polo Uniform)", url: 'https://api.dicebear.com/7.x/notionists/svg?seed=Carlos' },
  { id: 'ramon_vet', category: 'deped_male', label: "Sir Ramon (Senior Master Teacher)", url: 'https://api.dicebear.com/7.x/notionists/svg?seed=Ramon&glassesProbability=100' },
  { id: 'jericho_stem', category: 'deped_male', label: "Sir Jericho (STEM Specialist)", url: 'https://api.dicebear.com/7.x/notionists/svg?seed=Jericho' },
  { id: 'joel_science', category: 'deped_male', label: "Sir Joel (Science Lab Head)", url: 'https://api.dicebear.com/7.x/notionists/svg?seed=Joel' },
  { id: 'manny_mapeh', category: 'deped_male', label: "Sir Manny (MAPEH & Sports Coordinator)", url: 'https://api.dicebear.com/7.x/notionists/svg?seed=Manny' },
  { id: 'aris_ict', category: 'deped_male', label: "Sir Aris (School ICT Coordinator)", url: 'https://api.dicebear.com/7.x/notionists/svg?seed=Aris' },
  { id: 'francis_arts', category: 'deped_male', label: "Sir Francis (Music & Creative Arts)", url: 'https://api.dicebear.com/7.x/notionists/svg?seed=Francis' },
  { id: 'mateo_guidance', category: 'deped_male', label: "Sir Mateo (Guidance Counselor)", url: 'https://api.dicebear.com/7.x/notionists/svg?seed=Mateo' },
  { id: 'rodrigo_head', category: 'deped_male', label: "Sir Rodrigo (Department Head)", url: 'https://api.dicebear.com/7.x/notionists/svg?seed=Rodrigo' },

  // --- AI Mascots & Smart Assistants ---
  { id: 'grader_bot', category: 'ai_mascot', label: "GraderBot (Optical Scanner Bot)", url: 'https://api.dicebear.com/7.x/bottts/svg?seed=GraderBot&colors=emerald,teal,cyan' },
  { id: 'robot_green', category: 'ai_mascot', label: "RoboTeacher Green (DepEd Emerald)", url: 'https://api.dicebear.com/7.x/bottts/svg?seed=RoboGreen&colors=green' },
  { id: 'owl_wise', category: 'ai_mascot', label: "Wise Owl Scholar", url: 'https://api.dicebear.com/7.x/bottts/svg?seed=WiseOwl&colors=amber,orange' },
  { id: 'cyber_juan', category: 'ai_mascot', label: "CyberJuan AI Assistant", url: 'https://api.dicebear.com/7.x/bottts/svg?seed=CyberJuan&colors=blue,cyan' },
  { id: 'spark_bot', category: 'ai_mascot', label: "SparkBot Co-Pilot", url: 'https://api.dicebear.com/7.x/bottts/svg?seed=SparkBot&colors=purple,pink' },
  { id: 'pixel_sensei', category: 'ai_mascot', label: "Pixel Sensei Bot", url: 'https://api.dicebear.com/7.x/bottts/svg?seed=PixelSensei&colors=teal' },
  { id: 'byte_prof', category: 'ai_mascot', label: "Byte Professor", url: 'https://api.dicebear.com/7.x/bottts/svg?seed=ByteProfessor&colors=emerald' },
  { id: 'atlas_drone', category: 'ai_mascot', label: "Atlas Curriculum Drone", url: 'https://api.dicebear.com/7.x/bottts/svg?seed=AtlasDrone&colors=amber' },

  // --- Creative & Modern Educators ---
  { id: 'dr_ben', category: 'modern_creative', label: "Dr. Ben (Academic Scholar)", url: 'https://api.dicebear.com/7.x/notionists/svg?seed=Ben&glassesProbability=100' },
  { id: 'slide_craft', category: 'modern_creative', label: "SlideCraft (Presentation Designer)", url: 'https://api.dicebear.com/7.x/notionists/svg?seed=Art&beardProbability=0' },
  { id: 'alex_modern', category: 'modern_creative', label: "Teacher Alex (Modern Classroom)", url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alex' },
  { id: 'sophia_vibrant', category: 'modern_creative', label: "Teacher Sophia (Creative Innovator)", url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sophia' },
  { id: 'gabriel_friendly', category: 'modern_creative', label: "Sir Gabriel (Friendly Mentor)", url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Gabriel' },
  { id: 'chloe_interactive', category: 'modern_creative', label: "Teacher Chloe (Interactive Games)", url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Chloe' },
  { id: 'miguel_digital', category: 'modern_creative', label: "Sir Miguel (Digital Classroom)", url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Miguel' },
  { id: 'kat_consultant', category: 'modern_creative', label: "Ma'am Katrina (Curriculum Specialist)", url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Katrina' },
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
