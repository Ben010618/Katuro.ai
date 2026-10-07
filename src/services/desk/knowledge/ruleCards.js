/**
 * ruleCards.js — official DepEd rules the KaTuro admin maintains from the Admin
 * Dashboard (adminConfig/deskKnowledge), so a new DepEd order reaches every
 * teacher's KaTuroDesk without an app update.
 *
 * Every card must cite its official source. Only cards whose trigger words appear
 * in the request are sent to the AI (a few hundred tokens at most).
 */

export const CARD_LIMITS = { title: 120, triggers: 300, text: 1200, source: 200, maxCards: 60, sentChars: 2500 };

/** Trims and validates one card. → { card } or { error }. */
export function cleanCard(raw = {}) {
  const s = (v, max) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, max);
  const card = {
    id: s(raw.id, 40) || `card-${Date.now().toString(36)}`,
    title: s(raw.title, CARD_LIMITS.title),
    triggers: s(raw.triggers, CARD_LIMITS.triggers),
    text: String(raw.text || '').trim().slice(0, CARD_LIMITS.text),
    source: s(raw.source, CARD_LIMITS.source),
    active: raw.active !== false,
  };
  if (!card.title) return { error: 'Give the card a title.' };
  if (!card.text) return { error: 'Write the rule itself.' };
  if (!card.source) return { error: 'Every rule needs its official source (e.g. "DepEd Order No. 42, s. 2016, para. 5").' };
  if (!triggerList(card.triggers).length) return { error: 'Add at least one trigger word (e.g. DLL, lesson plan).' };
  return { card };
}

export function triggerList(triggers) {
  return String(triggers || '').split(/[,;\n]+/).map((t) => t.trim().toLowerCase()).filter((t) => t.length >= 2);
}

const norm = (s) => ` ${String(s || '').toLowerCase().replace(/[^a-z0-9ñ\s]/g, ' ').replace(/\s+/g, ' ')} `;

/** Cards whose trigger words appear in the text (whole words), active only. */
export function cardsFor(text, cards = []) {
  const t = norm(text);
  return (cards || []).filter((c) => c && c.active !== false && triggerList(c.triggers).some((w) => t.includes(norm(w))));
}

/** Compact text for the planner, or '' — stops at CARD_LIMITS.sentChars. */
export function ruleCardsText(text, cards = []) {
  const hits = cardsFor(text, cards);
  if (!hits.length) return '';
  const lines = ['Official rule cards (maintained by the KaTuro admin; follow them and cite the source when relevant):'];
  let used = lines[0].length;
  for (const c of hits) {
    const line = `- ${c.title}: ${c.text} (Source: ${c.source})`;
    if (used + line.length > CARD_LIMITS.sentChars) break;
    lines.push(line);
    used += line.length;
  }
  return lines.join('\n');
}

let cache = { at: 0, cards: [] };
const CACHE_MS = 10 * 60 * 1000;

/** Rule cards from Firestore (cached 10 minutes). Never throws: no cards on any error. */
export async function loadRuleCards({ force = false } = {}) {
  if (!force && import.meta.env?.MODE === 'test') return cache.cards; // unit tests pass cards in directly
  if (!force && Date.now() - cache.at < CACHE_MS) return cache.cards;
  try {
    const { doc, getDoc } = await import('firebase/firestore');
    const { db } = await import('../../../firebase');
    // A slow network must not hold up the teacher's request: give up after 2.5 s.
    const snap = await Promise.race([
      getDoc(doc(db, 'adminConfig', 'deskKnowledge')),
      new Promise((_, reject) => setTimeout(() => reject(new Error('slow')), 2500)),
    ]);
    const cards = snap.exists() && Array.isArray(snap.data().cards) ? snap.data().cards : [];
    cache = { at: Date.now(), cards };
    return cards;
  } catch {
    return cache.cards;
  }
}

/** Admin: saves the whole card list (validated). */
export async function saveRuleCards(cards, adminUid) {
  const cleaned = [];
  for (const raw of cards.slice(0, CARD_LIMITS.maxCards)) {
    const { card, error } = cleanCard(raw);
    if (error) throw new Error(`${raw.title || 'A card'}: ${error}`);
    cleaned.push(card);
  }
  const { doc, setDoc } = await import('firebase/firestore');
  const { db } = await import('../../../firebase');
  await setDoc(doc(db, 'adminConfig', 'deskKnowledge'), { cards: cleaned, updatedAt: new Date(), updatedBy: adminUid });
  cache = { at: Date.now(), cards: cleaned };
  return cleaned;
}
