/**
 * depedTemplates.js — pure DocumentSpec builders for common DepEd documents.
 * No AI, no IO: numbers come in already computed (see depedGrading.js).
 */

import { normalizeDocumentSpec } from '../docSpec.js';
import { gradeDescriptor, round2 } from '../depedGrading.js';
import { answerLabel } from './shared.js';

const s = (v) => (v === null || v === undefined ? '' : String(v));
const fmt = (n) => (n === null || n === undefined || n === '' || Number.isNaN(Number(n)) ? '' : String(round2(n)));
const today = () => new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' });

const headerFrom = (meta = {}) => ({ deped: true, region: meta.region, division: meta.division, school: meta.school || meta.schoolName });

// ── Item analysis report ─────────────────────────────────────────────────────

export function itemAnalysisReportSpec(analysis, meta = {}, { remarks = [], interventions = [] } = {}) {
  const a = analysis || {};
  const items = a.items || [];
  const lmc = a.leastMastered || items.filter((it) => it.isLeastMastered);
  const blocks = [
    { type: 'heading', level: 2, text: 'Summary of Results' },
    {
      type: 'paragraph',
      text: `A total of **${a.examinees ?? 0}** learners took the ${a.itemCount ?? items.length}-item test. The class obtained a mean score of **${fmt(a.mean)}** (SD = ${fmt(a.standardDeviation)}), a highest score of ${a.highest ?? 0} and a lowest score of ${a.lowest ?? 0}. The Mean Percentage Score (MPS) is **${fmt(a.mps)}%**, interpreted as **${s(a.masteryLevel)}**.`,
    },
    { type: 'heading', level: 2, text: 'Item Analysis' },
    {
      type: 'table',
      columns: ['No.', 'Competency', 'Correct', '%', 'Difficulty', 'Discrimination', 'Mastery'],
      widths: [0.6, 3.4, 0.9, 0.9, 1.3, 1.6, 1.8],
      rows: items.map((it) => [
        s(it.number), s(it.competency) || '—', s(it.correct), fmt(it.percentCorrect),
        s(it.difficultyLabel), it.discrimination === null || it.discrimination === undefined ? '—' : `${fmt(it.discrimination)} ${s(it.discriminationLabel)}`.trim(), s(it.mastery),
      ]),
    },
    { type: 'heading', level: 2, text: 'Least Mastered Competencies' },
  ];
  if (lmc.length) {
    blocks.push({
      type: 'paragraph',
      text: `Items with less than ${a.lmcThreshold ?? 75}% of learners answering correctly are considered least mastered.`,
    });
    blocks.push({
      type: 'table',
      columns: ['Item No.', 'Competency', '% Correct', 'Mastery Level'],
      widths: [0.9, 4.5, 1.1, 2.2],
      rows: lmc.map((it) => [s(it.number), s(it.competency) || '—', fmt(it.percentCorrect), s(it.mastery)]),
    });
  } else {
    blocks.push({ type: 'paragraph', text: `All items reached the ${a.lmcThreshold ?? 75}% mastery threshold.` });
  }
  if (remarks.length) blocks.push({ type: 'heading', level: 2, text: 'Remarks' }, { type: 'bullets', items: remarks.map(s) });
  if (interventions.length) blocks.push({ type: 'heading', level: 2, text: 'Proposed Interventions' }, { type: 'bullets', items: interventions.map(s) });

  return normalizeDocumentSpec({
    title: 'Item Analysis and Least Mastered Competencies Report',
    header: headerFrom(meta),
    meta: [
      { label: 'School', value: meta.school },
      { label: 'Learning Area', value: meta.subject },
      { label: 'Grade & Section', value: meta.gradeSection },
      { label: 'Quarter', value: meta.quarter },
      { label: 'Test', value: meta.testTitle },
      { label: 'Date', value: meta.date || today() },
      { label: 'No. of Examinees', value: s(a.examinees ?? 0) },
      { label: 'No. of Items', value: s(a.itemCount ?? items.length) },
    ],
    blocks,
    signatures: [
      { label: 'Prepared by:', name: meta.teacher, role: meta.teacherRole || 'Subject Teacher' },
      { label: 'Checked by:', name: meta.checkedBy, role: meta.checkedByRole || 'Master Teacher / Head Teacher' },
      { label: 'Noted by:', name: meta.notedBy, role: meta.notedByRole || 'School Head' },
    ],
  });
}

// ── Remedial slips (2-up) ────────────────────────────────────────────────────

function slipBlocks(meta, title, competency, instructions, items) {
  const head = [meta.school && `School: ${meta.school}`, meta.subject && `Learning Area: ${meta.subject}`, meta.gradeSection && `Grade & Section: ${meta.gradeSection}`]
    .filter(Boolean).join('   |   ');
  const blocks = [];
  if (head) blocks.push({ type: 'paragraph', text: head });
  blocks.push({ type: 'paragraph', text: 'Name: ______________________________________   Date: ________________   Score: ______' });
  blocks.push({ type: 'heading', level: 2, text: title });
  if (competency) blocks.push({ type: 'paragraph', text: `**Competency:** ${competency}` });
  if (instructions) blocks.push({ type: 'paragraph', text: `**Directions:** ${instructions}` });
  blocks.push({ type: 'questions', items: items.map((q) => ({ question: q.question, ...(q.choices?.length ? { choices: q.choices } : {}) })), showAnswers: false });
  return blocks;
}

function repeated(slip, copies) {
  const out = [];
  for (let i = 0; i < copies; i++) {
    if (i > 0) out.push({ type: 'cutLine' });
    out.push(...slip);
  }
  return out;
}

export function remedialSlipsSpec({ meta = {}, practice = {}, retest = {}, copiesPerPage = 2 } = {}) {
  const copies = Math.max(1, Math.min(4, Number(copiesPerPage) || 2));
  const pItems = (practice.items || []).filter((q) => q && s(q.question).trim());
  const rItems = (retest.items || []).filter((q) => q && s(q.question).trim());
  const blocks = [];
  if (pItems.length) {
    blocks.push(...repeated(slipBlocks(meta, practice.title || 'Remedial Practice Slip', practice.competency, practice.instructions, pItems), copies));
  }
  if (rItems.length) {
    if (blocks.length) blocks.push({ type: 'pageBreak' });
    blocks.push(...repeated(slipBlocks(meta, retest.title || '5-Item Quick Re-test', practice.competency, retest.instructions || 'Choose the letter of the correct answer.', rItems), copies));
  }
  const keyRows = [];
  const max = Math.max(pItems.length, rItems.length);
  for (let i = 0; i < max; i++) keyRows.push([String(i + 1), pItems[i] ? answerLabel(pItems[i]) || '—' : '', rItems[i] ? answerLabel(rItems[i]) || '—' : '']);
  if (max) {
    blocks.push(
      { type: 'pageBreak' },
      { type: 'heading', level: 1, text: 'Answer Key (for the teacher)' },
      { type: 'table', columns: ['No.', 'Remedial Practice', 'Quick Re-test'], widths: [0.6, 2, 2], rows: keyRows },
    );
  }
  return normalizeDocumentSpec({
    title: practice.title || 'Remedial Practice Slips',
    subtitle: [meta.subject, meta.gradeSection, practice.competency].filter(Boolean).join(' · ') || undefined,
    header: null,
    hideTitle: true,
    blocks,
  });
}

// ── Home visitation notice (Filipino + English) ──────────────────────────────

export function homeVisitationNoticeSpec({
  learnerName = '', parentName = '', gradeSection = '', absences = '', dates = [], schedule = '', teacherName = '', schoolName = '', date = '', region, division,
} = {}) {
  const dateList = (Array.isArray(dates) ? dates : [dates]).map(s).filter(Boolean).join(', ');
  const parent = parentName || 'Magulang/Tagapag-alaga';
  const abs = s(absences) || '___';
  const sched = s(schedule) || '______________________';
  return normalizeDocumentSpec({
    title: 'Paunawa sa Pagbisita sa Tahanan',
    subtitle: 'Home Visitation Notice',
    header: { deped: true, region, division, school: schoolName },
    blocks: [
      { type: 'paragraph', text: date || today() },
      { type: 'paragraph', text: `**${parentName || 'G./Gng. ______________________'}**` },
      { type: 'paragraph', text: `Magulang/Tagapag-alaga ni ${learnerName}` },
      { type: 'paragraph', text: `Mahal na ${parent}:` },
      {
        type: 'paragraph',
        text: `Magandang araw po! Nais po naming ipaalam na ang inyong anak na si **${learnerName}** ng ${gradeSection} ay lumiban sa klase nang **${abs} araw**${dateList ? ` (${dateList})` : ''}. Upang matulungan siyang makahabol sa mga aralin, magsasagawa po ang inyong anak na guro ng pagbisita sa inyong tahanan sa **${sched}**. Kung hindi po kayo available sa nasabing petsa, mangyari pong ipaalam sa amin sa pamamagitan ng ibabang slip.`,
      },
      {
        type: 'paragraph',
        text: `**English translation:** Good day! We would like to inform you that your child, **${learnerName}** of ${gradeSection}, has been absent from class for **${abs} day(s)**${dateList ? ` (${dateList})` : ''}. To help your child catch up with the lessons, the class adviser will conduct a home visit on **${sched}**. If you are not available on that date, kindly let us know using the slip below.`,
      },
      { type: 'paragraph', text: 'Maraming salamat po sa inyong suporta. / Thank you very much for your support.' },
      { type: 'paragraph', text: 'Lubos na gumagalang, / Respectfully yours,' },
      { type: 'paragraph', text: `**${s(teacherName).toUpperCase() || '______________________'}**` },
      { type: 'paragraph', text: 'Gurong Tagapayo / Class Adviser' },
      { type: 'cutLine' },
      { type: 'heading', level: 3, text: 'Katibayan ng Pagtanggap / Acknowledgment Slip' },
      {
        type: 'paragraph',
        text: `Natanggap ko ang paunawa tungkol sa pagliban ng aking anak na si **${learnerName}** (${gradeSection}) at ang nakatakdang pagbisita sa aming tahanan. / I received the notice about my child's absences and the scheduled home visit.`,
      },
      { type: 'paragraph', text: '[  ] Available po ako sa nakatakdang petsa. / I am available on the scheduled date.' },
      { type: 'paragraph', text: '[  ] Hindi po ako available. Mas mainam na petsa/oras: / I am not available. Preferred date/time:' },
      { type: 'answerLines', count: 1 },
      { type: 'paragraph', text: 'Contact No.: ____________________' },
    ],
    signatures: [{ label: 'Lagda ng Magulang / Parent\'s Signature', name: parentName, role: 'Magulang/Tagapag-alaga · Parent/Guardian' }],
  });
}

// ── Class record summary ─────────────────────────────────────────────────────

const pick = (row, flat, key) => row?.[flat] ?? row?.components?.[key]?.ps;

export function classRecordSummarySpec({ meta = {}, rows = [] } = {}) {
  return normalizeDocumentSpec({
    title: 'Summary of Quarterly Grades',
    header: headerFrom(meta),
    meta: [
      { label: 'Learning Area', value: meta.subject },
      { label: 'Grade & Section', value: meta.gradeSection },
      { label: 'Quarter', value: meta.quarter },
      { label: 'School Year', value: meta.schoolYear },
    ],
    blocks: [{
      type: 'table',
      columns: ['No.', "Learner's Name", 'WW PS', 'PT PS', 'QA PS', 'Initial Grade', 'Quarterly Grade', 'Descriptor'],
      widths: [0.5, 3.2, 0.9, 0.9, 0.9, 1, 1.1, 1.9],
      rows: rows.map((r, i) => {
        const qg = r.quarterlyGrade ?? r.grade;
        return [
          String(i + 1), s(r.name), fmt(pick(r, 'wwPs', 'ww')), fmt(pick(r, 'ptPs', 'pt')), fmt(pick(r, 'qaPs', 'qa')),
          fmt(r.initialGrade), s(qg ?? ''), s(r.descriptor || (qg !== undefined && qg !== null && qg !== '' ? gradeDescriptor(qg) : '')),
        ];
      }),
    }],
    signatures: [
      { label: 'Prepared by:', name: meta.teacher, role: 'Subject Teacher' },
      { label: 'Noted by:', name: meta.notedBy, role: 'School Head' },
    ],
  });
}
