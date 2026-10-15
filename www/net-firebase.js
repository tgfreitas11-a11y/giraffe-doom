// Giraffe Doom — multiplayer pelo Firebase (Realtime Database + login anônimo).
// Imita a mesma interface que o jogo usava dentro do Claude (db / room / user),
// mas cada mesa fica numa "sala" com código: rooms/{CÓDIGO}/game e rooms/{CÓDIGO}/peers/{uid}.
(function () {
  const firebaseConfig = {
    apiKey: "AIzaSyAjS063fBZDuDYfOjw995o317d8NHVpnuc",
    authDomain: "giraffe-doom.firebaseapp.com",
    databaseURL: "https://giraffe-doom-default-rtdb.firebaseio.com",
    projectId: "giraffe-doom",
    storageBucket: "giraffe-doom.firebasestorage.app",
    messagingSenderId: "627295316774",
    appId: "1:627295316774:web:91912c570f05fd727befe7"
  };
  if (!window.firebase) { console.warn('Firebase não carregou'); return; }
  firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  const rtdb = firebase.database();
  const TS = firebase.database.ServerValue.TIMESTAMP;

  let uidP = null;
  function signIn() {
    if (!uidP) uidP = new Promise((res, rej) => {
      const off = auth.onAuthStateChanged(u => {
        if (u) { off(); res(u.uid); }
      });
      auth.signInAnonymously().catch(e => { uidP = null; off(); rej(e); });
    });
    return uidP;
  }

  // letras sem confusão (sem O/0, I/1)
  const ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const newCode = () => Array.from({ length: 5 }, () => ABC[Math.floor(Math.random() * ABC.length)]).join('');
  const clean = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);

  let cur = null; // sala atual

  function makeRoom(code, uid, owner) {
    const base = rtdb.ref('rooms/' + code);
    const gameRef = base.child('game');
    const peersRef = base.child('peers');
    const meRef = peersRef.child(uid);
    let mine = {};
    let peers = [];
    const peerCbs = [];
    const offs = [];

    // update (não set): não apaga a sinalização de voz que fica em peers/{uid}/v
    const writeMe = () => meRef.update({ j: JSON.stringify(mine), at: TS }).catch(e => console.error('presença', e));
    let wTimer = null;
    const schedule = () => { if (!wTimer) wTimer = setTimeout(() => { wTimer = null; writeMe(); }, 30); };

    // reconecta: registra de novo a saída automática e reescreve a presença
    const connRef = rtdb.ref('.info/connected');
    const onConn = s => { if (s.val() === true) { meRef.onDisconnect().remove().then(writeMe); } };
    connRef.on('value', onConn); offs.push(() => connRef.off('value', onConn));

    // presença: escuta só o campo "j" de cada jogador (a sinalização de voz não dispara atualizações)
    const pmap = new Map(); const jOffs = new Map();
    const emit = () => {
      peers = Array.from(pmap, ([by, p]) => ({ by, kind: 'viewer', guest: false, presence: p }));
      const ch = { peers: peers.slice() };
      peerCbs.forEach(cb => { try { cb(ch); } catch (e) { console.error(e); } });
    };
    const onAdd = cs => {
      const by = cs.key, jr = cs.ref.child('j');
      const h = js => { let p = null; try { p = JSON.parse(js.val() || 'null'); } catch (e) {} if (p) pmap.set(by, p); else pmap.delete(by); emit(); };
      jr.on('value', h); jOffs.set(by, () => jr.off('value', h));
    };
    const onRem = cs => { const by = cs.key; if (jOffs.has(by)) { jOffs.get(by)(); jOffs.delete(by); } pmap.delete(by); emit(); };
    peersRef.on('child_added', onAdd); peersRef.on('child_removed', onRem);
    offs.push(() => { peersRef.off('child_added', onAdd); peersRef.off('child_removed', onRem); jOffs.forEach(f => f()); jOffs.clear(); });

    const room = {
      presence(part) {
        if (part) { for (const k in part) { if (part[k] === null || part[k] === undefined) delete mine[k]; else mine[k] = part[k]; } schedule(); }
        return Object.assign({}, mine);
      },
      peers: () => peers.slice(),
      onPeers(cb) { peerCbs.push(cb); return () => { const i = peerCbs.indexOf(cb); if (i >= 0) peerCbs.splice(i, 1); }; }
    };

    const db = {
      doc() {
        return {
          set(obj) { return gameRef.set({ host: obj.host || uid, j: JSON.stringify(obj), at: TS }); },
          onSnapshot(cb, err) {
            const h = s => {
              const v = s.val();
              let d = null; if (v && v.j) { try { d = JSON.parse(v.j); } catch (e) {} }
              cb({ exists: !!d, data: () => d });
            };
            gameRef.on('value', h, e => { console.error(e); if (err) err(e); });
            offs.push(() => gameRef.off('value', h));
            return () => gameRef.off('value', h);
          }
        };
      }
    };

    const user = { id: async () => uid, isOwner: async () => owner };

    // sinalização da voz (WebRTC): cada um escreve só no próprio nó, em peers/{eu}/v/{destino}
    const voice = {
      uid,
      send(to, msg) { return meRef.child('v').child(to).push(msg).catch(e => console.error('voz', e)); },
      clearTo(to) { return meRef.child('v').child(to).remove().catch(() => {}); },
      clearAll() { return meRef.child('v').remove().catch(() => {}); },
      listen(from, cb) {
        const r = peersRef.child(from).child('v').child(uid);
        const h = cs => { try { cb(cs.key, cs.val()); } catch (e) { console.error(e); } };
        r.on('child_added', h); return () => r.off('child_added', h);
      }
    };

    return {
      code, owner, db, room, user, voice,
      close() {
        offs.forEach(f => f()); clearTimeout(wTimer);
        meRef.onDisconnect().cancel(); meRef.remove().catch(() => {});
      }
    };
  }

  window.GDNet = {
    get code() { return cur && cur.code; },
    // cria uma sala nova (você é o anfitrião)
    async create() {
      const uid = await signIn();
      for (let i = 0; i < 6; i++) {
        const code = newCode();
        const s = await rtdb.ref('rooms/' + code + '/game').once('value');
        const v = s.val();
        if (v && v.host !== uid && Date.now() - (v.at || 0) < 86400000) continue; // código em uso
        if (cur) cur.close();
        cur = makeRoom(code, uid, true);
        return cur;
      }
      throw new Error('Não foi possível criar a sala. Tente de novo.');
    },
    // entra numa sala existente pelo código
    async join(codeIn) {
      const code = clean(codeIn);
      if (code.length < 4) throw Object.assign(new Error('Código inválido.'), { code: 'invalid' });
      const uid = await signIn();
      const s = await rtdb.ref('rooms/' + code + '/game').once('value');
      const v = s.val();
      let d = null; try { d = v && JSON.parse(v.j); } catch (e) {}
      if (!d || d.status === 'ended') throw Object.assign(new Error('Sala não encontrada.'), { code: 'notfound' });
      if (cur) cur.close();
      cur = makeRoom(code, uid, v.host === uid);
      return cur;
    },
    leave() { if (cur) { cur.close(); cur = null; } }
  };
})();
