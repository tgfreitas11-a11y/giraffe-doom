// Giraffe Doom — interface com animações (você contra bots)
(function () {
  const E = window.GD_ENGINE, B = window.GD_BOT, C = window.GD_CARDS;
  let ME = 0; // assento deste aparelho (no online pode ser outro)
  const BOT_NAMES = ['Girafa Bot', 'Pescoçudo', 'Dona Mancha', 'Sr. Savana', 'Doom Jr.'];
  const $app = document.getElementById('app');
  const $fx = document.createElement('div'); $fx.className = 'fx'; document.body.appendChild($fx);
  const $stage = document.createElement('div'); $stage.className = 'stage'; document.body.appendChild($stage);

  let st = null;          // estado verdadeiro
  let V = null;           // estado exibido (atrasado durante as animações)
  let snap = null;        // cópia do estado antes da última jogada
  let lastSeq = 0;
  let pumping = false;
  const ui = { sheet: null, toast: null, view: 'setup', focus: ME, busy: false, thinking: null, status: '', enter: null, narr: [], open: new Set() };
  function narr(html, icon = '•') { ui.narr.push({ html, icon }); if (ui.narr.length > 30) ui.narr.shift(); const n = $app.querySelector('.narr'); if (n) n.innerHTML = narrHTML(); }
  function narrHTML() { const L = ui.narr.slice(-3); return L.map((l, i) => `<div class="nl ${i === L.length - 1 ? 'now' : ''}"><span class="ni">${l.icon}</span><span>${l.html}</span></div>`).join('') || '<div class="nl now"><span class="ni">🦒</span><span>A partida vai começar.</span></div>'; }

  const img = id => `img/${E.CARDS[id].img}.webp`;
  const objImg = o => `img/${E.OBJ[o].img}.webp`;
  // ícone de defesa (engrenagem com caveira): n ícones, os últimos `lost` apagados
  const dicons = (n, lost = 0, cls = '') => n > 0 ? `<span class="pips ${cls}" title="defesa ${n}${lost ? `, dano ${Math.min(lost, n)}` : ''}">${Array.from({ length: n }, (_, i) => `<i class="${i >= n - lost ? 'lost' : ''}"></i>`).join('')}</span>` : '';
  // dano que conta agora numa peça: o do turno + o de veneno (que não some)
  const hurtOf = (S, id) => ((S && S.dmg && S.dmg[id]) || 0) + ((S && S.wounds && S.wounds[id]) || 0);
  const cico = c => c ? `<img class="cico" src="img/c_${c}.webp" alt="">` : '';
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const K = id => E.CARDS[id].kind;
  const NM = id => E.CARDS[id].name;
  const P = i => st.players[i];
  const clone = o => JSON.parse(JSON.stringify(o));
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- preferências ----------
  const prefs = { speed: 'normal', sound: true, name: '', bots: 3, tap: true };
  try { Object.assign(prefs, JSON.parse(localStorage.getItem('giraffe-doom-prefs') || '{}')); } catch (e) {}
  const savePrefs = () => { try { localStorage.setItem('giraffe-doom-prefs', JSON.stringify(prefs)); } catch (e) {} };
  const SPEED = { lento: 1.5, normal: 1, rapido: 0.6 };
  const k = () => (reduced ? 0.5 : SPEED[prefs.speed] || 1);
  const wait = ms => new Promise(r => setTimeout(r, ms * k()));
  // pausa de leitura: espera o tempo, mas o jogador pode tocar na tela para seguir
  let skipFn = null;
  const TAP = Infinity;
  function hold(ms) {
    // nunca espera para sempre: segue sozinho depois de alguns segundos (tocar pula na hora)
    if (ms === TAP) ms = prefs.tap ? 3200 : 2400;
    return new Promise(r => {
      const t = setTimeout(done, ms * k());
      function done() { clearTimeout(t); if (skipFn === done) skipFn = null; document.body.classList.remove('can-skip', 'wait-tap', 'popup'); r(); }
      skipFn = done; document.body.classList.add('can-skip');
      // janela de destaque aberta: a tela de trás fica bloqueada (só a carta ou o texto avançam)
      document.body.classList.toggle('popup', !!document.querySelector(POPUP_SEL));
    });
  }
  let swallowClick = false;
  const MY_UI = '.scrim, .top, .dock, .foes, .tablehead, .herdwrap';
  const unpeek = () => {};
  const POPUP_SEL = '.stage.on, .fx .banner:not(.intro)';
  const POPUP_HIT = '.fx .fly.onstage, .stage.on .cap, .fx .banner:not(.intro), .fx .objfx, .fx .stamp';
  const inPopup = (x, y) => [...document.querySelectorAll(POPUP_HIT)].some(el => { const r = el.getBoundingClientRect(); return r.width && x >= r.left - 6 && x <= r.right + 6 && y >= r.top - 6 && y <= r.bottom + 6; });
  const swallow = e => { e.preventDefault(); e.stopPropagation(); swallowClick = true; };
  // qualquer toque segue o jogo; toques na mesa/mão/oponentes também fazem a ação normal
  document.addEventListener('pointerdown', e => {
    if (e.target.closest('.scrim, .sheet, .modal, .lang')) return;
    if (document.querySelector(POPUP_SEL)) {
      swallow(e);
      if (skipFn) { if (inPopup(e.clientX, e.clientY)) skipFn(); }
      else if (!ui.busy) { $stage.classList.remove('on'); $stage.innerHTML = ''; }  // segurança: nunca deixa a tela presa
      return;
    }
    if (!skipFn) return;
    const f = skipFn;
    if (e.target.closest(MY_UI + ', button, input, select, a')) { f(); return; }
    e.preventDefault(); e.stopPropagation(); swallowClick = true; f();
  }, true);
  document.addEventListener('click', e => { if (swallowClick) { swallowClick = false; e.preventDefault(); e.stopPropagation(); } }, true);

  // ---------- persistência ----------
  const KEY = 'giraffe-doom-save-v2';
  function save() { if (NET.mode === 'online' || !st) return; try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
  function load() { try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } }
  function clearSave() { try { localStorage.removeItem(KEY); } catch (e) {} }

  // ---------- som (sintetizado no aparelho, sem arquivos) ----------
  let actx = null, master = null, reverbNode = null;
  function audio() {
    if (!prefs.sound) return null;
    try {
      if (!actx) {
        actx = new (window.AudioContext || window.webkitAudioContext)();
        const comp = actx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
        master = actx.createGain(); master.gain.value = 0.9; master.connect(comp).connect(actx.destination);
        // reverberação curta gerada por ruído
        const len = actx.sampleRate * 1.6, ir = actx.createBuffer(2, len, actx.sampleRate);
        for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
        reverbNode = actx.createConvolver(); reverbNode.buffer = ir; const vg = actx.createGain(); vg.gain.value = 0.35; reverbNode.connect(vg).connect(master);
      }
      if (actx.state === 'suspended') actx.resume();
      return actx;
    } catch (e) { return null; }
  }
  function out(node, wet) { node.connect(master); if (wet) node.connect(reverbNode); }
  function tone(f, d, { type = 'sine', vol = 0.2, to = 0, at = 0, att = 0.005, wet = false, lp = 0 } = {}) {
    const a = audio(); if (!a) return; const t = a.currentTime + at;
    const o = a.createOscillator(), g = a.createGain(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + d);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + att); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    let n = o.connect(g);
    if (lp) { const f2 = a.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = lp; n = g.connect(f2); }
    out(n, wet); o.start(t); o.stop(t + d + 0.05);
  }
  function noise(d, { vol = 0.3, type = 'lowpass', f = 1200, to = 0, q = 0.8, at = 0, att = 0.004, wet = false } = {}) {
    const a = audio(); if (!a) return; const t = a.currentTime + at;
    const b = a.createBuffer(1, Math.max(1, a.sampleRate * d), a.sampleRate), ch = b.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    const src = a.createBufferSource(), fl = a.createBiquadFilter(), g = a.createGain();
    fl.type = type; fl.Q.value = q; fl.frequency.setValueAtTime(f, t); if (to) fl.frequency.exponentialRampToValueAtTime(to, t + d);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + att); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    src.buffer = b; out(src.connect(fl).connect(g), wet); src.start(t); src.stop(t + d + 0.05);
  }
  const sfx = {
    flick: () => noise(0.12, { vol: 0.22, type: 'bandpass', f: 2600, to: 5200, q: 1.2 }),
    place: () => { tone(170, 0.16, { vol: 0.45, to: 55 }); noise(0.07, { vol: 0.25, f: 900 }); },
    whoosh: () => noise(0.5, { vol: 0.3, type: 'bandpass', f: 350, to: 2600, q: 1.5, att: 0.15, wet: true }),
    hit: () => { tone(120, 0.3, { vol: 0.7, to: 38 }); noise(0.18, { vol: 0.45, f: 1800, to: 300 }); tone(240, 0.09, { type: 'square', vol: 0.08, to: 90 }); },
    crack: () => { [0, 0.045, 0.1, 0.16].forEach((at, i) => noise(0.09, { vol: 0.35 - i * 0.05, type: 'highpass', f: 2600 + i * 500, at })); tone(2600, 0.25, { type: 'triangle', vol: 0.06, at: 0.02, wet: true }); tone(3400, 0.2, { type: 'triangle', vol: 0.05, at: 0.07, wet: true }); },
    topple: () => { tone(320, 0.9, { type: 'sawtooth', vol: 0.12, to: 55, lp: 700 }); setTimeout(() => { tone(90, 0.4, { vol: 0.7, to: 35 }); noise(0.35, { vol: 0.4, f: 500 }); }, 800 * k()); },
    boom: () => { noise(1.6, { vol: 0.9, f: 900, to: 60, att: 0.01, wet: true }); tone(60, 1.3, { vol: 0.8, to: 28 }); [0.15, 0.3, 0.5].forEach(at => noise(0.12, { vol: 0.25, type: 'highpass', f: 1800, at })); },
    shield: () => [880, 1320, 1760, 2640].forEach((f, i) => tone(f, 0.7, { vol: 0.09, at: i * 0.06, wet: true })),
    cancel: () => { tone(150, 0.16, { type: 'square', vol: 0.12, lp: 900 }); tone(110, 0.28, { type: 'square', vol: 0.12, at: 0.2, lp: 900 }); },
    reflect: () => { noise(0.35, { vol: 0.25, type: 'bandpass', f: 2600, to: 400, q: 2 }); [1320, 990].forEach((f, i) => tone(f, 0.4, { vol: 0.09, at: 0.25 + i * 0.1, wet: true })); },
    fanfare: () => { const n = [523, 659, 784, 1046]; n.forEach((f, i) => tone(f, 0.35, { type: 'sawtooth', vol: 0.09, at: i * 0.13, lp: 2400, wet: true })); [523, 659, 784].forEach(f => tone(f, 1.1, { type: 'sawtooth', vol: 0.06, at: 0.55, lp: 2000, wet: true })); },
    sparkle: () => { for (let i = 0; i < 8; i++) tone(1800 + Math.random() * 2400, 0.25, { vol: 0.05, at: i * 0.05, wet: true }); },
    poison: () => { for (let i = 0; i < 6; i++) { const f = 260 + Math.random() * 420; tone(f, 0.12, { vol: 0.14, to: f * 1.9, at: i * 0.09 + Math.random() * 0.04 }); } },
    snore: () => { tone(90, 0.9, { type: 'sawtooth', vol: 0.12, lp: 380, att: 0.4, to: 110 }); tone(140, 0.6, { vol: 0.07, at: 1.0, to: 300, att: 0.2 }); },
    myturn: () => { tone(660, 0.5, { vol: 0.16, wet: true }); tone(990, 0.7, { vol: 0.12, at: 0.14, wet: true }); },
    botturn: () => tone(520, 0.25, { type: 'triangle', vol: 0.08, wet: true }),
    shuffle: () => { for (let i = 0; i < 10; i++) noise(0.05, { vol: 0.18, type: 'bandpass', f: 3000 + Math.random() * 1500, q: 1.5, at: i * 0.045 }); },
    steal: () => { noise(0.3, { vol: 0.2, type: 'bandpass', f: 600, to: 3000, q: 2 }); tone(700, 0.18, { type: 'triangle', vol: 0.12, at: 0.28, to: 1400 }); },
    magic: () => { [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.5, { type: 'triangle', vol: 0.08, at: i * 0.08, wet: true })); },
    heal: () => [523, 784, 1046].forEach((f, i) => tone(f, 0.6, { vol: 0.1, at: i * 0.1, wet: true })),
    reveal: () => { noise(0.25, { vol: 0.15, type: 'bandpass', f: 800, to: 3000, q: 1, att: 0.1 }); tone(392, 0.4, { type: 'triangle', vol: 0.08, at: 0.15, wet: true }); },
  };
  sfx.swoosh = sfx.flick; sfx.turn = sfx.botturn;
  function buzz(ms) { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} }

  // ---------- fluxo principal ----------
  async function pump() {
    if (pumping) return; pumping = true; ui.busy = true;
    try {
      while (st) {
        await playEvents();
        if (NET.mode === 'online') {
          reportSeen();
          // estado novo que chegou enquanto animávamos
          if (NET.incoming) { snap = st; st = NET.incoming; NET.incoming = null; continue; }
          // anfitrião: aplica jogadas enviadas pelos outros celulares
          if (NET.isHost && NET.queue.length && st.winner === null) { hostApplyQueued(); continue; }
        }
        if (st.winner !== null) { ui.busy = false; ui.thinking = null; render(); await celebrate(); break; }
        const w = E.whoActs(st);
        if (w === null || w === undefined) break;
        if (!P(w).isBot) break;
        if (NET.mode === 'online' && !NET.isHost) break; // só o anfitrião move os bots
        if (NET.mode === 'online') { const ok = await waitPlayersCaughtUp(); if (!ok) continue; }
        // bot pensando, como um adversário de verdade
        ui.thinking = w; ui.status = st.pending && st.pending.type === 'react' ? `${P(w).name} está decidindo se reage…` : st.pending && st.pending.type === 'stealdest' ? `${P(w).name} está escolhendo onde encaixar o pescoço roubado…` : st.pending && st.pending.type === 'reflect' ? `${P(w).name} está escolhendo onde a defesa revida…` : `${P(w).name} está pensando…`;
        render();
        const isReact = st.pending && st.pending.type === 'react';
        const firstAct = ui.lastActTurn !== st.turnNo; ui.lastActTurn = st.turnNo;
        await wait(isReact ? 1700 + Math.random() * 800 : firstAct ? 2400 + Math.random() * 1200 : 1500 + Math.random() * 900);
        ui.thinking = null;
        snap = clone(st);
        const r = B.step(st, w);
        if (r && r.ok === false) E.draw(st, st.turn, st.objBought ? 'pass' : 'deck');
        ui.status = '';
        save(); if (NET.isHost) pushState();
      }
    } catch (e) { console.error(e); }
    ui.busy = false; ui.thinking = null; ui.status = '';
    V = st; render(); save();
    pumping = false;
  }
  // uma jogada deste aparelho: {t:'play'|'respond'|'destiny'|'draw'|'hl', ...}
  function applyAct(S, seat, a) {
    switch (a.t) {
      case 'play': return E.play(S, seat, a.cid, a.p || {});
      case 'respond': return E.respond(S, seat, a.cid || null);
      case 'destiny': return E.chooseDestiny(S, seat, a.i);
      case 'sd': return E.chooseStealDest(S, seat, a.gid || null);
      case 'rf': return E.chooseReflect(S, seat, a.gid, a.piece);
      case 'draw': return E.draw(S, seat, a.src);
      case 'hl': return E.discardExcess(S, seat, a.ids);
      case 'objpick': return E.chooseObjective(S, seat, a.i);
    }
    return { ok: false, error: 'Jogada desconhecida.' };
  }
  function act(a) {
    if (ui.busy || pumping) { toast('Aguarde a animação terminar.'); return { ok: false }; }
    if (NET.mode === 'online' && !NET.isHost) {
      const r = applyAct(clone(st), ME, a); // confere antes de enviar
      if (r && r.ok === false) { toast(r.error); return r; }
      sendIntent(a);
      ui.sheet = null; renderSheet();
      return r;
    }
    snap = clone(st);
    const r = applyAct(st, ME, a);
    if (r && r.ok === false) { toast(r.error); return r; }
    ui.sheet = null; renderSheet();
    save(); if (NET.isHost) pushState(); pump();
    return r;
  }

  // ---------- reprodução dos eventos ----------
  async function playEvents() {
    const evs = (st.events || []).filter(e => e.seq > lastSeq);
    if (!evs.length) { V = st; return; }
    lastSeq = evs[evs.length - 1].seq;
    V = snap ? snap : clone(st);
    render();
    for (let i = 0; i < evs.length; i++) {
      const e = evs[i], next = evs[i + 1];
      if (stageOpen() && e.t !== 'react') {
        if (e.t === 'cancel') { stamp('CANCELADA', 'no'); sfx.cancel(); narr(`<b>${esc(NM(e.card))}</b> foi cancelada e não teve efeito.`, '🚫'); setCap(`<b>${esc(NM(e.card))}</b> foi cancelada e não teve efeito.`); await hold(TAP); }
        if (e.t === 'reflect') { stamp('DEVOLVIDA', 'back'); sfx.reflect(); narr(`${who(e.by)} usou uma Defesa: <b>${esc(NM(e.card))}</b> volta contra ${whom(e.pid)}.`, '↩️'); setCap(`A Defesa de ${who(e.by)} funcionou: <b>${esc(NM(e.card))}</b> volta contra ${whom(e.pid)}.`); await hold(TAP); }
        await clearStage(e.t === 'reflect' || e.t === 'cancel' ? next : e);
      }
      const h = HANDLERS[e.t];
      if (h) { try { await h(e, next); } catch (err) { console.error(err); } }
    }
    // a janela de reação continua aberta: as cartas ficam no palco até alguém responder
    if (!(st.pending && st.pending.type === 'react')) await clearStage(null);
    V = st; snap = null; render();
  }

  // ---------- utilitários de animação ----------
  function rectOf(el) { if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }
  function centerRect(wFrac = 0.56, max = 230) { const w = Math.min(window.innerWidth * wFrac, max); const h = w * 611 / 400; return { x: (window.innerWidth - w) / 2, y: Math.max(70, window.innerHeight * 0.36 - h / 2), w, h }; }
  function srcRect(pid, cardId) {
    if (pid === ME) {
      const el = cardId && $app.querySelector(`#hand [data-card="${cardId}"]`);
      return rectOf(el) || rectOf($app.querySelector('#hand')) || centerRect(0.2, 80);
    }
    return chipRect(pid);
  }
  function chipRect(pid) { const el = $app.querySelector(`[data-foe="${pid}"]`); const r = rectOf(el); if (!r) return { x: window.innerWidth / 2 - 30, y: 60, w: 60, h: 86 }; return { x: r.x + r.w / 2 - 24, y: r.y + 4, w: 48, h: 69 }; }
  function handRect() { const r = rectOf($app.querySelector('#hand')); if (!r) return centerRect(0.2, 70); return { x: r.x + Math.min(r.w - 80, (V.players[ME].hand.length) * 84) , y: r.y, w: 76, h: 109 }; }
  const deckRect = () => rectOf($app.querySelector('#deck'));
  const discardRect = () => rectOf($app.querySelector('#discardbtn'));
  function cardEl(id, back, w) {
    const el = document.createElement('div'); el.className = 'fly';
    el.innerHTML = `<div class="face front" style="${id ? `background-image:url(${img(id)})` : ''}"></div><div class="face back"></div>`;
    if (back) el.classList.add('flipped');
    el.style.width = w + 'px'; el.style.height = (w * 611 / 400) + 'px';
    $fx.appendChild(el); return el;
  }
  function tf(r, w) { const s = r.w / w; return `translate(${r.x}px, ${r.y}px) scale(${s})`; }
  async function fly(id, from, to, opt = {}) {
    if (!from || !to) return;
    const W = 200; const el = cardEl(id, opt.back, W);
    const dur = (opt.dur || 520) * k();
    const rot = opt.rot || 0;
    const kf = [{ transform: tf(from, W) + ` rotate(${opt.rot0 || 0}deg)`, opacity: opt.fadeIn ? 0 : 1 }, { transform: tf(to, W) + ` rotate(${rot}deg)`, opacity: opt.fadeOut ? 0 : 1 }];
    if (!opt.silent) sfx.swoosh();
    const anim = el.animate(kf, { duration: dur, easing: 'cubic-bezier(.2,.75,.25,1)', fill: 'forwards' });
    if (opt.flipTo !== undefined) setTimeout(() => el.classList.toggle('flipped', opt.flipTo), dur * 0.4);
    await anim.finished.catch(() => {});
    if (opt.keep) return el;
    el.remove();
  }
  function banner(text, sub, cls = '', ms = 1100) {
    const b = document.createElement('div'); b.className = 'banner ' + cls;
    b.innerHTML = `<div class="b1">${text}</div>${sub ? `<div class="b2">${sub}</div>` : ''}`;
    $fx.appendChild(b);
    return hold(ms).then(() => { b.classList.add('out'); return wait(260); }).then(() => b.remove());
  }
  function floatText(el, txt, cls = '') {
    const r = rectOf(el); if (!r) return;
    const f = document.createElement('div'); f.className = 'floattx ' + cls; f.textContent = txt;
    f.style.left = (r.x + r.w / 2) + 'px'; f.style.top = (r.y + r.h / 2) + 'px';
    $fx.appendChild(f); setTimeout(() => f.remove(), 2000 * k());
  }
  function pulse(el, cls, ms = 600) { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); setTimeout(() => el.classList.remove(cls), ms * k() + 50); }
  function screenFx(cls, ms = 700) { document.body.classList.add(cls); setTimeout(() => document.body.classList.remove(cls), ms * k()); }
  function setFocus(pid) { if (ui.pin != null && pid !== ui.pin) return; if (ui.manualUntil && Date.now() < ui.manualUntil && pid !== ui.focus) return; if (ui.focus !== pid) { ui.focus = pid; render(); const t = $app.querySelector('.herdwrap'); if (t) pulse(t, 'swap', 400); } }
  const who = pid => pid === ME ? 'Você' : esc(V.players[pid].name);
  const whom = pid => pid === ME ? 'você' : esc(V.players[pid].name);
  const verb = (pid, a, b) => pid === ME ? a : b;

  // ---------- palco (cartas jogadas ficam visíveis enquanto as reações acontecem) ----------
  let stageCards = [];
  const stageOpen = () => stageCards.length > 0;
  async function stageShow(id, caption, from, idx) {
    let to = centerRect(0.46, 190);
    if (idx) { const base = to; const w = base.w * 0.55; to = { x: base.x + base.w - w * 0.55 + 8 * (idx - 1), y: base.y + base.h - w * 611 / 400 * 0.7 + 10 * (idx - 1), w, h: w * 611 / 400 }; }
    const el = await fly(id, from, to, { dur: 800, silent: true, keep: true, rot: idx ? 6 * idx : 0, flipTo: false, back: true });
    if (!el) return;
    el.classList.add('onstage');
    stageCards.push({ el, id, rect: to });
    $stage.innerHTML = `<div class="cap">${caption}<div class="tap">toque para seguir</div></div>`; $stage.classList.add('on'); unpeek(); sfx.whoosh();
    const capEl = $stage.querySelector('.cap'); const base = stageCards[0].rect; capEl.style.top = (Math.max(base.y + base.h, to.y + to.h) + 14) + 'px';
  }
  function stamp(txt, cls) {
    const s = stageCards[0]; if (!s) return;
    const d = document.createElement('div'); d.className = 'stamp ' + cls; d.textContent = txt;
    d.style.left = (s.rect.x + s.rect.w / 2) + 'px'; d.style.top = (s.rect.y + s.rect.h / 2) + 'px';
    $fx.appendChild(d); stamps.push(d);
  }
  let stamps = [];
  function setCap(html) { const c = $stage.querySelector('.cap'); if (c) c.innerHTML = `${html}<div class="tap">toque para seguir</div>`; }
  async function clearStage(nextEv) {
    if (!stageCards.length) return;
    $stage.classList.remove('on'); $stage.innerHTML = ''; stamps.forEach(d => d.remove()); stamps = [];
    const cards = stageCards; stageCards = [];
    // ataque: a carta voa até a girafa alvo antes de bater
    let toTarget = null;
    if (nextEv && (nextEv.t === 'hit') && cards[0]) {
      setFocus(nextEv.pid);
      toTarget = rectOf($app.querySelector(`[data-piece="${nextEv.piece}"]`)) || rectOf($app.querySelector(`[data-gid="${nextEv.gid}"]`));
    }
    let dr = discardRect();
    if (nextEv && nextEv.t === 'poisoned') { setFocus(nextEv.pid); dr = rectOf($app.querySelector(`[data-piece="${nextEv.piece}"]`)) || rectOf($app.querySelector(`[data-gid="${nextEv.gid}"] .head`)) || (nextEv.pid === ME ? rectOf($app.querySelector('.sectionlbl')) || dr : chipRect(nextEv.pid)); }
    await Promise.all(cards.map((c, i) => {
      const W = 200;
      const dest = i === 0 && toTarget ? { x: toTarget.x + toTarget.w / 2 - 20, y: toTarget.y + toTarget.h / 2 - 29, w: 40, h: 58 } : dr;
      if (!dest) { c.el.remove(); return null; }
      return c.el.animate([{ transform: tf(c.rect, W) }, { transform: tf(dest, W) + ' rotate(-8deg)', opacity: i === 0 && toTarget ? 0.2 : 1 }],
        { duration: 420 * k(), easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' }).finished.catch(() => {}).then(() => c.el.remove());
    }));
  }

  async function spotlight(id, html, from, to, opt = {}) {
    const c = centerRect(0.5, 200);
    const el = await fly(id, from || deckRect(), c, { dur: 750, keep: true, back: !!opt.flip, flipTo: opt.flip ? false : undefined, silent: true });
    if (!el) return;
    sfx.reveal();
    el.classList.add('onstage');
    $stage.innerHTML = `<div class="cap" style="top:${c.y + c.h + 14}px"><span class="kd">${opt.label || C.KIND_LABEL[K(id)]}</span>${html}<div class="tap">toque para seguir</div></div>`; $stage.classList.add('on'); unpeek();
    await hold(TAP);
    $stage.classList.remove('on'); $stage.innerHTML = '';
    if (to) await el.animate([{ transform: tf(c, 200) }, { transform: tf(to, 200) }], { duration: 480 * k(), easing: 'cubic-bezier(.5,0,.75,0)', fill: 'forwards' }).finished.catch(() => {});
    el.remove();
  }
  const help = id => `<div class="expl">${esc(C.KIND_HELP[K(id)])}${E.CARDS[id].def ? ` Defesa: ${dicons(E.CARDS[id].def, 0, 'inl')}` : ''}${E.CARDS[id].color ? ` Cor: ${cico(E.CARDS[id].color)}${E.COLOR_PT[E.CARDS[id].color]}.` : ''}</div>`;

  // ---------- explicações ----------
  const plural = (n, a, b) => n === 1 ? a : b;
  function gname(S, pid, gid) { const g = S.players[pid].giraffes.find(x => x.id === gid); return g ? NM(g.special || g.head) : 'girafa'; }
  function explainPlay(e) {
    const c = E.CARDS[e.card], kd = c.kind, T = e.target != null ? whom(e.target) : '';
    const tP = e.target != null ? V.players[e.target] : null;
    switch (kd) {
      case 'attack': {
        const g = tP && tP.giraffes.find(x => x.id === e.gid);
        if (!g) return `Ataque de ${c.dmg} de dano em ${T}.`;
        const tp = E.pieceOf(g, e.piece); const already = hurtOf(V, tp.id);
        const left = tp.def - already;
        return `Ataque de <b>${c.dmg} de dano</b> em ${T}, na girafa <b>${esc(NM(g.special || g.head))}</b>. O golpe acerta ${tp.kind === 'neck' ? `o pescoço <b>${esc(NM(tp.id))}</b> (nível ${g.necks.indexOf(tp.id) + 1} de ${g.necks.length})` : '<b>a cabeça</b> (ela não tem pescoços)'}, que tem defesa ${tp.def}${already ? ` e já levou ${already} neste turno` : ''}. ${c.dmg >= left ? (tp.kind === 'neck' ? 'Se ninguém reagir, o pescoço quebra.' : 'Se ninguém reagir, a girafa inteira cai!') : `Não basta para quebrar: faltaria mais ${left - c.dmg} de dano neste turno.`}`;
      }
      case 'poison': { const pg = tP && tP.giraffes.find(x => x.id === e.gid); const pc = pg && E.pieceOf(pg, e.piece); return `Veneno em ${T}${pg ? `, na girafa <b>${esc(NM(pg.special || pg.head))}</b>${pc ? `, ${pc.kind === 'neck' ? `pescoço <b>${esc(NM(pc.id))}</b>` : 'na cabeça'}` : ''}` : ''}: a carta fica em cima ${pc && pc.kind === 'neck' ? 'do pescoço, que' : 'da peça, que'} perde 1 ponto no início de cada turno ${e.target === ME ? 'seu' : 'do dono'}, por 3 turnos. Os pontos não voltam. Só o antídoto para.`; }
      case 'steal': { const g = tP && tP.giraffes.find(x => x.id === e.gid); const n = g && (g.necks.includes(e.piece) ? e.piece : g.necks[g.necks.length - 1]); return `Missão Pescoço: rouba o pescoço${n ? ` <b>${esc(NM(n))}</b>` : ''} da girafa ${g ? esc(NM(g.special || g.head)) : ''} de ${T} e encaixa numa girafa ${e.pid === ME ? 'sua' : 'de quem jogou'}.`; }
      case 'sneaky': return `Pega Carta: ${who(e.pid)} pega 1 carta aleatória da mão de ${T}.`;
      case 'discard': return `Discard: ${e.target === ME ? 'você' : T} perde 1 carta aleatória da mão, que vai para o descarte.`;
      case 'exchange': return `Intercâmbio: ${who(e.pid)} entrega 1 carta e recebe 1 carta aleatória da mão de ${T}.`;
      case 'sleep': return `Hora do Sono: ${e.target === e.pid ? `${who(e.pid)} ${e.pid === ME ? 'vai' : 'vai'} dormir de propósito, para ficar protegido` : `${T} vai dormir`} por ${c.turns} ${plural(c.turns, 'turno', 'turnos')}. Quem dorme pula a vez e não pode ser alvo.`;
      case 'timetravel': return `Viagem ao Tempo: ${who(e.pid)} ganha um turno extra logo depois deste.`;
      case 'destiny': return `Destino: ${who(e.pid)} olha as 2 cartas do topo do monte e fica com uma. A outra volta para o topo. Isso substitui a compra e encerra o turno.`;
      case 'portal': return `Portal: ${who(e.pid)} pega uma carta do descarte no lugar da compra (se for cabeça ou corpo, leva a girafa completa). Isso encerra o turno.`;
      case 'mixup': return `Embaralhe: ${who(e.pid)} embaralha um monte à escolha (compra, corpos ou objetivos).`;
      case 'medicine': return `Medicina Mágica: ${who(e.pid)} se cura de todos os venenos.`;
    }
    return esc(C.KIND_HELP[kd] || '');
  }
  function explainReact(e) {
    const kd = K(e.card);
    if (kd === 'defense') return `Defesa: a jogada volta contra quem a fez.`;
    if (kd === 'super') return `Pare Agora!: cancela tudo o que está na mesa, e ninguém pode responder.`;
    return `Pare!: cancela a última carta jogada. Quem foi cancelado ainda pode responder com outro Pare!.`;
  }

  // ---------- tratadores de evento ----------
  const HANDLERS = {
    async turn(e) {
      const p = V.players[e.pid]; V.turn = e.pid;
      setFocus(e.pid);
      ui.status = e.pid === ME ? 'Sua vez!' : `Vez de ${p.name}`;
      render();
      if (st.winner !== null) return;
      if (e.pid === ME) {
        sfx.myturn(); buzz(30);
        narr(`<b>Sua vez.</b> Você pode baixar 1 girafa <i>ou</i> encaixar 1 pescoço. Depois ataque ou use ações. Para terminar, compre 1 carta do monte ou pegue um corpo da vitrine.`, '🦒');
        await banner('Sua vez!', '1 girafa ou 1 pescoço · ataque · compre 1 carta para encerrar', 'mine', 1700);
      } else {
        sfx.botturn();
        narr(`Começa a vez de <b>${esc(p.name)}</b>.`, '⏳');
        await banner(`Vez de ${esc(p.name)}`, `${p.hand.length} cartas na mão · ${p.giraffes.length} ${plural(p.giraffes.length, 'girafa', 'girafas')} na mesa`, '', 1400);
      }
    },
    async play(e) {
      const p = V.players[e.pid];
      const from = srcRect(e.pid, e.card);
      const expl = explainPlay(e);
      removeFromHand(e.pid, e.card);
      ui.thinking = null; ui.status = `${p.name} jogou ${NM(e.card)}`;
      render();
      const tgt = e.target !== null && e.target !== undefined ? ` em <b>${whom(e.target)}</b>` : '';
      narr(`${who(e.pid)} ${e.pid === ME ? 'jogou' : 'jogou'} <b>${esc(NM(e.card))}</b>${tgt}. ${expl}`, '🃏');
      await stageShow(e.card, `<span class="kd">${C.KIND_LABEL[K(e.card)]}</span><b>${who(e.pid)}</b> jogou <b>${esc(NM(e.card))}</b>${tgt}<div class="expl">${expl}</div>`, from, 0);
      if (e.target === ME) buzz(60);
      await hold(TAP);
    },
    async react(e) {
      const from = srcRect(e.pid, e.card);
      removeFromHand(e.pid, e.card); render();
      sfx.shield();
      const ex = explainReact(e);
      narr(`${who(e.pid)} reagiu com <b>${esc(NM(e.card))}</b>. ${ex}`, '🛡️');
      await stageShow(e.card, `<span class="kd">${C.KIND_LABEL[K(e.card)]}</span><b>${who(e.pid)}</b> reagiu com <b>${esc(NM(e.card))}</b>!<div class="expl">${ex}</div>`, from, stageCards.length);
      await hold(TAP);
    },
    async cancel() { },
    async reflect() { },
    async hit(e) {
      setFocus(e.pid);
      const g = $app.querySelector(`[data-gid="${e.gid}"]`);
      const piece = $app.querySelector(`[data-piece="${e.piece}"]`) || g;
      sfx.hit(); if (e.pid === ME) buzz([40, 30, 40]);
      pulse(g, 'shake', 500); pulse(piece, 'flash', 500);
      floatText(piece, `-${e.amount}`, 'dmg');
      const pn = esc(NM(e.piece)), gn = esc(gname(V, e.pid, e.gid));
      if (e.total < e.def) {
        narr(e.wound ? `<b>${pn}</b> (${gn} de ${whom(e.pid)}) perdeu 1 ponto pelo veneno: ${e.total} de ${e.def}. Ponto de veneno não volta.` : `<b>${pn}</b> (${gn} de ${whom(e.pid)}) levou ${e.amount} de dano: ${e.total} de ${e.def}. Resistiu! O dano de ataque só vale neste turno.`, '🩹');
        V.dmg = V.dmg || {}; V.wounds = V.wounds || {};
        if (e.wound) V.wounds[e.piece] = e.total - (V.dmg[e.piece] || 0); else V.dmg[e.piece] = e.total - (V.wounds[e.piece] || 0);
        await wait(700); render(); await hold(2200);
      } else {
        narr(`<b>${pn}</b> levou ${e.amount} de dano: ${e.total} de ${e.def}. A defesa não aguentou!`, '💥');
        await wait(900);
      }
    },
    async destroy(e) {
      setFocus(e.pid);
      const p = V.players[e.pid];
      const gi = p.giraffes.findIndex(g => g.id === e.gid);
      const gn = esc(gname(V, e.pid, e.gid));
      if (e.kind === 'neck') {
        const el = $app.querySelector(`[data-piece="${e.piece}"]`);
        sfx.crack(); if (el) el.classList.add('breaking');
        floatText(el, 'Quebrou!', 'crack');
        const lvl = gi >= 0 ? p.giraffes[gi].necks.length - 1 : 0;
        const above = gi >= 0 ? p.giraffes[gi].necks.length - 1 - p.giraffes[gi].necks.indexOf(e.piece) : 0;
        narr(`O pescoço <b>${esc(NM(e.piece))}</b> quebrou e foi para o descarte. ${gn} de ${whom(e.pid)} caiu para o <b>nível ${lvl}</b>${above > 0 ? ` e ${above === 1 ? 'o pescoço de cima desceu' : 'os pescoços de cima desceram'}` : ''}.`, '💥');
        await wait(800);
        if (gi >= 0) { const g = p.giraffes[gi]; g.necks = g.necks.filter(n => n !== e.piece); }
        if (V.dmg) delete V.dmg[e.piece]; if (V.wounds) delete V.wounds[e.piece];
        V.discard = V.discard.concat(e.piece);
        render(); await hold(1800);
      } else {
        const el = $app.querySelector(`[data-gid="${e.gid}"]`);
        sfx.topple(); if (e.pid === ME) buzz(200);
        if (el) el.classList.add('toppling');
        floatText(el, 'Caiu!', 'crack');
        narr(`A cabeça de <b>${gn}</b> não aguentou: a girafa de ${whom(e.pid)} caiu e foi inteira para o descarte, com cabeça e corpo.`, '💀');
        await wait(1100);
        if (gi >= 0) p.giraffes.splice(gi, 1);
        render(); await hold(2000);
      }
    },
    async wildswap(e) {
      setFocus(e.pid);
      const from = srcRect(e.pid, e.card);
      removeFromHand(e.pid, e.card); render();
      const pieceEl = $app.querySelector(`[data-piece="${e.back}"]`); const to = rectOf(pieceEl);
      const gn = esc(NM(e.slot === 'head' ? e.card : (V.players[e.pid].giraffes.find(g => g.id === e.gid) || {}).head || e.card));
      const toWild = E.CARDS[e.card].wild;
      if (e.pid !== ME) await spotlight(e.card, toWild ? `${who(e.pid)} pôs o coringa <b>${esc(NM(e.card))}</b> no lugar de <b>${esc(NM(e.back))}</b>` : `${who(e.pid)} trocou o coringa <b>${esc(NM(e.back))}</b> pela carta certa <b>${esc(NM(e.card))}</b>`, from, to, { label: 'Troca do coringa' });
      else await fly(e.card, from, to, { dur: 700 });
      const g = V.players[e.pid].giraffes.find(x => x.id === e.gid); if (g) g[e.slot] = e.card;
      ['dmg', 'wounds'].forEach(key => { if (V[key] && V[key][e.back]) { V[key][e.card] = V[key][e.back]; delete V[key][e.back]; } });
      (V.players[e.pid].poisons || []).forEach(po => { if (po.piece === e.back) po.piece = e.card; });
      sfx.place(); render();
      await fly(e.back, to, e.pid === ME ? handRect() : chipRect(e.pid), { dur: 650 });
      addToHand(e.pid, e.back); render();
      narr(toWild ? `${who(e.pid)} pôs o coringa <b>${esc(NM(e.card))}</b> no lugar de <b>${esc(NM(e.back))}</b>, que voltou para a mão. Neste turno, nada mais de girafas ou pescoços.` : `${who(e.pid)} colocou <b>${esc(NM(e.card))}</b> no lugar do coringa <b>${esc(NM(e.back))}</b>, que voltou para a mão. Neste turno, nada mais de girafas ou pescoços.`, '🃏');
    },
    async build(e) {
      setFocus(e.pid);
      const from = srcRect(e.pid, e.cards[0]);
      e.cards.forEach(c => removeFromHand(e.pid, c));
      render();
      const herd = $app.querySelector('.herd') || $app.querySelector('.empty-herd');
      const r = rectOf(herd);
      const to = r ? { x: r.x + Math.min(r.w - 92, V.players[e.pid].giraffes.length * 104), y: r.y, w: 92, h: 132 } : centerRect(0.3, 100);
      if (e.pid !== ME) await spotlight(e.cards[0], `${who(e.pid)} baixou ${e.cards.length === 1 ? 'a girafa especial' : 'a girafa'} <b>${esc(NM(e.cards[0]))}</b>${help(e.cards[0])}`, from, to, { label: e.cards.length === 1 ? 'Girafa especial' : 'Nova girafa' });
      else await fly(e.cards[0], from, to, { dur: 800 });
      const real = st.players[e.pid].giraffes.find(g => g.id === e.gid);
      V.players[e.pid].giraffes.push(real ? clone(Object.assign({}, real, { necks: [] })) : { id: e.gid, head: e.cards[0], body: e.cards[1], special: e.cards.length === 1 ? e.cards[0] : undefined, necks: [] });
      ui.enter = { gid: e.gid };
      sfx.place(); render();
      const nm = esc(NM(e.cards[0])), def = E.CARDS[e.cards[0]].def;
      narr(e.cards.length === 1
        ? `${who(e.pid)} baixou a girafa especial <b>${nm}</b> (inteira numa carta só, defesa ${def}). Ela não recebe pescoços.`
        : (E.CARDS[e.cards[0]].match !== E.CARDS[e.cards[1]].match ? `${who(e.pid)} juntou a cabeça de <b>${nm}</b> com o corpo de <b>${esc(NM(e.cards[1]))}</b> (${E.CARDS[e.cards[0]].wild ? 'a cabeça' : 'o corpo'} é coringa) e baixou a girafa. A cabeça tem defesa ${def}.` : `${who(e.pid)} juntou cabeça e corpo de <b>${nm}</b> e baixou a girafa na mesa. A cabeça tem defesa ${def}. Agora pode receber pescoços.`), '🦒');
      if (e.pid === ME) await banner(e.cards.length === 1 ? '✨ Girafa especial!' : '🦒 Nova girafa!', `Você baixou ${nm}`, '', 1500); else await wait(500);
    },
    async neck(e) {
      setFocus(e.pid);
      const from = srcRect(e.pid, e.card);
      removeFromHand(e.pid, e.card); render();
      const gEl = $app.querySelector(`[data-gid="${e.gid}"] .head`);
      const r = rectOf(gEl);
      const to = r ? { x: r.x, y: r.y + r.h, w: r.w, h: r.w * 611 / 400 } : centerRect(0.3, 100);
      if (e.pid !== ME) await spotlight(e.card, `${who(e.pid)} vai encaixar <b>${esc(NM(e.card))}</b> em ${esc(gname(V, e.pid, e.gid))}${help(e.card)}`, from, to, { label: 'Pescoço' });
      else await fly(e.card, from, to, { dur: 750 });
      const g = V.players[e.pid].giraffes.find(x => x.id === e.gid);
      if (g) g.necks.push(e.card);
      ui.enter = { piece: e.card };
      sfx.place(); render();
      const lvl = g ? g.necks.length : '';
      const c = E.CARDS[e.card];
      floatText($app.querySelector(`[data-piece="${e.card}"]`), `Nível ${lvl}`, 'lvl');
      if (e.pid !== ME) { narr(`${who(e.pid)} encaixou <b>${esc(c.name)}</b> (${cico(c.color)}${E.COLOR_PT[c.color]}, defesa ${dicons(c.def, 0, 'inl')}) em ${esc(gname(V, e.pid, e.gid))}, que chegou ao <b>nível ${lvl}</b>.`, '➕'); await wait(900); }
      else { narr(`Você encaixou <b>${esc(c.name)}</b> (${cico(c.color)}${E.COLOR_PT[c.color]}, defesa ${dicons(c.def, 0, 'inl')}) em ${esc(gname(V, e.pid, e.gid))}, que chegou ao <b>nível ${lvl}</b>.`, '➕'); await wait(1200); }
    },
    async draw(e) {
      const dst = e.pid === ME ? handRect() : chipRect(e.pid);
      if (e.src === 'deck') {
        V.deck = V.deck.slice(0, -1); render();
        sfx.flick();
        narr(e.pid === ME ? `Você comprou <b>${esc(NM(e.card))}</b> e encerrou o turno.` : `${who(e.pid)} comprou 1 carta do monte e encerrou o turno. A carta é secreta.`, '🂠');
        if (e.pid === ME) await spotlight(e.card, `Você comprou <b>${esc(NM(e.card))}</b>${help(e.card)}`, deckRect(), handRect(), { flip: true });
        else await fly(null, deckRect(), dst, { back: true, dur: 800, silent: true });
        addToHand(e.pid, e.card); render();
        if (e.pid !== ME) await hold(1300);
      } else {
        const from = rectOf($app.querySelector(`[data-market="${e.idx}"]`));
        V.market = V.market.slice(); V.market[e.idx] = null; render();
        narr(`${who(e.pid)} pegou o corpo de <b>${esc(NM(e.card))}</b> da vitrine e encerrou o turno. Uma nova carta entrou na vitrine.`, '🛒');
        await spotlight(e.card, `${who(e.pid)} pegou o corpo de <b>${esc(NM(e.card))}</b> da vitrine`, from, dst, { label: 'Corpo · vitrine' });
        V.market[e.idx] = st.market[e.idx];
        addToHand(e.pid, e.card); render();
        if (V.market[e.idx]) { const nm = V.market[e.idx]; await spotlight(nm, `Novo corpo na vitrine: <b>${esc(NM(nm))}</b><div class="expl">Quem tiver a cabeça de ${esc(NM(nm))} na mão (ou na mesa com um corpo coringa) pode pegá-lo como compra.</div>`, deckRect(), rectOf($app.querySelector(`[data-market="${e.idx}"]`)), { label: 'Vitrine', flip: true }); }
      }
    },
    async bomb(e) {
      V.deck = V.deck.slice(0, -1); render();
      const c = centerRect(0.6, 250);
      sfx.reveal();
      const el = await fly(e.card, deckRect(), c, { back: true, flipTo: false, dur: 900, keep: true, silent: true });
      await wait(400);
      sfx.boom(); screenFx('quake', 900); screenFx('redflash', 600); buzz([100, 50, 200]);
      narr(`<b>Campo minado!</b> ${who(e.pid)} comprou ${esc(NM(e.card))}, uma Evento Doom escondida no monte, e leva <b>3 pontos de dano</b> na girafa mais alta, somados de cima para baixo: pode quebrar 3 pescoços de defesa 1, um de defesa 3, ou a soma que der.`, '💣');
      $stage.innerHTML = `<div class="cap boomcap" style="top:${c.y + c.h + 14}px"><span class="kd">Evento Doom · 3 de dano</span><b>💣 Campo minado!</b> ${who(e.pid)} comprou <b>${esc(NM(e.card))}</b> e leva 3 pontos de dano na girafa mais alta, quebrando pescoços de cima para baixo até somar 3.<div class="tap">toque para seguir</div></div>`; $stage.classList.add('on'); unpeek();
      await hold(TAP); $stage.classList.remove('on'); $stage.innerHTML = '';
      if (el) { const dr = discardRect(); await el.animate([{ transform: tf(c, 200) }, { transform: tf(dr, 200) }], { duration: 500 * k(), fill: 'forwards' }).finished.catch(() => {}); el.remove(); }
      setFocus(e.pid);
    },
    async poisontick(e) {
      setFocus(e.pid); sfx.poison(); render();
      screenFx('greenflash', 600);
      const gEl = $app.querySelector(`[data-piece="${e.piece}"]`) || $app.querySelector(`[data-gid="${e.gid}"]`); pulse(gEl, 'poisonpulse', 900);
      const p = V.players[e.pid]; const po = p.poisons.find(x => x.card === e.card);
      if (po) { po.left = e.left; if (e.left <= 0) p.poisons = p.poisons.filter(x => x !== po); }
      const gn = esc(gname(V, e.pid, e.gid));
      narr(`O veneno <b>${esc(NM(e.card))}</b> age em <b>${esc(NM(e.piece))}</b> (${gn} de ${whom(e.pid)}): perde 1 ponto${e.left > 0 ? ` (faltam ${e.left})` : ' (último ponto; a carta sai de jogo)'}.`, '☠️');
      await banner('☠️ Veneno', `${gn} de ${who(e.pid)} perde 1 ponto`, 'poison', 1800);
    },
    async poisoned(e) {
      sfx.poison();
      const p = V.players[e.pid]; p.poisons = p.poisons.concat({ card: e.card, left: 3, gid: e.gid, piece: e.piece });
      setFocus(e.pid); render();
      const el = $app.querySelector(`[data-piece="${e.piece}"]`) || $app.querySelector(`[data-gid="${e.gid}"]`) || (e.pid === ME ? $app.querySelector('.sectionlbl') : $app.querySelector(`[data-foe="${e.pid}"]`));
      pulse(el, 'poisonpulse', 900); floatText(el, '☠️', 'big');
      narr(`<b>${esc(NM(e.card))}</b> ficou em cima de <b>${esc(NM(e.piece))}</b> (${esc(gname(V, e.pid, e.gid))}) de ${whom(e.pid)}: perde 1 ponto por turno, por 3 turnos, se não usar o antídoto.`, '☠️');
      await hold(1800);
    },
    async cure(e) { V.players[e.pid].poisons = []; render(); sfx.heal(); narr(`${who(e.pid)} usou o antídoto e tirou todos os venenos das girafas. Os pontos já perdidos não voltam.`, '💊'); await banner('💊 Curado!', `${who(e.pid)} eliminou o veneno`, 'good', 1800); },
    async sleep(e) {
      V.players[e.pid].sleep += e.turns; render(); sfx.snore();
      const el = e.pid === ME ? $app.querySelector('.sectionlbl') : $app.querySelector(`[data-foe="${e.pid}"]`);
      floatText(el, '💤', 'big');
      narr(`${who(e.pid)} vai dormir por ${e.turns} ${plural(e.turns, 'turno', 'turnos')}: pula a vez e, enquanto dorme, ninguém pode jogar cartas ${e.pid === ME ? 'em você' : 'nele'}.`, '😴');
      await banner('😴 Hora de dormir', `${who(e.pid)} dorme por ${e.turns} ${plural(e.turns, 'turno', 'turnos')}`, '', 2000);
    },
    async sleepskip(e) { V.players[e.pid].sleep = Math.max(0, V.players[e.pid].sleep - 1); render(); sfx.snore(); narr(`${who(e.pid)} está dormindo e pula esta vez.`, '😴'); await banner('😴 Zzz…', `${who(e.pid)} está dormindo e pula a vez`, '', 2000); },
    async extraturn(e) { sfx.magic(); narr(`Turno extra! ${who(e.pid)} joga de novo.`, '⏳'); await banner('⏳ Turno extra!', `${who(e.pid)} joga de novo`, 'good', 1800); },
    async timetravel() { sfx.magic(); },
    async shuffle(e) {
      const pile = (e && e.pile) || 'deck';
      const L = { deck: ['monte de compra', '#deck'], bodies: ['monte de corpos', '.vgroup [data-market]'], objectives: ['monte de objetivos', '#objpile'] }[pile];
      sfx.shuffle(); render();
      $app.querySelectorAll(pile === 'bodies' ? '[data-market]' : L[1]).forEach(el => pulse(el, 'spin', 800));
      narr(pile === 'bodies' ? `${who(e.pid)} embaralhou o monte de corpos: a vitrine foi trocada.` : `${who(e.pid)} embaralhou o ${L[0]}.`, '🌀');
      await banner(`🌀 ${L[0][0].toUpperCase() + L[0].slice(1)} embaralhado`, pile === 'bodies' ? 'Vitrine nova' : '', '', 1500);
    },
    async reshuffle() { sfx.shuffle(); pulse($app.querySelector('#deck'), 'spin', 800); narr(`O monte acabou: as cartas do descarte foram embaralhadas e viraram o novo monte.`, '🔄'); await banner('🔄 Monte reabastecido', 'O descarte voltou para o monte', '', 1800); },
    async discard(e) {
      const from = srcRect(e.pid, e.card); removeFromHand(e.pid, e.card); render();
      narr(`${who(e.pid)} perdeu <b>${esc(NM(e.card))}</b>, que foi para o descarte.`, '🗑️');
      await spotlight(e.card, `${who(e.pid)} ${e.pid === ME ? 'perdeu' : 'perdeu'} <b>${esc(NM(e.card))}</b><div class="expl">A carta foi para o descarte.</div>`, from, discardRect(), { label: 'Descarte' });
      V.discard = V.discard.concat(e.card); render();
    },
    async take(e) {
      const from = srcRect(e.from, e.card); removeFromHand(e.from, e.card); render();
      const vis = e.to === ME || e.from === ME;
      sfx.steal();
      if (vis) await spotlight(e.card, e.from === ME ? `${who(e.to)} pegou <b>${esc(NM(e.card))}</b> da sua mão` : `Você pegou <b>${esc(NM(e.card))}</b> da mão de ${whom(e.from)}${help(e.card)}`, from, e.to === ME ? handRect() : chipRect(e.to), { label: 'Pega Carta' });
      else await fly(null, from, chipRect(e.to), { back: true, dur: 900, silent: true });
      addToHand(e.to, e.card); render();
      narr(e.from === ME ? `${who(e.to)} pegou <b>${esc(NM(e.card))}</b> da sua mão.` : e.to === ME ? `Você pegou <b>${esc(NM(e.card))}</b> da mão de ${whom(e.from)}.` : `${who(e.to)} pegou uma carta da mão de ${whom(e.from)}.`, '🫳');
      if (!vis) await hold(1600);
    },
    async swap(e) {
      const ra = e.a === ME ? handRect() : chipRect(e.a), rb = e.b === ME ? handRect() : chipRect(e.b);
      sfx.steal();
      await Promise.all([fly(e.a === ME ? e.gave : null, ra, rb, { back: e.a !== ME, dur: 900, silent: true }), fly(e.a === ME || e.b === ME ? e.got : null, rb, ra, { back: !(e.a === ME || e.b === ME), dur: 900, silent: true })]);
      removeFromHand(e.a, e.gave); removeFromHand(e.b, e.got); addToHand(e.a, e.got); addToHand(e.b, e.gave); render();
      if (e.a === ME || e.b === ME) { const got = e.a === ME ? e.got : e.gave; await spotlight(got, `Você recebeu <b>${esc(NM(got))}</b> na troca${help(got)}`, e.a === ME ? rb : ra, handRect(), { label: 'Intercâmbio' }); }
      narr(e.b === ME ? `${who(e.a)} trocou cartas com você: você recebeu <b>${esc(NM(e.gave))}</b> e perdeu <b>${esc(NM(e.got))}</b>.` : e.a === ME ? `Você entregou <b>${esc(NM(e.gave))}</b> e recebeu <b>${esc(NM(e.got))}</b>.` : `${who(e.a)} trocou uma carta com ${whom(e.b)}.`, '🔁');
      if (!(e.a === ME || e.b === ME)) await hold(2000);
    },
    async steal(e) {
      setFocus(e.from);
      const el = $app.querySelector(`[data-piece="${e.card}"]`); const from = rectOf(el);
      const g = V.players[e.from].giraffes.find(x => x.id === e.fromGid); if (g) g.necks = g.necks.filter(n => n !== e.card);
      if (V.dmg) delete V.dmg[e.card]; if (V.wounds) delete V.wounds[e.card];
      render(); sfx.steal();
      await spotlight(e.card, `${who(e.to)} roubou o pescoço <b>${esc(NM(e.card))}</b> de ${whom(e.from)}${help(e.card)}`, from, e.to === ME ? handRect() : chipRect(e.to), { label: 'Missão Pescoço' });
      if (e.toGid) { const d = V.players[e.to].giraffes.find(x => x.id === e.toGid); if (d) d.necks.push(e.card); setFocus(e.to); ui.enter = { piece: e.card }; render(); sfx.place(); }
      else addToHand(e.to, e.card);
      render();
      narr(`${who(e.to)} roubou o pescoço <b>${esc(NM(e.card))}</b> de ${whom(e.from)}${e.toGid ? ` e encaixou em ${esc(gname(V, e.to, e.toGid))}` : ' (sem espaço na mesa, foi para a mão)'}.`, '🪝');
      await wait(700);
    },
    async portal(e) {
      const cards = e.cards || [e.card];
      V.discard = V.discard.filter(x => !cards.includes(x)); render(); sfx.magic();
      const pair = cards.length > 1;
      narr(pair ? `${who(e.pid)} usou o Portal e pegou a girafa completa <b>${esc(NM(cards[0]))}</b> (cabeça e corpo de <b>${esc(NM(cards[1]))}</b>) do descarte. O turno acabou.` : `${who(e.pid)} usou o Portal e pegou <b>${esc(NM(e.card))}</b> do descarte. O turno acabou.`, '🌌');
      for (const id of cards) {
        await spotlight(id, pair ? `${who(e.pid)} pegou ${E.CARDS[id].kind === 'head' ? 'a cabeça' : 'o corpo'} <b>${esc(NM(id))}</b> do descarte` : `${who(e.pid)} pegou <b>${esc(NM(id))}</b> do descarte${help(id)}`, discardRect(), e.pid === ME ? handRect() : chipRect(e.pid), { label: pair ? 'Portal · girafa completa' : 'Portal' });
        addToHand(e.pid, id); render();
      }
    },
    async destiny(e) { sfx.magic(); narr(`${who(e.pid)} está olhando as 2 cartas do topo do monte.`, '🔮'); await banner('🔮 Vendo o futuro…', `${who(e.pid)} olha as 2 cartas do topo`, '', 1600); },
    async destinypick(e) { narr(e.pid === ME ? `Você ficou com <b>${esc(NM(e.card))}</b>. A outra carta voltou para o topo do monte e o seu turno acabou.` : `${who(e.pid)} escolheu uma carta. A outra voltou para o topo do monte e o turno acabou.`, '🔮'); if (e.pid !== ME) await hold(1500); addToHand(e.pid, e.card); render(); },
    async handdiscard(e) {
      for (const c of e.cards) { const from = srcRect(e.pid, c); removeFromHand(e.pid, c); render(); await fly(c, from, discardRect(), { dur: 500 }); V.discard = V.discard.concat(c); }
      render();
    },
    async objoffer(e) { if (e.pid === ME) narr(`Escolha seu novo objetivo: olhe os 2 do topo do monte de objetivos e fique com um. O outro vai para baixo do monte.`, '🎯'); else narr(`${who(e.pid)} está escolhendo um novo objetivo.`, '🎯'); },
    async objpick(e) {
      const p = V.players[e.pid]; if (!p.objectives.includes(e.obj)) p.objectives = p.objectives.concat(e.obj);
      if (e.pid !== ME) { narr(`${who(e.pid)} olhou os 2 objetivos do topo, ficou com um${e.under ? ' e pôs o outro embaixo do monte' : ''}.`, '🎯'); pulse($app.querySelector('#objpile'), 'spin', 800); await wait(700); }
      else narr(`Novo objetivo: <b>${esc(E.OBJ[e.obj].name)}</b> (${E.OBJ[e.obj].pts} ${plural(E.OBJ[e.obj].pts, 'ponto', 'pontos')}).${e.under ? ' O outro foi para baixo do monte.' : ''}`, '🎯');
      render();
    },
    async objective(e) {
      const p = V.players[e.pid];
      p.objectives = p.objectives.filter(o => o !== e.obj); p.done = p.done.concat(e.obj); render();
      sfx.fanfare(); setTimeout(() => sfx.sparkle(), 500);
      const c = centerRect(0.5, 210);
      const el = document.createElement('div'); el.className = 'objfx';
      el.style.cssText = `left:${c.x}px;top:${c.y}px;width:${c.w}px;height:${c.h}px`;
      el.innerHTML = `<div class="b"></div><div class="f" style="background-image:url(${objImg(e.obj)})"></div>`;
      $fx.appendChild(el);
      const O = E.OBJ[e.obj], tot = E.score(p);
      narr(`${who(e.pid)} completou o objetivo <b>${esc(O.name)}</b> (${esc(O.text)}) e ganhou ${O.pts} ${plural(O.pts, 'ponto', 'pontos')}. Total: ${tot} ${plural(tot, 'ponto', 'pontos')} e ${p.done.length} de 3 objetivos.`, '🏆');
      const bn = document.createElement('div'); bn.className = 'banner gold';
      bn.innerHTML = `<div class="b1">🏆 Objetivo completo!</div><div class="b2">${who(e.pid)} · ${esc(O.name)}<br><small>${esc(O.text)}</small><br>+${O.pts} ${plural(O.pts, 'ponto', 'pontos')}</div><div class="tap">toque para seguir</div>`;
      $fx.appendChild(bn); await hold(TAP); bn.remove();
      el.classList.add('out'); await wait(300); el.remove();
    },
    async win(e) { narr(`<b>${who(e.pid)} ${e.pid === ME ? 'venceu' : 'venceu'} a partida!</b>`, '👑'); },
  };
  function removeFromHand(pid, id) {
    const p = V.players[pid];
    const i = p.hand.indexOf(id);
    p.hand = p.hand.slice();
    if (i >= 0) p.hand.splice(i, 1); else if (pid !== ME) p.hand.pop();
  }
  function addToHand(pid, id) { const p = V.players[pid]; p.hand = p.hand.concat(id); }

  async function celebrate() {
    if (ui.celebrated === st.seed) return; ui.celebrated = st.seed;
    sfx.fanfare();
    const colors = ['#c8913f', '#e0462c', '#45a161', '#4a86dc', '#e3b53b', '#ebe5da'];
    for (let i = 0; i < 90; i++) {
      const c = document.createElement('i'); c.className = 'confetti';
      c.style.left = Math.random() * 100 + 'vw'; c.style.background = colors[i % colors.length];
      c.style.animationDelay = Math.random() * 0.8 + 's'; c.style.animationDuration = 2 + Math.random() * 1.6 + 's';
      c.style.transform = `rotate(${Math.random() * 360}deg)`;
      $fx.appendChild(c); setTimeout(() => c.remove(), 4500);
    }
    ui.sheet = { type: 'over' }; renderSheet();
  }

  // ---------- toast ----------
  let toastTimer = null;
  function toast(msg) {
    let t = document.querySelector('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }


  // =====================================================================
  // ONLINE: o dono do jogo é o anfitrião. Ele roda as regras e os bots e
  // grava o estado em db (online/game). Os outros leem esse documento e
  // mandam suas jogadas pela presença da sala; o anfitrião confere e aplica.
  // =====================================================================
  const NET = { mode: 'solo', ready: false, db: null, room: null, user: null, uid: null, owner: false,
    isHost: false, doc: null, ver: 0, incoming: null, queue: [], actN: 0, writing: Promise.resolve(), sentAt: 0, absent: {} };
  const MAX_SEATS = 6;
  // ---------- versão instalável: salas com código no Firebase (net-firebase.js) ----------
  let watchdogOn = false;
  async function connectRoom(R) {
    NET.db = R.db; NET.room = R.room; NET.user = R.user; NET.code = R.code;
    NET.uid = await R.user.id();
    NET.owner = !!(await R.user.isOwner());
    NET.ready = true; NET.why = '';
    R.db.doc('online/game').onSnapshot(onGameDoc, () => { toast(tS('netErr')); disconnectRoom(); });
    R.room.onPeers(onPeers);
    R.room.presence({ name: myName(), seen: 0 });
    if (!watchdogOn) { watchdogOn = true; setInterval(hostWatchdog, 5000); }
  }
  function disconnectRoom() {
    if (window.GDNet) window.GDNet.leave();
    NET.ready = false; NET.why = 'code'; NET.db = null; NET.room = null; NET.doc = null; NET.owner = false; NET.code = null; NET.autoJoin = false;
    refreshSetup();
  }
  async function netCreate() {
    NET.why = 'busy'; refreshSetup();
    try { const R = await window.GDNet.create(); await connectRoom(R); await hostOpenLobby(); }
    catch (e) { console.error(e); toast(tS('netErr')); disconnectRoom(); }
  }
  async function netJoin(code) {
    NET.why = 'busy'; refreshSetup();
    try { const R = await window.GDNet.join(code); NET.autoJoin = true; await connectRoom(R); }
    catch (e) { console.error(e); toast(e && e.code === 'notfound' ? tS('notFound') : e && e.code === 'invalid' ? tS('invalid') : tS('netErr')); disconnectRoom(); }
  }
  async function initNet() {
    if (window.GDNet) { NET.why = 'code'; refreshSetup(); return; }
    if (!window.claude || !window.claude.use) return;
    try {
      const [db, room, user] = await Promise.all([claude.use('db'), claude.use('room'), claude.use('user')]);
      NET.why = !room ? 'room' : !db ? 'db' : !user ? 'user' : '';
      if (!db || !room || !user) { refreshSetup(); return; }
      NET.db = db; NET.room = room; NET.user = user;
      NET.uid = await user.id();
      NET.owner = !!(await user.isOwner());
      if (!NET.uid) { NET.why = 'login'; refreshSetup(); return; }
      NET.ready = true;
      db.doc('online/game').onSnapshot(onGameDoc, () => { NET.ready = false; refreshSetup(); });
      room.onPeers(onPeers);
      room.presence({ name: myName(), seen: 0 });
      setInterval(hostWatchdog, 5000);
      refreshSetup();
    } catch (e) { console.error(e); }
  }
  const myName = () => ((prefs.name || 'Jogador').trim() || 'Jogador').slice(0, 16);
  const seatOf = (D, uid) => D && D.seats ? D.seats.findIndex(x => x.by === uid) : -1;
  function refreshSetup() {
    if (ui.view === 'setup') { const o = $app.querySelector('#online'); if (o) { o.innerHTML = onlineSetupHTML(); bindOnlineSetup(); } }
    if (ui.view === 'lobby') renderLobby();
  }

  function onlineSetupHTML() {
    if (!NET.ready && NET.why === 'code') {
      return `<div class="sectionlbl">${tS('online')}</div>
        <button class="btn ghost" id="netcreate"><span>${tS('create')}</span><small>${tS('host')}</small></button>
        <div class="field"><label for="netcode">${tS('codeLbl')}</label>
          <div style="display:flex;gap:8px"><input id="netcode" maxlength="8" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="${tS('codePh')}" style="flex:1;min-width:0;text-transform:uppercase;letter-spacing:.12em">
          <button class="btn" id="netjoincode" style="flex:0 0 auto"><span>${tS('enter')}</span></button></div></div>`;
    }
    if (!NET.ready && NET.why === 'busy') return `<div class="sectionlbl">${tS('online')}</div><p class="note">${tS('connecting')}</p>`;
    if (!NET.ready) {
      const why = NET.why === 'login' ? tS('login') : NET.why ? tS('public') : tS('connecting');
      return `<div class="sectionlbl">${tS('online')}</div><p class="note">${why}</p>`;
    }
    const D = NET.doc;
    let h = `<div class="sectionlbl">${tS('online')}</div>`;
    // quem sai de uma partida online não volta para ela: a mesa sempre recomeça pela sala de espera
    if (NET.owner) {
      if (D && D.status === 'lobby') h += `<button class="btn" id="netlobby"><span>${tS('openLobby')}</span><small>${tS('openLobbySub')}</small></button>`;
      else h += `<button class="btn ghost" id="netopen"><span>${tS('newLobby')}</span><small>${tS('host')}</small></button>`;
      if (D && D.status === 'playing') h += `<p class="note">${tS('ended')}</p>`;
    } else {
      if (D && D.status === 'lobby') h += `<button class="btn" id="netjoin"><span>${tS('join')(esc(D.hostName || 'anfitrião'))}</span><small>online</small></button>`;
      else if (D && D.status === 'playing') h += `<p class="note">${tS('running')}</p>`;
      else h += `<p class="note">${tS('wait')}</p>`;
    }
    if (NET.code) h += `<p class="note">${tS('roomLbl')} <b style="letter-spacing:.12em">${esc(NET.code)}</b> · <button class="chip" id="netleaveroom">${tS('leaveRoom')}</button></p>`;
    return h;
  }
  function bindOnlineSetup() {
    const q = id => $app.querySelector(id);
    if (q('#netcreate')) q('#netcreate').onclick = () => { if (requireNick()) { audio(); netCreate(); } };
    if (q('#netjoincode')) {
      const go = () => { if (!requireNick()) return; audio(); netJoin(q('#netcode').value); };
      q('#netjoincode').onclick = go;
      q('#netcode').onkeydown = e => { if (e.key === 'Enter') go(); };
    }
    if (q('#netleaveroom')) q('#netleaveroom').onclick = () => { if (NET.room) NET.room.presence({ join: null }); disconnectRoom(); };
    if (q('#netopen')) q('#netopen').onclick = () => { if (requireNick()) hostOpenLobby(); };
    if (q('#netlobby')) q('#netlobby').onclick = () => { if (!requireNick()) return; audio(); joinLobby(); };
    if (q('#netjoin')) q('#netjoin').onclick = () => { if (!requireNick()) return; audio(); joinLobby(); };
  }

  function joinLobby() { ui.view = 'lobby'; NET.room.presence({ name: myName(), join: true, quit: null, act: null }); renderLobby(); }
  // limpa a partida online da tela deste aparelho
  function dropOnlineGame() {
    leaveOnline(); st = null; V = null; ui.sheet = null;
    stageCards.forEach(c => c.el.remove()); stageCards = []; $stage.classList.remove('on'); $stage.innerHTML = ''; renderSheet();
  }
  // anfitrião: descarta a partida e volta todo mundo para a sala de espera
  async function hostResetToLobby(stay) {
    const prev = NET.doc && NET.doc.gameId;
    const lobby = { status: 'lobby', host: NET.uid, hostName: myName(), at: Date.now(), prev: prev || null };
    NET.resetting = true;
    try { await NET.writing; await NET.db.doc('online/game').set(lobby); NET.doc = lobby; } catch (e) { toast('Não foi possível reiniciar a mesa (' + (e.code || 'erro') + ').'); }
    NET.resetting = false;
    dropOnlineGame();
    if (stay) joinLobby(); else { NET.room.presence({ join: null }); ui.view = 'setup'; renderSetup(); }
  }

  // ---------- sala de espera ----------
  function lobbyPeople() {
    const seen = new Set(), list = [];
    for (const p of NET.room.peers()) {
      if (!p.by || p.kind !== 'viewer' || !p.presence || !p.presence.join || seen.has(p.by)) continue;
      seen.add(p.by); list.push({ by: p.by, name: String(p.presence.name || 'Jogador').slice(0, 16), me: p.by === NET.uid, guest: p.guest });
    }
    list.sort((a, b) => (b.by === (NET.doc && NET.doc.host)) - (a.by === (NET.doc && NET.doc.host)));
    return list;
  }
  const setScreen = n => { document.body.dataset.screen = n; };
  function renderLobby() {
    setScreen('setup');
    const D = NET.doc;
    if (!D || D.status !== 'lobby') { if (D && D.status === 'playing' && seatOf(D, NET.uid) >= 0) return enterOnline(D); ui.view = 'setup'; return renderSetup(); }
    const people = lobbyPeople().slice(0, MAX_SEATS);
    const bots = Math.min(prefs.bots, MAX_SEATS - people.length);
    const host = NET.owner;
    $app.innerHTML = `<div class="setup">
      <h1>Sala de espera</h1>
      ${NET.code ? `<div class="field"><label>Código da sala</label><div style="font-family:var(--f-display);font-size:30px;letter-spacing:.2em;color:var(--bronze);user-select:all">${esc(NET.code)}</div></div>` : ''}
      <p class="lede">${host && NET.code ? 'Passe este código para quem vai jogar. A pessoa abre o jogo, digita o código em <b>Código da sala</b> e toca em <b>Entrar</b>; ela aparece aqui. Se alguém sair durante a partida, todos voltam para esta sala e a partida recomeça.' : host ? 'Mande o link do jogo para quem vai jogar. Quando a pessoa abrir e tocar em <b>Entrar na sala de espera</b>, ela aparece aqui. Se alguém sair durante a partida, todos voltam para esta sala e a partida recomeça.' : `Você está na sala de espera de <b>${esc(D.hostName || 'anfitrião')}</b>. A partida começa quando o anfitrião tocar em Começar. Se alguém sair durante a partida, todos voltam para cá.`}</p>
      <div class="field"><label>Na mesa (${people.length} de ${MAX_SEATS})</label>
        <div class="seatlist">${people.map(p => `<div class="seat"><span>🦒 ${esc(p.name)}</span><small>${p.by === D.host ? 'anfitrião' : ''}${p.me ? ' · você' : ''}</small></div>`).join('') || '<p class="note">Ninguém ainda.</p>'}
        ${host ? Array.from({ length: bots }, (_, i) => `<div class="seat bot"><span>🤖 ${BOT_NAMES[i]}</span><small>bot</small></div>`).join('') : ''}</div></div>
      ${host ? `<div class="field"><label>Bots para completar a mesa</label><div class="seg" id="lbots">${[0, 1, 2, 3, 4, 5].map(n => `<button data-n="${n}" class="${n === Math.min(prefs.bots, 5) ? 'on' : ''}" ${people.length + n > MAX_SEATS ? 'disabled' : ''}>${n}</button>`).join('')}</div></div>
      <button class="btn" id="lstart" ${people.length + bots < 2 ? 'disabled' : ''}><span>Começar a partida</span><small>${people.length + bots} jogadores</small></button>
      <button class="btn ghost" id="lclose"><span>Fechar a mesa</span></button>` : `<div class="waiting"><span class="dots"><i></i><i></i><i></i></span> Esperando o anfitrião começar…</div><button class="btn ghost" id="lleave"><span>Sair da sala de espera</span></button>`}
    </div>`;
    const q = id => $app.querySelector(id);
    if (q('#lbots')) q('#lbots').onclick = e => { const n = e.target.dataset.n; if (n !== undefined && !e.target.disabled) { prefs.bots = +n; savePrefs(); renderLobby(); } };
    if (q('#lstart')) q('#lstart').onclick = () => hostStart(people, bots);
    if (q('#lclose')) q('#lclose').onclick = async () => { await hostEndTable(); if (NET.code) { disconnectRoom(); ui.view = 'setup'; renderSetup(); } };
    if (q('#lleave')) q('#lleave').onclick = () => { NET.room.presence({ join: null }); if (NET.code) disconnectRoom(); ui.view = 'setup'; renderSetup(); };
  }

  // ---------- anfitrião ----------
  async function hostOpenLobby() {
    audio();
    try {
      const lobby = { status: 'lobby', host: NET.uid, hostName: myName(), at: Date.now() };
      await NET.db.doc('online/game').set(lobby);
      NET.doc = lobby;
      NET.room.presence({ name: myName(), join: true });
      ui.view = 'lobby'; renderLobby();
    } catch (e) { toast('Não foi possível abrir a mesa (' + (e.code || 'erro') + ').'); }
  }
  async function hostStart(people, bots) {
    const seats = people.map(p => ({ by: p.by, name: p.name, human: true })).concat(Array.from({ length: bots }, (_, i) => ({ by: null, name: BOT_NAMES[i], human: false })));
    // anfitrião sempre no assento 0
    seats.sort((a, b) => (b.by === NET.uid) - (a.by === NET.uid));
    const g = E.newGame(seats.map(x => ({ name: x.name, isBot: !x.human })));
    g.online = { ack: {} };
    try {
      await NET.db.doc('online/game').set({ status: 'playing', host: NET.uid, hostName: myName(), seats, state: g, ver: 1, gameId: String(g.seed) + '-' + Date.now(), at: Date.now() });
    } catch (e) { toast('Não foi possível começar (' + (e.code || 'erro') + ').'); }
  }
  function pushState() {
    if (!NET.isHost || !NET.doc) return;
    NET.ver++;
    const body = { status: 'playing', host: NET.uid, hostName: NET.doc.hostName, seats: NET.doc.seats, gameId: NET.doc.gameId, state: st, ver: NET.ver, at: Date.now() };
    const json = JSON.parse(JSON.stringify(body));
    NET.writing = NET.writing.then(() => NET.db.doc('online/game').set(json)).catch(e => { console.error(e); toast('Falha ao salvar a jogada online.'); });
  }
  async function hostEndTable() {
    try { await NET.writing; await NET.db.doc('online/game').set({ status: 'ended', host: NET.uid, at: Date.now() }); } catch (e) {}
    leaveOnline();
  }
  function onPeers(ch) {
    if (ui.view === 'lobby') renderLobby();
    if (!NET.isHost || NET.mode !== 'online' || !st) return;
    const seats = NET.doc && NET.doc.seats; if (!seats) return;
    const quitter = ch.peers.find(p => p.by && p.by !== NET.uid && p.presence && p.presence.quit && p.presence.quit === NET.doc.gameId && seats.some(x => x.human && x.by === p.by));
    if (quitter && !NET.resetting) { toast(`${String(quitter.presence.name || 'Um jogador').slice(0, 16)} saiu: a partida recomeça na sala de espera.`); hostResetToLobby(true); return; }
    const ack = (st.online = st.online || { ack: {} }).ack;
    for (const p of ch.peers) {
      if (!p.by || p.by === NET.uid) continue;
      const a = p.presence && p.presence.act;
      if (!a || typeof a.n !== 'number' || a.g !== NET.doc.gameId || a.n <= (ack[p.by] || 0)) continue;
      if (NET.queue.some(q => q.by === p.by && q.a.n === a.n)) continue;
      NET.queue.push({ by: p.by, a });
    }
    // jogador voltou: sai do controle do bot
    let changed = false;
    seats.forEach((x, i) => {
      if (!x.human) return;
      const here = ch.peers.some(p => p.by === x.by);
      if (here) { delete NET.absent[x.by]; if (st.players[i].isBot && x.by !== NET.uid) { st.players[i].isBot = false; st.log.push(`🔌 ${x.name} voltou para a mesa.`); changed = true; } }
    });
    if (changed) { pushState(); }
    if (NET.queue.length && !pumping) pump();
  }
  function hostApplyQueued() {
    const { by, a } = NET.queue.shift();
    const seat = seatOf(NET.doc, by);
    st.online.ack[by] = a.n;
    if (seat < 0) return;
    snap = clone(st);
    const r = applyAct(st, seat, a);
    if (r && r.ok === false) { console.warn('jogada recusada', r.error); }
    pushState();
  }
  // espera os outros celulares terminarem de ver a jogada anterior (como numa mesa de verdade)
  async function waitPlayersCaughtUp() {
    const target = st.evSeq || 0, t0 = Date.now();
    while (Date.now() - t0 < 90000) {
      const late = (NET.doc.seats || []).filter((x, i) => x.human && x.by !== NET.uid && !st.players[i].isBot).filter(x => {
        const p = NET.room.peers().find(q => q.by === x.by);
        return p && (p.presence.seen || 0) < target;
      });
      if (!late.length) return true;
      ui.status = `Esperando ${late.map(x => x.name).join(', ')} acompanhar a jogada…`; render();
      await new Promise(r => setTimeout(r, 400));
      if (NET.queue.length || NET.mode !== 'online') return false;
    }
    return true;
  }
  // quem sumiu por mais de 40 s passa a ser jogado por um bot
  function hostWatchdog() {
    if (!NET.isHost || NET.mode !== 'online' || !st || st.winner !== null || !NET.doc || !NET.doc.seats) return;
    const now = Date.now(); let changed = false;
    NET.doc.seats.forEach((x, i) => {
      if (!x.human || x.by === NET.uid || st.players[i].isBot) return;
      const here = NET.room.peers().some(p => p.by === x.by);
      if (here) { delete NET.absent[x.by]; return; }
      NET.absent[x.by] = NET.absent[x.by] || now;
      if (now - NET.absent[x.by] > 40000) { st.players[i].isBot = true; st.log.push(`🔌 ${x.name} saiu da mesa. Um bot joga no lugar até ele voltar.`); changed = true; }
    });
    if (changed) { pushState(); render(); if (!pumping) pump(); }
  }

  // ---------- todos ----------
  function onGameDoc(snapDoc) {
    const D = snapDoc.exists ? snapDoc.data() : null;
    const before = NET.doc;
    NET.doc = D;
    if (!D || D.status === 'ended') {
      const wasIn = NET.mode === 'online' || ui.view === 'lobby';
      if (NET.mode === 'online') { toast('O anfitrião fechou a mesa.'); dropOnlineGame(); ui.view = 'setup'; renderSetup(); }
      else if (wasIn && D && !NET.owner) toast('O anfitrião fechou a mesa.');
      // versão com código: quem não é o anfitrião sai da sala fechada
      if (NET.code && !NET.owner && D) { setTimeout(disconnectRoom, 0); if (ui.view === 'lobby') { ui.view = 'setup'; renderSetup(); } return; }
      refreshSetup(); return;
    }
    if (D.status === 'lobby' && NET.autoJoin && NET.mode !== 'online') { NET.autoJoin = false; joinLobby(); return; }
    if (D.status === 'lobby') {
      // a partida foi reiniciada: quem estava jogando volta para a sala de espera
      if (NET.mode === 'online' && !NET.resetting) {
        const wasHost = NET.isHost;
        dropOnlineGame();
        if (!wasHost) { toast('A partida foi reiniciada: todos voltaram para a sala de espera.'); joinLobby(); return; }
      }
      refreshSetup(); return;
    }
    if (D.status === 'playing') {
      const seat = seatOf(D, NET.uid);
      if (NET.mode !== 'online') {
        if (ui.view === 'lobby' && seat >= 0) { enterOnline(D); return; }
        // quem saiu (fechou ou recarregou o jogo) não volta para a partida: ela recomeça pela sala de espera
        if (NET.owner && D.host === NET.uid && !NET.resetting) { hostResetToLobby(false); return; }
        if (seat >= 0 && NET.quitSent !== D.gameId) { NET.quitSent = D.gameId; NET.room.presence({ quit: D.gameId, join: null, act: null }); }
        refreshSetup();
        return;
      }
      if (NET.isHost) return; // o anfitrião é quem escreve
      if ((D.ver || 0) <= NET.ver) return;
      NET.ver = D.ver;
      const ns = JSON.parse(JSON.stringify(D.state));
      if (pumping) NET.incoming = ns;
      else { snap = st; st = ns; pump(); }
    }
  }
  function enterOnline(D) {
    const seat = seatOf(D, NET.uid);
    if (seat < 0) return;
    NET.mode = 'online'; NET.isHost = D.host === NET.uid; NET.ver = D.ver || 0;
    ME = seat; ui.focus = ME; ui.celebrated = null;
    st = JSON.parse(JSON.stringify(D.state)); st.online = st.online || { ack: {} };
    V = st; lastSeq = st.evSeq || 0; snap = null;
    NET.actN = Math.max(NET.actN, (st.online.ack || {})[NET.uid] || 0);
    ui.view = 'game';
    NET.room.presence({ name: myName(), join: null, seen: lastSeq, act: null });
    narr(`Você entrou na mesa online de <b>${esc(D.hostName || '')}</b>. ${NET.isHost ? 'Você é o anfitrião: deixe o jogo aberto para a partida andar.' : 'As jogadas de todos aparecem aqui ao vivo.'}`, '🌐');
    if (!st.players[ME].done.length && (st.turnNo || 0) <= st.players.length && ui.introFor !== D.gameId) { ui.introFor = D.gameId; render(); objIntro().then(pump); } else pump();
  }
  function leaveOnline() {
    NET.mode = 'solo'; NET.isHost = false; NET.queue = []; NET.incoming = null; ME = 0;
    if (NET.room) NET.room.presence({ join: null, act: null });
  }
  let seenTimer = null;
  function reportSeen() {
    clearTimeout(seenTimer);
    seenTimer = setTimeout(() => { if (NET.room && NET.mode === 'online') NET.room.presence({ seen: lastSeq }); }, 150);
  }
  function sendIntent(a) {
    NET.actN++;
    NET.room.presence({ act: Object.assign({ n: NET.actN, g: NET.doc && NET.doc.gameId }, a), seen: lastSeq });
    ui.busy = true; ui.status = 'Enviando sua jogada…'; render();
    const n = NET.actN;
    setTimeout(() => { if (ui.busy && !pumping && NET.actN === n) { ui.busy = false; ui.status = ''; render(); toast('Sua jogada ainda não foi registrada. O anfitrião está com o jogo aberto?'); } }, 45000);
  }

  // ---------- abertura: mostra os 2 objetivos secretos ----------
  function objIntro() {
    const me = st && st.players[ME]; if (!me || !me.objectives.length) return Promise.resolve();
    return new Promise(res => {
      const n = me.objectives.length, gap = 12;
      const w = Math.min(160, (Math.min(window.innerWidth, 720) - 32 - gap * (n - 1)) / n), h = w * 611 / 400;
      const x0 = (window.innerWidth - (w * n + gap * (n - 1))) / 2, y = Math.max(70, window.innerHeight * 0.14);
      const els = me.objectives.map((o, i) => {
        const el = document.createElement('div'); el.className = 'objfx';
        el.style.cssText = `left:${x0 + i * (w + gap)}px;top:${y}px;width:${w}px;height:${h}px;animation-delay:${i * 220}ms`;
        el.innerHTML = `<div class="b"></div><div class="f" style="background-image:url(${objImg(o)})"></div>`;
        $fx.appendChild(el); return el;
      });
      const bn = document.createElement('div'); bn.className = 'banner gold intro';
      bn.style.top = (y + h + 24) + 'px'; bn.style.bottom = 'auto'; bn.style.transform = 'translateX(-50%)';
      bn.innerHTML = `<div class="b1">🎯 Seus objetivos secretos</div><div class="b2">${me.objectives.map(o => `<b>${esc(E.OBJ[o].name)}</b> · ${E.OBJ[o].pts} ${plural(E.OBJ[o].pts, 'ponto', 'pontos')}<br><small>${esc(E.OBJ[o].text)}</small>`).join('<br>')}</div><button class="btn" id="introgo"><span>Começar</span><small>ver de novo em 🎯</small></button>`;
      $fx.appendChild(bn); sfx.sparkle && sfx.sparkle();
      bn.querySelector('#introgo').onclick = () => { els.forEach(el => el.classList.add('out')); bn.classList.add('out'); setTimeout(() => { els.forEach(el => el.remove()); bn.remove(); res(); }, 300); };
    });
  }

  // ---------- tela inicial ----------
  const BAD_NICKS = ['você', 'voce', 'jogador', 'eu'];
  const nickOk = () => { const n = (prefs.name || '').trim(); return n.length >= 2 && !BAD_NICKS.includes(n.toLowerCase()); };
  const SETUP_I18N = {
    pt: { lede: 'Monte girafas, empilhe pescoços até o nível 5 e cumpra seus objetivos antes que o Doom derrube tudo. Vence quem fizer 5 pontos ou completar 3 objetivos.', resume: 'Continuar partida', round: 'rodada', nick: 'Apelido', ph: 'Digite seu apelido', bots: 'Bots adversários', pace: 'Ritmo dos adversários', calm: 'Calmo', normal: 'Normal', fast: 'Rápido', start: 'Nova partida', players: 'jogadores', rules: 'Como jogar', online: 'Jogar online', connecting: 'Conectando…', login: 'Entre na sua conta do Claude e abra o jogo de novo.', public: 'Este acesso veio pelo <b>link público</b>, que não entra na sala online. Peça ao dono do jogo para convidar você pelo <b>e-mail</b> e abra o jogo pelo convite. Contra os bots dá para jogar normalmente.', openLobby: 'Abrir a sala de espera', openLobbySub: 'os jogadores entram por ela', newLobby: 'Abrir sala de espera online', host: 'você é o anfitrião', ended: 'A partida online anterior foi encerrada. Abra a sala de espera para começar outra.', join: n => `Entrar na sala de espera de ${n}`, running: 'Tem uma partida online em andamento. Quando ela reiniciar, o botão para entrar na sala de espera aparece aqui.', wait: 'Quando o dono do jogo abrir a sala de espera, o botão para entrar aparece aqui.', errOther: 'Escolha outro apelido (pelo menos 2 letras, diferente de “Você”).', errNone: 'Escolha um apelido para começar a partida.' },
    en: { lede: 'Build giraffes, stack necks up to level 5 and complete your objectives before the Doom knocks everything down. First to 5 points or 3 objectives wins.', resume: 'Continue game', round: 'round', nick: 'Nickname', ph: 'Type your nickname', bots: 'Bot opponents', pace: 'Opponent speed', calm: 'Calm', normal: 'Normal', fast: 'Fast', start: 'New game', players: 'players', rules: 'How to play', online: 'Play online', connecting: 'Connecting…', login: 'Sign in to your Claude account and open the game again.', public: 'You opened the <b>public link</b>, which can’t join the online room. Ask the game owner to invite you by <b>email</b> and open the game from the invite. You can still play against the bots.', openLobby: 'Open the waiting room', openLobbySub: 'players join through it', newLobby: 'Open online waiting room', host: 'you are the host', ended: 'The previous online game has ended. Open the waiting room to start another.', join: n => `Join ${n}’s waiting room`, running: 'An online game is in progress. When it restarts, the button to join the waiting room shows up here.', wait: 'When the game owner opens the waiting room, the join button shows up here.', errOther: 'Choose another nickname (at least 2 letters).', errNone: 'Choose a nickname to start the game.' },
    fr: { lede: 'Construis des girafes, empile les cous jusqu’au niveau 5 et remplis tes objectifs avant que le Doom ne détruise tout. Le premier à 5 points ou 3 objectifs gagne.', resume: 'Continuer la partie', round: 'manche', nick: 'Pseudo', ph: 'Tape ton pseudo', bots: 'Bots adversaires', pace: 'Rythme des adversaires', calm: 'Calme', normal: 'Normal', fast: 'Rapide', start: 'Nouvelle partie', players: 'joueurs', rules: 'Comment jouer', online: 'Jouer en ligne', connecting: 'Connexion…', login: 'Connecte-toi à ton compte Claude et rouvre le jeu.', public: 'Tu as ouvert le <b>lien public</b>, qui ne donne pas accès à la salle en ligne. Demande au propriétaire du jeu de t’inviter par <b>e-mail</b> et ouvre le jeu depuis l’invitation. Tu peux quand même jouer contre les bots.', openLobby: 'Ouvrir la salle d’attente', openLobbySub: 'les joueurs entrent par là', newLobby: 'Ouvrir la salle d’attente en ligne', host: 'tu es l’hôte', ended: 'La partie en ligne précédente est terminée. Ouvre la salle d’attente pour en lancer une autre.', join: n => `Rejoindre la salle d’attente de ${n}`, running: 'Une partie en ligne est en cours. Quand elle recommencera, le bouton pour rejoindre la salle d’attente apparaîtra ici.', wait: 'Quand le propriétaire du jeu ouvrira la salle d’attente, le bouton pour entrer apparaîtra ici.', errOther: 'Choisis un autre pseudo (au moins 2 lettres).', errNone: 'Choisis un pseudo pour commencer la partie.' },
    es: { lede: 'Arma jirafas, apila cuellos hasta el nivel 5 y cumple tus objetivos antes de que el Doom lo derribe todo. Gana quien haga 5 puntos o complete 3 objetivos.', resume: 'Continuar partida', round: 'ronda', nick: 'Apodo', ph: 'Escribe tu apodo', bots: 'Bots rivales', pace: 'Ritmo de los rivales', calm: 'Tranquilo', normal: 'Normal', fast: 'Rápido', start: 'Nueva partida', players: 'jugadores', rules: 'Cómo jugar', online: 'Jugar en línea', connecting: 'Conectando…', login: 'Inicia sesión en tu cuenta de Claude y vuelve a abrir el juego.', public: 'Entraste por el <b>enlace público</b>, que no da acceso a la sala en línea. Pide al dueño del juego que te invite por <b>correo</b> y abre el juego desde la invitación. Contra los bots puedes jugar normalmente.', openLobby: 'Abrir la sala de espera', openLobbySub: 'los jugadores entran por ella', newLobby: 'Abrir sala de espera en línea', host: 'eres el anfitrión', ended: 'La partida en línea anterior terminó. Abre la sala de espera para empezar otra.', join: n => `Entrar en la sala de espera de ${n}`, running: 'Hay una partida en línea en curso. Cuando se reinicie, aquí aparecerá el botón para entrar en la sala de espera.', wait: 'Cuando el dueño del juego abra la sala de espera, aquí aparecerá el botón para entrar.', errOther: 'Elige otro apodo (al menos 2 letras).', errNone: 'Elige un apodo para empezar la partida.' },
  };
  Object.assign(SETUP_I18N.pt, { create: 'Criar sala online', codeLbl: 'Código da sala', codePh: 'Ex.: GZ7K2', enter: 'Entrar', notFound: 'Sala não encontrada. Confira o código.', invalid: 'Digite o código que o anfitrião passou.', netErr: 'Sem conexão com o servidor do jogo. Verifique a internet e tente de novo.', roomLbl: 'Sala', leaveRoom: 'sair da sala' });
  Object.assign(SETUP_I18N.en, { create: 'Create online room', codeLbl: 'Room code', codePh: 'e.g. GZ7K2', enter: 'Join', notFound: 'Room not found. Check the code.', invalid: 'Type the code the host gave you.', netErr: 'Can’t reach the game server. Check your internet and try again.', roomLbl: 'Room', leaveRoom: 'leave room' });
  Object.assign(SETUP_I18N.fr, { create: 'Créer une salle en ligne', codeLbl: 'Code de la salle', codePh: 'ex. GZ7K2', enter: 'Entrer', notFound: 'Salle introuvable. Vérifie le code.', invalid: 'Tape le code donné par l’hôte.', netErr: 'Impossible de joindre le serveur du jeu. Vérifie ta connexion et réessaie.', roomLbl: 'Salle', leaveRoom: 'quitter la salle' });
  Object.assign(SETUP_I18N.es, { create: 'Crear sala en línea', codeLbl: 'Código de la sala', codePh: 'Ej.: GZ7K2', enter: 'Entrar', notFound: 'Sala no encontrada. Revisa el código.', invalid: 'Escribe el código que te pasó el anfitrión.', netErr: 'No hay conexión con el servidor del juego. Revisa internet e inténtalo de nuevo.', roomLbl: 'Sala', leaveRoom: 'salir de la sala' });
  const iosHint = () => { try { const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); return ios && !navigator.standalone && !window.Capacitor; } catch (e) { return false; } };
  const tS = k => (SETUP_I18N[splashLang()] || SETUP_I18N.pt)[k];
  function requireNick() {
    if (nickOk()) return true;
    const inp = $app.querySelector('#pname'), err = $app.querySelector('#nickerr');
    if (err) { err.hidden = false; err.textContent = (prefs.name || '').trim() ? tS('errOther') : tS('errNone'); }
    if (inp) { inp.classList.add('err'); inp.focus(); inp.classList.remove('shake'); void inp.offsetWidth; inp.classList.add('shake'); inp.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    return false;
  }
  function renderSetup() {
    setScreen('setup');
    const saved = load();
    const heroes = ['h_girafwitch', 'h_girafknight', 'h_piraffe', 'h_girafnaut', 'h_girafurai', 'h_giraflava'];
    $app.innerHTML = `
      ${langWidgetHTML('fixed')}
      <div class="setup">
        <h1 class="brand"><img src="img/logo.webp" alt="Giraffe Doom: The Neck Extension Trap Game"></h1>
        <div class="heroes">${heroes.map((h, i) => `<div class="card hero" style="background-image:url(img/${h}.webp);animation-delay:${i * 90}ms"></div>`).join('')}</div>
        <p class="lede">${tS('lede')}</p>
        ${iosHint() ? `<p class="note">📲 <b>No iPhone:</b> toque em <b>Compartilhar</b> (o quadrado com a seta) e depois em <b>Adicionar à Tela de Início</b> para instalar o jogo.</p>` : ''}
        ${saved && saved.winner === null ? `<button class="btn" id="resume"><span>${tS('resume')}</span><small>${tS('round')} ${Math.ceil(saved.turnNo / saved.players.length)}</small></button>` : ''}
        <div class="field"><label for="pname">${tS('nick')}</label><input id="pname" maxlength="16" autocomplete="nickname" placeholder="${tS('ph')}" value="${nickOk() ? esc(prefs.name) : ''}" aria-describedby="nickerr"><p class="fielderr" id="nickerr" hidden></p></div>
        <div class="field"><label>${tS('bots')}</label>
          <div class="seg" id="bots">${[1, 2, 3, 4, 5].map(n => `<button data-n="${n}" class="${n === prefs.bots ? 'on' : ''}">${n}</button>`).join('')}</div>
        </div>
        <div class="field"><label>${tS('pace')}</label>
          <div class="seg" id="speed">${[['lento', tS('calm')], ['normal', tS('normal')], ['rapido', tS('fast')]].map(([v, l]) => `<button data-v="${v}" class="${prefs.speed === v ? 'on' : ''}">${l}</button>`).join('')}</div>
        </div>
        <button class="btn" id="start"><span>${tS('start')}</span><small>${prefs.bots + 1} ${tS('players')}</small></button>
        <button class="btn ghost" id="rulesbtn"><span>${tS('rules')}</span></button>
        <div class="online" id="online">${onlineSetupHTML()}</div>
      </div>`;
    bindOnlineSetup();
    bindLangWidget($app, () => renderSetup());
    $app.querySelector('#bots').onclick = e => { const n = +e.target.dataset.n; if (n) { prefs.bots = n; savePrefs(); renderSetup(); } };
    $app.querySelector('#speed').onclick = e => { const v = e.target.dataset.v; if (v) { prefs.speed = v; savePrefs(); renderSetup(); } };
    if (!nickOk()) prefs.name = '';
    $app.querySelector('#pname').oninput = e => { prefs.name = e.target.value; savePrefs(); if (nickOk()) { e.target.classList.remove('err'); const er = $app.querySelector('#nickerr'); if (er) er.hidden = true; } };
    $app.querySelector('#start').onclick = () => {
      if (!requireNick()) return;
      audio();
      const nm = prefs.name.trim().slice(0, 16);
      const players = [{ name: nm }].concat(BOT_NAMES.slice(0, prefs.bots).map(n => ({ name: n, isBot: true })));
      NET.mode = 'solo'; NET.isHost = false; ME = 0;
      snap = null; st = E.newGame(players);
      V = clone(st); V.events = []; lastSeq = 0;
      // estado inicial "antes" para animar o primeiro turno
      snap = clone(st);
      ui.view = 'game'; ui.focus = ME; ui.celebrated = null;
      save(); render(); objIntro().then(pump);
    };
    const r = $app.querySelector('#resume'); if (r) r.onclick = () => { audio(); NET.mode = 'solo'; NET.isHost = false; ME = 0; st = saved; V = st; lastSeq = st.evSeq || 0; ui.view = 'game'; ui.focus = ME; pump(); };
    $app.querySelector('#rulesbtn').onclick = () => openSheet({ type: 'rules' });
  }

  // ---------- componentes ----------
  function giraffeHTML(S, g, owner) {
    const top = E.topPiece(g);
    const dmg = hurtOf(S, top.id);
    const hurt = id => hurtOf(S, id) ? `<span class="hpbadge ${(S.wounds || {})[id] ? 'wound' : ''}" title="dano">${hurtOf(S, id)}/${E.CARDS[id].def}</span>` : '';
    const own = S.players[owner];
    const venom = pid => { const pz = own ? own.poisons.filter(po => po.gid === g.id && (po.piece || top.id) === pid) : []; return pz.length ? `<div class="venom" title="envenenado">${pz.map((po, i) => `<span class="vcard" style="background-image:url(${img(po.card)});--i:${i}"></span>`).join('')}<b>☠️ ${pz.map(po => po.left).join('+')}</b></div>` : ''; };
    const headId = g.special || g.head;
    const necks = g.necks.slice().reverse(); // topo primeiro (perto da cabeça)
    const en = ui.enter || {};
    return `<div class="giraffe ${en.gid === g.id ? 'enter-g' : ''} ${ui.open.has(g.id) ? 'open' : ''}" data-gid="${g.id}" role="button" tabindex="0" aria-expanded="${ui.open.has(g.id)}" aria-label="Abrir ou fechar as cartas de ${esc(NM(headId))}">
      <div class="piece head" data-piece="${headId}" style="background-image:url(${img(headId)})">${hurt(headId)}${venom(headId)}</div>
      ${necks.map(n => `<div class="piece neck ${en.piece === n ? 'enter-n' : ''}" data-piece="${n}" style="background-image:url(${img(n)});--ico:url(img/c_${E.CARDS[n].color}.webp)" title="${esc(NM(n))}">${hurt(n)}${venom(n)}</div>`).join('')}
      ${g.body ? `<div class="piece body" data-piece="${g.body}" style="background-image:url(${img(g.body)})"></div>` : ''}
      <div class="cap"><b>${esc(NM(headId))}</b>${g.special ? 'nível 1' : 'nível ' + g.necks.length} ${dicons(top.def, dmg, 'inl')}</div>
    </div>`;
  }
  function herdHTML(S, p) {
    if (!p.giraffes.length) return `<div class="empty-herd">${p.idx === ME ? 'Nenhuma girafa na mesa ainda. Junte uma <b>cabeça</b> e o <b>corpo</b> da mesma girafa (a vitrine de corpos fica aqui embaixo) ou baixe uma girafa especial.' : `${esc(p.name)} ainda não tem girafas na mesa.`}</div>`;
    return `<div class="herd">${p.giraffes.map(g => giraffeHTML(S, g, p.idx)).join('')}</div>`;
  }
  function statusIcons(p) {
    return `${p.poisons.length ? `<span class="status" title="envenenado">☠️${p.poisons.length > 1 ? p.poisons.length : ''}</span>` : ''}${p.sleep ? `<span class="status" title="dormindo">😴${p.sleep}</span>` : ''}`;
  }

  // ---------- render ----------
  function render() {
    if (ui.view === 'lobby') return renderLobby();
    if (ui.view !== 'game' || !st) return renderSetup();
    setScreen('game');
    const S = V || st;
    const me = S.players[ME];
    const live = !ui.busy;
    const w = E.whoActs(st);
    const myTurn = live && st.turn === ME && !st.pending && st.winner === null;
    let bar;
    if (live && st.winner !== null) bar = `👑 <span><b>${esc(P(st.winner).name)}</b> venceu!</span>`;
    else if (live && st.pending && w === ME) bar = `⚡ <span><b>Sua resposta</b> — veja a janela aberta.</span>`;
    else if (myTurn) bar = `🦒 <span><b>Sua vez.</b> ${E.canBuild(st) ? `${st.swapped ? 'Coringa trocado ✓ (sem girafa nem pescoço neste turno)' : st.built ? 'Girafa baixada ✓ (pescoço só no próximo turno)' : st.neckPlayed ? 'Pescoço encaixado ✓' : 'Baixe 1 girafa <i>ou</i> 1 pescoço'}. Depois ataque e ` : 'Ataque ou use ações e '}${st.objBought ? 'encerre o turno (pegou objetivo: sem compra do monte).' : 'compre 1 carta para encerrar.'}</span>`;
    else bar = `${ui.thinking !== null || /Esperando|Enviando/.test(ui.status) ? '<span class="dots"><i></i><i></i><i></i></span>' : '⏳'} <span>${esc(ui.status || `Vez de ${S.players[S.turn].name}`)}</span>`;
    if (NET.mode === 'online') bar += `<span class="netpill" title="Partida online">🌐</span>`;
    const foes = S.players.filter(p => p.idx !== ME);
    const fp = S.players[ui.focus] || me;
    // guarda a posição de rolagem (mão, mesa, adversários) para não voltar ao início a cada atualização
    const SCR = ['#hand', '.herd', '.foes', '.table', '.herdwrap'];
    const keep = {}; SCR.forEach(s => { const el = $app.querySelector(s); if (el) keep[s] = [el.scrollLeft, el.scrollTop]; });
    const keepFocus = ui.focus;
    ui._restore = () => SCR.forEach(s => { const el = $app.querySelector(s), k = keep[s]; if (!el || !k) return; if (s === '.herd' && ui._lastFocus !== keepFocus) return; el.scrollLeft = k[0]; el.scrollTop = k[1]; });
    $app.innerHTML = `
      <div class="top">
        <div class="logo"><img src="img/logo.webp" alt="Giraffe Doom"></div>
        <button class="iconbtn score-pill" id="objbtn" title="Seus objetivos">🎯 ${E.score(me)}·${me.done.length}/3</button>
        <button class="iconbtn" id="logbtn" title="Histórico">📜</button>
        <button class="iconbtn" id="menubtn" title="Menu">☰</button>
      </div>
      <div class="foes">${foes.map(p => `
        <button class="foe ${S.turn === p.idx ? 'turn' : ''} ${ui.focus === p.idx ? 'focus' : ''} ${ui.thinking === p.idx ? 'thinking' : ''}" data-foe="${p.idx}">
          <span class="nm">${esc(p.name)} ${statusIcons(p)}</span>
          <span class="meta"><span>🂠 ${p.hand.length}</span><span>🎯 ${E.score(p)}·${p.done.length}</span><span>🦒 ${p.giraffes.length}</span></span>
          <span class="tower">${p.giraffes.map(g => `<i style="height:${4 + g.necks.length * 3}px"></i>`).join('') || '<i style="height:2px;opacity:.4"></i>'}</span>
          ${ui.thinking === p.idx ? '<span class="think"><span class="dots"><i></i><i></i><i></i></span></span>' : ''}
        </button>`).join('')}</div>
      <div class="turnbar ${myTurn ? 'mine' : ''}">${bar}</div>
      <div class="table">
        <div class="tablehead">
          <div class="sectionlbl">${ui.focus === ME ? 'Sua mesa' : 'Mesa de ' + esc(fp.name)} ${statusIcons(fp)}</div>
          <div class="tabs">${ui.focus !== ME ? `<button class="chip" id="mytable">Ver minha mesa</button><button class="chip" id="foedetail">Detalhes</button>` : `<button class="chip ${ui.pin === ME ? 'on' : ''}" id="pinme" title="Manter a sua mesa na tela enquanto os outros jogam">${ui.pin === ME ? '📌 Mesa fixada' : '📌 Fixar minha mesa'}</button>`}</div>
        </div>
        <div class="herdwrap">${herdHTML(S, fp)}</div>
        <div class="narr" aria-live="polite">${narrHTML()}</div>
      </div>
      <div class="dock">
        <div class="row">
          <div class="vgroup"><button class="deck objpile" id="objpile" title="Monte de objetivos"><span><b>${(S.objDeck || []).length}</b></span></button><div class="mini-lbl">objetivos</div></div>
          <div class="vgroup"><button class="deck pile ${myTurn ? 'go' : ''}" id="deck"><span><b>${S.deck.length}</b>monte</span></button><div class="mini-lbl">comprar</div></div>
          <div class="vgroup"><div class="row" style="padding:0;gap:6px">${S.market.map((b, i) => b ? `<button class="card sm ${E.canTakeBody(st, ME, b) ? 'canbuy' : 'nobuy'}" data-market="${i}" style="background-image:url(${img(b)})" aria-label="Corpo ${esc(NM(b))}">${E.canTakeBody(st, ME, b) ? `<span class="tag">${E.hasHeadFor(st, ME, b) ? 'tenho a cabeça' : 'troca o coringa'}</span>` : ''}</button>` : `<div class="deck" style="opacity:.3"></div>`).join('')}</div><div class="mini-lbl">vitrine de corpos</div></div>
          <div class="sep"></div>
          <div class="vgroup"><button class="deck" id="discardbtn" style="${S.discard.length ? `background:url(${img(S.discard[S.discard.length - 1])}) center/cover` : ''}"><span>${S.discard.length ? '' : '<b>0</b>'}</span></button><div class="mini-lbl">descarte ${S.discard.length}</div></div>
        </div>
        <div class="row" id="hand">${me.hand.map(id => {
          const playable = myTurn && playableShallow(id);
          return `<button class="card ${playable ? 'lift' : ''}" data-card="${id}" style="background-image:url(${img(id)})" aria-label="${esc(NM(id))}"><span class="tag">${esc(C.KIND_LABEL[K(id)])}</span></button>`;
        }).join('') || '<div class="empty-herd" style="width:100%">Sem cartas na mão.</div>'}</div>
      </div>`;
    if (ui._restore) { ui._restore(); ui._restore = null; }
    ui._lastFocus = ui.focus;
    bind();
    ui.enter = null;
    if (live) autoSheets(); else cleanSheets();
    renderSheet();
  }
  // girafas minhas onde esta carta pode substituir um coringa
  function swapTargets(id) {
    const c = E.CARDS[id]; if (!c || !['head', 'body'].includes(c.kind)) return [];
    // coringa na mão: pode entrar no lugar da carta certa; carta certa: entra no lugar do coringa
    if (c.wild) return P(ME).giraffes.filter(g => !g.special && E.CARDS[g[c.kind]] && !E.CARDS[g[c.kind]].wild);
    return P(ME).giraffes.filter(g => !g.special && E.CARDS[g[c.kind]] && E.CARDS[g[c.kind]].wild && (() => { const o = E.CARDS[c.kind === 'head' ? g.body : g.head]; return o.wild || o.match === c.match; })());
  }
  const swapWhy = () => !E.canBuild(st) ? 'só antes de atacar' : st.swapped ? 'já trocou neste turno' : (st.built || st.neckPlayed) ? 'você já baixou neste turno' : st.played ? 'só como primeira jogada do turno' : '';
  // trocas possíveis direto pela girafa da mesa (tocando no nome dela)
  function giraffeSwapHTML(g) {
    if (g.special) return '';
    const opts = P(ME).hand.filter(id => swapTargets(id).includes(g));
    if (!opts.length) return '';
    const live = st.turn === ME && !st.pending && !ui.busy;
    const why = !live ? 'só na sua vez' : swapWhy();
    return `<div class="sectionlbl">Trocar carta</div><div class="btns">` + opts.map(id => { const kd = K(id);
      return `<button class="btn ${why ? 'ghost' : ''}" data-swapg='${JSON.stringify({ cid: id, gid: g.id })}' ${why ? 'disabled' : ''}><span>Pôr ${kd === 'head' ? 'a cabeça' : 'o corpo'} ${esc(NM(id))} no lugar ${kd === 'head' ? 'da cabeça' : 'do corpo'} ${esc(NM(g[kd]))}</span><small>${why || esc(NM(g[kd])) + ' volta para a mão'}</small></button>`; }).join('') + `</div><p class="note">Fazendo a troca, neste turno você não baixa mais girafas nem pescoços.</p>`;
  }
  function playableShallow(id) {
    const kd = K(id), me = P(ME);
    if (['defense', 'interrupt', 'super', 'bomb'].includes(kd)) return false;
    if (kd === 'head' || kd === 'body') return E.canBuild(st) && !st.built && !st.neckPlayed && !st.swapped && (me.hand.some(x => C.pairs(E.CARDS[x], E.CARDS[id])) || (!st.played && swapTargets(id).length > 0));
    if (kd === 'attack' || kd === 'poison') return me.giraffes.length > 0 && st.players.some(p => p.idx !== ME && p.giraffes.length && E.targetable(st, p.idx, ME));
    if (kd === 'special') return E.canBuild(st) && !st.built && !st.neckPlayed && !st.swapped;
    if (kd === 'neck') return E.canBuild(st) && !st.neckPlayed && !st.built && !st.swapped && me.giraffes.some(g => !g.special && g.necks.length < E.MAX_NECKS);
    if (kd === 'medicine') return me.poisons.length > 0;
    return true;
  }

  function bind() {
    $app.querySelector('#objbtn').onclick = () => openSheet({ type: 'objectives' });
    $app.querySelector('#logbtn').onclick = () => openSheet({ type: 'log' });
    $app.querySelector('#menubtn').onclick = () => openSheet({ type: 'menu' });
    $app.querySelectorAll('[data-foe]').forEach(b => b.onclick = () => { ui.pin = null; ui.focus = +b.dataset.foe; ui.manualUntil = Date.now() + 15000; render(); });
    const mt = $app.querySelector('#mytable'); if (mt) mt.onclick = () => { ui.pin = ME; ui.focus = ME; render(); };
    const pm = $app.querySelector('#pinme'); if (pm) pm.onclick = () => { ui.pin = ui.pin === ME ? null : ME; render(); };
    const fd = $app.querySelector('#foedetail'); if (fd) fd.onclick = () => openSheet({ type: 'foe', pid: ui.focus });
    $app.querySelectorAll('#hand [data-card]').forEach(b => b.onclick = () => openSheet({ type: 'card', cid: b.dataset.card }));
    $app.querySelectorAll('.herd .giraffe[data-gid]').forEach(el => {
      const gid = el.dataset.gid;
      const details = () => openSheet({ type: 'giraffe', pid: st.players[ui.focus] ? ui.focus : ME, gid });
      // tocar nas cartas abre/fecha a pilha; tocar no nome abre os detalhes
      const toggle = () => { if (ui.open.has(gid)) ui.open.delete(gid); else ui.open.add(gid); el.classList.toggle('open', ui.open.has(gid)); el.setAttribute('aria-expanded', ui.open.has(gid)); };
      el.onclick = ev => { if (ev.target.closest('.cap')) details(); else toggle(); };
      el.onkeydown = ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggle(); } };
    });
    $app.querySelector('#deck').onclick = () => {
      if (ui.busy) return toast('Aguarde a jogada do adversário.');
      if (st.turn !== ME || st.pending) return toast(st.pending ? 'Responda a janela aberta primeiro.' : 'Espere a sua vez.');
      openSheet({ type: 'confirmdraw' });
    };
    $app.querySelectorAll('[data-market]').forEach(b => b.onclick = () => openSheet({ type: 'market', idx: +b.dataset.market }));
    $app.querySelector('#discardbtn').onclick = () => openSheet({ type: 'discard' });
    $app.querySelector('#objpile').onclick = () => openSheet({ type: 'objectives' });
  }

  function cleanSheets() {
    const s = ui.sheet; if (!s) return;
    const pd = st && st.pending;
    if (['react', 'destiny', 'handlimit', 'stealdest', 'reflect'].includes(s.type) && !(pd && E.whoActs(st) === ME && (pd.type === s.type || (s.type === 'react' && pd.type === 'react')))) ui.sheet = null;
    if (s.type === 'card' && !P(ME).hand.includes(s.cid)) ui.sheet = null;
    if (s.type === 'objpick' && !(P(ME).objOwed > 0)) ui.sheet = null;
  }
  function autoSheets() {
    cleanSheets();
    const w = E.whoActs(st); const pd = st.pending;
    if (st.winner !== null) return;
    if (pd && w === ME) {
      const t = pd.type === 'react' ? 'react' : pd.type;
      if (!ui.sheet || ui.sheet.type !== t) ui.sheet = { type: t, sel: [] };
    } else {
      if (ui.sheet && ['react', 'destiny', 'handlimit', 'stealdest', 'reflect'].includes(ui.sheet.type)) ui.sheet = null;
      if (P(ME).objOwed > 0 && (!ui.sheet || ui.sheet.type !== 'objpick')) ui.sheet = { type: 'objpick' };
    }
  }

  // ---------- folhas ----------
  function openSheet(s) { ui.sheet = s; renderSheet(); }
  function closeSheet() { if (['react', 'destiny', 'handlimit', 'stealdest', 'reflect', 'over', 'objpick'].includes(ui.sheet && ui.sheet.type)) return; ui.sheet = null; renderSheet(); }
  function renderSheet() {
    let sc = document.querySelector('.scrim');
    if (!ui.sheet) { if (sc) sc.remove(); return; }
    if (!sc) { sc = document.createElement('div'); sc.className = 'scrim'; document.body.appendChild(sc); sc.addEventListener('click', e => { if (e.target === sc) closeSheet(); }); }
    sc.classList.toggle('compact', ui.sheet.type === 'react');
    sc.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${sheetHTML(ui.sheet)}</div>`;
    sheetBind(sc, ui.sheet);
  }
  const closeBtn = '<button class="btn ghost" data-act="close"><span>Fechar</span></button>';
  const cardBig = id => `<div class="big" style="background-image:url(${img(id)})"></div>`;
  function objHTML(o, doneFlag) {
    return `<div class="obj"><div class="card" style="background-image:url(${objImg(o)})"></div><div><h3>${esc(E.OBJ[o].name)}</h3><p>${esc(E.OBJ[o].text)}</p><span class="pts">${doneFlag ? '✅ Completo · ' : ''}${E.OBJ[o].pts} ponto${E.OBJ[o].pts > 1 ? 's' : ''}</span></div></div>`;
  }

  function sheetHTML(s) {
    const me = st && P(ME);
    switch (s.type) {
      case 'rules': return `<h2>Como jogar</h2><div class="rules">
        <div><b>Objetivo.</b> Faça 5 pontos ou complete 3 cartas de objetivo. Você começa com 2 objetivos secretos e compra outro sempre que completa um.</div>
        <div><b>Começo.</b> Cada jogador recebe 2 objetivos secretos, 3 cartas do bolo de cabeças (as cabeças e as girafas especiais) e 4 cartas do monte. <b>Com até 4 jogadores</b>, a partida usa só <b>metade das cartas</b>, sorteada a cada jogo: cada cabeça vem com o seu corpo, e cada tipo de carta (pescoços de cada cor, ataques, defesas…) entra pela metade. Com 5 ou 6 jogadores, entra o baralho inteiro.</div>
        <div><b>Girafas.</b> Uma girafa é cabeça + corpo do mesmo personagem, ou uma girafa especial (Girassauro, Girafarão, Girapeta e Crocorafa), que já vem inteira, <b>não recebe pescoços</b> e conta como <b>nível 1</b> nos objetivos. As cartas de fundo colorido (Girafclown e Mimicraffe) são <b>coringas</b>: a cabeça combina com qualquer corpo e o corpo com qualquer cabeça. Os corpos ficam na vitrine (3 abertos) ou chegam por troca e roubo.</div>
        <div><b>Pescoços.</b> Encaixe até 5 por girafa. O nível é a quantidade de pescoços e as cores contam para os objetivos.</div>
        <div><b>Seu turno.</b> 1) Baixe <b>1 girafa</b> ou encaixe <b>1 pescoço</b> (nunca os dois no mesmo turno: a girafa nova só recebe pescoço no turno seguinte). 2) Ataque e use ações. 3) Compre 1 carta do monte ou da vitrine — a compra encerra o turno. Se no turno você pegou um objetivo novo, não compra do monte: pode pegar um corpo da vitrine ou encerrar sem comprar. <b>Destino</b> e <b>Portal</b> substituem a compra e também encerram o turno. Com o Portal você pega qualquer carta do descarte; se escolher uma cabeça ou um corpo, leva a girafa completa (a outra parte vem junto, se estiver no descarte).</div>
        <div><b>Coringas.</b> Girafalhaço e Mimicarafa combinam com qualquer girafa. A troca vale nos dois sentidos: na <b>primeira jogada</b> do turno você pode pôr a carta certa no lugar do coringa ou o coringa no lugar da carta certa, e a carta que sai volta para a mão. Fazendo a troca, você não baixa mais girafa nem pescoço nesse turno. Também dá para trocar tocando no nome da girafa na mesa.</div>
        <div><b>Combate.</b> Para atacar você precisa ter pelo menos uma girafa na mesa, e só dá para atacar quem também tem girafa. Quem ataca escolhe o oponente, a girafa e qual pescoço acertar; a cabeça só pode ser atacada quando a girafa não tem pescoços. Se um pescoço do meio quebrar, os de cima descem. Para destruir uma peça, os danos do mesmo turno precisam somar a defesa dela. Se a cabeça cair, a girafa inteira cai.</div>
        <div><b>Campo minado.</b> As Evento Doom (4, ou 2 em partidas de até 4 jogadores) estão na metade de baixo do monte. Quem comprar leva 3 pontos de dano na girafa mais alta, somados de cima para baixo (ex.: 3 pescoços de defesa 1, ou 1 de defesa 3).</div>
        <div><b>Reações.</b> Defesa devolve a ação a quem jogou, e quem se defendeu escolhe onde o revide acerta. Pare! cancela. Pare Agora! (Sai Pra Lá) cancela tudo e ninguém responde.</div>
        <div><b>Vitrine.</b> Só dá para pegar um corpo da vitrine se você tiver a cabeça dessa girafa na mão, ou se ela já estiver baixada na sua mesa com um corpo coringa. Não há limite de cartas na mão.</div>
        <div><b>Ritmo.</b> Cada carta jogada, comprada ou revelada fica ampliada até você tocar na tela. No menu dá para mudar isso.</div></div>${closeBtn}`;
      case 'menu': return `<h2>Menu</h2>
        <div class="field"><label>Ritmo dos adversários</label><div class="seg" id="speedm">${[['lento', 'Calmo'], ['normal', 'Normal'], ['rapido', 'Rápido']].map(([v, l]) => `<button data-v="${v}" class="${prefs.speed === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
        <div class="btns">
        <button class="btn ghost" data-act="tap"><span>Cartas ampliadas</span><small>${prefs.tap ? 'ficam até eu tocar' : 'somem sozinhas'}</small></button>
        <button class="btn ghost" data-act="sound"><span>Som</span><small>${prefs.sound ? 'ligado' : 'desligado'}</small></button>
        <button class="btn ghost" data-act="rules"><span>Como jogar</span></button>
        ${NET.mode === 'online' ? (NET.isHost ? `<button class="btn ghost" data-act="tolobby"><span>Reiniciar na sala de espera</span><small>todos voltam para a sala</small></button><button class="btn ghost" data-act="endtable"><span>Fechar a mesa online</span><small>para todos</small></button>` : '') + `<button class="btn ghost" data-act="leaveonline"><span>Sair da mesa</span><small>a partida reinicia para todos</small></button>` : `<button class="btn ghost" data-act="newgame"><span>Abandonar e voltar ao início</span></button>`}</div>${closeBtn}`;
      case 'confirmnew': return `<h2>Abandonar a partida?</h2><p>A partida atual será perdida.</p><div class="btns"><button class="btn" data-act="reallynew"><span>Sim, voltar ao início</span></button></div>${closeBtn}`;
      case 'log': return `<h2>Histórico</h2><div class="loglist">${st.log.slice().reverse().map(l => `<div>${esc(l)}</div>`).join('')}</div>${closeBtn}`;
      case 'objectives': return `<h2>Seus objetivos</h2><p>${E.score(me)} pontos · ${me.done.length} de 3 objetivos completos.</p><div class="objs">${me.objectives.map(o => objHTML(o)).join('')}${me.done.map(o => objHTML(o, true)).join('')}</div>${closeBtn}`;
      case 'foe': {
        const p = P(s.pid);
        return `<h2>${esc(p.name)} ${statusIcons(p)}</h2><p>${p.hand.length} cartas na mão · ${E.score(p)} pontos · ${p.done.length} objetivo(s) completo(s)${p.sleep ? ` · dormindo por ${p.sleep} turno(s)` : ''}${p.poisons.length ? ` · ${p.poisons.length} veneno(s)` : ''}.</p>
          ${p.done.length ? `<div class="sectionlbl">Objetivos completos</div><div class="objs">${p.done.map(o => objHTML(o, true)).join('')}</div>` : '<p>Nenhum objetivo completo ainda.</p>'}${closeBtn}`;
      }
      case 'discard': return `<h2>Descarte</h2><p>${st.discard.length} cartas. Uma carta Portal pega qualquer uma delas.</p><div class="grid-cards">${st.discard.slice().reverse().map(id => `<div class="card" style="background-image:url(${img(id)})"></div>`).join('')}</div>${closeBtn}`;
      case 'confirmdraw': return st.objBought
        ? `<h2>Sem compra do monte</h2><p>Neste turno você pegou um objetivo, então não pode comprar do monte. Você pode pegar um corpo da vitrine ou encerrar o turno sem comprar.</p><div class="btns"><button class="btn" data-act="drawpass"><span>Encerrar o turno</span><small>sem comprar</small></button></div>${closeBtn}`
        : `<h2>Comprar do monte?</h2><p>Comprar encerra o seu turno. Cuidado com o campo minado.</p><div class="btns"><button class="btn" data-act="drawdeck"><span>Comprar e encerrar</span><small>${st.deck.length} no monte</small></button></div>${closeBtn}`;
      case 'market': {
        const id = st.market[s.idx]; if (!id) return closeBtn;
        const has = E.canTakeBody(st, ME, id);
        const can = has && !ui.busy && st.turn === ME && !st.pending;
        return `<span class="kind">Corpo · vitrine</span><h2>${esc(NM(id))}</h2>${cardBig(id)}
          <p>${E.hasHeadFor(st, ME, id) ? 'Você tem a cabeça desta girafa! Pegar o corpo conta como a sua compra e encerra o turno. Na próxima vez, junte os dois e baixe a girafa.' : E.hasWildBodyFor(st, ME, id) ? 'A cabeça desta girafa está na sua mesa com um corpo coringa. Pegar este corpo conta como a sua compra e encerra o turno; depois você pode trocar o coringa por ele.' : `Você só pode pegar este corpo se tiver a cabeça de ${esc(NM(id))} na mão, ou baixada na sua mesa com um corpo coringa.`}</p>
          <div class="btns">${can ? `<button class="btn" data-act="drawmarket"><span>Pegar este corpo e encerrar</span></button>` : ''}</div>${closeBtn}`;
      }
      case 'card': return cardSheet(s);
      case 'giraffe': {
        const p = P(s.pid); const g = p && p.giraffes.find(x => x.id === s.gid);
        if (!g) return `<h2>Girafa</h2><p>Esta girafa não está mais na mesa.</p>${closeBtn}`;
        const headId = g.special || g.head;
        const list = [[headId, g.special ? 'Girafa especial' : 'Cabeça']]
          .concat(g.necks.slice().reverse().map(n => [n, `Pescoço · nível ${g.necks.indexOf(n) + 1}`]))
          .concat(g.body ? [[g.body, 'Corpo']] : []);
        const top = E.topPiece(g);
        return `<span class="kind">${s.pid === ME ? 'Sua girafa' : 'Girafa de ' + esc(p.name)}</span><h2>${esc(NM(headId))}</h2>
          <p>${g.special ? 'Girafa inteira numa carta só.' : `Nível ${g.necks.length}${g.necks.length ? ' · ' + g.necks.map(n => cico(E.CARDS[n].color)).join('') : ''}`} · topo ${dicons(top.def, hurtOf(st, top.id), 'inl')}</p>
          <div class="grid-cards gfull">${list.map(([id, lbl]) => `<div class="gf"><div class="card" style="background-image:url(${img(id)})">${hurtOf(st, id) ? `<span class="hpbadge">${hurtOf(st, id)}/${E.CARDS[id].def}</span>` : ''}</div><div class="mini-lbl">${lbl}</div></div>`).join('')}</div>${s.pid === ME ? giraffeSwapHTML(g) : ''}${closeBtn}`;
      }
      case 'react': {
        const pd = st.pending; if (!pd || pd.type !== 'react') return closeBtn;
        const e0 = pd.stack[0]; const top = pd.stack[pd.stack.length - 1];
        const opts = E.eligibleReactions(st, ME);
        const what = pd.stack.length === 1
          ? `${esc(P(e0.pid).name)} jogou <b>${esc(NM(e0.card))}</b>${e0.target === ME ? ' em <b>você</b>' : e0.target != null ? ' em ' + esc(P(e0.target).name) : ''}.`
          : `${esc(P(top.pid).name)} reagiu com <b>${esc(NM(top.card))}</b> contra ${pd.stack[pd.stack.length - 2].pid === ME ? 'a <b>sua</b> jogada' : 'a jogada de ' + esc(P(pd.stack[pd.stack.length - 2].pid).name)}.`;
        return `<span class="kind">Reação</span><h2>Quer responder?</h2><p>${what}</p>
          <div class="btns">${opts.map(id => `<button class="btn" data-react="${id}"><span>Usar ${esc(NM(id))}</span><small>${C.KIND_LABEL[K(id)]}</small></button>`).join('')}
          <button class="btn ghost" data-react=""><span>Deixar passar</span></button></div>`;
      }
      case 'objpick': {
        const opts = E.objOptions(st);
        if (!(me.objOwed > 0) || !opts.length) return closeBtn;
        return `<span class="kind">Novo objetivo</span><h2>Escolha um objetivo</h2><p>Estes são os ${opts.length} do topo do monte de objetivos. Fique com um${opts.length > 1 ? '; o outro vai para debaixo do monte' : ''}.</p>
          <div class="grid-cards two">${opts.map((o, i) => `<button class="objopt" data-objpick="${i}"><span class="card" style="background-image:url(${objImg(o)})"></span><b>${esc(E.OBJ[o].name)}</b><small>${esc(E.OBJ[o].text)}</small><em>${E.OBJ[o].pts} ${plural(E.OBJ[o].pts, 'ponto', 'pontos')}</em></button>`).join('')}</div>`;
      }
      case 'destiny': {
        const pd = st.pending; if (!pd || pd.type !== 'destiny') return closeBtn;
        return `<span class="kind">Destino</span><h2>Escolha uma carta</h2><p>A outra volta para o topo do monte. Destino substitui a compra: seu turno termina depois da escolha.</p>
          <div class="grid-cards two">${pd.options.map((id, i) => `<button class="card" data-destiny="${i}" style="background-image:url(${img(id)})"><span class="tag">${K(id) === 'bomb' ? '💣 bomba!' : esc(NM(id))}</span></button>`).join('')}</div>`;
      }
      case 'reflect': {
        const pd = st.pending; if (!pd || pd.type !== 'reflect') return closeBtn;
        const kd = K(pd.card), t = P(pd.target), opts = E.reflectOptions(st, pd.card, pd.target);
        const what = kd === 'steal' ? 'Qual pescoço você rouba de volta?' : kd === 'poison' ? 'Em qual peça o veneno volta?' : `Onde o revide acerta? (${E.CARDS[pd.card].dmg} de dano)`;
        const groups = t.giraffes.map(g => { const os = opts.filter(o => o.gid === g.id); if (!os.length) return '';
          return `<div class="sectionlbl">${esc(NM(g.special || g.head))}</div><div class="grid-cards pieces">` + os.slice().reverse().map(o => { const lv = g.necks.indexOf(o.piece) + 1; const d = hurtOf(st, o.piece); const breaks = kd === 'attack' && E.CARDS[pd.card].dmg + d >= E.CARDS[o.piece].def;
            return `<button class="card" data-rf='${JSON.stringify(o)}' style="background-image:url(${img(o.piece)})" aria-label="${esc(NM(o.piece))}"><span class="tag">${lv ? 'nível ' + lv : 'cabeça'}${breaks ? ' · quebra!' : ''}</span></button>`; }).join('') + `</div>`; }).join('');
        return `<span class="kind">Defesa · revide</span><h2>${what}</h2><p>Sua defesa devolveu <b>${esc(NM(pd.card))}</b> contra ${esc(t.name)}. Escolha a peça.</p>${groups}`;
      }
      case 'stealdest': {
        const pd = st.pending; if (!pd || pd.type !== 'stealdest') return closeBtn;
        const dests = E.stealDests(me);
        return `<span class="kind">Missão Pescoço</span><h2>Onde encaixar o pescoço?</h2><p>Você roubou <b>${esc(NM(pd.card))}</b> de ${esc(P(pd.from).name)}. Escolha em qual girafa sua ele entra.</p>
          <div class="card" style="background-image:url(${img(pd.card)});justify-self:center;--card-w:110px"></div>
          <div class="btns">${me.giraffes.map(g => { const ok = dests.includes(g); return `<button class="btn ${ok ? '' : 'ghost'}" data-sd="${g.id}" ${ok ? '' : 'disabled'}><span>${esc(NM(g.special || g.head))}</span><small>${g.special ? 'girafa inteira, sem pescoço' : g.necks.length >= E.MAX_NECKS ? 'já tem 5 pescoços' : `nível ${g.necks.length} → ${g.necks.length + 1}`}</small></button>`; }).join('')}</div>`;
      }
      case 'handlimit': {
        const pd = st.pending; if (!pd || pd.type !== 'handlimit') return closeBtn; s.sel = s.sel || [];
        return `<span class="kind">Limite de mão</span><h2>Descarte ${pd.n} carta${pd.n > 1 ? 's' : ''}</h2><p>Toque nas cartas para marcar (${s.sel.length}/${pd.n}).</p>
          <div class="grid-cards">${me.hand.map(id => `<button class="card ${s.sel.includes(id) ? 'marked' : ''}" data-hl="${id}" style="background-image:url(${img(id)})"><span class="tag">${esc(NM(id))}</span></button>`).join('')}</div>
          <div class="btns"><button class="btn" data-act="hlok" ${s.sel.length === pd.n ? '' : 'disabled'}><span>Descartar</span></button></div>`;
      }
      case 'over': {
        const wn = P(st.winner);
        return `<span class="kind">Fim de jogo</span><h2>${st.winner === ME ? 'Você venceu! 👑' : esc(wn.name) + ' venceu!'}</h2>
          <p>${esc(wn.name)} fez ${E.score(wn)} pontos com ${wn.done.length} objetivo(s).</p>
          <div class="objs">${wn.done.map(o => objHTML(o, true)).join('')}</div>
          <div class="btns">${NET.mode === 'online' ? (NET.isHost ? `<button class="btn" data-act="tolobby"><span>Nova partida</span><small>todos voltam para a sala de espera</small></button><button class="btn ghost" data-act="endtable"><span>Fechar a mesa</span></button>` : `<button class="btn ghost" data-act="leaveonline"><span>Sair da mesa</span></button>`) : `<button class="btn" data-act="again"><span>Jogar de novo</span></button>`}<button class="btn ghost" data-act="seetable"><span>Ver a mesa</span></button></div>`;
      }
    }
    return closeBtn;
  }

  function cardSheet(s) {
    const id = s.cid, c = E.CARDS[id], kd = c.kind, me = P(ME);
    if (!me.hand.includes(id)) return closeBtn;
    const myTurn = !ui.busy && st.turn === ME && !st.pending && st.winner === null;
    s.params = s.params || {};
    const head = `<span class="kind">${C.KIND_LABEL[kd]}${c.color ? ' · ' + cico(c.color) + E.COLOR_PT[c.color] : ''}${c.def ? ' · defesa ' + dicons(c.def, 0, 'inl') : ''}${c.dmg ? ' · dano ' + c.dmg : ''}</span><h2>${esc(c.name)}</h2>${cardBig(id)}<p>${C.KIND_HELP[kd]}</p>`;
    if (!myTurn) return head + `<p>${['defense', 'interrupt', 'super'].includes(kd) ? 'Ela aparece automaticamente quando você puder reagir.' : 'Você poderá usar esta carta na sua vez.'}</p>` + closeBtn;
    let body = '';
    const foes = st.players.filter(p => p.idx !== ME);
    const playerBtns = (list, attr) => list.map(p => {
      const asleep = kd !== 'sleep' && !E.targetable(st, p.idx, ME) && p.idx !== ME;
      const noG = (kd === 'attack' || kd === 'poison') && !p.giraffes.length;
      const ok = kd === 'sleep' ? (p.idx === ME || p.sleep === 0) : !asleep && !noG;
      return `<button class="btn ghost" data-${attr}="${p.idx}" ${ok ? '' : 'disabled'}><span>${p.idx === ME ? 'Você' : esc(p.name)} ${statusIcons(p)}</span><small>🦒 ${p.giraffes.length} · 🂠 ${p.hand.length}${asleep ? ' · dormindo' : noG ? ' · sem girafa' : ''}</small></button>`;
    }).join('');
    const gBtns = (p, filter, attr) => p.giraffes.filter(filter).map(g => {
      const tp = E.topPiece(g);
      const venomOn = t => (t.poisons || []).filter(po => po.gid === g.id).length;
      const info = kd === 'attack' || kd === 'poison' ? (g.necks.length ? `nível ${g.necks.length} · ${g.necks.map(n => cico(E.CARDS[n].color)).join('')}` : `sem pescoço · cabeça ${dicons(tp.def, hurtOf(st, tp.id), 'inl')}`) + (venomOn(p) ? ` · ☠️${venomOn(p)}` : '') : `nível ${g.necks.length} · topo: ${esc(NM(tp.id))} ${dicons(tp.def, hurtOf(st, tp.id), 'inl')}`;
      return `<button class="btn ghost" data-${attr}="${g.id}"><span>${esc(NM(g.special || g.head))}</span><small>${info}</small></button>`;
    }).join('');
    switch (kd) {
      case 'head': case 'body': {
        const pairsIn = me.hand.filter(x => C.pairs(E.CARDS[x], c));
        const sw = swapTargets(id);
        const swapHTML = sw.length ? `<div class="sectionlbl">${E.CARDS[id].wild ? 'Pôr o coringa numa girafa' : 'Trocar o coringa'}</div>` + sw.map(g => {
          const why = swapWhy();
          return `<button class="btn ${why ? 'ghost' : ''}" data-go='${JSON.stringify({ swap: g.id })}' ${why ? 'disabled' : ''}><span>Colocar no lugar de ${esc(NM(g[kd]))}</span><small>${why || (E.CARDS[id].wild ? esc(NM(g[kd])) + ' volta para a mão' : 'o coringa volta para a mão')}</small></button>`;
        }).join('') + `<p class="note">Trocando o coringa, neste turno você não baixa mais girafas nem pescoços.</p>` : '';
        if (st.swapped) body = `<p>Neste turno você já trocou um coringa: não dá mais para baixar girafas nem pescoços.</p>`;
        else if (!E.canBuild(st)) body = `<p>Você já atacou neste turno. Girafas só podem ser baixadas antes de atacar.</p>`;
        else if (st.built) body = `<p>Você já baixou 1 girafa neste turno. Só dá para baixar 1 girafa por turno.</p>`;
        else if (st.neckPlayed) body = `<p>Neste turno você já encaixou um pescoço. Girafa e pescoço não podem ser baixados no mesmo turno.</p>`;
        else if (pairsIn.length) body = (pairsIn.length > 1 ? `<div class="sectionlbl">Juntar com qual ${kd === 'head' ? 'corpo' : 'cabeça'}?</div>` : '') + pairsIn.map(pair => `<button class="btn" data-go='${JSON.stringify({ pair })}'><span>Baixar com ${kd === 'head' ? 'o corpo' : 'a cabeça'} ${esc(NM(pair))}</span><small>${E.CARDS[pair].wild || c.wild ? 'coringa' : 'mesma girafa'}</small></button>`).join('');
        else body = sw.length ? '' : `<p>Você ainda não tem ${kd === 'head' ? 'um corpo' : 'uma cabeça'} que combine com esta carta.${kd === 'head' && st.market.some(b => b && C.pairs(E.CARDS[b], c)) ? ' <b>Tem um corpo que combina na vitrine!</b>' : ''}</p>`;
        body = swapHTML + body;
        break;
      }
      case 'special': body = st.swapped ? `<p>Neste turno você já trocou um coringa: não dá mais para baixar girafas nem pescoços.</p>` : !E.canBuild(st) ? `<p>Você já atacou neste turno.</p>` : st.built ? `<p>Você já baixou 1 girafa neste turno. Só dá para baixar 1 girafa por turno.</p>` : st.neckPlayed ? `<p>Neste turno você já encaixou um pescoço. Girafa e pescoço não podem ser baixados no mesmo turno.</p>` : `<button class="btn" data-go='{}'><span>Baixar na mesa</span></button>`; break;
      case 'neck': {
        if (st.swapped) { body = `<p>Neste turno você já trocou um coringa: não dá mais para baixar girafas nem pescoços.</p>`; break; }
        if (!E.canBuild(st)) { body = `<p>Você já atacou neste turno. Pescoços só antes de atacar.</p>`; break; }
        if (st.neckPlayed) { body = `<p>Você já encaixou 1 pescoço neste turno. Só dá para encaixar 1 pescoço por turno.</p>`; break; }
        if (st.built) { body = `<p>Neste turno você baixou uma girafa. O pescoço só pode ser encaixado no próximo turno.</p>`; break; }
        if (!me.giraffes.some(g => !g.special)) { body = `<p>Você precisa de uma girafa montada com cabeça e corpo para encaixar pescoços. Girafas inteiras (especiais) não recebem pescoço.</p>`; break; }
        body = `<div class="sectionlbl">Encaixar em qual girafa?</div>` + me.giraffes.map(g => `<button class="btn ghost" data-go='${JSON.stringify({ gid: g.id })}' ${g.special || g.necks.length >= E.MAX_NECKS ? 'disabled' : ''}><span>${esc(NM(g.special || g.head))}</span><small>${g.special ? 'girafa inteira, sem pescoço' : g.necks.length >= E.MAX_NECKS ? 'já tem 5 pescoços' : `nível ${g.necks.length} → ${g.necks.length + 1}`}</small></button>`).join('');
        break;
      }
      case 'attack': case 'steal': case 'poison': {
        if (kd !== 'steal' && !me.giraffes.length) { body = `<p>Você precisa ter pelo menos uma girafa na mesa para atacar. Baixe uma girafa primeiro.</p>`; break; }
        if (s.params.target === undefined) { body = `<div class="sectionlbl">Escolha o oponente</div>` + playerBtns(foes, 'tgt'); break; }
        const t = P(s.params.target);
        const tg = ['attack', 'poison', 'steal'].includes(kd) && s.params.gid ? t.giraffes.find(x => x.id === s.params.gid) : null;
        if (tg && kd === 'steal' && s.params.piece) {
          // 4º passo (Missão Pescoço): em qual girafa sua o pescoço roubado entra
          const nk = s.params.piece, dests = me.giraffes.filter(g => !g.special && g.necks.length < E.MAX_NECKS);
          body = `<div class="sectionlbl">Encaixar ${esc(NM(nk))} em qual girafa sua?</div>` + me.giraffes.map(g => {
            const ok = dests.includes(g);
            return `<button class="btn ${ok ? '' : 'ghost'}" data-dpick="${g.id}" ${ok ? '' : 'disabled'}><span>${esc(NM(g.special || g.head))}</span><small>${g.special ? 'girafa inteira, sem pescoço' : g.necks.length >= E.MAX_NECKS ? 'já tem 5 pescoços' : `nível ${g.necks.length} → ${g.necks.length + 1}`}</small></button>`;
          }).join('') + (dests.length ? '' : `<p>Nenhuma girafa sua pode receber pescoço agora: ele vai para a sua mão.</p><button class="btn" data-dpick=""><span>Roubar para a mão</span></button>`) + `<button class="btn ghost" data-act="backp"><span>Trocar pescoço</span></button>`;
          break;
        }
        if (tg) {
          // 3º passo: qual pescoço (do topo para a base); sem pescoços, a cabeça
          const pieces = tg.necks.length ? tg.necks.slice().reverse() : [tg.special || tg.head];
          body = `<div class="sectionlbl">${kd === 'poison' ? 'Em qual pescoço de ' + esc(NM(tg.special || tg.head)) + ' o veneno fica?' : kd === 'steal' ? 'Qual pescoço de ' + esc(NM(tg.special || tg.head)) + ' roubar?' : 'Qual pescoço de ' + esc(NM(tg.special || tg.head)) + '?'}</div><div class="grid-cards pieces">` + pieces.map(pid => {
            const pc = E.CARDS[pid], d = hurtOf(st, pid), lvl = tg.necks.indexOf(pid) + 1;
            const breaks = kd === 'attack' && c.dmg + d >= pc.def;
            const pz = (t.poisons || []).filter(po => po.piece === pid).length;
            return `<button class="card" data-ppick="${pid}" style="background-image:url(${img(pid)})" aria-label="${esc(NM(pid))}"><span class="tag">${lvl ? `nível ${lvl}` : 'cabeça'}${breaks ? ' · quebra!' : ''}${pz ? ' · ☠️' : ''}</span></button>`;
          }).join('') + `</div>` + (tg.necks.length ? '' : `<p>Esta girafa não tem pescoços: ${kd === 'poison' ? 'o veneno fica' : 'o ataque vai'} na cabeça.</p>`) + `<button class="btn ghost" data-act="backg"><span>Trocar girafa</span></button>`;
          break;
        }
        const list = gBtns(t, g => kd !== 'steal' || g.necks.length, 'gpick');
        body = `<div class="sectionlbl">${kd === 'poison' ? 'Em qual girafa de ' + esc(t.name) + ' o veneno fica?' : 'Qual girafa de ' + esc(t.name) + '?'}</div>` + (list || `<p>${esc(t.name)} não tem ${kd === 'steal' ? 'pescoços para roubar' : 'girafas'}.</p>`) + `<button class="btn ghost" data-act="back"><span>Trocar oponente</span></button>`;
        break;
      }
      case 'sneaky': case 'discard': body = `<div class="sectionlbl">Escolha o alvo</div>` + playerBtns(foes, 'tgtgo'); break;
      case 'sleep': body = `<div class="sectionlbl">Quem vai dormir?</div>` + playerBtns([me].concat(foes), 'tgtgo'); break;
      case 'exchange': {
        if (s.params.target === undefined) { body = `<div class="sectionlbl">Trocar com quem?</div>` + playerBtns(foes, 'tgt'); break; }
        body = `<div class="sectionlbl">Qual carta você entrega?</div><div class="grid-cards">${me.hand.filter(x => x !== id).map(x => `<button class="card" data-give="${x}" style="background-image:url(${img(x)})"><span class="tag">${esc(NM(x))}</span></button>`).join('')}</div><button class="btn ghost" data-act="back"><span>Trocar alvo</span></button>`;
        break;
      }
      case 'portal': {
        if (!st.discard.length) { body = `<p>O descarte está vazio.</p>`; break; }
        body = `<div class="sectionlbl">Escolha uma carta do descarte</div><div class="grid-cards portalgrid">${st.discard.slice().reverse().map(x => {
          const pr = E.portalPartner(st, x), kd2 = K(x);
          const tag = pr ? `+ ${kd2 === 'head' ? 'corpo' : 'cabeça'}` : esc(NM(x));
          return `<button class="card ${pr ? 'combo' : ''}" data-pick="${x}" style="background-image:url(${img(x)})" title="${esc(NM(x))}${pr ? ' + ' + esc(NM(pr)) : ''}"><span class="tag">${tag}</span></button>`;
        }).join('')}</div>`;
        break;
      }
      case 'medicine': body = me.poisons.length ? `<button class="btn" data-go='{}'><span>Curar o veneno</span></button>` : `<p>Você não está envenenado.</p>`; break;
      case 'defense': case 'interrupt': case 'super': body = `<p>Carta de reação: ela aparece automaticamente quando alguém jogar algo que você pode responder.</p>`; break;
      case 'mixup': body = `<div class="sectionlbl">Qual monte embaralhar?</div>
        <button class="btn" data-go='{"pile":"deck"}'><span>Monte de compra</span><small>${st.deck.length} cartas</small></button>
        <button class="btn ghost" data-go='{"pile":"bodies"}'><span>Monte de corpos</span><small>a vitrine é trocada</small></button>
        <button class="btn ghost" data-go='{"pile":"objectives"}'><span>Monte de objetivos</span><small>${(st.objDeck || []).length} cartas</small></button>`; break;
      default: body = `<button class="btn" data-go='{}'><span>Usar ${esc(c.name)}</span></button>`;
    }
    return head + `<div class="btns">${body}</div>` + closeBtn;
  }

  function sheetBind(sc, s) {
    const on = (sel, fn) => sc.querySelectorAll(sel).forEach(b => b.addEventListener('click', () => { if (!b.disabled) fn(b); }));
    const play = params => act({ t: 'play', cid: s.cid, p: params });
    on('[data-act]', b => {
      const a = b.dataset.act;
      if (a === 'close') { ui.sheet = null; renderSheet(); }
      if (a === 'rules') openSheet({ type: 'rules' });
      if (a === 'tap') { prefs.tap = !prefs.tap; savePrefs(); renderSheet(); }
      if (a === 'sound') { prefs.sound = !prefs.sound; savePrefs(); renderSheet(); if (prefs.sound) sfx.turn(); }
      if (a === 'newgame') openSheet({ type: 'confirmnew' });
      if (a === 'endtable') { hostEndTable(); st = null; V = null; ui.view = 'setup'; ui.sheet = null; stageCards.forEach(c => c.el.remove()); stageCards = []; $stage.classList.remove('on'); renderSheet(); renderSetup(); }
      if (a === 'tolobby') { ui.sheet = null; renderSheet(); hostResetToLobby(true); }
      if (a === 'leaveonline') {
        if (NET.isHost) hostResetToLobby(false);
        else { const gid = NET.doc && NET.doc.gameId; dropOnlineGame(); NET.room.presence({ quit: gid, join: null, act: null }); ui.view = 'setup'; renderSetup(); }
      }
      if (a === 'reallynew' || a === 'again') { if (NET.mode === 'online') leaveOnline(); else clearSave(); st = null; V = null; ui.view = 'setup'; ui.sheet = null; stageCards.forEach(c => c.el.remove()); stageCards = []; $stage.classList.remove('on'); renderSheet(); renderSetup(); }
      if (a === 'seetable') { ui.sheet = null; ui.focus = st.winner; renderSheet(); render(); }
      if (a === 'drawdeck') act({ t: 'draw', src: 'deck' });
      if (a === 'drawpass') act({ t: 'draw', src: 'pass' });
      if (a === 'drawmarket') act({ t: 'draw', src: s.idx });
      if (a === 'back') { s.params = {}; renderSheet(); }
      if (a === 'backg') { s.params = { target: s.params.target }; renderSheet(); }
      if (a === 'backp') { s.params = { target: s.params.target, gid: s.params.gid }; renderSheet(); }
      if (a === 'hlok') act({ t: 'hl', ids: s.sel });
    });
    sc.querySelectorAll('#speedm button').forEach(b => b.addEventListener('click', () => { prefs.speed = b.dataset.v; savePrefs(); renderSheet(); }));
    on('[data-go]', b => play(Object.assign({}, s.params, JSON.parse(b.dataset.go))));
    on('[data-tgt]', b => { s.params = { target: +b.dataset.tgt }; renderSheet(); });
    on('[data-tgtgo]', b => play({ target: +b.dataset.tgtgo }));
    on('[data-gpick]', b => {
      if (['attack', 'poison', 'steal'].includes(E.CARDS[s.cid].kind)) { s.params = Object.assign({}, s.params, { gid: b.dataset.gpick }); renderSheet(); }
      else play(Object.assign({}, s.params, { gid: b.dataset.gpick }));
    });
    on('[data-ppick]', b => {
      if (E.CARDS[s.cid].kind === 'steal') { s.params = Object.assign({}, s.params, { piece: b.dataset.ppick }); renderSheet(); }
      else play(Object.assign({}, s.params, { piece: b.dataset.ppick }));
    });
    on('[data-dpick]', b => play(Object.assign({}, s.params, { toGid: b.dataset.dpick || null })));
    on('[data-give]', b => play(Object.assign({}, s.params, { give: b.dataset.give })));
    on('[data-pick]', b => play({ pick: b.dataset.pick }));
    on('[data-pair]', b => play({ pair: JSON.parse(b.dataset.pair) }));
    on('[data-react]', b => act({ t: 'respond', cid: b.dataset.react || null }));
    on('[data-destiny]', b => act({ t: 'destiny', i: +b.dataset.destiny }));
    on('[data-sd]', b => act({ t: 'sd', gid: b.dataset.sd }));
    on('[data-swapg]', b => { const o = JSON.parse(b.dataset.swapg); act({ t: 'play', cid: o.cid, p: { swap: o.gid } }); });
    on('[data-rf]', b => { const o = JSON.parse(b.dataset.rf); act({ t: 'rf', gid: o.gid, piece: o.piece }); });
    on('[data-objpick]', b => act({ t: 'objpick', i: +b.dataset.objpick }));
    on('[data-hl]', b => { const id = b.dataset.hl; s.sel = s.sel.includes(id) ? s.sel.filter(x => x !== id) : s.sel.concat(id).slice(-st.pending.n); renderSheet(); });
  }

  // ganchos de teste
  window.__gd = { get st() { return st; }, get ui() { return ui; }, get ME() { return ME; }, get NET() { return NET; }, act: x => act(x), step: () => { if (!ui.busy && st && !P(E.whoActs(st)).isBot) { snap = clone(st); B.step(st, E.whoActs(st)); pump(); } } };

  // ---------- tela de apresentação ----------
  // ---------- idiomas da tela de apresentação ----------
  const SPLASH_I18N = {
    pt: { tag: 'Monte girafas. Estique o pescoço. <b>Sobreviva ao Doom.</b>', start: 'Iniciar', sub: '2 a 6 jogadores · contra bots ou online', title: 'Giraffe Doom: o jogo da armadilha do pescoço' },
    en: { tag: 'Build giraffes. Stretch the neck. <b>Survive the Doom.</b>', start: 'Start', sub: '2 to 6 players · vs bots or online', title: 'Giraffe Doom: The Neck Extension Trap Game' },
    fr: { tag: 'Construis des girafes. Allonge le cou. <b>Survis au Doom.</b>', start: 'Commencer', sub: '2 à 6 joueurs · contre des bots ou en ligne', title: 'Giraffe Doom : le jeu du piège du cou' },
    es: { tag: 'Arma jirafas. Estira el cuello. <b>Sobrevive al Doom.</b>', start: 'Empezar', sub: '2 a 6 jugadores · contra bots o en línea', title: 'Giraffe Doom: el juego de la trampa del cuello' },
  };
  // bandeiras desenhadas em SVG: aparecem iguais no celular, Mac e Windows (o Windows não mostra emoji de bandeira)
  const FLAG = {
    pt: '<svg viewBox="0 0 28 20" class="flag" aria-hidden="true"><rect width="28" height="20" fill="#009c3b"/><path d="M14 2.6 25.4 10 14 17.4 2.6 10z" fill="#ffdf00"/><circle cx="14" cy="10" r="4.6" fill="#002776"/><path d="M9.6 9.1c3-.9 6.2-.5 8.8 1.2" stroke="#fff" stroke-width=".9" fill="none"/></svg>',
    en: '<svg viewBox="0 0 28 20" class="flag" aria-hidden="true"><rect width="28" height="20" fill="#fff"/><g fill="#b22234">' + [0, 2, 4, 6, 8, 10, 12].map(i => `<rect y="${i * 20 / 13}" width="28" height="${20 / 13}"/>`).join('') + '</g><rect width="12" height="10.77" fill="#3c3b6e"/><g fill="#fff">' + [[2,2],[5,2],[8,2],[3.5,4.2],[6.5,4.2],[2,6.4],[5,6.4],[8,6.4],[3.5,8.6],[6.5,8.6]].map(([x, y]) => `<circle cx="${x + .5}" cy="${y - .4}" r=".55"/>`).join('') + '</g></svg>',
    fr: '<svg viewBox="0 0 28 20" class="flag" aria-hidden="true"><rect width="28" height="20" fill="#fff"/><rect width="9.33" height="20" fill="#0055a4"/><rect x="18.67" width="9.33" height="20" fill="#ef4135"/></svg>',
    es: '<svg viewBox="0 0 28 20" class="flag" aria-hidden="true"><rect width="28" height="20" fill="#aa151b"/><rect y="5" width="28" height="10" fill="#f1bf00"/><rect x="6" y="7.2" width="3.4" height="5.6" rx=".6" fill="#aa151b" opacity=".85"/></svg>',
  };
  const LANGS = [['pt', FLAG.pt, 'Português'], ['en', FLAG.en, 'English'], ['fr', FLAG.fr, 'Français'], ['es', FLAG.es, 'Español']];
  function langWidgetHTML(extra = '') {
    return `<div class="sp-lang ${extra}"><button class="sp-langbtn" aria-haspopup="menu" aria-expanded="false"></button>
      <div class="sp-langmenu" role="menu" hidden>${LANGS.map(([c, f, n]) => `<button role="menuitemradio" data-lang="${c}"><span class="fl">${f}</span><span>${n}</span></button>`).join('')}</div></div>`;
  }
  function paintLangWidget(root) {
    const cur = LANGS.find(l => l[0] === splashLang());
    const btn = root.querySelector('.sp-langbtn'); if (!btn) return;
    btn.innerHTML = `<span class="fl">${cur[1]}</span>`; btn.setAttribute('aria-label', 'Idioma: ' + cur[2]); btn.title = cur[2];
    root.querySelectorAll('.sp-langmenu button').forEach(b => { const on = b.dataset.lang === splashLang(); b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
    document.documentElement.lang = splashLang() === 'pt' ? 'pt-BR' : splashLang();
  }
  function bindLangWidget(root, onChange) {
    const w = root.querySelector('.sp-lang'); if (!w) return;
    const lbtn = w.querySelector('.sp-langbtn'), lmenu = w.querySelector('.sp-langmenu');
    const setMenu = open => { lmenu.hidden = !open; lbtn.setAttribute('aria-expanded', open); };
    paintLangWidget(w);
    lbtn.onclick = ev => { ev.stopPropagation(); setMenu(lmenu.hidden); };
    lmenu.querySelectorAll('button').forEach(b => b.onclick = ev => { ev.stopPropagation(); prefs.lang = b.dataset.lang; savePrefs(); setMenu(false); paintLangWidget(w); onChange && onChange(); });
    root.__closeLang = () => setMenu(false);
    if (!root.__langBound) {
      root.__langBound = true;
      root.addEventListener('pointerdown', ev => { if (!ev.target.closest('.sp-lang') && root.__closeLang) root.__closeLang(); });
      root.addEventListener('keydown', ev => { if (ev.key === 'Escape' && root.__closeLang) root.__closeLang(); });
    }
  }
  const splashLang = () => SPLASH_I18N[prefs.lang] ? prefs.lang : ((navigator.language || 'pt').slice(0, 2) in SPLASH_I18N ? (navigator.language || 'pt').slice(0, 2) : 'pt');
  function applySplashLang(sp) {
    const L = SPLASH_I18N[splashLang()];
    sp.querySelector('.sp-tag').innerHTML = L.tag; sp.querySelector('#spstart span').textContent = L.start;
    sp.querySelector('.sp-sub').textContent = L.sub; sp.querySelector('.sp-title').textContent = L.title;
    paintLangWidget(sp);
  }

  function renderSplash() {
    ui.view = 'splash'; setScreen('splash');
    // cartas flutuando soltas, espelhadas dos dois lados do escudo, em pares que se sobrepõem um pouco
    // [imagem, lado, x%, y%, rotação, atraso, escala, celular: x%, y% (ou null = só no computador)]
    const F = [
      ['h_girafwitch', 'l', 6, 18, -12, 0, 1, 2, 47], ['g_giraevil', 'r', 6, 18, 12, .8, 1, 2, 47],
      ['n_void', 'l', 17, 9, 10, 2.2, .85, null], ['h_piraffe', 'r', 17, 9, -10, 1.6, .85, null],
      ['a_tea_time_fall', 'l', 3, 52, 8, 1.3, .9, null], ['h_girafknight', 'r', 3, 52, -8, 2.7, .9, null],
      ['x_magic_mirror', 'l', 14, 58, -6, 1.9, .95, 13, 61], ['g_crocoraffe', 'r', 14, 58, 6, .4, .95, 13, 61],
    ];
    const embers = Array.from({ length: 22 }, (_, i) => `<i style="--x:${(i * 37) % 100}%;--d:${(i * 0.73) % 7}s;--t:${6 + (i % 5)}s;--s:${2 + (i % 3)}px"></i>`).join('');
    $app.innerHTML = `
      <div class="splash" id="splash">
        <div class="sp-bg"></div>
        <div class="sp-vignette"></div>
        <div class="sp-embers" aria-hidden="true">${embers}</div>
        <div class="sp-cards" aria-hidden="true">${F.map(([c, side, x, y, r, d, s, mx, my]) => `<div class="fcard ${side} ${mx === null ? 'wide' : ''}" style="--x:${x}%;--y:${y}%;--r:${r}deg;--d:${d}s;--s:${s};--mx:${mx ?? 0}%;--my:${my ?? 0}%"><div class="fc" style="background-image:url(img/${c}.webp)"></div></div>`).join('')}</div>
        <h1 class="sp-title">Giraffe Doom: The Neck Extension Trap Game</h1>
        ${langWidgetHTML()}
        <div class="sp-front" aria-hidden="true"><img class="sp-shield" id="spshield" src="img/logo_shield.webp" alt="" draggable="false"></div>
        <div class="sp-logo" id="splogo" aria-hidden="true"></div>
        <div class="sp-boom" id="spboom" aria-hidden="true"></div>
        <div class="sp-fx" id="spfx" aria-hidden="true"></div>
        <canvas class="sp-cardcv" id="spcards" aria-hidden="true"></canvas>
        <canvas class="sp-fire" id="spfire" aria-hidden="true"></canvas>
        <div class="sp-cta">
          <p class="sp-tag">Monte girafas. Estique o pescoço. <b>Sobreviva ao Doom.</b></p>
          <button class="btn sp-start" id="spstart"><span>Iniciar</span></button>
          <small class="sp-sub">2 a 6 jogadores · contra bots ou online</small>
        </div>
      </div>`;
    const sp = $app.querySelector('#splash');
    applySplashLang(sp);
    bindLangWidget(sp, () => applySplashLang(sp));
    const bg = sp.querySelector('.sp-bg');
    const centerLogo = () => {
      if (!bg.isConnected) return removeEventListener('resize', centerLogo);
      // escudo recortado (PNG com transparência) encaixado exatamente sobre o escudo da arte de fundo
      const W = 1920, H = 1182, LX = 0.41461, LY = 0.11786, LW = 0.19622, LH = 0.44166, LOGO_X = LX + LW / 2, w = bg.clientWidth, h = bg.clientHeight;
      // a arte cobre a tela e sempre sobra um pouco de largura, para dar para deslizar e pôr o escudo no centro exato
      const iw = Math.max(W * Math.max(w / W, h / H), w * 1.03), s = iw / W;
      const off = w / 2 - LOGO_X * iw;
      bg.style.backgroundSize = iw.toFixed(1) + 'px auto';
      bg.style.backgroundPositionX = off.toFixed(1) + 'px';
      // área do escudo (para o segredo de segurar o logo)
      const r = bg.getBoundingClientRect(), ih = H * s;
      const offY = parseFloat(getComputedStyle(bg).backgroundPositionY) / 100 * (h - ih) || 0;
      const shield = sp.querySelector('#spshield');
      if (shield) Object.assign(shield.style, { left: (off + LX * iw) + 'px', top: (offY + LY * ih) + 'px', width: (LW * iw) + 'px', height: (LH * ih) + 'px' });
      const lg = sp.querySelector('#splogo'), sr = shield && shield.getBoundingClientRect();
      if (lg && sr) Object.assign(lg.style, { left: sr.left + 'px', top: sr.top + 'px', width: sr.width + 'px', height: sr.height + 'px' });
    };
    centerLogo(); addEventListener('resize', centerLogo);
    // recalcula assim que a tela tiver o tamanho real (no app do celular ela pode abrir com tamanho provisório)
    if (window.ResizeObserver) { const ro = new ResizeObserver(() => { if (!bg.isConnected) return ro.disconnect(); centerLogo(); }); ro.observe(bg); }
    requestAnimationFrame(() => requestAnimationFrame(centerLogo));
    // leve paralaxe com o mouse (computador)
    sp.addEventListener('pointermove', ev => {
      if (reduced || ev.pointerType !== 'mouse') return;
      const dx = ev.clientX / innerWidth - .5, dy = ev.clientY / innerHeight - .5;
      sp.style.setProperty('--px', dx.toFixed(3)); sp.style.setProperty('--py', dy.toFixed(3));
    });
    // segredo: segurar o logo por 5 segundos faz ele explodir em fogo e cartas
    const lg = sp.querySelector('#splogo');
    // ---- fogo orgânico (partículas em canvas, mistura aditiva) ----
    const cv = sp.querySelector('#spfire'), cx2 = cv.getContext('2d');
    const ccv = sp.querySelector('#spcards'), cc = ccv.getContext('2d');
    const P = [], CP = []; let fireRaf = 0, lastF = 0, charge = 0;
    const sizeCv = () => { [cv, ccv].forEach(c => { c.width = innerWidth; c.height = innerHeight; c.style.width = innerWidth + 'px'; c.style.height = innerHeight + 'px'; }); };
    // cartas da explosão desenhadas no canvas (muito mais leve que centenas de elementos animados)
    // pré-carrega e reduz cada carta para um canvas pequeno (assim a explosão não trava decodificando imagens)
    const CARD_IMGS = [];
    Object.keys(E.CARDS).sort(() => Math.random() - .5).slice(0, 48).forEach(id => {
      const im = new Image(); im.src = `img/${E.CARDS[id].img}.webp`;
      (im.decode ? im.decode() : new Promise(r => { im.onload = r; })).then(() => {
        const c = document.createElement('canvas'); c.width = 140; c.height = 214;
        c.getContext('2d').drawImage(im, 0, 0, 140, 214); c.complete = true; c.naturalWidth = 140; CARD_IMGS.push(c);
      }).catch(() => {});
    });
    sizeCv(); addEventListener('resize', sizeCv);
    // cor do fogo pela "idade": branco → amarelo → laranja → vermelho → fumaça
    const fireColor = (t, a) => {
      if (t < .15) return `rgba(255,250,${Math.round(230 - t * 600)},${a})`;
      if (t < .4) return `rgba(255,${Math.round(220 - (t - .15) * 360)},${Math.round(60 - (t - .15) * 200)},${a})`;
      if (t < .75) return `rgba(${Math.round(255 - (t - .4) * 200)},${Math.round(130 - (t - .4) * 260)},20,${a})`;
      return `rgba(90,30,15,${a * .6})`;
    };
    // sprites pré-desenhados (um por fase da cor) — desenhar imagem é bem mais leve que criar gradiente por partícula
    const STAGES = 24, SPR = [];
    for (let i = 0; i < STAGES; i++) {
      const t = i / (STAGES - 1), c = document.createElement('canvas'); c.width = c.height = 64;
      const g2 = c.getContext('2d'), gr = g2.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, fireColor(t, 1)); gr.addColorStop(.45, fireColor(Math.min(1, t + .1), .55)); gr.addColorStop(1, fireColor(Math.min(1, t + .2), 0));
      g2.fillStyle = gr; g2.fillRect(0, 0, 64, 64); SPR.push(c);
    }
    const MAXP = reduced ? 120 : 700;
    const emit = (x, y, vx, vy, size, life, big) => P.length < MAXP && P.push({ x, y, vx, vy, size, life, big, age: 0, seed: Math.random() * 6.28 });
    const shieldBox = () => { const r = lg.getBoundingClientRect(); return { cx: r.left + r.width / 2, cy: r.top + r.height * .5, rx: r.width * .44, ry: r.height * .47 }; };
    function fireLoop(now) {
      const dt = Math.min(.05, (now - (lastF || now)) / 1000); lastF = now;
      // contorno de chamas enquanto segura: emite do perímetro do escudo, cada vez mais
      if (charge > 0) {
        const b = shieldBox(), n = Math.round(3 + charge * 14);
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2, x = b.cx + Math.cos(a) * b.rx, y = b.cy + Math.sin(a) * b.ry;
          emit(x, y, Math.cos(a) * 30 + (Math.random() - .5) * 20, -50 - Math.random() * 80 * (1 + charge), 7 + Math.random() * 12 * (1 + charge * .6), .4 + Math.random() * .5);
        }
      }
      cx2.globalAlpha = 1; cx2.clearRect(0, 0, innerWidth, innerHeight);
      cx2.globalCompositeOperation = 'lighter';
      for (let i = P.length - 1; i >= 0; i--) {
        const p = P[i]; p.age += dt;
        const t = p.age / p.life; if (t >= 1) { P.splice(i, 1); continue; }
        // turbulência + empuxo para cima + arrasto
        p.vx += Math.sin(p.seed + p.age * 9) * 60 * dt; p.vy -= 120 * dt;
        p.vx *= 1 - 1.6 * dt; p.vy *= 1 - 1.2 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        const sz = p.size * (1 + t * 1.6), a = (1 - t) * (t < .08 ? t / .08 : 1) * (p.big ? .3 : .42);
        cx2.globalAlpha = a; cx2.drawImage(SPR[Math.min(STAGES - 1, (t * STAGES) | 0)], p.x - sz, p.y - sz, sz * 2, sz * 2);
      }
      // cartas
      cc.clearRect(0, 0, innerWidth, innerHeight);
      for (let i = CP.length - 1; i >= 0; i--) {
        const c = CP[i]; c.age += dt;
        if (c.age < 0) continue;
        if (c.age >= c.life) { CP.splice(i, 1); continue; }
        c.vx *= 1 - c.drag * dt; c.vy *= 1 - c.drag * dt; c.vy += c.grav * dt;
        c.x += c.vx * dt; c.y += c.vy * dt; c.rot += c.vr * dt;
        const t = c.age / c.life, s = c.grow ? Math.min(1, .25 + c.age * 6) : 1;
        if (!c.im.complete || !c.im.naturalWidth) continue;
        cc.globalAlpha = t > .8 ? (1 - t) / .2 : 1;
        cc.setTransform(s, 0, 0, s, c.x, c.y); cc.rotate(c.rot);
        cc.drawImage(c.im, -c.w / 2, -c.h / 2, c.w, c.h);
      }
      cc.setTransform(1, 0, 0, 1, 0, 0); cc.globalAlpha = 1;
      if (P.length || CP.length || charge > 0) fireRaf = requestAnimationFrame(fireLoop); else { fireRaf = 0; lastF = 0; sp.classList.remove('firelive'); }
    }
    const kickFire = () => { if (!sp.classList.contains('firelive')) { sp.classList.add('firelive'); centerLogo(); } if (!fireRaf) fireRaf = requestAnimationFrame(fireLoop); };

    let holdT0 = 0, holdRaf = 0, lastTick = 0;
    const stopHold = () => { cancelAnimationFrame(holdRaf); holdT0 = 0; charge = 0; sp.classList.remove('charging'); sp.style.setProperty('--p', 0); };
    const holdLoop = () => {
      if (!holdT0) return;
      const p = Math.min(1, (performance.now() - holdT0) / 5000);
      charge = p; sp.style.setProperty('--p', p.toFixed(3));
      const gap = 420 - p * 360;
      if (performance.now() - lastTick > gap) { lastTick = performance.now(); try { sfx.flick(); } catch (e) {} if (p > .6) buzz(15); }
      if (p >= 1) { stopHold(); cardBlast(); return; }
      holdRaf = requestAnimationFrame(holdLoop);
    };
    lg.addEventListener('pointerdown', ev => {
      ev.preventDefault(); audio(); holdT0 = performance.now(); lastTick = 0;
      sp.style.setProperty('--px', 0); sp.style.setProperty('--py', 0); sp.classList.add('charging'); centerLogo();
      try { lg.setPointerCapture(ev.pointerId); } catch (e) {}
      holdRaf = requestAnimationFrame(holdLoop); kickFire();
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(n => lg.addEventListener(n, stopHold));
    lg.addEventListener('contextmenu', ev => ev.preventDefault());

    let blasting = false;
    function cardBlast() {
      const boom = sp.querySelector('#spboom'); if (!boom || blasting) return;
      blasting = true; setTimeout(() => { blasting = false; }, 3500);
      const b = shieldBox(), cx = b.cx, cy = b.cy;
      const VW = innerWidth, VH = innerHeight, far = Math.hypot(VW, VH), N = reduced ? .2 : 1;
      const all = Object.keys(E.CARDS).sort(() => Math.random() - .5);
      const anim = (el, kf, o) => el.animate(kf, Object.assign({ fill: 'forwards' }, o)).finished.then(() => el.remove()).catch(() => el.remove());
      const S = (fn, ms) => setTimeout(() => { try { fn(); } catch (e) {} }, ms);
      sp.classList.add('blastlive'); setTimeout(() => sp.classList.remove('blastlive'), 5000);
      sp.classList.remove('blast'); void sp.offsetWidth; sp.classList.add('blast'); S(() => sp.classList.remove('blast'), 1300);
      try { sfx.boom(); } catch (e) {} S(() => sfx.boom(), 120); S(() => sfx.crack(), 40); S(() => sfx.sparkle(), 380);
      buzz([140, 40, 220, 60, 120]);

      // bola de fogo orgânica: centenas de partículas saindo do escudo em todas as direções
      for (let i = 0; i < 260 * N; i++) {
        const a = Math.random() * Math.PI * 2, v = (.25 + Math.pow(Math.random(), .7)) * (far * .75);
        emit(cx + (Math.random() - .5) * b.rx, cy + (Math.random() - .5) * b.ry, Math.cos(a) * v, Math.sin(a) * v * .8 - 80, 14 + Math.random() * 34, .6 + Math.random() * .9, 1);
      }
      // anel de chamas que corre pelo contorno do escudo e depois se abre
      for (let i = 0; i < 110 * N; i++) {
        const a = i / (110 * N) * Math.PI * 2;
        emit(cx + Math.cos(a) * b.rx, cy + Math.sin(a) * b.ry, Math.cos(a) * 420, Math.sin(a) * 340, 16 + Math.random() * 20, .6 + Math.random() * .5);
      }
      S(() => { for (let i = 0; i < 70 * N; i++) { const a = Math.random() * Math.PI * 2, v = (.3 + Math.random()) * far * .4; emit(cx, cy, Math.cos(a) * v, Math.sin(a) * v - 60, 18 + Math.random() * 28, .8 + Math.random(), 1); } }, 160);
      kickFire();

      // cartas: muitas, de uma vez, saindo de trás do escudo
      const card = (x, y, vx, vy, opts) => { if (!CARD_IMGS.length) return; const w = opts.w; CP.push(Object.assign({ im: CARD_IMGS[(Math.random() * CARD_IMGS.length) | 0], x, y, vx, vy, w, h: w * 1.5275, rot: (Math.random() - .5) * .6, vr: (Math.random() - .5) * 14, age: -(opts.delay || 0), life: 1.6 + Math.random() * 1.2, drag: 1.4, grav: 520, grow: true }, opts)); };
      for (let i = 0; i < 160 * N; i++) {
        const a = Math.random() * Math.PI * 2, v = far * (.9 + Math.random() * 1.4);
        card(cx, cy, Math.cos(a) * v, Math.sin(a) * v * .85 - far * .25, { w: 46 + Math.random() * 80, delay: Math.random() * .12 });
      }
      // chuva de cartas depois
      for (let i = 0; i < 26 * N; i++) {
        const w = 38 + Math.random() * 44;
        card(Math.random() * VW, -w * 1.6, (Math.random() - .5) * 80, 60 + Math.random() * 120, { w, delay: .7 + Math.random() * 1.3, drag: .3, grav: 160, life: 4.5, vr: (Math.random() - .5) * 5, grow: false });
      }
      kickFire();
    }
    $app.querySelector('#spstart').onclick = () => {
      audio(); if (sfx.sparkle) sfx.sparkle();
      sp.classList.add('out');
      setTimeout(() => { ui.view = 'setup'; renderSetup(); }, reduced ? 50 : 650);
    };
  }

  // ---------- início ----------
  const boot = data => {
    if (data && data.st) { st = data.st; V = st; lastSeq = st.evSeq || 0; ui.view = 'game'; pump(); }
    else renderSplash();
    initNet();
  };
  window.claude?.hot?.snapshot?.(() => ({ st }));
  window.claude?.hot?.ready ? window.claude.hot.ready(boot) : boot(window.claude?.hot?.data ?? {});
})();
