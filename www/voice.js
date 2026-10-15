// Giraffe Doom — conversa de voz nas salas online (WebRTC, direto entre os celulares).
// O Firebase só carrega a "sinalização" (quem fala com quem); o áudio vai de aparelho para aparelho.
(function () {
  const ICE = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
    { urls: 'stun:stun.cloudflare.com:3478' }
  ];
  let api = null, room = null, notify = () => {};
  let joined = false, session = null, stream = null, muted = false, joining = false;
  const peers = new Map();      // uid -> { pc, rs (sessão do outro), audio, pend: [] , seen: Set }
  const listens = new Map();    // uid -> off()
  const early = new Map();      // uid -> candidatos que chegaram antes da oferta
  const talking = new Set();
  let actx = null, meter = null;
  const rnd = () => Math.random().toString(36).slice(2, 10);

  function supported() { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.RTCPeerConnection); }

  function attach(voiceApi, roomApi, onNotify) {
    detach();
    api = voiceApi; room = roomApi; notify = onNotify || notify;
    room.onPeers(sync);
    api.clearAll();
    sync(); refresh();
  }
  function detach() {
    if (joined) leave(true);
    listens.forEach(off => off()); listens.clear();
    api = null; room = null; refresh();
  }

  async function join() {
    if (!api || joined || joining) return;
    if (!supported()) { notify('Este aparelho não permite conversa de voz pelo jogo.'); return; }
    joining = true; refresh();
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (e) {
      joining = false; refresh();
      notify('Sem acesso ao microfone. Libere o microfone para o Giraffe Doom nas configurações do celular.');
      return;
    }
    joining = false; joined = true; muted = false; session = rnd();
    try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); actx.resume && actx.resume(); } catch (e) {}
    watchLevel('me', stream);
    room.presence({ voice: session });
    sync(); refresh();
  }
  function leave(silent) {
    joined = false; session = null;
    peers.forEach((_, uid) => closePeer(uid));
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null; muted = false; talking.clear();
    if (room) room.presence({ voice: null });
    if (api) api.clearAll();
    refresh();
  }
  function setMuted(m) {
    muted = !!m;
    if (stream) stream.getAudioTracks().forEach(t => { t.enabled = !muted; });
    if (room) room.presence({ vmute: muted || null });
    refresh();
  }
  // botão: desligado -> entra na voz; ligado -> muda mudo/falando
  function toggle() { if (!joined) return join(); setMuted(!muted); }

  // ---------- quem conecta com quem ----------
  function others() {
    if (!room || !api) return [];
    return room.peers().filter(p => p.by && p.by !== api.uid && p.presence && p.presence.voice);
  }
  function sync() {
    if (!room || !api) return;
    const list = others();
    const ids = new Set(list.map(p => p.by));
    // escuta mensagens de todos que estão na sala
    room.peers().forEach(p => { if (p.by && p.by !== api.uid && !listens.has(p.by)) listens.set(p.by, api.listen(p.by, (k, m) => onMsg(p.by, k, m))); });
    listens.forEach((off, uid) => { if (!room.peers().some(p => p.by === uid)) { off(); listens.delete(uid); } });
    // fecha quem saiu da voz ou reentrou com outra sessão
    peers.forEach((x, uid) => { const p = list.find(q => q.by === uid); if (!p || (x.rs && p.presence.voice !== x.rs)) closePeer(uid); });
    if (joined) {
      // o de menor id faz a oferta; o outro espera
      list.forEach(p => { if (!peers.has(p.by) && api.uid < p.by) offer(p.by, p.presence.voice); });
    }
    refresh();
  }

  function makePeer(uid, rs) {
    const pc = new RTCPeerConnection({ iceServers: ICE });
    const x = { pc, rs, audio: null, pend: [], seen: new Set() };
    peers.set(uid, x);
    if (stream) stream.getTracks().forEach(t => pc.addTrack(t, stream));
    pc.onicecandidate = e => { if (e.candidate) send(uid, rs, { t: 'ice', d: JSON.stringify(e.candidate) }); };
    pc.ontrack = e => {
      const st = e.streams[0] || new MediaStream([e.track]);
      if (!x.audio) { x.audio = new Audio(); x.audio.autoplay = true; x.audio.setAttribute('playsinline', ''); x.audio.style.display = 'none'; document.body.appendChild(x.audio); }
      x.audio.srcObject = st; const pl = x.audio.play(); if (pl && pl.catch) pl.catch(() => {});
      watchLevel(uid, st);
    };
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === 'failed') {
        closePeer(uid);
        notify('A voz com um jogador não conectou (a rede pode estar bloqueando). Tentando de novo…');
        setTimeout(sync, 3000);
      }
      refresh();
    };
    return x;
  }
  function closePeer(uid) {
    const x = peers.get(uid); if (!x) return;
    try { x.pc.close(); } catch (e) {}
    if (x.audio) { x.audio.srcObject = null; x.audio.remove(); }
    peers.delete(uid); talking.delete(uid); early.delete(uid);
    if (api) api.clearTo(uid);
  }
  function send(to, rs, m) { if (api && joined) api.send(to, Object.assign({ s: session, r: rs }, m)); }

  async function offer(uid, rs) {
    await api.clearTo(uid);
    const x = makePeer(uid, rs);
    try {
      const o = await x.pc.createOffer({ offerToReceiveAudio: true });
      await x.pc.setLocalDescription(o);
      send(uid, rs, { t: 'offer', d: JSON.stringify(x.pc.localDescription) });
    } catch (e) { console.error(e); closePeer(uid); }
  }
  async function onMsg(uid, key, m) {
    if (!joined || !m || m.r !== session) return;          // mensagem de outra sessão
    let x = peers.get(uid);
    if (x && x.seen.has(key)) return;
    try {
      if (m.t === 'offer') {
        if (x && x.rs !== m.s) { closePeer(uid); x = null; }
        if (!x) { await api.clearTo(uid); x = makePeer(uid, m.s); }
        x.seen.add(key);
        x.pend.push(...(early.get(uid) || [])); early.delete(uid);
        await x.pc.setRemoteDescription(JSON.parse(m.d));
        const a = await x.pc.createAnswer();
        await x.pc.setLocalDescription(a);
        send(uid, m.s, { t: 'answer', d: JSON.stringify(x.pc.localDescription) });
        flush(x);
      } else if (m.t === 'answer' && x && x.rs === m.s) {
        x.seen.add(key);
        if (x.pc.signalingState === 'have-local-offer') { await x.pc.setRemoteDescription(JSON.parse(m.d)); flush(x); }
      } else if (m.t === 'ice') {
        if (!x || x.rs !== m.s) { const q = early.get(uid) || []; q.push(JSON.parse(m.d)); early.set(uid, q.slice(-40)); return; }
        x.seen.add(key);
        const c = JSON.parse(m.d);
        if (x.pc.remoteDescription) await x.pc.addIceCandidate(c).catch(() => {}); else x.pend.push(c);
      }
    } catch (e) { console.error('voz', e); }
  }
  function flush(x) { const p = x.pend.splice(0); p.forEach(c => x.pc.addIceCandidate(c).catch(() => {})); }

  // ---------- quem está falando ----------
  const meters = new Map();
  function watchLevel(uid, st) {
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      const src = actx.createMediaStreamSource(st); const an = actx.createAnalyser(); an.fftSize = 512; src.connect(an);
      meters.set(uid, { an, buf: new Uint8Array(an.fftSize) });
      if (!meter) meter = setInterval(tick, 180);
    } catch (e) {}
  }
  function tick() {
    let changed = false;
    meters.forEach((m, uid) => {
      if (uid !== 'me' && !peers.has(uid)) { meters.delete(uid); return; }
      if (uid === 'me' && !joined) { meters.delete(uid); return; }
      m.an.getByteTimeDomainData(m.buf);
      let sum = 0; for (let i = 0; i < m.buf.length; i++) { const v = (m.buf[i] - 128) / 128; sum += v * v; }
      const on = Math.sqrt(sum / m.buf.length) > 0.04 && !(uid === 'me' && muted);
      const key = uid === 'me' ? (api && api.uid) : uid;
      if (on !== talking.has(key)) { on ? talking.add(key) : talking.delete(key); changed = true; }
    });
    if (!meters.size) { clearInterval(meter); meter = null; }
    if (changed) paintTalking();
  }
  function paintTalking() {
    document.querySelectorAll('[data-vuid]').forEach(el => el.classList.toggle('talking', talking.has(el.dataset.vuid)));
    document.querySelectorAll('[data-voicebtn]').forEach(el => el.classList.toggle('talking', talking.size > 0));
  }

  // ---------- botão ----------
  function inVoice(uid) { return !!(room && room.peers().some(p => p.by === uid && p.presence && p.presence.voice)); }
  function count() { return others().length + (joined ? 1 : 0); }
  function label() {
    if (!api) return '';
    if (joining) return '🎙️ …';
    if (!joined) { const n = others().length; return n ? `🎙️ ${n}` : '🎙️'; }
    return (muted ? '🔇' : '🎙️') + ' ' + count();
  }
  function title() {
    if (!joined) return 'Entrar na conversa de voz';
    return muted ? 'Microfone desligado: toque para falar' : 'Microfone ligado: toque para ficar mudo';
  }
  function refresh() {
    document.querySelectorAll('[data-voicebtn]').forEach(el => {
      el.hidden = !api;
      el.textContent = label(); el.title = title(); el.setAttribute('aria-label', title());
      el.classList.toggle('on', joined && !muted); el.classList.toggle('muted', joined && muted);
    });
    document.querySelectorAll('[data-voiceleave]').forEach(el => { el.hidden = !joined; });
    document.querySelectorAll('[data-vuid]').forEach(el => el.classList.toggle('invoice', inVoice(el.dataset.vuid) || (joined && api && el.dataset.vuid === api.uid)));
    paintTalking();
  }

  window.GDVoice = { attach, detach, join, leave, toggle, setMuted, refresh, supported, get active() { return !!api; }, get joined() { return joined; }, get muted() { return muted; } };
})();
