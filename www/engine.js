// Giraffe Doom — motor de regras (estado puro e serializável, pronto para o modo online)
(function (root) {
  const C = root.GD_CARDS || (typeof require !== 'undefined' ? require('./cards.js') : null);
  const { cards: CARDS, piles: PILES } = C.buildCards();
  const OBJ = C.OBJECTIVES;
  const HAND_LIMIT = Infinity; // o jogo não tem limite de mão
  const MAX_NECKS = 5;
  const TARGETED = new Set(['attack', 'poison', 'discard', 'steal', 'sneaky', 'exchange', 'sleep']);
  const REACTION = new Set(['defense', 'interrupt', 'super']);
  const COLOR_PT = { R: 'vermelho', B: 'azul', G: 'verde', Y: 'amarelo', W: 'branco' };

  // ---------- RNG determinístico ----------
  function rand(st) {
    let t = (st.seed = (st.seed + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function shuffle(st, a) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand(st) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  const card = id => CARDS[id];
  const name = id => CARDS[id].name;

  // ---------- Preparação ----------
  function newGame(players, seed) {
    const st = {
      seed: (seed ?? Math.floor(Math.random() * 2 ** 31)) | 0,
      players: players.map((p, i) => ({
        idx: i, name: p.name, isBot: !!p.isBot, hand: [], objectives: [], done: [], giraffes: [],
        poisons: [], sleep: 0,
      })),
      deck: [], discard: [], bodyDeck: [], market: [], objDeck: [],
      turn: 0, turnNo: 1, built: 0, attacked: false, extraTurns: 0, dmg: {}, turnHits: {},
      pending: null, winner: null, log: [], gidSeq: 1, mustEndTurn: false,
    };
    const n = st.players.length;
    const P = pilesFor(st, n);
    st.half = n <= 4;
    st.objDeck = shuffle(st, OBJ.map((_, i) => i));
    st.players.forEach(p => { p.objectives = [st.objDeck.pop(), st.objDeck.pop()]; });
    st.bodyDeck = shuffle(st, P.bodies.slice());
    st.market = [st.bodyDeck.pop(), st.bodyDeck.pop(), st.bodyDeck.pop()];
    const heads = shuffle(st, P.heads.concat(P.specials));
    st.players.forEach(p => p.hand.push(heads.pop(), heads.pop(), heads.pop()));
    const main = shuffle(st, P.main.concat(heads));
    st.players.forEach(p => { for (let k = 0; k < 4; k++) p.hand.push(main.pop()); });
    // Campo minado: bombas embaralhadas na metade de baixo do monte
    const half = Math.floor(main.length / 2);
    const bottom = shuffle(st, main.slice(0, half).concat(P.bombs));
    st.deck = bottom.concat(main.slice(half)); // topo = fim do array
    st.turn = Math.floor(rand(st) * n);
    log(st, `🦒 Partida começou! ${st.players[st.turn].name} joga primeiro.`);
    startTurn(st);
    return st;
  }

  // até 4 jogadores: metade das cartas, sorteada a cada partida.
  // Cada cabeça vem com o seu corpo, e cada tipo de carta é dividido ao meio
  // (pescoços por cor, ataques por dano, sono por turnos) para o jogo continuar equilibrado.
  function pilesFor(st, n) {
    if (n > 4) return PILES;
    const halfOf = arr => shuffle(st, arr.slice()).slice(0, Math.ceil(arr.length / 2));
    const heads = halfOf(PILES.heads);
    const keep = new Set(heads.map(h => card(h).match));
    const bodies = PILES.bodies.filter(b => keep.has(card(b).match));
    const groups = {};
    PILES.main.forEach(id => { const c = card(id); const k = c.kind + (c.kind === 'neck' ? c.color : c.kind === 'attack' ? c.dmg : c.kind === 'sleep' ? c.turns : ''); (groups[k] = groups[k] || []).push(id); });
    const main = [].concat(...Object.keys(groups).sort().map(k => halfOf(groups[k])));
    return { heads, bodies, specials: halfOf(PILES.specials), main, bombs: halfOf(PILES.bombs) };
  }
  function log(st, msg) { st.log.push(msg); if (st.log.length > 100) st.log.shift(); }
  // eventos estruturados para a interface animar
  function ev(st, e) { st.events = st.events || []; st.evSeq = (st.evSeq || 0) + 1; e.seq = st.evSeq; st.events.push(e); if (st.events.length > 150) st.events.shift(); }

  // ---------- Consultas ----------
  const cur = st => st.players[st.turn];
  function topPiece(g) {
    if (g.necks.length) return { kind: 'neck', id: g.necks[g.necks.length - 1], def: card(g.necks[g.necks.length - 1]).def };
    const id = g.special || g.head;
    return { kind: 'head', id, def: card(id).def };
  }
  // girafas especiais (Girassauro, Girafarão, Girapeta, Crocorafa) contam como nível 1
  function giraffeView(g) { return { necks: g.necks.map(id => card(id).color), special: !!g.special }; }
  function score(p) { return p.done.reduce((s, o) => s + OBJ[o].pts, 0); }
  function canBuild(st) { return !st.attacked && !st.pending && !st.winner; }
  function targetable(st, pid, actorPid) { const p = st.players[pid]; return pid !== actorPid && p.sleep === 0; }

  // ---------- Início / fim de turno ----------
  function startTurn(st) {
    st.dmg = {}; st.turnHits = {}; st.attacked = false; st.built = 0; st.neckPlayed = 0; st.swapped = false; st.mustEndTurn = false; st.played = 0; st.objBought = false;
    const p = cur(st);
    ev(st, { t: 'turn', pid: p.idx });
    // veneno
    if (p.poisons.length) {
      p.poisons.slice().forEach(po => {
        if (!p.poisons.includes(po)) return; // saiu porque a girafa caiu
        // o veneno fica em cima da girafa atacada: 1 ponto por turno, que não volta
        const g = po.gid ? p.giraffes.find(x => x.id === po.gid) : biggest(p);
        if (!g) { po.left = 0; return; }
        po.gid = g.id;
        if (!po.piece) po.piece = topPiece(g).id;
        if (!(g.necks.includes(po.piece) || po.piece === (g.special || g.head))) { po.left = 0; return; }
        po.left--;
        ev(st, { t: 'poisontick', pid: p.idx, card: po.card, gid: g.id, piece: po.piece, left: po.left });
        log(st, `☠️ O veneno ${name(po.card)} age em ${name(po.piece)} (${name(g.special || g.head)}) de ${p.name}: perde 1 ponto (${po.left ? `mais ${po.left} turno${po.left > 1 ? 's' : ''}` : 'último ponto'}).`);
        hit(st, p.idx, g.id, 1, true, po.piece, true);
      });
      p.poisons.filter(po => po.left <= 0).forEach(po => { st.discard.push(po.card); log(st, `${name(po.card)} perdeu o efeito em ${p.name}.`); });
      p.poisons = p.poisons.filter(po => po.left > 0);
      st.dmg = {};
    }
    if (p.sleep > 0) {
      p.sleep--;
      log(st, `😴 ${p.name} está dormindo e pula a vez.`);
      ev(st, { t: 'sleepskip', pid: p.idx });
      return endTurn(st, true);
    }
  }
  function endTurn(st, skipped) {
    if (st.winner) return;
    if (!skipped && st.extraTurns > 0) {
      st.extraTurns--;
      log(st, `⏳ Turno extra para ${cur(st).name}!`);
      ev(st, { t: 'extraturn', pid: st.turn });
    } else {
      st.turn = (st.turn + 1) % st.players.length;
      st.turnNo++;
    }
    startTurn(st);
  }
  function biggest(p) {
    if (!p.giraffes.length) return null;
    return p.giraffes.slice().sort((a, b) => b.necks.length - a.necks.length)[0];
  }

  // ---------- Dano ----------
  // peça que um ataque pode acertar: qualquer pescoço; a cabeça só quando não há pescoços
  function pieceOf(g, pieceId) {
    if (pieceId && g.necks.includes(pieceId)) return { kind: 'neck', id: pieceId, def: card(pieceId).def };
    if (pieceId && pieceId === (g.special || g.head)) return { kind: 'head', id: pieceId, def: card(pieceId).def };
    return topPiece(g);
  }
  function validPiece(g, pieceId) { return !pieceId || g.necks.includes(pieceId) || (!g.necks.length && pieceId === (g.special || g.head)); }
  function dropPoisons(st, p, fn) {
    p.poisons.filter(fn).forEach(po => { st.discard.push(po.card); log(st, `${name(po.card)} saiu de jogo junto com a peça envenenada.`); });
    p.poisons = p.poisons.filter(po => !fn(po));
  }
  // wound = dano de veneno: não some no fim do turno
  function hit(st, pid, gid, amount, silent, pieceId, wound) {
    const p = st.players[pid];
    const g = p.giraffes.find(x => x.id === gid);
    if (!g) return;
    st.wounds = st.wounds || {};
    const piece = pieceOf(g, pieceId);
    const total = (st.dmg[piece.id] || 0) + (st.wounds[piece.id] || 0) + amount;
    ev(st, { t: 'hit', pid, gid, piece: piece.id, amount, total, def: piece.def, wound: !!wound });
    if (total >= piece.def) {
      delete st.dmg[piece.id]; delete st.wounds[piece.id];
      if (piece.kind === 'neck') {
        g.necks.splice(g.necks.indexOf(piece.id), 1); st.discard.push(piece.id);
        dropPoisons(st, p, po => po.piece === piece.id);
        ev(st, { t: 'destroy', pid, gid, piece: piece.id, kind: 'neck' });
        log(st, `💥 ${name(piece.id)} de ${p.name} quebrou (${total} de dano ≥ defesa ${piece.def}). A girafa ${name(g.special || g.head)} caiu para o nível ${g.necks.length}.`);
      } else {
        p.giraffes = p.giraffes.filter(x => x !== g);
        g.necks.forEach(n => { delete st.dmg[n]; delete st.wounds[n]; st.discard.push(n); });
        // venenos em cima dessa girafa vão para o descarte
        dropPoisons(st, p, po => po.gid === g.id);
        ev(st, { t: 'destroy', pid, gid, piece: piece.id, kind: 'giraffe' });
        [g.head, g.body, g.special].filter(Boolean).forEach(id => st.discard.push(id));
        log(st, `💀 A cabeça de ${name(g.special || g.head)} não aguentou (${total} de dano ≥ defesa ${piece.def}): a girafa de ${p.name} caiu e foi para o descarte.`);
      }
    } else {
      if (wound) st.wounds[piece.id] = (st.wounds[piece.id] || 0) + amount;
      else st.dmg[piece.id] = (st.dmg[piece.id] || 0) + amount;
      log(st, `🩹 ${name(piece.id)} de ${p.name} levou ${amount} de dano (${total} de ${piece.def}). Resiste por enquanto: falta ${piece.def - total} neste mesmo turno para quebrar.`);
    }
  }

  // ---------- Compras ----------
  function drawOne(st) {
    if (!st.deck.length) {
      if (!st.discard.length) return null;
      st.deck = shuffle(st, st.discard); st.discard = [];
      ev(st, { t: 'reshuffle' });
      log(st, '🔄 O monte acabou: o descarte foi embaralhado.');
    }
    return st.deck.pop();
  }
  function explode(st, pid, id) {
    const p = st.players[pid];
    log(st, `💣 CAMPO MINADO! ${p.name} comprou ${name(id)} e leva 3 de dano!`);
    ev(st, { t: 'bomb', pid, card: id });
    const g = biggest(p);
    // os 3 pontos se somam de cima para baixo: quebra pescoços até gastar o dano (3 de defesa 1, ou 1 de 2 + 1 de 1, ou 1 de 3...)
    let left = 3;
    while (g && left > 0 && p.giraffes.includes(g)) {
      const pc = topPiece(g);
      const need = pc.def - (st.dmg[pc.id] || 0) - ((st.wounds || {})[pc.id] || 0);
      const amt = Math.min(left, Math.max(1, need));
      hit(st, pid, g.id, amt);
      left -= amt;
      if (amt < need) break;
    }
    if (!g) log(st, `${p.name} não tinha girafas na mesa, então a bomba explodiu sem causar dano.`);
    st.discard.push(id);
  }

  // ---------- Objetivos ----------
  // ---------- Novo objetivo: olha os 2 do topo, fica com 1, o outro vai para baixo do monte ----------
  function objOptions(st) { return st.objDeck.slice(-2).reverse(); } // topo primeiro
  function takeObjective(st, p, idx) {
    const opts = objOptions(st); const pick = opts[idx];
    if (pick === undefined) return false;
    st.objDeck.splice(st.objDeck.lastIndexOf(pick), 1);
    const rest = opts.filter((_, i) => i !== idx);
    rest.forEach(o => { st.objDeck.splice(st.objDeck.lastIndexOf(o), 1); st.objDeck.unshift(o); });
    p.objectives.push(pick);
    if (p.idx === st.turn) st.objBought = true; // quem compra objetivo no turno não compra do monte
    ev(st, { t: 'objpick', pid: p.idx, obj: pick, under: rest.length });
    log(st, `🎯 ${p.name} escolheu um novo objetivo${rest.length ? ' e pôs o outro embaixo do monte de objetivos' : ''}.`);
    return true;
  }
  function offerObjective(st, p) {
    if (!st.objDeck.length) return;
    if (p.isBot) {
      // bot: prefere o que já cumpre, senão o de menos pontos (mais fácil)
      const gs = p.giraffes.map(giraffeView);
      const opts = objOptions(st);
      let best = 0;
      opts.forEach((o, i) => { const a = opts[best]; const okO = OBJ[o].check(gs, { maxHitsOnOne: 0 }), okA = OBJ[a].check(gs, { maxHitsOnOne: 0 }); if ((okO && !okA) || (okO === okA && OBJ[o].pts < OBJ[a].pts)) best = i; });
      takeObjective(st, p, best);
      return;
    }
    p.objOwed = (p.objOwed || 0) + 1;
    ev(st, { t: 'objoffer', pid: p.idx });
  }
  function chooseObjective(st, pid, idx) {
    const p = st.players[pid];
    if (!p || !(p.objOwed > 0)) return err('Não há objetivo para escolher.');
    if (!takeObjective(st, p, idx)) return err('Opção inválida.');
    p.objOwed--;
    checkObjectives(st, pid);
    return { ok: true };
  }
  function checkObjectives(st, pid) {
    const p = st.players[pid];
    const gs = p.giraffes.map(giraffeView);
    const stats = { maxHitsOnOne: Math.max(0, ...Object.values(st.turnHits)) };
    let changed = true;
    while (changed && !st.winner) {
      changed = false;
      for (const o of p.objectives.slice()) {
        if (OBJ[o].check(gs, pid === st.turn ? stats : { maxHitsOnOne: 0 })) {
          p.objectives = p.objectives.filter(x => x !== o);
          p.done.push(o);
          log(st, `🏆 ${p.name} completou "${OBJ[o].name}" (+${OBJ[o].pts})!`);
          ev(st, { t: 'objective', pid, obj: o });
          changed = true;
          if (score(p) >= 5 || p.done.length >= 3) {
            st.winner = pid;
            log(st, `👑 ${p.name} VENCEU a partida!`);
            ev(st, { t: 'win', pid });
            return;
          }
          offerObjective(st, p);
        }
      }
    }
  }

  // ---------- Validação de jogadas ----------
  function err(m) { return { ok: false, error: m }; }
  function validate(st, pid, cid, params = {}) {
    if (st.winner !== null) return err('A partida acabou.');
    if (st.pending) return err('Aguardando uma resposta.');
    if (pid !== st.turn) return err('Não é a sua vez.');
    const p = st.players[pid];
    if (!p.hand.includes(cid)) return err('Carta não está na mão.');
    const c = card(cid);
    const k = c.kind;
    if (st.mustEndTurn) return err('Seu turno acabou.');
    if (REACTION.has(k)) return err('Essa carta é de reação: use quando alguém jogar algo.');
    if (k === 'bomb') return err('Bomba não se joga.');
    const SWAPPED = 'Neste turno você já trocou um coringa: não dá mais para baixar girafas nem pescoços.';
    if ((k === 'head' || k === 'body') && params.swap) {
      // trocar o coringa pela carta certa: o coringa volta para a mão
      if (!canBuild(st)) return err('A troca do coringa só pode ser feita antes de atacar.');
      if (st.swapped) return err(SWAPPED);
      if (st.built >= 1 || st.neckPlayed >= 1) return err('Neste turno você já baixou girafa ou pescoço: a troca do coringa fica para o próximo turno.');
      if (st.played > 0) return err('A troca do coringa precisa ser a primeira jogada do turno.');
      if (c.wild) return err('Use a carta certa (não coringa) para trocar.');
      const g = p.giraffes.find(x => x.id === params.swap);
      if (!g || g.special) return err('Escolha uma girafa sua.');
      const slot = k, other = k === 'head' ? g.body : g.head;
      if (!card(g[slot]).wild) return err(`Essa girafa não tem ${k === 'head' ? 'cabeça' : 'corpo'} coringa.`);
      if (!card(other).wild && card(other).match !== c.match) return err('Essa carta não é da mesma girafa.');
      return { ok: true };
    }
    if ((k === 'head' || k === 'body' || k === 'special' || k === 'neck') && st.swapped) return err(SWAPPED);
    if (k === 'head' || k === 'body') {
      if (!canBuild(st)) return err('Girafas só podem ser baixadas antes de atacar.');
      if (st.built >= 1) return err('Você já baixou 1 girafa neste turno. O limite é 1 por turno.');
      if (st.neckPlayed >= 1) return err('Neste turno você já encaixou um pescoço. Girafa e pescoço não podem ser baixados no mesmo turno.');
      const other = params.pair;
      if (!other || !p.hand.includes(other)) return err('Falta o par desta girafa.');
      const oc = card(other);
      if (!C.pairs(c, oc)) return err('Cabeça e corpo precisam ser da mesma girafa (ou um deles ser coringa).');
      return { ok: true };
    }
    if (k === 'special') return !canBuild(st) ? err('Girafas só podem ser baixadas antes de atacar.') : st.built >= 1 ? err('Você já baixou 1 girafa neste turno. O limite é 1 por turno.') : st.neckPlayed >= 1 ? err('Neste turno você já encaixou um pescoço. Girafa e pescoço não podem ser baixados no mesmo turno.') : { ok: true };
    if (k === 'neck') {
      if (!canBuild(st)) return err('Pescoços só podem ser encaixados antes de atacar.');
      if (st.neckPlayed >= 1) return err('Você já encaixou 1 pescoço neste turno. O limite é 1 por turno.');
      if (st.built >= 1) return err('Neste turno você baixou uma girafa. O pescoço só pode ser encaixado no próximo turno.');
      const g = p.giraffes.find(x => x.id === params.gid);
      if (!g) return err('Escolha uma girafa sua.');
      if (g.special) return err('Girafas inteiras (especiais) não recebem pescoço.');
      if (g.necks.length >= MAX_NECKS) return err('Essa girafa já tem 5 pescoços.');
      return { ok: true };
    }
    if (TARGETED.has(k)) {
      const t = params.target;
      if (t === undefined || !st.players[t]) return err('Escolha um alvo.');
      if (k === 'sleep') { if (t !== pid && st.players[t].sleep > 0) return err('Esse jogador já está dormindo.'); }
      else if (!targetable(st, t, pid)) return err('Esse jogador não pode ser alvo agora.');
      const tp = st.players[t];
      if ((k === 'attack' || k === 'poison') && !p.giraffes.length) return err('Você precisa ter pelo menos uma girafa na mesa para atacar.');
      if ((k === 'attack' || k === 'poison') && !tp.giraffes.length) return err('Só dá para atacar quem tem girafa na mesa.');
      if (k === 'attack') {
        const g = tp.giraffes.find(g => g.id === params.gid);
        if (!g) return err('Escolha uma girafa do alvo.');
        if (!validPiece(g, params.piece)) return err('Escolha um pescoço dessa girafa (a cabeça só pode ser atacada quando não há pescoços).');
      }
      if (k === 'poison' && params.gid) {
        const g = tp.giraffes.find(g => g.id === params.gid);
        if (!g) return err('Escolha uma girafa do alvo.');
        if (!validPiece(g, params.piece)) return err('Escolha um pescoço dessa girafa (a cabeça só quando não há pescoços).');
      }
      if (k === 'steal') {
        const g = tp.giraffes.find(g => g.id === params.gid);
        if (!g || !g.necks.length) return err('Escolha uma girafa do alvo que tenha pescoço.');
        if (params.piece && !g.necks.includes(params.piece)) return err('Escolha um pescoço dessa girafa.');
        if (params.toGid) { const d = p.giraffes.find(x => x.id === params.toGid); if (!d || d.special || d.necks.length >= MAX_NECKS) return err('Essa girafa sua não pode receber o pescoço.'); }
      }
      if ((k === 'sneaky' || k === 'discard') && !tp.hand.length) return err('Esse jogador está sem cartas.');
      if (k === 'exchange') {
        if (!tp.hand.length) return err('Esse jogador está sem cartas.');
        if (!params.give || params.give === cid || !p.hand.includes(params.give)) return err('Escolha a carta que vai entregar.');
      }
      return { ok: true };
    }
    if (k === 'portal') {
      // uma carta qualquer do descarte, ou uma girafa completa (cabeça + corpo que combinam)
      if (Array.isArray(params.pair)) {
        const [h, b] = params.pair;
        if (!st.discard.includes(h) || !st.discard.includes(b) || h === b || !C.pairs(card(h), card(b))) return err('Escolha uma cabeça e um corpo do descarte que formem uma girafa.');
        return { ok: true };
      }
      if (!st.discard.includes(params.pick)) return err('Escolha uma carta do descarte.');
      return { ok: true };
    }
    if (k === 'destiny') { if (st.deck.length + st.discard.length < 1) return err('Não há cartas no monte.'); return { ok: true }; }
    if (k === 'medicine') { if (!p.poisons.length) return err('Você não está envenenado.'); return { ok: true }; }
    return { ok: true };
  }

  // ---------- Jogar carta ----------
  function play(st, pid, cid, params = {}) {
    const v = validate(st, pid, cid, params);
    if (!v.ok) return v;
    const p = st.players[pid];
    const c = card(cid);
    const k = c.kind;
    const take = id => { p.hand.splice(p.hand.indexOf(id), 1); };
    st.played = (st.played || 0) + 1;
    if ((k === 'head' || k === 'body') && params.swap) {
      const g = p.giraffes.find(x => x.id === params.swap);
      const back = g[k];
      take(cid); g[k] = cid; p.hand.push(back);
      // o que estava na peça (dano, veneno) passa para a carta nova
      ['dmg', 'wounds'].forEach(key => { if (st[key] && st[key][back]) { st[key][cid] = st[key][back]; delete st[key][back]; } });
      p.poisons.forEach(po => { if (po.piece === back) po.piece = cid; });
      st.swapped = true;
      ev(st, { t: 'wildswap', pid, gid: g.id, card: cid, back, slot: k });
      log(st, `🃏 ${p.name} trocou o coringa ${card(back).name} pela carta certa ${c.name}; o coringa voltou para a mão.`);
      checkObjectives(st, pid);
      return { ok: true };
    }
    if (k === 'head' || k === 'body') {
      take(cid); take(params.pair);
      const head = k === 'head' ? cid : params.pair, body = k === 'body' ? cid : params.pair;
      p.giraffes.push({ id: 'g' + st.gidSeq++, head, body, necks: [], born: st.turnNo });
      ev(st, { t: 'build', pid, gid: p.giraffes[p.giraffes.length - 1].id, cards: [head, body] });
      log(st, `🦒 ${p.name} baixou ${card(head).name}!`);
      st.built++;
      checkObjectives(st, pid);
      return { ok: true };
    }
    if (k === 'special') {
      take(cid);
      p.giraffes.push({ id: 'g' + st.gidSeq++, special: cid, necks: [], born: st.turnNo });
      st.built++;
      ev(st, { t: 'build', pid, gid: p.giraffes[p.giraffes.length - 1].id, cards: [cid] });
      log(st, `✨ ${p.name} baixou a girafa especial ${c.name}!`);
      checkObjectives(st, pid);
      return { ok: true };
    }
    if (k === 'neck') {
      take(cid);
      const g = p.giraffes.find(x => x.id === params.gid);
      g.necks.push(cid);
      st.neckPlayed++;
      ev(st, { t: 'neck', pid, gid: g.id, card: cid });
      log(st, `➕ ${p.name} encaixou ${c.name} (${COLOR_PT[c.color]}) em ${name(g.special || g.head)} — nível ${g.necks.length}.`);
      checkObjectives(st, pid);
      return { ok: true };
    }
    // ações/ataques: passam pela janela de reação
    take(cid);
    if (k === 'attack' || k === 'poison') { st.attacked = true; st.turnHits[params.target] = (st.turnHits[params.target] || 0) + 1; }
    const target = TARGETED.has(k) ? params.target : null;
    log(st, `🃏 ${p.name} jogou ${c.name}${target !== null && target !== undefined ? ' em ' + st.players[target].name : ''}.`);
    ev(st, { t: 'play', pid, card: cid, target, gid: params.gid || null, piece: params.piece || null });
    st.pending = { type: 'react', stack: [{ pid, card: cid, params, target }], asked: [] };
    advanceReact(st);
    return { ok: true };
  }

  // ---------- Janela de reação ----------
  function eligibleReactions(st, pid) {
    const pd = st.pending;
    if (!pd || pd.type !== 'react') return [];
    const top = pd.stack[pd.stack.length - 1];
    if (top.pid === pid) return [];
    const p = st.players[pid];
    return p.hand.filter(id => {
      const k = card(id).kind;
      if (k === 'interrupt' || k === 'super') return true;
      if (k === 'defense') return pd.stack.length === 1 && top.target === pid;
      return false;
    });
  }
  function responderOrder(st) {
    const pd = st.pending; const top = pd.stack[pd.stack.length - 1];
    const n = st.players.length; const order = [];
    // quem foi afetado responde primeiro: o alvo da ação original ou o autor da carta cancelada
    const first = pd.stack.length === 1 ? (top.target ?? null) : pd.stack[pd.stack.length - 2].pid;
    if (first !== null && first !== undefined) order.push(first);
    for (let i = 1; i <= n; i++) { const q = (top.pid + i) % n; if (!order.includes(q)) order.push(q); }
    return order.filter(q => q !== top.pid);
  }
  function advanceReact(st) {
    const pd = st.pending;
    while (true) {
      const next = responderOrder(st).find(q => !pd.asked.includes(q) && eligibleReactions(st, q).length);
      if (next === undefined) return resolveStack(st);
      pd.awaiting = next;
      return;
    }
  }
  function respond(st, pid, cid) {
    const pd = st.pending;
    if (!pd || pd.type !== 'react' || pd.awaiting !== pid) return err('Não há reação pendente para você.');
    if (cid == null) { pd.asked.push(pid); pd.awaiting = null; advanceReact(st); return { ok: true }; }
    if (!eligibleReactions(st, pid).includes(cid)) return err('Essa carta não pode ser usada agora.');
    const p = st.players[pid];
    p.hand.splice(p.hand.indexOf(cid), 1);
    const c = card(cid);
    log(st, `🛡️ ${p.name} reagiu com ${c.name} (${C.KIND_LABEL[c.kind]})!`);
    pd.stack.push({ pid, card: cid });
    ev(st, { t: 'react', pid, card: cid, against: pd.stack[pd.stack.length - 2].pid });
    pd.awaiting = null;
    if (c.kind === 'super') return resolveStack(st);
    pd.asked = [pid];
    advanceReact(st);
    return { ok: true };
  }
  function resolveStack(st) {
    const pd = st.pending; const s = pd.stack;
    const active = s.map(() => true);
    for (let i = s.length - 1; i >= 1; i--) {
      if (!active[i]) continue;
      if (card(s[i].card).kind === 'super') { for (let j = 0; j < i; j++) active[j] = false; break; }
      active[i - 1] = false;
    }
    st.pending = null;
    s.forEach(e => st.discard.push(e.card));
    const e0 = s[0];
    if (active[0]) { effect(st, e0.pid, e0.card, e0.params); }
    else if (s.length > 1 && active[1] && card(s[1].card).kind === 'defense') {
      log(st, `↩️ ${name(e0.card)} voltou contra ${st.players[e0.pid].name}!`);
      ev(st, { t: 'reflect', pid: e0.pid, by: s[1].pid, card: e0.card });
      reflect(st, e0, s[1].pid);
    } else {
      log(st, `🚫 ${name(e0.card)} foi cancelada.`);
      ev(st, { t: 'cancel', pid: e0.pid, card: e0.card });
    }
    // girafa poderia ter caído; objetivos do jogador da vez
    if (!st.pending) checkObjectives(st, st.turn);
    if (st.mustEndTurnNow) { st.mustEndTurnNow = false; if (!st.winner) endTurn(st); }
  }
  // peças do atacante que a defesa pode acertar de volta
  function reflectOptions(st, cid, attackerPid) {
    const k = card(cid).kind, a = st.players[attackerPid], out = [];
    a.giraffes.forEach(g => {
      if (k === 'steal') g.necks.forEach(n => out.push({ gid: g.id, piece: n }));
      else if (k === 'attack' || k === 'poison') (g.necks.length ? g.necks : [g.special || g.head]).forEach(n => out.push({ gid: g.id, piece: n }));
    });
    return out;
  }
  function reflect(st, e0, defender) {
    const k = card(e0.card).kind;
    const attacker = st.players[e0.pid];
    if (k === 'exchange') return log(st, 'A troca foi desfeita.');
    const params = { target: e0.pid };
    if (k === 'attack' || k === 'poison' || k === 'steal') {
      const opts = reflectOptions(st, e0.card, e0.pid);
      if (!opts.length) return log(st, k === 'steal' ? 'Não havia pescoço para devolver.' : `${attacker.name} não tem girafas — nada acontece.`);
      // quem se defendeu escolhe onde o revide acerta
      if (opts.length > 1) { st.pending = { type: 'reflect', pid: defender, card: e0.card, target: e0.pid }; return; }
      Object.assign(params, opts[0]);
    } else Object.assign(params, e0.params, { target: e0.pid });
    effect(st, defender, e0.card, params, true);
  }
  function chooseReflect(st, pid, gid, piece) {
    const pd = st.pending;
    if (!pd || pd.type !== 'reflect' || pd.pid !== pid) return err('Nada para escolher.');
    const ok = reflectOptions(st, pd.card, pd.target).some(o => o.gid === gid && o.piece === piece);
    if (!ok) return err('Escolha uma peça do adversário.');
    st.pending = null;
    effect(st, pid, pd.card, { target: pd.target, gid, piece }, true);
    if (!st.pending) checkObjectives(st, st.turn);
    if (st.mustEndTurnNow && !st.pending) { st.mustEndTurnNow = false; if (st.winner === null) endTurn(st); }
    return { ok: true };
  }

  // ---------- Efeitos ----------
  function effect(st, pid, cid, params, reflected) {
    const p = st.players[pid]; const c = card(cid); const k = c.kind;
    const t = params.target !== undefined && params.target !== null ? st.players[params.target] : null;
    switch (k) {
      case 'attack': {
        const g = t.giraffes.find(x => x.id === params.gid) || biggest(t);
        if (g) hit(st, t.idx, g.id, c.dmg, false, g.id === params.gid ? params.piece : null); break;
      }
      case 'poison': {
        { const di = st.discard.lastIndexOf(cid); if (di >= 0) st.discard.splice(di, 1); } // a carta fica em jogo
        const pg = t.giraffes.find(x => x.id === params.gid) || biggest(t);
        if (!pg) { st.discard.push(cid); log(st, `${t.name} não tem girafas: o veneno não pegou.`); break; }
        const pc = pieceOf(pg, pg.id === params.gid ? params.piece : null).id;
        t.poisons.push({ card: cid, left: 3, from: pid, gid: pg.id, piece: pc });
        log(st, `☠️ ${name(cid)} ficou em cima de ${name(pc)} (${name(pg.special || pg.head)}) de ${t.name}: perde 1 ponto por turno, por 3 turnos.`); ev(st, { t: 'poisoned', pid: t.idx, card: cid, gid: pg.id, piece: pc }); break;
      }
      case 'medicine': {
        p.poisons.forEach(po => st.discard.push(po.card)); p.poisons = [];
        log(st, `💊 ${p.name} se curou do veneno.`); ev(st, { t: 'cure', pid }); break;
      }
      case 'discard': {
        if (!t.hand.length) break;
        const i = Math.floor(rand(st) * t.hand.length); const id = t.hand.splice(i, 1)[0];
        st.discard.push(id); log(st, `🗑️ ${t.name} descartou ${name(id)}.`); ev(st, { t: 'discard', pid: t.idx, card: id }); break;
      }
      case 'sneaky': {
        if (!t.hand.length) break;
        const i = Math.floor(rand(st) * t.hand.length); const id = t.hand.splice(i, 1)[0];
        p.hand.push(id); log(st, `🫳 ${p.name} pegou uma carta da mão de ${t.name}.`); ev(st, { t: 'take', from: t.idx, to: pid, card: id }); break;
      }
      case 'exchange': {
        if (!t.hand.length || !p.hand.includes(params.give)) break;
        const i = Math.floor(rand(st) * t.hand.length); const got = t.hand.splice(i, 1)[0];
        p.hand.splice(p.hand.indexOf(params.give), 1); t.hand.push(params.give); p.hand.push(got);
        log(st, `🔁 ${p.name} trocou uma carta com ${t.name}.`); ev(st, { t: 'swap', a: pid, b: t.idx, gave: params.give, got }); break;
      }
      case 'steal': {
        const g = t.giraffes.find(x => x.id === params.gid && x.necks.length) || t.giraffes.find(x => x.necks.length);
        if (!g) { log(st, 'Não havia pescoço para roubar.'); break; }
        const nk = (g.id === params.gid && params.piece && g.necks.includes(params.piece)) ? params.piece : g.necks[g.necks.length - 1];
        g.necks.splice(g.necks.indexOf(nk), 1); delete st.dmg[nk]; if (st.wounds) delete st.wounds[nk]; dropPoisons(st, t, po => po.piece === nk);
        const fromGid = g.id;
        const dests = stealDests(p);
        const chosen = dests.find(x => x.id === params.toGid);
        // quem rouba escolhe onde encaixar; se a escolha ainda não foi feita (ex.: roubo devolvido) e há mais de uma opção, pergunta
        if (!chosen && dests.length > 1) {
          st.pending = { type: 'stealdest', pid, card: nk, from: t.idx, fromGid };
          log(st, `🪝 ${p.name} roubou ${name(nk)} de ${t.name} e está escolhendo onde encaixar.`);
          break;
        }
        placeStolen(st, pid, nk, t.idx, fromGid, chosen || dests[0] || null);
        break;
      }
      case 'sleep': {
        t.sleep += c.turns; log(st, `😴 ${t.name} vai dormir por ${c.turns} turno${c.turns > 1 ? 's' : ''}.`); ev(st, { t: 'sleep', pid: t.idx, turns: c.turns }); break;
      }
      case 'timetravel': st.extraTurns++; log(st, `⏳ ${p.name} ganhou um turno extra!`); ev(st, { t: 'timetravel', pid }); break;
      case 'mixup': {
        // embaralha o monte escolhido: compra, corpos (a vitrine volta para o monte e é trocada) ou objetivos
        const pile = ['deck', 'bodies', 'objectives'].includes(params.pile) ? params.pile : 'deck';
        if (pile === 'bodies') {
          const n = st.market.length;
          st.market.forEach(b => { if (b) st.bodyDeck.push(b); });
          shuffle(st, st.bodyDeck);
          st.market = Array.from({ length: n }, () => st.bodyDeck.pop() || null);
          log(st, '🌀 O monte de corpos foi embaralhado e a vitrine foi trocada!');
        } else if (pile === 'objectives') { shuffle(st, st.objDeck); log(st, '🌀 O monte de objetivos foi embaralhado!'); }
        else { shuffle(st, st.deck); log(st, '🌀 O monte de compra foi embaralhado!'); }
        ev(st, { t: 'shuffle', pid, pile }); break;
      }
      case 'portal': {
        // Portal substitui a compra: depois dele o turno termina.
        // Escolheu cabeça ou corpo? Leva o combo (a parte que completa a girafa, se estiver no descarte).
        const want = Array.isArray(params.pair) ? params.pair : portalTake(st, params.pick);
        if (!want.every(id => st.discard.includes(id))) { log(st, 'As cartas escolhidas não estão mais no descarte.'); st.mustEndTurnNow = true; break; }
        want.forEach(id => { st.discard.splice(st.discard.indexOf(id), 1); p.hand.push(id); });
        ev(st, { t: 'portal', pid, card: want[0], cards: want });
        log(st, want.length > 1 ? `🌌 ${p.name} pegou a girafa completa ${name(want[0])} (cabeça e corpo) do descarte e encerrou o turno.` : `🌌 ${p.name} pegou ${name(want[0])} do descarte e encerrou o turno.`);
        st.mustEndTurnNow = true; break;
      }
      case 'destiny': {
        const a = drawOne(st); const b = drawOne(st);
        const opts = [a, b].filter(Boolean);
        // Destiny substitui a compra: depois dele o turno termina
        if (!opts.length) { log(st, `🔮 ${p.name} não tinha futuro para ver: o monte está vazio. O turno acabou.`); st.mustEndTurnNow = true; break; }
        if (opts.every(id => card(id).kind === 'bomb')) {
          opts.reverse().forEach(r => st.deck.push(r));
          log(st, `🔮 ${p.name} viu o futuro: só bombas à vista! Elas voltaram para o topo do monte e o turno acabou.`);
          st.mustEndTurnNow = true;
          break;
        }
        ev(st, { t: 'destiny', pid });
        st.pending = { type: 'destiny', pid, options: opts };
        break;
      }
    }
  }
  // girafas que podem receber um pescoço roubado
  function stealDests(p) { return p.giraffes.filter(x => !x.special && x.necks.length < MAX_NECKS); }
  function placeStolen(st, pid, nk, from, fromGid, dest) {
    const p = st.players[pid], t = st.players[from];
    ev(st, { t: 'steal', from, fromGid, to: pid, toGid: dest ? dest.id : null, card: nk });
    if (dest) { dest.necks.push(nk); log(st, `🪝 ${p.name} roubou ${name(nk)} de ${t.name} e encaixou em ${name(dest.special || dest.head)}.`); }
    else { p.hand.push(nk); log(st, `🪝 ${p.name} roubou ${name(nk)} de ${t.name} (sem girafa para receber, foi para a mão).`); }
  }
  function chooseStealDest(st, pid, gid) {
    const pd = st.pending;
    if (!pd || pd.type !== 'stealdest' || pd.pid !== pid) return err('Nada para escolher.');
    const dests = stealDests(st.players[pid]);
    const dest = dests.find(x => x.id === gid);
    if (!dest && dests.length) return err('Escolha uma girafa sua que possa receber o pescoço.');
    st.pending = null;
    placeStolen(st, pid, pd.card, pd.from, pd.fromGid, dest || null);
    checkObjectives(st, st.turn);
    if (st.mustEndTurnNow && !st.pending) { st.mustEndTurnNow = false; if (st.winner === null) endTurn(st); }
    return { ok: true };
  }
  function chooseDestiny(st, pid, idx) {
    const pd = st.pending;
    if (!pd || pd.type !== 'destiny' || pd.pid !== pid) return err('Nada para escolher.');
    const opts = pd.options;
    const pick = opts[idx];
    if (pick === undefined) return err('Opção inválida.');
    if (card(pick).kind === 'bomb') return err('Você não quer essa! Escolha a outra.');
    const rest = opts.filter((_, i) => i !== idx);
    st.players[pid].hand.push(pick);
    rest.forEach(r => st.deck.push(r)); // volta para o topo
    st.pending = null;
    log(st, `🔮 ${st.players[pid].name} viu o futuro, escolheu uma carta e encerrou o turno.`);
    ev(st, { t: 'destinypick', pid, card: pick });
    checkObjectives(st, st.turn);
    // Destiny substitui a compra: a jogada termina aqui
    if (st.winner === null && !st.pending) endTurn(st);
    return { ok: true };
  }

  // ---------- Compra final do turno ----------
  function draw(st, pid, source) {
    if (st.winner !== null) return err('A partida acabou.');
    if (st.pending) return err('Aguardando uma resposta.');
    if (pid !== st.turn) return err('Não é a sua vez.');
    const p = st.players[pid];
    if (source === 'pass') {
      if (!st.objBought) return err('Compre uma carta para encerrar o turno.');
      log(st, `${p.name} pegou um objetivo neste turno e encerrou sem comprar do monte.`);
      ev(st, { t: 'pass', pid });
      endTurn(st); return { ok: true };
    }
    if (source === 'deck' && st.objBought) return err('Neste turno você pegou um objetivo: não pode comprar do monte. Pegue um corpo da vitrine ou encerre o turno.');
    if (source === 'deck') {
      const id = drawOne(st);
      if (id === null) log(st, 'Não há cartas para comprar.');
      else if (card(id).kind === 'bomb') explode(st, pid, id);
      else { p.hand.push(id); log(st, `${p.name} comprou do monte.`); ev(st, { t: 'draw', pid, src: 'deck', card: id }); }
    } else {
      const i = Number(source);
      const id = st.market[i];
      if (!id) return err('Não há corpo nessa posição.');
      if (!canTakeBody(st, pid, id)) return err('Você só pode pegar o corpo de uma girafa cuja cabeça está na sua mão.');
      p.hand.push(id);
      st.market[i] = st.bodyDeck.pop() || null;
      ev(st, { t: 'draw', pid, src: 'market', idx: i, card: id });
      log(st, `${p.name} pegou o corpo ${card(id).name} da vitrine.`);
    }
    if (st.winner !== null) return { ok: true };
    endTurn(st);
    return { ok: true };
  }
  function discardExcess(st, pid, ids) {
    const pd = st.pending;
    if (!pd || pd.type !== 'handlimit' || pd.pid !== pid) return err('Nada para descartar.');
    const p = st.players[pid];
    if (!Array.isArray(ids) || ids.length !== pd.n || new Set(ids).size !== ids.length || !ids.every(id => p.hand.includes(id))) return err(`Escolha ${pd.n} carta(s).`);
    ids.forEach(id => { p.hand.splice(p.hand.indexOf(id), 1); st.discard.push(id); });
    log(st, `${p.name} descartou ${ids.length} carta(s) (limite de mão).`);
    ev(st, { t: 'handdiscard', pid, cards: ids });
    st.pending = null;
    endTurn(st);
    return { ok: true };
  }

  function portalPartner(st, id) {
    const c = card(id); if (!c || (c.kind !== 'head' && c.kind !== 'body')) return null;
    const other = c.kind === 'head' ? 'body' : 'head';
    const opts = st.discard.filter(x => x !== id && card(x).kind === other && C.pairs(c, card(x)));
    return opts.find(x => card(x).match === c.match) || opts[0] || null;
  }
  function portalTake(st, id) { const pr = portalPartner(st, id); if (!pr) return [id]; return card(id).kind === 'head' ? [id, pr] : [pr, id]; }
  function discardPairs(st) {
    const heads = st.discard.filter(id => card(id).kind === 'head'), bodies = st.discard.filter(id => card(id).kind === 'body');
    const out = [];
    heads.forEach(h => bodies.forEach(b => { if (C.pairs(card(h), card(b))) out.push([h, b]); }));
    // mesma girafa primeiro, depois as combinações com coringa
    return out.sort((x, y) => (card(y[0]).match === card(y[1]).match) - (card(x[0]).match === card(x[1]).match));
  }
  function canAttack(st, pid) { return st.players[pid].giraffes.length > 0; }
  // qualquer corpo da vitrine pode ser comprado, mesmo sem a cabeça na mão
  function canTakeBody(st, pid, bodyId) { return !!bodyId; }
  function hasHeadFor(st, pid, bodyId) { const b = card(bodyId); return st.players[pid].hand.some(h => card(h).kind === 'head' && C.pairs(card(h), b)); }

  // quem precisa agir agora
  function whoActs(st) {
    if (st.winner !== null) return null;
    const pd = st.pending;
    if (!pd) return st.turn;
    if (pd.type === 'react') return pd.awaiting;
    return pd.pid;
  }

  const API = {
    CARDS, OBJ, HAND_LIMIT, MAX_NECKS, COLOR_PT, pieceOf, discardPairs, portalPartner, objOptions, chooseObjective, newGame, validate, play, respond, chooseDestiny, chooseStealDest, stealDests, chooseReflect, reflectOptions, hasHeadFor, draw,
    discardExcess, canTakeBody, canAttack, eligibleReactions, whoActs, topPiece, score, canBuild, targetable, biggest, rand,
  };
  root.GD_ENGINE = API;
  if (typeof module !== 'undefined') module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
