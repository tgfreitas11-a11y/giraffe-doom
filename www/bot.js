// Giraffe Doom — bots
(function (root) {
  const E = root.GD_ENGINE || require('./engine.js');
  const K = id => E.CARDS[id].kind;
  const R = st => E.rand(st);
  const PAIRS = (root.GD_CARDS || require('./cards.js')).pairs;

  function leaderOrder(st, pid) {
    return st.players.filter(q => q.idx !== pid && q.sleep === 0)
      .sort((a, b) => (E.score(b) * 10 + b.done.length * 6 + b.giraffes.reduce((s, g) => s + 1 + g.necks.length, 0))
        - (E.score(a) * 10 + a.done.length * 6 + a.giraffes.reduce((s, g) => s + 1 + g.necks.length, 0)));
  }

  function cardValue(st, p, id) {
    const c = E.CARDS[id];
    switch (c.kind) {
      case 'head': return p.hand.some(h => PAIRS(c, E.CARDS[h])) ? 10 : 6;
      case 'body': return p.hand.some(h => PAIRS(c, E.CARDS[h])) ? 10 : 2;
      case 'special': return 9;
      case 'neck': return p.giraffes.length ? 5 + c.def : 3 + c.def;
      case 'defense': case 'super': return 8;
      case 'interrupt': return 7;
      case 'attack': return 4 + c.dmg;
      case 'timetravel': return 7;
      case 'medicine': return p.poisons.length ? 9 : 2;
      default: return 4;
    }
  }

  // ---- reação ----
  function react(st, pid) {
    const pd = st.pending; const opts = E.eligibleReactions(st, pid);
    const top = pd.stack[pd.stack.length - 1];
    const pick = kinds => opts.find(id => kinds.includes(K(id)));
    let want = 0;
    if (pd.stack.length === 1 && top.target === pid) {
      const k = K(top.card); const me = st.players[pid];
      if (k === 'attack') {
        const g = me.giraffes.find(x => x.id === top.params.gid);
        if (g) { const tp = E.pieceOf(g, top.params.piece); const kill = (st.dmg[tp.id] || 0) + E.CARDS[top.card].dmg >= tp.def; want = kill ? (tp.kind === 'head' ? 0.95 : 0.75) : 0.25; }
      } else if (k === 'steal' || k === 'poison') want = 0.8;
      else if (k === 'sleep') want = E.CARDS[top.card].turns > 1 ? 0.8 : 0.5;
      else want = 0.4;
      if (R(st) < want) {
        const c = pick(['defense']) || pick(['interrupt']) || (want > 0.9 ? pick(['super']) : null);
        if (c) return E.respond(st, pid, c);
      }
    } else if (pd.stack.length > 1 && pd.stack[pd.stack.length - 2].pid === pid) {
      // alguém cancelou a minha jogada
      if (R(st) < 0.6) { const c = pick(['interrupt']) || (R(st) < 0.4 ? pick(['super']) : null); if (c) return E.respond(st, pid, c); }
    } else if (pd.stack.length === 1) {
      const lead = leaderOrder(st, -1)[0];
      if (lead && lead.idx === top.pid && lead.idx !== pid && R(st) < 0.12) { const c = pick(['interrupt']); if (c) return E.respond(st, pid, c); }
    }
    return E.respond(st, pid, null);
  }

  // ---- melhor pescoço/girafa ----
  function neckPlan(st, p) {
    const necks = p.hand.filter(id => K(id) === 'neck');
    if (!necks.length || !p.giraffes.length) return null;
    let best = null;
    for (const n of necks) for (const g of p.giraffes) {
      if (g.special || g.necks.length >= E.MAX_NECKS) continue;
      const gs = p.giraffes.map(x => ({ necks: x.necks.map(id => E.CARDS[id].color).concat(x === g ? [E.CARDS[n].color] : []) }));
      let sc = g.necks.length * 2 + E.CARDS[n].def;
      for (const o of p.objectives) if (E.OBJ[o].check(gs, { maxHitsOnOne: 0 })) sc += 100 + E.OBJ[o].pts;
      if (!best || sc > best.sc) best = { sc, n, g };
    }
    return best;
  }

  // ---- um passo do bot ----
  function step(st, pid) {
    const pd = st.pending;
    const p = st.players[pid];
    if (pd && pd.type === 'react') return react(st, pid);
    if (pd && pd.type === 'destiny') {
      const sc = pd.options.map(id => K(id) === 'bomb' ? -99 : cardValue(st, p, id));
      return E.chooseDestiny(st, pid, sc.indexOf(Math.max(...sc)));
    }
    if (pd && pd.type === 'handlimit') {
      const ids = p.hand.slice().sort((a, b) => cardValue(st, p, a) - cardValue(st, p, b)).slice(0, pd.n);
      return E.discardExcess(st, pid, ids);
    }
    const H = () => p.hand.slice();
    const tryPlay = (id, params) => E.play(st, pid, id, params).ok;

    if (E.canBuild(st)) {
      // girafa ou pescoço (não os dois): pescoço que fecha objetivo vem primeiro;
      // com 2+ girafas na mesa, alterna e às vezes prefere crescer o pescoço
      const plan0 = neckPlan(st, p);
      if (plan0 && !st.built && (plan0.sc >= 100 || (p.giraffes.filter(g => !g.special).length >= 2 && R(st) < 0.6)) && tryPlay(plan0.n, { gid: plan0.g.id })) return true;
      for (const h of H().filter(id => K(id) === 'head')) {
        // prefere o corpo da própria girafa e guarda o coringa para depois
        const opts = p.hand.filter(id => K(id) === 'body' && PAIRS(E.CARDS[id], E.CARDS[h]));
        const b = opts.find(id => E.CARDS[id].match === E.CARDS[h].match) || opts[0];
        if (b && tryPlay(h, { pair: b })) return true;
      }
      const sp = p.hand.find(id => K(id) === 'special');
      if (sp && tryPlay(sp, {})) return true;
      // troca o coringa pela carta certa (o coringa volta para a mão)
      for (const g of p.giraffes) for (const id of H().filter(x => (K(x) === 'head' || K(x) === 'body') && !E.CARDS[x].wild)) {
        if (tryPlay(id, { swap: g.id })) return true;
      }
      const plan = neckPlan(st, p);
      if (plan && tryPlay(plan.n, { gid: plan.g.id })) return true;
    }
    const med = p.hand.find(id => K(id) === 'medicine');
    if (med && p.poisons.length && tryPlay(med, {})) return true;
    const tt = p.hand.find(id => K(id) === 'timetravel');
    if (tt && tryPlay(tt, {})) return true;

    const foes = leaderOrder(st, pid);
    // roubar pescoço
    const steal = p.hand.find(id => K(id) === 'steal');
    if (steal && p.giraffes.length) {
      for (const f of foes) {
        const g = f.giraffes.filter(x => x.necks.length).sort((a, b) => b.necks.length - a.necks.length)[0];
        if (g) { const dest = p.giraffes.filter(x => !x.special && x.necks.length < E.MAX_NECKS).sort((a, b) => b.necks.length - a.necks.length)[0]; const nk = g.necks.slice().sort((a, b) => E.CARDS[b].def - E.CARDS[a].def)[0]; if (tryPlay(steal, { target: f.idx, gid: g.id, piece: nk, toGid: dest && dest.id })) return true; }
      }
    }
    // ataques
    const atks = p.hand.filter(id => K(id) === 'attack').sort((a, b) => E.CARDS[b].dmg - E.CARDS[a].dmg);
    if (atks.length && p.giraffes.length) {
      const total = atks.reduce((s, id) => s + E.CARDS[id].dmg, 0);
      for (const f of foes) {
        // escolhe a peça: cabeça exposta que dá para derrubar > pescoço mais forte que dá para quebrar
        let best = null;
        for (const x of f.giraffes) {
          const pieces = x.necks.length ? x.necks.map(n => E.pieceOf(x, n)) : [E.topPiece(x)];
          for (const pc of pieces) {
            const need = pc.def - (st.dmg[pc.id] || 0);
            if (need > total) continue;
            const sc = (pc.kind === 'head' ? 100 : 0) + pc.def * 10 + x.necks.length;
            if (!best || sc > best.sc) best = { sc, g: x, pc, need };
          }
        }
        if (best) {
          const a = atks.find(id => E.CARDS[id].dmg >= best.need) || atks[0];
          if (tryPlay(a, { target: f.idx, gid: best.g.id, piece: best.pc.id })) return true;
        }
      }
    }
    const lead = foes[0];
    const use = (kind, prob, params) => {
      const id = p.hand.find(x => K(x) === kind);
      if (id && R(st) < prob) return tryPlay(id, params);
      return false;
    };
    if (lead) {
      const ptgt = foes.find(f => f.giraffes.length);
      const pgB = ptgt && ptgt.giraffes.slice().sort((a, b) => b.necks.length - a.necks.length)[0];
      // veneno no pescoço mais forte (os pontos não voltam)
      const pcB = pgB && (pgB.necks.length ? pgB.necks.slice().sort((a, b) => E.CARDS[b].def - E.CARDS[a].def)[0] : (pgB.special || pgB.head));
      if (ptgt && p.giraffes.length && use('poison', 0.8, { target: ptgt.idx, gid: pgB.id, piece: pcB })) return true;
      if (lead.hand.length && use('sneaky', 0.8, { target: lead.idx })) return true;
      if (lead.hand.length && use('discard', 0.6, { target: lead.idx })) return true;
      const sl = p.hand.find(x => K(x) === 'sleep');
      if (sl && (E.score(lead) >= 2 || R(st) < 0.35) && tryPlay(sl, { target: lead.idx })) return true;
      const ex = p.hand.find(x => K(x) === 'exchange');
      if (ex && lead.hand.length && R(st) < 0.35) {
        const give = p.hand.filter(x => x !== ex).sort((a, b) => cardValue(st, p, a) - cardValue(st, p, b))[0];
        if (give && cardValue(st, p, give) <= 4 && tryPlay(ex, { target: lead.idx, give })) return true;
      }
    }
    if (use('destiny', 0.9, {})) return true;
    if (use('mixup', 0.15, {})) return true;
    // portal: busca algo útil no descarte em vez de comprar
    const portal = p.hand.find(x => K(x) === 'portal');
    if (portal) {
      const pr = E.discardPairs(st)[0];
      if (pr && tryPlay(portal, { pick: pr[0] })) return true; // pega a cabeça e o corpo vem junto
      const pick = st.discard.find(x => K(x) === 'body' && E.canTakeBody(st, pid, x))
        || st.discard.find(x => K(x) === 'special') || (p.giraffes.length && st.discard.find(x => K(x) === 'neck' && E.CARDS[x].def >= 2));
      if (pick && tryPlay(portal, { pick })) return true;
    }
    // compra
    const unpaired = p.hand.some(h => K(h) === 'head' && !p.hand.some(b => K(b) === 'body' && PAIRS(E.CARDS[h], E.CARDS[b])));
    const mi = unpaired ? st.market.findIndex(b => b && E.canTakeBody(st, pid, b) && p.hand.some(h => K(h) === 'head' && !p.hand.some(x => K(x) === 'body' && PAIRS(E.CARDS[h], E.CARDS[x])) && PAIRS(E.CARDS[h], E.CARDS[b]))) : -1;
    return E.draw(st, pid, mi >= 0 ? mi : 'deck');
  }

  const API = { step };
  root.GD_BOT = API;
  if (typeof module !== 'undefined') module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
