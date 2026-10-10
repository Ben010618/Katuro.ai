// The bubble: shows the state KaTuroDesk sends and sends back what the teacher clicks.
(() => {
  const $ = (id) => document.getElementById(id);
  const face = $('face');
  const MOOD_TEXT = { resting: 'Here if you need me', preparing: 'Preparing your lessons…', ready: 'Lessons ready', reminder: 'Reminder', needs: 'Needs your answer', quiet: 'Quiet during class' };
  let state = {};

  function render(s) {
    state = s || {};
    document.body.className = [state.theme === 'dark' ? 'dark' : '', state.mood || 'resting'].filter(Boolean).join(' ');
    if (state.avatarUrl && $('avatar').getAttribute('src') !== state.avatarUrl) $('avatar').setAttribute('src', state.avatarUrl);
    $('avatar').alt = state.name || 'KaTuro assistant';
    face.setAttribute('aria-label', `${state.name || 'KaTuro assistant'}: ${state.expanded ? 'make small' : 'open'}`);
    const dot = $('dot');
    dot.hidden = !(state.mood === 'ready' || state.mood === 'needs');
    dot.className = `dot${state.mood === 'needs' ? ' needs' : ''}`;
    const badge = $('badge');
    badge.hidden = !(state.pending > 0);
    badge.textContent = state.pending > 9 ? '9+' : String(state.pending || '');
    $('card').hidden = !state.expanded;
    if (!state.expanded) return;
    $('who').textContent = state.name || 'KaTuro';
    $('mood').textContent = MOOD_TEXT[state.mood] || '';
    const msg = state.message || {};
    $('title').textContent = msg.title || '';
    $('title').hidden = !msg.title;
    $('text').textContent = msg.text || 'Nothing due right now. Ask me anything below.';
    $('reply').hidden = !state.reply;
    $('reply').textContent = state.reply || '';
    const actions = $('actions');
    actions.textContent = '';
    for (const [i, a] of (msg.actions || []).slice(0, 4).entries()) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `btn${i === 0 ? ' primary' : ''}`;
      b.textContent = a.label;
      b.addEventListener('click', () => window.ktBubble.action(a.id));
      actions.appendChild(b);
    }
    $('askText').placeholder = `Ask ${state.name || 'me'} anything…`;
  }

  window.ktBubble.onState(render);

  // Drag the head to move it; a click without moving opens or closes the card.
  let start = null;
  let last = null;
  let moved = false;
  face.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    face.setPointerCapture(e.pointerId);
    start = { x: e.screenX, y: e.screenY };
    last = { ...start };
    moved = false;
  });
  face.addEventListener('pointermove', (e) => {
    if (!start) return;
    if (!moved && Math.hypot(e.screenX - start.x, e.screenY - start.y) < 5) return;
    moved = true;
    window.ktBubble.drag(e.screenX - last.x, e.screenY - last.y);
    last = { x: e.screenX, y: e.screenY };
  });
  const end = (e) => {
    if (!start) return;
    try { face.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    if (moved) window.ktBubble.drag(0, 0, true);
    else window.ktBubble.action('toggle');
    start = null;
  };
  face.addEventListener('pointerup', end);
  face.addEventListener('pointercancel', () => { start = null; });
  face.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.ktBubble.action('toggle'); } });

  $('close').addEventListener('click', () => window.ktBubble.action('toggle'));
  $('ask').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = $('askText').value.trim();
    if (!text) return;
    window.ktBubble.action('ask', text);
    $('askText').value = '';
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.expanded) window.ktBubble.action('toggle'); });
})();
