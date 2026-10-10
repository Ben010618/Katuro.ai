import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useDeskStore, workspaceIdOf } from '../../../store/deskStore';
import { createVirtualWorkspace } from '../../../services/localFileSystem';
import { lessonFor, DEFAULT_SETTINGS } from '../../../services/desk/teaching/teachingDay';

vi.mock('../runChatTurn', () => ({ runChatTurn: vi.fn(async () => ({ status: 'done', content: '**Sure.** Here is a quick idea for your class.', files: [] })) }));

const rizal = { id: 'r', subject: 'Science', grade: 'Grade 7', section: 'Rizal', room: '', days: [1, 2, 3, 4, 5], start: '07:30', end: '08:20', materialsFolder: '' };
const seq = { source: 'typed', items: [{ code: 'A1', text: 'Mixtures and solutions', sessions: 2 }, { code: 'A2', text: 'Separating mixtures', sessions: 1 }], startDate: '2026-10-26', startIndex: 0, startSession: 0 };
const at = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return new Date(2026, 9, 26, h, m).getTime(); }; // Monday Oct 26, 2026

describe('teaching assistant engine (bubble, reminders, after-class)', () => {
  let bubble;
  let notify;
  let actionListener;
  let presenting;
  let stop;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(at('07:19'));
    bubble = [];
    notify = [];
    presenting = false;
    globalThis.document = { addEventListener: () => {}, removeEventListener: () => {} };
    globalThis.window = {
      location: { href: 'file:///C:/KaTuroDesk/dist/index.html' },
      katuroDeskApi: {
        setBubble: async (s) => { bubble.push(s); return true; },
        onBubbleAction: (cb) => { actionListener = cb; return () => {}; },
        isPresenting: async () => presenting,
        notify: async (t, b) => { notify.push([t, b]); },
        showWindow: async () => {},
      },
    };
    const ws = createVirtualWorkspace('Class');
    const key = lessonFor(rizal, '2026-10-26', seq).key;
    useDeskStore.setState({
      workspace: ws, persona: 'luna', deskTheme: 'light', isGenerating: false,
      myClasses: [rizal], lessonSequences: { r: seq }, teachingLog: { noClass: [], noClassFor: {}, repeat: {} },
      teachingSettings: { ...DEFAULT_SETTINGS, morningBrief: false }, assistantFired: {},
      preparedLessons: { [key]: { status: 'ready', workspaceId: workspaceIdOf(ws), at: 1, files: [{ path: 'Lesson Prep/2026-10-26 Monday/Science 7 - Mixtures and solutions/Mixtures.pptx', name: 'Mixtures.pptx', format: 'pptx' }, { path: 'Lesson Prep/2026-10-26 Monday/Science 7 - Mixtures and solutions/Lesson Plan.docx', name: 'Lesson Plan.docx', format: 'docx' }] } },
    });
    const { startTeachingAssistant } = await import('./assistantEngine');
    stop = startTeachingAssistant(() => ({ user: { uid: 'u1', displayName: 'Ana Reyes' }, profile: { fullName: 'Ana Reyes', gender: 'female' }, onOpenClasses: () => {} }));
  });

  afterEach(() => {
    stop?.();
    vi.useRealTimers();
  });

  const last = () => bubble[bubble.length - 1];
  const settle = async (ms = 3500) => { await vi.advanceTimersByTimeAsync(ms); };

  it('10 minutes before class the bubble opens with the persona\'s reminder and the lesson\'s buttons', async () => {
    await settle();                                   // first tick at 7:19 + 3 s: 11 min before → the 30-min reminder
    vi.setSystemTime(at('07:21'));
    await settle(20000);
    const b = last();
    expect(b).toMatchObject({ visible: true, expanded: true, mood: 'reminder', name: 'Luna' });
    expect(b.avatarUrl).toMatch(/^file:\/\/\/C:\/KaTuroDesk\/dist\/|^file:\/\/\/.*luna/);
    expect(b.message.title).toBe('Science 7 – Rizal at 7:30 AM');
    expect(b.message.text).toMatch(/If I may, .*: your Science 7 – Rizal class begins in \d+ minutes\. Lesson "Mixtures and solutions" and slides are ready\./);
    expect(b.message.actions.map((a) => a.label)).toEqual(['Open slides', 'Open lesson plan', 'Remind me in 5 min', 'OK']);
    expect(notify).toEqual([]);                        // the bubble carries it; no double notification
    expect(b.pending).toBe(0);                         // the 10-minute reminder replaced the 30-minute one
    expect(b.message.text).toMatch(/begins in 9 minutes/);
  });

  it('snooze comes back after 5 minutes; OK closes it', async () => {
    vi.setSystemTime(at('07:21'));
    await settle();
    expect(last().expanded).toBe(true);
    await actionListener({ id: 'snooze' });
    await settle(500);
    expect(last().expanded).toBe(false);
    await settle(5 * 60000);
    expect(last().expanded).toBe(true);
    await actionListener({ id: 'dismiss' });
    await settle(500);
    expect(last()).toMatchObject({ expanded: false, message: null });
  });

  it('a slideshow on screen keeps it closed with a badge; it opens once the slideshow ends', async () => {
    presenting = true;
    vi.setSystemTime(at('07:21'));
    await settle();
    expect(last()).toMatchObject({ expanded: false, pending: 1 });
    presenting = false;
    await settle(25000);                               // the cache in the real app lasts 20 s
    expect(last().expanded).toBe(true);
  });

  it('quiet during class, but the teacher can still open it; after class it asks, and "Not finished" repeats the lesson', async () => {
    vi.setSystemTime(at('07:45'));
    await settle();
    expect(last()).toMatchObject({ mood: 'quiet', expanded: false });
    await actionListener({ id: 'toggle', expanded: true });
    await settle(500);
    expect(last().expanded).toBe(true);                // opened by the teacher during class
    await actionListener({ id: 'toggle', expanded: false });
    vi.setSystemTime(at('08:22'));
    await settle(20000);
    const b = last();
    expect(b.message.title).toBe('Science 7 – Rizal ended');
    expect(b.message.actions.map((a) => a.id)).toEqual(['finished', 'notFinished']);
    await actionListener({ id: 'notFinished' });
    await settle(500);
    expect(useDeskStore.getState().teachingLog.repeat.r).toEqual(['2026-10-26']);
    expect(last().reply).toMatch(/same lesson continues at the next meeting/);
    // Tuesday now repeats meeting 1 of "Mixtures and solutions".
    const tue = lessonFor(rizal, '2026-10-27', seq, useDeskStore.getState().teachingLog);
    expect([tue.item.code, tue.session]).toEqual(['A1', 1]);
  });

  it('questions typed in the bubble are answered there (short, plain text)', async () => {
    await settle();
    await actionListener({ id: 'ask', text: 'Give me a quick motivation activity' });
    await settle(500);
    expect(last().reply).toBe('Sure. Here is a quick idea for your class.');
  });

  it('with the bubble off, reminders come as Windows notifications', async () => {
    useDeskStore.setState({ teachingSettings: { ...DEFAULT_SETTINGS, morningBrief: false, bubble: false } });
    vi.setSystemTime(at('07:21'));
    await settle(20000);
    expect(notify[0][0]).toBe('Science 7 – Rizal at 7:30 AM');
    expect(last().visible).toBe(false);
  });

  it('no bubble at all until the teacher has classes', async () => {
    useDeskStore.setState({ myClasses: [] });
    await settle(20000);
    expect(last().visible).toBe(false);
  });
});
