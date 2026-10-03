import { useEffect, useState } from 'react';
import { useCotStore } from '../../store/cotStore';
import { useAuth } from '../../hooks/useAuth';
import CoTeacherBanner from '../../components/CoTeacherBanner';
import { Sparkles } from 'lucide-react';
import DepEdCurriculumPickerModal from '../../components/DepEdCurriculumPickerModal';

const GRADES = [
  'Grade 1','Grade 2','Grade 3','Grade 4','Grade 5','Grade 6',
  'Grade 7','Grade 8','Grade 9','Grade 10','Grade 11','Grade 12',
];
const QUARTERS = ['First Quarter','Second Quarter','Third Quarter','Fourth Quarter'];

function Field({ label, required, hint, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 12, fontWeight: 700, color: '#4a4060', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {label}{required && <span style={{ color: '#7c3aed', marginLeft: 2 }}>*</span>}
      </label>
      {children}
      {hint && <p style={{ margin: 0, fontSize: 11, color: '#9ca3af', lineHeight: 1.5 }}>{hint}</p>}
    </div>
  );
}

export default function CotStep1() {
  const store    = useCotStore();
  const { user } = useAuth();
  const [curriculumModalOpen, setCurriculumModalOpen] = useState(false);

  function handleSelectCurriculumForCOT(selectedList) {
    if (!selectedList || selectedList.length === 0) return;
    const item = selectedList[0];
    store.setStep1({
      melc: item.text,
      topic: item.domain || store.topic,
    });
  }

  // Pre-fill teacher name & school from auth profile if empty
  useEffect(() => {
    if (!store.teacherName && user?.displayName) {
      store.setStep1({ teacherName: user.displayName });
    }
  }, [user]);

  function set(field) {
    return e => store.setStep1({ [field]: e.target.value });
  }

  const inp = {
    className: 'input',
    style: { fontFamily: 'inherit', fontSize: 14 },
  };

  const selectStyle = {
    ...inp,
    style: { ...inp.style, cursor: 'pointer' },
  };

  return (
    <div style={{ maxWidth: 720, margin: '0 auto' }}>
      <CoTeacherBanner
        agentId="dll"
        badge="COT-RPMS Lesson Plan"
        title="Tell kaTuro about your lesson"
        description="Fill in the details below. Objectives are optional — the AI will generate them using Bloom's Taxonomy if left blank."
      />

      {/* Two-column form */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

        {/* Row: Teacher + School */}
        <div className="kt-grid-2" style={{ gap: 16 }}>
          <Field label="Teacher Name" required>
            <input
              {...inp}
              value={store.teacherName}
              onChange={set('teacherName')}
              placeholder="e.g. Ben Mark Joy A. Cuvinar"
            />
          </Field>
          <Field label="School Name" required>
            <input
              {...inp}
              value={store.school}
              onChange={set('school')}
              placeholder="e.g. Dayap National High School"
            />
          </Field>
        </div>

        {/* Row: Subject + Grade */}
        <div className="kt-grid-2" style={{ gap: 16 }}>
          <Field label="Subject / Learning Area" required>
            <input
              {...inp}
              value={store.subject}
              onChange={set('subject')}
              placeholder="e.g. Science 10, Math 7, English 8"
            />
          </Field>
          <Field label="Grade Level" required>
            <select {...selectStyle} value={store.grade} onChange={set('grade')}>
              <option value="">Select grade level</option>
              {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </Field>
        </div>

        {/* Row: Quarter + Teaching Date */}
        <div className="kt-grid-2" style={{ gap: 16 }}>
          <Field label="Quarter" required>
            <select {...selectStyle} value={store.quarter} onChange={set('quarter')}>
              <option value="">Select quarter</option>
              {QUARTERS.map(q => <option key={q} value={q}>{q}</option>)}
            </select>
          </Field>
          <Field label="Teaching Date & Time">
            <input
              {...inp}
              value={store.teachingDate}
              onChange={set('teachingDate')}
              placeholder="e.g. Oct 23, 2025 · 8:00–9:00 AM"
            />
          </Field>
        </div>

        {/* Topic */}
        <Field label="Lesson Topic / Content" required hint="Be specific — this becomes the lesson title in your document.">
          <input
            {...inp}
            value={store.topic}
            onChange={set('topic')}
            placeholder="e.g. Charles' Law — Volume and Temperature Relationship of Gases"
          />
        </Field>

        {/* MELC */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: '#4a4060', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              MELC Competency <span style={{ color: '#7c3aed', marginLeft: 2 }}>*</span>
            </label>
            <button
              type="button"
              onClick={() => setCurriculumModalOpen(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '3px 10px',
                borderRadius: 100,
                border: '1px solid #7c3aed',
                background: '#f5f3ff',
                color: '#6d28d9',
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#ede9fe')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#f5f3ff')}
            >
              <Sparkles size={11} color="#7c3aed" />
              1-Click DepEd MATATAG Auto-Load
            </button>
          </div>
          <textarea
            {...inp}
            rows={3}
            value={store.melc}
            onChange={set('melc')}
            placeholder="e.g. Investigate the relationship between the volume and temperature at constant pressure of a gas (S10LT-IIIg-40)"
            style={{ ...inp.style, resize: 'vertical', lineHeight: 1.65 }}
          />
          <p style={{ margin: 0, fontSize: 11, color: '#9ca3af', lineHeight: 1.5 }}>
            Paste the full MELC code or click the 1-Click Auto-Load button to pull directly from official DepEd guides.
          </p>
        </div>

        {/* Materials */}
        <Field label="Available Materials" hint="List materials the class has access to. Separate with commas.">
          <input
            {...inp}
            value={store.materials}
            onChange={set('materials')}
            placeholder="e.g. balloons, hot water, ice water, plastic bottles, textbook, computer tablets"
          />
        </Field>

        {/* Objectives (optional) */}
        <Field
          label="Learning Objectives (Optional)"
          hint="Leave blank and the AI will generate cognitive, affective, and psychomotor objectives automatically using Bloom's Taxonomy."
        >
          <textarea
            {...inp}
            rows={4}
            value={store.objectives}
            onChange={set('objectives')}
            placeholder="Optional: paste your draft objectives here, or leave blank for AI-generated objectives."
            style={{ ...inp.style, resize: 'vertical', lineHeight: 1.65 }}
          />
        </Field>

        {/* Optional blank AI note */}
        {!store.objectives && (
          <div style={{
            background: 'rgba(124,58,237,0.04)', border: '1px solid rgba(124,58,237,0.15)',
            borderRadius: 10, padding: '12px 16px',
            display: 'flex', alignItems: 'flex-start', gap: 10,
          }}>
            <span style={{ fontSize: 18 }}>✨</span>
            <p style={{ margin: 0, fontSize: 13, color: '#5b21b6', lineHeight: 1.65 }}>
              <strong>AI will generate objectives</strong> — The AI will write three objectives (cognitive, affective, psychomotor) aligned to Bloom's Taxonomy, targeting the Application level or higher.
            </p>
          </div>
        )}

        <div style={{ height: 24 }} />
      </div>

      <DepEdCurriculumPickerModal
        isOpen={curriculumModalOpen}
        onClose={() => setCurriculumModalOpen(false)}
        onSelectCompetencies={handleSelectCurriculumForCOT}
        defaultSubject={store.subject || 'Science'}
        defaultGrade={store.grade || 'Grade 7'}
        defaultQuarter={store.quarter || 'Quarter 1'}
        singleSelect={true}
      />
    </div>
  );
}
