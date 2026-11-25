/**
 * templates.js — ready-made routines for the DepEd school year (Routines › Ready-made).
 *
 * "Use this" makes the teacher's own copy, switched off. Files and folders are left for the
 * teacher to choose (KaTuro never guesses which file is the SF2 or which record is the class);
 * the Builder lists exactly what to choose ("File is needed"), then the routine can be switched on.
 */
import { cleanRoutine, newId } from './routine.js';

const row = (items) => {
  const cards = items.map(([type, settings = {}]) => ({ id: newId('c'), type, settings }));
  return { cards, wires: cards.slice(1).map((c, i) => ({ from: cards[i].id, to: c.id })) };
};

export const TEMPLATES = [
  {
    id: 'friday-attendance',
    name: { en: 'Friday attendance wrap-up', fil: 'Pagsusuri ng attendance tuwing Biyernes' },
    about: { en: 'Every Friday at 3 PM: checks your SF2 for learners absent 3 days in a row and makes Home Visitation Notices.', fil: 'Tuwing Biyernes, 3 PM: sinusuri ang SF2 mo para sa mga lumiban nang 3 araw na sunod-sunod at gumagawa ng Home Visitation Notice.' },
    choose: { en: 'Choose your SF2 file.', fil: 'Piliin ang SF2 file mo.' },
    make: () => row([
      ['when.schedule', { repeat: 'weekly', weekdays: [5], time: '15:00' }],
      ['get.sheet', {}],
      ['do.attendance', { minConsecutive: 3 }],
      ['save.notify', {}],
    ]),
  },
  {
    id: 'answer-sheet-photos',
    name: { en: 'New answer-sheet photos → scores', fil: 'Bagong litrato ng answer sheet → iskor' },
    about: { en: 'When photos of answer sheets arrive in a folder (from the KaTuro App or a scanner), checks them with your answer key, asks you first, then types the scores into your class record.', fil: 'Kapag may dumating na litrato ng answer sheet sa isang folder (mula sa KaTuro App o scanner), tsine-check ito gamit ang answer key mo, itatanong muna sa iyo, saka itatype ang iskor sa class record mo.' },
    choose: { en: 'Choose the photos folder, the answer key, your class record and the column.', fil: 'Piliin ang folder ng litrato, ang answer key, ang class record mo at ang column.' },
    make: () => row([
      ['when.newFiles', { what: 'photos' }],
      ['do.checkPapers', {}],
      ['ask.approve', { note: 'Check the scores before they go into the class record.' }],
      ['do.typeScores', {}],
      ['save.notify', {}],
    ]),
  },
  {
    id: 'end-of-term',
    name: { en: 'End of term: grades → check for mistakes', fil: 'Katapusan ng term: grado → suriin kung may mali' },
    about: { en: '5 days before each term ends (DepEd calendar): computes the grades by the DepEd weights into an E-Class Record, then checks it for mistakes before you submit.', fil: '5 araw bago matapos ang bawat term (DepEd calendar): kinokompyut ang grado ayon sa DepEd weights sa isang E-Class Record, saka sinusuri kung may mali bago mo ipasa.' },
    choose: { en: 'Choose your score sheet and type the subject.', fil: 'Piliin ang score sheet mo at i-type ang asignatura.' },
    make: () => row([
      ['when.deped', { event: 'termEnd', offsetDays: -5, time: '07:00' }],
      ['get.sheet', {}],
      ['do.classGrades', {}],
      ['do.checkGrades'],
      ['save.notify', {}],
    ]),
  },
  {
    id: 'adviser-sf9',
    name: { en: 'Adviser: SF9 report cards → submission pack', fil: 'Adviser: SF9 report card → submission pack' },
    about: { en: '3 days before each term ends: makes the SF9 report cards of your section from the subject teachers\' class records in one folder, then one PDF ready to submit.', fil: '3 araw bago matapos ang bawat term: gumagawa ng SF9 report card ng seksyon mo mula sa mga class record ng subject teacher sa isang folder, saka isang PDF na handa nang ipasa.' },
    choose: { en: 'Choose the folder with the subject teachers\' class records.', fil: 'Piliin ang folder ng mga class record ng subject teacher.' },
    make: () => row([
      ['when.deped', { event: 'termEnd', offsetDays: -3, time: '07:00' }],
      ['get.folder', {}],
      ['do.reportCards', {}],
      ['do.submissionPack', { title: 'Learner\'s Progress Reports (SF9)' }],
      ['save.notify', {}],
    ]),
  },
  {
    id: 'phil-iri',
    name: { en: 'Phil-IRI reading levels', fil: 'Antas ng pagbasa (Phil-IRI)' },
    about: { en: 'Scores your class\'s oral reading results (BOSY or EOSY): each learner\'s level and who needs reading help.', fil: 'Iniiskor ang resulta ng oral reading ng klase (BOSY o EOSY): antas ng bawat mag-aaral at sino ang kailangang tulungan.' },
    choose: { en: 'Choose the reading results sheet; add the number of words and questions.', fil: 'Piliin ang sheet ng resulta; ilagay ang bilang ng salita at tanong.' },
    make: () => row([
      ['when.manual'],
      ['get.sheet', {}],
      ['do.reading', {}],
      ['save.notify', {}],
    ]),
  },
  {
    id: 'item-analysis',
    name: { en: 'Item analysis + remedial slips', fil: 'Item analysis + remedial slip' },
    about: { en: 'After a quiz: item analysis (MPS, least mastered skills) and remedial slips for the learners who need them.', fil: 'Pagkatapos ng quiz: item analysis (MPS, pinakamahinang kasanayan) at remedial slip para sa mga mag-aaral na kailangan nito.' },
    choose: { en: 'Choose the quiz score sheet.', fil: 'Piliin ang score sheet ng quiz.' },
    make: () => row([
      ['when.manual'],
      ['get.sheet', {}],
      ['do.itemAnalysis', { remedial: 'yes' }],
      ['save.notify', {}],
    ]),
  },
  {
    id: 'month-end-sf2',
    name: { en: 'Month-end attendance summary', fil: 'Buod ng attendance sa katapusan ng buwan' },
    about: { en: 'On the 28th of every month: combines the attendance sheets in a folder into one Excel and a PDF for the school head.', fil: 'Tuwing ika-28 ng buwan: pinagsasama ang mga attendance sheet sa isang folder sa isang Excel at PDF para sa school head.' },
    choose: { en: 'Choose the folder with your attendance sheets.', fil: 'Piliin ang folder ng mga attendance sheet mo.' },
    make: () => row([
      ['when.schedule', { repeat: 'monthly', dayOfMonth: 28, time: '16:00' }],
      ['get.folder', {}],
      ['do.consolidate', { title: 'Monthly attendance' }],
      ['do.submissionPack', { title: 'Monthly attendance' }],
      ['save.notify', {}],
    ]),
  },
  {
    id: 'weekly-dll',
    name: { en: 'Friday: next week\'s DLL draft', fil: 'Biyernes: draft ng DLL sa susunod na linggo' },
    about: { en: 'Every Friday at 4 PM: a Daily Lesson Log draft for next week, saved in Lessons for you to check. Change the topic each week.', fil: 'Tuwing Biyernes, 4 PM: draft ng Daily Lesson Log para sa susunod na linggo, naka-save sa Lessons para suriin mo. Palitan ang paksa bawat linggo.' },
    choose: { en: 'Type the subject, grade and topic.', fil: 'I-type ang asignatura, baitang at paksa.' },
    make: () => row([
      ['when.schedule', { repeat: 'weekly', weekdays: [5], time: '16:00' }],
      ['do.dll', {}],
      ['save.notify', {}],
    ]),
  },
];

/** The teacher's own copy of a ready-made routine (switched off). */
export function fromTemplate(id, lang = 'en') {
  const t = TEMPLATES.find((x) => x.id === id);
  if (!t) throw new Error('That ready-made routine is not there.');
  const { cards, wires } = t.make();
  return cleanRoutine({ name: t.name[lang] || t.name.en, enabled: false, cards, wires }).routine;
}
