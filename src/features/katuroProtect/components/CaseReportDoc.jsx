// Printable Child Protection Case Report — the hidden content that
// CaseDetail's Export button rasterizes into an A4 PDF via html2canvas +
// jsPDF (same technique as SF1Form/SF5Form). Signatory block follows the
// same three-tier "Prepared by / Received by / Noted by" convention already
// used for SF5 in this app, filled with the roles DepEd Order No. 40, s. 2012
// assigns to a school-level Child Protection Committee case: the reporting
// class adviser, the Guidance Designate who receives it, and the School Head
// who chairs the CPC ex officio.
import { CASE_STATE_LABELS } from '../types';

const PAGE_W = 794; // A4 @ 96dpi, portrait — keeps the printable div's aspect ratio honestly A4

function ts(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-PH', { month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function dateOnly(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' });
}

const SECTION_TITLE = { margin: '0 0 8px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#0d2218', borderBottom: '1.5px solid #000', paddingBottom: 4 };
const LABEL = { fontSize: 8.5, fontWeight: 700, color: '#4a6357', textTransform: 'uppercase', letterSpacing: '0.04em' };
const VALUE = { fontSize: 11, color: '#000', marginTop: 2 };
const SECTION = { marginBottom: 16 };

function Field({ label, value, span }) {
  return (
    <div style={{ gridColumn: span ? '1 / -1' : 'auto' }}>
      <div style={LABEL}>{label}</div>
      <div style={VALUE}>{value || '—'}</div>
    </div>
  );
}

function DepEdMark() {
  return (
    <div style={{ width: 58, height: 58, border: '1.5px solid #000', borderRadius: '50%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <div style={{ fontSize: 7.5, fontWeight: 'bold', textAlign: 'center', lineHeight: 1.2 }}>
        <div>DepEd</div>
        <div style={{ fontSize: 5.5, fontWeight: 'normal' }}>Republic of the</div>
        <div style={{ fontSize: 5.5, fontWeight: 'normal' }}>Philippines</div>
      </div>
    </div>
  );
}

export default function CaseReportDoc({ caseData, schoolProfile }) {
  const sp = schoolProfile || {};
  const intake = caseData.intake || {};
  const c = intake.complainant || {};
  const r = intake.respondent || {};
  const receivedBy = intake.received_by || {};
  const timeline = caseData.timeline || [];

  return (
    <div style={{
      width: PAGE_W, minHeight: 1123, boxSizing: 'border-box',
      padding: '68px 64px', fontFamily: 'Arial, sans-serif', color: '#000', background: '#fff',
      lineHeight: 1.55,
    }}>
      {/* Letterhead */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 6 }}>
        <DepEdMark />
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 10, letterSpacing: '0.03em' }}>Republic of the Philippines</div>
          <div style={{ fontSize: 12, fontWeight: 700 }}>DEPARTMENT OF EDUCATION</div>
          <div style={{ fontSize: 9.5 }}>{[sp.region, sp.division].filter(Boolean).join(' · ') || 'Region · Division'}</div>
          <div style={{ fontSize: 11, fontWeight: 700, marginTop: 2 }}>{sp.schoolName || 'School Name'}</div>
        </div>
        <div style={{ width: 58 }} />
      </div>

      <div style={{ textAlign: 'center', margin: '18px 0 22px' }}>
        <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '0.02em' }}>CHILD PROTECTION CASE REPORT</div>
        <div style={{ fontSize: 9.5, fontStyle: 'italic', color: '#333', marginTop: 3 }}>
          Initial Case Intake &amp; Documentation — Child Protection Committee (DepEd Order No. 40, s. 2012)
        </div>
      </div>

      {/* Case meta strip */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, marginBottom: 20, borderTop: '1px solid #000', borderBottom: '1px solid #000', padding: '5px 0' }}>
        <span><strong>Case No.:</strong> {caseData.id.slice(0, 8).toUpperCase()}</span>
        <span><strong>Status:</strong> {CASE_STATE_LABELS[caseData.state] || caseData.state}</span>
        <span><strong>Date Generated:</strong> {dateOnly(new Date().toISOString())}</span>
      </div>

      {/* Incident basics */}
      <div style={SECTION}>
        <h4 style={SECTION_TITLE}>I. Incident Basics</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px 16px' }}>
          <Field label="Date of Incident" value={dateOnly(intake.date_of_incident)} />
          <Field label="Time" value={intake.time} />
          <Field label="Date Reported" value={dateOnly(intake.date_reported)} />
          <Field label="Location" value={intake.location} span />
          <Field label="Reporter Role" value={intake.reporter_role} />
          <Field label="Filed By (Class Adviser)" value={receivedBy.name} />
        </div>
      </div>

      {/* Parties */}
      <div style={SECTION}>
        <h4 style={SECTION_TITLE}>II. Parties Involved</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px' }}>
          <Field label="Complainant" value={c.code_name} />
          <Field label="Respondent" value={r.code_name} />
          <Field label="Complainant Grade/Section" value={c.grade_section} />
          <Field label="Respondent Grade/Section or Position" value={r.grade_section_or_position} />
          <Field label="Complainant Role" value={c.role} />
          <Field label="Respondent Role" value={r.role} />
        </div>
      </div>

      {/* Modality */}
      <div style={SECTION}>
        <h4 style={SECTION_TITLE}>III. Modality</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px' }}>
          <Field label="Modality" value={(intake.modality || []).join(', ')} />
          <Field label="Repeated / Pattern" value={intake.repeated_or_pattern ? 'Yes' : 'No'} />
        </div>
      </div>

      {/* Narrative */}
      <div style={SECTION}>
        <h4 style={SECTION_TITLE}>IV. Incident Narrative</h4>
        <p style={{ fontSize: 11, whiteSpace: 'pre-wrap', margin: '0 0 0 4px', textAlign: 'justify' }}>{intake.incident_narrative || '—'}</p>
      </div>

      {/* Evidence */}
      <div style={SECTION}>
        <h4 style={SECTION_TITLE}>V. Evidence Available</h4>
        {(intake.evidence || []).length > 0 ? (
          <ul style={{ margin: '0 0 0 20px', padding: 0, fontSize: 11 }}>
            {intake.evidence.map((ev) => <li key={ev} style={{ marginBottom: 2 }}>{ev.replace(/_/g, ' ')}</li>)}
          </ul>
        ) : <p style={{ fontSize: 11, margin: '0 0 0 4px' }}>None listed.</p>}
      </div>

      {/* Immediate actions */}
      <div style={SECTION}>
        <h4 style={SECTION_TITLE}>VI. Immediate Actions Taken</h4>
        <p style={{ fontSize: 11, whiteSpace: 'pre-wrap', margin: '0 0 0 4px', textAlign: 'justify' }}>{intake.immediate_actions_taken || '—'}</p>
      </div>

      {/* Timeline */}
      <div style={SECTION}>
        <h4 style={SECTION_TITLE}>VII. Case Timeline</h4>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
          <tbody>
            {timeline.length > 0 ? timeline.map((entry, i) => (
              <tr key={i}>
                <td style={{ padding: '3px 8px 3px 4px', width: 160, color: '#4a6357', verticalAlign: 'top' }}>{ts(entry.at)}</td>
                <td style={{ padding: '3px 4px', verticalAlign: 'top' }}>
                  {entry.state && <strong>{CASE_STATE_LABELS[entry.state] || entry.state}</strong>}
                  {entry.state && entry.note ? ' — ' : ''}{!entry.state ? entry.note : entry.note}
                </td>
              </tr>
            )) : (
              <tr><td style={{ padding: '3px 4px', color: '#4a6357' }}>No timeline entries yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Signatories */}
      <div style={{ marginTop: 34, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 18, fontSize: 9.5 }}>
        <div>
          <div style={{ fontWeight: 700, marginBottom: 30 }}>PREPARED / REPORTED BY:</div>
          <div style={{ borderTop: '1px solid #000', paddingTop: 4 }}>{receivedBy.name || ' '}</div>
          <div style={{ color: '#4a6357' }}>Class Adviser</div>
        </div>
        <div>
          <div style={{ fontWeight: 700, marginBottom: 30 }}>RECEIVED BY:</div>
          <div style={{ borderTop: '1px solid #000', paddingTop: 4 }}>&nbsp;</div>
          <div style={{ color: '#4a6357' }}>Guidance Designate</div>
        </div>
        <div>
          <div style={{ fontWeight: 700, marginBottom: 30 }}>NOTED BY:</div>
          <div style={{ borderTop: '1px solid #000', paddingTop: 4 }}>&nbsp;</div>
          <div style={{ color: '#4a6357' }}>School Head, CPC Chairperson</div>
        </div>
      </div>

      <p style={{ marginTop: 30, fontSize: 8, color: '#666', textAlign: 'center', borderTop: '1px solid #ccc', paddingTop: 8 }}>
        Generated via kaTuro Protect — decision-support and case documentation tool. This report is not legal advice
        and does not replace the judgment of the Child Protection Committee, guidance counselor, or legal counsel.
        All disciplinary actions require due process.
      </p>
    </div>
  );
}
