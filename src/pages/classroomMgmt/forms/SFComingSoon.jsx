import { X, FileText, Clock, CheckCircle2, AlertCircle } from 'lucide-react';

const FORM_META = {
  2: {
    title: 'Daily Attendance Report of Learners',
    replaces: 'Form 1, Form 2 & STS Form 4 - Absenteeism and Dropout Profile',
    description: 'Monthly attendance tracker per learner per school day (M/T/W/TH/F). Auto-computes total absent, tardy, ADA, and dropout/transfer counts.',
    needed: [
      'Daily attendance records per student per school day',
      'School calendar (number of school days per month)',
      'Monthly attendance entry UI (click to mark Absent / Tardy per student per day)',
    ],
    color: '#1d4ed8',
    bg: 'rgba(29,78,216,0.08)',
  },
  3: {
    title: 'Books Issued and Returned',
    replaces: 'Form 1 & Inventory of Textbooks',
    description: 'Tracks textbook issuance and return per learner per subject. Up to 8 subject columns with Issued / Returned dates.',
    needed: [
      'Book issuance records (manual entry per student per subject)',
      'Subject Area & Title for each textbook',
      'Issued date and Returned date per book per student',
    ],
    color: '#7c3aed',
    bg: 'rgba(124,58,237,0.08)',
  },
  4: {
    title: "Monthly Learner's Movement and Attendance",
    replaces: 'Form 3 & STS Form 4-Absenteeism and Dropout Profile',
    description: 'School-level monthly roll-up of attendance from SF2. Shows registered learners, daily average, dropout, transfer in/out — by grade level and section.',
    needed: [
      'SF2 (Daily Attendance) data must be completed first',
      'Monthly summaries from all section advisers',
      'School-head level access to aggregate across all sections',
    ],
    color: '#0891b2',
    bg: 'rgba(8,145,178,0.08)',
  },
  6: {
    title: 'Summarized Report on Promotion and Level of Proficiency',
    replaces: 'Form 20',
    description: 'School-level aggregate of all SF5 forms. Shows Promoted / Irregular / Retained and Level of Proficiency counts across all grade levels.',
    needed: [
      'SF5 (Promotion Report) must be completed for ALL sections',
      'School-head level access to aggregate across all classes',
      'Final annual grades for all learners in the school',
    ],
    color: '#d97706',
    bg: 'rgba(217,119,6,0.08)',
  },
  7: {
    title: 'School Personnel Assignment List and Basic Profile',
    replaces: 'Form 12, Form 19, Form 29, Form 31',
    description: 'Complete teacher roster with educational qualifications, subject assignments, daily program schedule, and appointment details.',
    needed: [
      'Teacher profile: Employee No. / TIN, Sex, Fund Source, Position',
      'Educational qualification: Degree, Major/Specialization, Minor',
      'Nature of appointment (Permanent, Temporary, Contractual, etc.)',
      'Daily schedule: Teaching days, From/To times, Total minutes/week',
    ],
    color: '#059669',
    bg: 'rgba(5,150,105,0.08)',
  },
  8: {
    title: 'Health and Nutrition Report',
    replaces: 'Health & Nutrition data form',
    description: 'Per-student BMI tracking with WHO BMI-for-Age classification (Severely Wasted / Wasted / Normal / Overweight / Obese). Auto-computed from height and weight inputs.',
    needed: [
      'Height (cm) per student — manual entry at start and end of school year',
      'Weight (kg) per student — manual entry',
      'WHO BMI-for-Age reference table for auto-classification',
    ],
    color: '#dc2626',
    bg: 'rgba(220,38,38,0.08)',
  },
  9: {
    title: 'Learner\'s Progress Report Card',
    replaces: 'Quarterly Report Card',
    description: 'The quarterly report card issued to parents. Shows per-subject quarterly grades (Q1–Q4), MAPEH sub-components (Music/Arts/PE/Health), Core Values ratings (AO/SO/RO/NO), and monthly attendance.',
    needed: [
      'Quarterly grades per subject per learner (Q1, Q2, Q3, Q4 separately)',
      'MAPEH sub-grades: Music, Arts, Physical Education, Health — each quarterly',
      'Core Values ratings (AO/SO/RO/NO) per quarter per behavior statement',
      'Monthly attendance data from SF2',
    ],
    color: '#db2777',
    bg: 'rgba(219,39,119,0.08)',
  },
  10: {
    title: 'School Learner\'s Permanent Academic Record',
    replaces: 'Form 137',
    description: 'Permanent cumulative record across Grade 7–10 (or applicable levels). Stacks yearly SF9 data. Includes remedial class marks and recomputed final grades.',
    needed: [
      'SF9 (Report Card) data for all four years (Grade 7 through Grade 10)',
      'Remedial class records (if any): subject, original grade, remedial mark',
      'Student personal info: LRN, Name Extension, Elementary credentials',
      'Accumulated attendance across all school years',
    ],
    color: '#6b7280',
    bg: 'rgba(107,114,128,0.08)',
  },
};

export default function SFComingSoon({ formNumber, onClose }) {
  const meta = FORM_META[formNumber];
  if (!meta) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(3px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{
        background: '#fff', borderRadius: 18, width: '100%', maxWidth: 560,
        overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.2)',
      }}>
        {/* Header */}
        <div style={{
          background: meta.bg, borderBottom: `2px solid ${meta.color}20`,
          padding: '18px 22px', display: 'flex', alignItems: 'flex-start', gap: 12,
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10, flexShrink: 0,
            background: meta.bg, border: `1.5px solid ${meta.color}40`,
            display: 'grid', placeItems: 'center',
          }}>
            <FileText size={18} color={meta.color} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: 10, fontWeight: 800, color: meta.color, textTransform: 'uppercase', letterSpacing: '1px' }}>
              School Form {formNumber}
            </p>
            <p style={{ margin: '3px 0 0', fontSize: 15, fontWeight: 700, color: '#0d2218', lineHeight: 1.3 }}>
              {meta.title}
            </p>
            <p style={{ margin: '4px 0 0', fontSize: 11, color: '#6b7280', fontStyle: 'italic' }}>
              (This replaces {meta.replaces})
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'rgba(0,0,0,0.06)', border: 'none', borderRadius: 8, width: 28, height: 28, cursor: 'pointer', display: 'grid', placeItems: 'center', color: '#6b7280', flexShrink: 0 }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 22px' }}>
          {/* Coming soon badge */}
          <div style={{
            background: '#fef9c3', border: '1px solid #fbbf24',
            borderRadius: 10, padding: '10px 14px', marginBottom: 18,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <Clock size={16} color="#d97706" style={{ flexShrink: 0 }} />
            <div>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: '#92400e' }}>Coming Soon</p>
              <p style={{ margin: 0, fontSize: 12, color: '#92400e', marginTop: 2 }}>{meta.description}</p>
            </div>
          </div>

          {/* Data requirements */}
          <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: '#374151' }}>
            Required before this form can be generated:
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {meta.needed.map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <AlertCircle size={14} color="#f59e0b" style={{ flexShrink: 0, marginTop: 1 }} />
                <span style={{ fontSize: 12, color: '#4b5563', lineHeight: 1.5 }}>{item}</span>
              </div>
            ))}
          </div>

          {/* What's available now */}
          <div style={{ marginTop: 18, padding: '12px 14px', background: '#f0fdf4', borderRadius: 10, border: '1px solid rgba(34,197,94,0.2)' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
              <CheckCircle2 size={14} color="#16a34a" />
              <span style={{ fontSize: 12, fontWeight: 700, color: '#15803d' }}>What's available now</span>
            </div>
            <p style={{ margin: 0, fontSize: 11, color: '#166534' }}>
              Student roster (names, LRN, gender) is auto-populated from your class. Once the required data is collected and entered, this form will generate instantly with proper DepEd formatting.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 22px', borderTop: '1px solid #f3f4f6', textAlign: 'right' }}>
          <button
            onClick={onClose}
            style={{
              background: '#1a3d2b', color: '#fff', border: 'none', borderRadius: 9,
              padding: '9px 22px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
