/**
 * fastRoute.js — answers or routes obvious requests WITHOUT the planner AI call.
 *
 * The planner costs one full AI round trip (seconds) before any work starts.
 * When a request is unambiguous — a greeting, a quick-prompt button, or a short
 * request whose intent and files are clear — we build the task list in code.
 * Anything uncertain returns null and goes to the planner as before.
 */

import { getPersona } from '../personas.js';

const SHEET = /\.(xlsx|xlsm|xls|csv|tsv)$/i;
const PDF = /\.pdf$/i;
const IMAGE = /\.(png|jpe?g|webp|gif|bmp)$/i;
const DOC = /\.(docx|dotx|pdf|txt|md|pptx)$/i;
const SCORE_SOURCE = (p) => SHEET.test(p) || IMAGE.test(p) || PDF.test(p);
const base = (p) => p.split('/').pop();
const stem = (p) => base(p).replace(/\.[^.]+$/, '');

/** Quick-prompt buttons in the chat. `route` lets fastRoute skip the planner when the text is sent unchanged. */
export const QUICK_PROMPTS = [
  { route: 'item_analysis', label: 'Item Analysis & LMC', prompt: 'Run an item analysis on the attached score sheet. Show the MPS, mastery level, and least mastered competencies.' },
  { route: 'remedial', label: 'Remedial Slips & Re-test', prompt: 'Do an item analysis of the attached score sheet, then make a 1-page remedial practice slip and a 5-item quick re-test for 2-up printing based on the least mastered items.' },
  { route: 'class_record', label: 'e-Class Record', prompt: 'Encode the attached scores into an official DepEd e-Class Record with transmutation.' },
  { route: 'attendance', label: 'Attendance & SARDO', prompt: 'Check the attached attendance sheet for learners with 3 or more consecutive absences and prepare home visitation notices.' },
  { route: 'dll', label: 'DLL from my lesson', prompt: 'Turn the attached lesson file into a complete Daily Lesson Log (Monday to Friday).' },
  { route: 'slides', label: 'Slides from file', prompt: 'Make a PowerPoint presentation from the attached lesson.' },
  { route: 'photo_table', label: 'Photo to Excel', prompt: 'Read the table in the attached photo and turn it into an Excel file I can check.' },
  { route: 'merge_pdfs', label: 'Merge PDFs', prompt: 'Merge the attached PDFs into one file in the order I attached them.' },
];

const GREETING = /^(hi+|hello+|hey+|helo|hellow|yo+|yow|kumusta|musta|kamusta|good\s*(morning|afternoon|evening|day)|magandang\s*(umaga|hapon|gabi|araw))\b[\s,!.]*(po|sir|ma'?am|matt|luna|teacher|katuro)?[\s,!.?😊👋🙂]*$/iu;
const THANKS = /^(thanks?|thank\s*you|ty|salamat|maraming\s*salamat)\b[\s\S]{0,30}$/i;

/** Intent rules for short free-text requests; each needs matching files to be confident. */
const INTENTS = [
  { route: 'remedial', test: /\b(remedia|re-?test|intervention slip)/i, needs: /\b(item analysis|least mastered|lmc|score|quiz|test)\b/i },
  { route: 'item_analysis', test: /\b(item analysis|least mastered|\blmc\b|\bmps\b|mastery level)\b/i },
  { route: 'class_record', test: /\b(e-?class record|class record|\becr\b|transmut)/i },
  { route: 'attendance', test: /\b(attendance|sardo|consecutive absen|home visitation)/i },
  { route: 'merge_pdfs', test: /\b(merge|combine|pagsamahin)\b.*\bpdfs?\b|\bpdfs?\b.*\b(merge|combine)\b/i },
  { route: 'to_pdf', test: /\b(convert|gawing|save|turn)\b.*\b(to|into|as)?\s*pdf\b/i },
  { route: 'compare', test: /\b(compare|cross-?check|ikumpara|differences? between)\b/i },
  { route: 'understand', test: /^(what('?s| is) (this|in this|inside)|ano (ito|ang laman)|read this|basahin)/i },
];

function ack(persona, teacher, what) {
  return getPersona(persona).ack(teacher, what);
}

/**
 * @returns {null | { reply: string, tasks: object[], local?: boolean }}
 *   local: true when no AI call is needed at all (greetings/thanks).
 */
export function fastRoute({ prompt, attachedPaths = [], activePath = null, persona, teacherName = 'Teacher', now = new Date() }) {
  const text = String(prompt || '').trim();
  if (!text) return null;

  if (GREETING.test(text)) return { reply: getPersona(persona).greeting(teacherName, now), tasks: [], local: true };
  if (THANKS.test(text) && text.length <= 40) return { reply: getPersona(persona).thanks(teacherName), tasks: [], local: true };

  const quick = QUICK_PROMPTS.find((q) => q.prompt === text);
  let route = quick?.route || null;
  if (!route) {
    // Free text: only short, single-intent requests are routed in code.
    if (text.length > 140 || /\b(and then|tapos|after that|also|pati|then)\b/i.test(text)) return null;
    const hits = INTENTS.filter((i) => i.test.test(text) && (!i.needs || i.needs.test(text)));
    if (hits.length !== 1 && !(hits.length === 2 && hits[0].route === 'remedial')) return null;
    route = hits[0].route;
  }

  const files = [...new Set(attachedPaths.length ? attachedPaths : activePath ? [activePath] : [])];
  if (!files.length) return null; // the planner asks which file
  const mk = (i, tool, args, label, dependsOn = []) => ({ id: `t${i}`, tool, args, label, dependsOn });

  switch (route) {
    case 'item_analysis': {
      const src = files.filter(SCORE_SOURCE);
      if (src.length !== files.length) return null;
      return { reply: ack(persona, teacherName, src.length > 1 ? `the item analysis for all ${src.length} files` : 'the item analysis'), tasks: src.map((p, i) => mk(i + 1, 'analyze_scores', { path: p }, `Item analysis – ${base(p)}`)) };
    }
    case 'remedial': {
      const src = files.filter(SCORE_SOURCE);
      if (src.length !== files.length) return null;
      const tasks = [];
      src.forEach((p, i) => {
        tasks.push(mk(i * 2 + 1, 'analyze_scores', { path: p }, `Item analysis – ${base(p)}`));
        tasks.push(mk(i * 2 + 2, 'make_remedial_package', {}, `Remedial slips – ${base(p)}`, [`t${i * 2 + 1}`]));
      });
      return { reply: ack(persona, teacherName, 'the item analysis, then the remedial slips and re-test'), tasks };
    }
    case 'class_record': {
      const src = files.filter(SCORE_SOURCE);
      if (src.length !== files.length) return null;
      return { reply: ack(persona, teacherName, 'your e-Class Record'), tasks: src.map((p, i) => mk(i + 1, 'make_class_record', { path: p }, `e-Class Record – ${base(p)}`)) };
    }
    case 'attendance': {
      const src = files.filter(SCORE_SOURCE);
      if (src.length !== files.length) return null;
      return { reply: ack(persona, teacherName, 'the attendance check'), tasks: src.map((p, i) => mk(i + 1, 'check_attendance', { path: p }, `Attendance check – ${base(p)}`)) };
    }
    case 'dll': {
      if (files.length !== 1 || !DOC.test(files[0])) return null;
      return { reply: ack(persona, teacherName, 'your Daily Lesson Log'), tasks: [mk(1, 'write_document', { docType: 'dll', title: `Daily Lesson Log – ${stem(files[0])}`, instructions: text, sourcePaths: files }, 'Write the DLL')] };
    }
    case 'slides': {
      if (files.length !== 1 || !DOC.test(files[0])) return null;
      return { reply: ack(persona, teacherName, 'your slides'), tasks: [mk(1, 'make_slides', { topic: stem(files[0]).replace(/[_-]+/g, ' '), instructions: text, sourcePaths: files }, 'Make the slides')] };
    }
    case 'photo_table': {
      if (!files.every((p) => IMAGE.test(p) || PDF.test(p))) return null;
      return { reply: ack(persona, teacherName, files.length > 1 ? `the table extraction for ${files.length} files` : 'the table extraction'), tasks: files.map((p, i) => mk(i + 1, 'extract_table', { path: p }, `Read table – ${base(p)}`)) };
    }
    case 'merge_pdfs': {
      if (files.length < 2 || !files.every((p) => PDF.test(p))) return null;
      return { reply: ack(persona, teacherName, `the merge of ${files.length} PDFs`), tasks: [mk(1, 'merge_pdfs', { paths: files }, 'Merge PDFs')] };
    }
    case 'to_pdf': {
      if (!files.every((p) => /\.(docx|png|jpe?g)$/i.test(p))) return null;
      return { reply: ack(persona, teacherName, 'the PDF conversion'), tasks: [mk(1, 'convert_to_pdf', { paths: files }, 'Convert to PDF')] };
    }
    case 'compare': {
      if (files.length !== 2) return null;
      return { reply: ack(persona, teacherName, `the comparison of ${base(files[0])} and ${base(files[1])}`), tasks: [mk(1, 'compare_files', { pathA: files[0], pathB: files[1], instructions: text }, 'Compare files')] };
    }
    case 'understand': {
      if (files.length !== 1) return null;
      return { reply: ack(persona, teacherName, `a read-through of ${base(files[0])}`), tasks: [mk(1, 'understand_file', { path: files[0] }, `Understand ${base(files[0])}`)] };
    }
    default:
      return null;
  }
}
