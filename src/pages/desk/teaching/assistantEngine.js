/**
 * assistantEngine.js — the teaching assistant's background loop (KaTuroDesk only).
 * Runs in the KaTuroDesk page, which keeps running in the tray. Every 20 seconds it:
 *   - prepares coming lessons (one at a time, never while the teacher's own request runs),
 *   - turns due reminders, the morning brief and the after-class question into messages,
 *   - shows them in the floating bubble (or as Windows notifications when the bubble is off),
 *     staying quiet during class and while a full-screen slideshow is on screen,
 *   - answers the bubble's buttons and questions.
 * Plain module (no React): start() returns stop().
 */
import { useDeskStore, workspaceIdOf, folderIndex } from '../../../store/deskStore';
import { findEntryByPath, openInDefaultApp } from '../../../services/localFileSystem';
import { dueEvents, lessonsToPrepare, inClassNow, periodsOn, isoDay, toMin, DEFAULT_SETTINGS } from '../../../services/desk/teaching/teachingDay';
import { prepareLesson, mondayOf, weekPlan } from '../../../services/desk/teaching/prepareLesson';
import { messageFor, bubbleMood, bubbleReply } from '../../../services/desk/teaching/assistantMessages';
import { getTeacherSalutationName } from '../../../services/teacherProfileUtils';
import { getPersona } from '../../../services/desk/personas';
import { runChatTurn } from '../runChatTurn';
import mattAvatar from '../../../assets/avatars/matt.webp';
import lunaAvatar from '../../../assets/avatars/luna.webp';
import greyAvatar from '../../../assets/avatars/grey.webp';
import carmenAvatar from '../../../assets/avatars/carmen.webp';

const AVATARS = { matt: mattAvatar, luna: lunaAvatar, grey: greyAvatar, carmen: carmenAvatar };
const TICK_MS = 20000;
const SNOOZE_MS = 5 * 60000;
const api = () => (typeof window !== 'undefined' ? window.katuroDeskApi : undefined);

const manualJobs = []; // "Prepare now" from My classes
let prepRunning = false;
let poke = () => {};

/** Asks the assistant to prepare these lessons next (My classes: "Prepare now"). */
export function requestPrepare(jobs) {
  for (const j of jobs) if (!manualJobs.some((m) => m.key === j.key)) manualJobs.push(j);
  poke();
}
export const isPreparing = () => prepRunning;

function speak(text) {
  try {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const voice = window.speechSynthesis.getVoices().find((v) => /^en(-|_)/i.test(v.lang));
    if (voice) u.voice = voice;
    window.speechSynthesis.speak(u);
  } catch {
    // speaking is optional; the text is always shown
  }
}

async function readParsed(path) {
  const ws = useDeskStore.getState().workspace;
  return folderIndex.ensure(path, findEntryByPath(ws?.files || [], path), ws?.handle, { full: false });
}

/** Lessons prepared in this classroom folder only (another folder does not have the files). */
function preparedHere(s) {
  const wsId = workspaceIdOf(s.workspace);
  return Object.fromEntries(Object.entries(s.preparedLessons || {}).filter(([, r]) => r.workspaceId === wsId));
}

const settingsOf = (s) => ({ ...DEFAULT_SETTINGS, ...(s.teachingSettings || {}) });
const engineState = (s) => ({ classes: s.myClasses, sequences: s.lessonSequences, log: s.teachingLog, settings: settingsOf(s), prepared: preparedHere(s), fired: s.assistantFired });

/**
 * Starts the loop. getContext() → { user, profile, onOpenClasses } (always the latest).
 * Returns stop().
 */
export function startTeachingAssistant(getContext) {
  const desk = api();
  let queue = [];
  let expanded = false;
  let reply = '';
  let presenting = false;
  let userOpened = false; // the teacher opened it: quiet times do not close it
  let lastBubble = '';
  let pushTimer = null;
  let stopped = false;
  const timers = new Set();

  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); if (!stopped) fn(); }, ms); timers.add(id); };

  function pushBubble() {
    if (!desk?.setBubble || stopped) return;
    const s = useDeskStore.getState();
    const settings = settingsOf(s);
    const now = Date.now();
    const st = engineState(s);
    const inClass = s.myClasses.length ? inClassNow(now, st) : null;
    const current = queue[0] || null;
    const todayLessons = s.myClasses.length ? periodsOn(s.myClasses, isoDay(now), s.lessonSequences, s.teachingLog).filter((p) => p.lesson.kind === 'lesson') : [];
    const problems = todayLessons.filter((p) => st.prepared[p.lesson.key]?.status === 'failed').length;
    const persona = getPersona(s.persona);
    const visible = Boolean(settings.bubble && s.myClasses.length);
    // Quiet during class and slideshows: no pop-ups, but the teacher can still open it.
    const show = visible && expanded && (userOpened || (!inClass && !presenting));
    const state = {
      visible,
      expanded: show,
      mood: bubbleMood({ inClass: Boolean(inClass), preparing: prepRunning, current, todayLessons, prepared: st.prepared, problems }),
      avatarUrl: new URL(AVATARS[persona.id] || mattAvatar, window.location.href).href,
      name: persona.name,
      theme: s.deskTheme === 'dark' ? 'dark' : 'light',
      pending: queue.length > 1 || (queue.length && !show) ? queue.length : 0,
      message: current ? { title: current.title, text: current.text, actions: current.actions } : null,
      reply,
    };
    const key = JSON.stringify(state);
    if (key === lastBubble) return;
    lastBubble = key;
    desk.setBubble(state).catch?.(() => {});
  }

  /** A new first message opens the bubble, unless a class or a slideshow is on. */
  async function openForCurrent() {
    const s = useDeskStore.getState();
    const current = queue[0];
    if (!current) { expanded = false; pushBubble(); return; }
    presenting = Boolean(await desk?.isPresenting?.().catch(() => false));
    const inClass = s.myClasses.length ? inClassNow(Date.now(), engineState(s)) : null;
    if (!presenting && !inClass && !expanded) {
      expanded = true;
      if (settingsOf(s).voice) speak(current.text);
    }
    pushBubble();
  }

  function addMessages(msgs) {
    const before = queue[0]?.id;
    for (const m of msgs) {
      if (queue.some((x) => x.id === m.id)) continue;
      // A newer reminder for the same class replaces the older one (its minutes are current).
      const same = m.id.startsWith('remind|') ? queue.findIndex((x) => x.id.startsWith('remind|') && x.id.split('|').slice(0, 3).join('|') === m.id.split('|').slice(0, 3).join('|')) : -1;
      if (same >= 0) queue[same] = m;
      else queue.push(m);
    }
    if (queue[0]?.id !== before || !expanded) openForCurrent();
    else pushBubble();
  }

  function next() {
    queue = queue.slice(1);
    if (!queue.length && !userOpened) expanded = false;
    openForCurrent();
  }

  /** Many store changes (e.g. a streaming chat answer) → one bubble update. */
  function schedulePush() {
    if (pushTimer) return;
    pushTimer = setTimeout(() => { pushTimer = null; pushBubble(); }, 400);
  }

  function checkEvents(now) {
    const s = useDeskStore.getState();
    if (!s.myClasses.length) return;
    const st = engineState(s);
    const { events, skip } = dueEvents(now, st);
    if (skip.length) s.markAssistantFired(skip);
    if (!events.length) return;
    s.markAssistantFired(events.map((e) => e.key));
    const { user, profile } = getContext();
    const name = getTeacherSalutationName(profile, user);
    const msgs = events.map((e) => messageFor(e, { persona: s.persona || 'matt', name, prepared: st.prepared }));
    // The bubble is off (or not available): Windows notifications carry the messages.
    if (!settingsOf(s).bubble || !desk?.setBubble) {
      msgs.forEach((m) => desk?.notify?.(m.title, m.text.slice(0, 240))?.catch?.(() => {}));
      return;
    }
    addMessages(msgs);
  }

  function prepareNext(now) {
    const s = useDeskStore.getState();
    const { user, profile } = getContext();
    if (prepRunning || !user || s.isGenerating || !s.myClasses.length || s.workspace?.handle?.kind !== 'electron') return;
    const st = engineState(s);
    const todo = manualJobs.shift() || lessonsToPrepare(now, st)[0];
    if (!todo) return;
    const length = toMin(todo.cls.end) - toMin(todo.cls.start);
    let job = { ...todo, minutes: Number.isFinite(length) && length > 0 ? length : 50 };
    // Weekly DLL format: the week's DLL first.
    if (st.settings.planFormat === 'dll' && job.kind !== 'dll') {
      const monday = mondayOf(job.iso);
      const dllKey = `dll|${monday}|${job.cls.subject}|${job.cls.grade}`.toLowerCase();
      const r = st.prepared[dllKey];
      if (!r || (r.status === 'failed' && now - r.at > 30 * 60000)) {
        manualJobs.unshift(todo);
        job = { kind: 'dll', key: dllKey, monday, cls: job.cls, sections: job.sections, week: weekPlan(job.cls, monday, s.lessonSequences, s.teachingLog) };
      }
    }
    const wsId = workspaceIdOf(s.workspace);
    prepRunning = true;
    s.setPreparedLesson(job.key, { status: 'preparing', workspaceId: wsId, at: Date.now() });
    pushBubble();
    (async () => {
      try {
        const res = await prepareLesson(job, {
          workspace: s.workspace, user, profile, persona: s.persona, privacyMode: s.privacyMode,
          fileIndex: folderIndex, settings: st.settings, readParsed,
        });
        useDeskStore.getState().setPreparedLesson(job.key, { ...res, workspaceId: wsId, at: Date.now() });
        if (res.files.length) await useDeskStore.getState().refreshFiles();
      } catch (err) {
        useDeskStore.getState().setPreparedLesson(job.key, { status: 'failed', files: [], note: err?.message || 'Could not prepare the lesson.', workspaceId: wsId, at: Date.now() });
      } finally {
        prepRunning = false;
        if (!stopped) tick();
      }
    })();
  }

  function tick() {
    if (stopped) return;
    const now = Date.now();
    checkEvents(now);
    prepareNext(now);
    // A slideshow ended or a class finished: a waiting message can open now.
    if (queue.length && !expanded) openForCurrent();
    else pushBubble();
  }
  poke = () => later(tick, 50);

  async function onAction(action) {
    const s = useDeskStore.getState();
    const msg = queue[0];
    switch (action.id) {
      case 'toggle':
        expanded = Boolean(action.expanded);
        userOpened = expanded;
        if (!expanded) reply = '';
        pushBubble();
        break;
      case 'dismiss':
      case 'finished':
        reply = '';
        next();
        break;
      case 'notFinished':
        if (msg?.data?.classId) s.setRepeat(msg.data.classId, msg.data.iso, true);
        reply = 'Noted. The same lesson continues at the next meeting, and the next lessons move back by one.';
        next();
        break;
      case 'snooze':
        if (msg) later(() => addMessages([msg]), SNOOZE_MS);
        reply = '';
        next();
        break;
      case 'openSlides':
      case 'openPlan': {
        const f = msg?.data?.files?.[action.id === 'openSlides' ? 'slides' : 'plan'];
        if (f) {
          try {
            await openInDefaultApp(s.workspace?.handle, f.path);
          } catch {
            reply = 'I could not open the file. It may have been moved or renamed.';
            pushBubble();
          }
        }
        break;
      }
      case 'prepareNow':
        if (msg?.data?.key) {
          s.setPreparedLesson(msg.data.key, { status: 'failed', files: [], at: 1, workspaceId: workspaceIdOf(s.workspace) });
          reply = 'Preparing it again now.';
          pushBubble();
          poke();
        }
        break;
      case 'openClasses':
        await api()?.showWindow?.();
        getContext().onOpenClasses?.();
        reply = '';
        next();
        break;
      case 'ask': {
        const text = String(action.text || '').trim();
        const { user, profile } = getContext();
        if (!text) break;
        if (s.isGenerating || !user) { reply = 'I\'m busy with another request. Please ask again in a moment.'; pushBubble(); break; }
        reply = 'Thinking…';
        pushBubble();
        const out = await runChatTurn({ text, user, profile });
        reply = bubbleReply(out.content);
        pushBubble();
        break;
      }
      default:
        break;
    }
  }

  const offAction = desk?.onBubbleAction ? desk.onBubbleAction(onAction) : () => {};
  const unsub = useDeskStore.subscribe(schedulePush);
  const interval = setInterval(tick, TICK_MS);
  const onVisible = () => tick();
  document.addEventListener('visibilitychange', onVisible);
  useDeskStore.getState().pruneAssistant();
  later(tick, 3000); // let the last folder reopen first

  return function stop() {
    stopped = true;
    poke = () => {};
    clearInterval(interval);
    if (pushTimer) clearTimeout(pushTimer);
    timers.forEach((id) => clearTimeout(id));
    document.removeEventListener('visibilitychange', onVisible);
    unsub();
    offAction();
    desk?.setBubble?.({ visible: false })?.catch?.(() => {});
  };
}
