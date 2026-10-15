// Giraffe Doom — catálogo das cartas
(function (root) {
  const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

  const HEADS = [
    ['Giraflava', 3], ['Girafknight', 3], ['Giraftus', 1], ['Giraffegun', 2], ['Girafclown', 1],
    ['Steamraffe', 1], ['Piraffe', 1], ['Ninjaraffe', 2], ['Giraffeon', 1], ['Girafiking', 3],
    ['Giralactea', 2], ['Mimicraffe', 1], ['Superaffe', 2], ['Girainbow', 2], ['Bandgiraffe', 2],
    ['Braveraffe', 1], ['Giraffanana', 3], ['Girafnaut', 3], ['Girafwitch', 3], ['Girafurai', 3],
    ['Cyberaffe', 2], ['Bubbleraffe', 1],
  ];
  const SPECIALS = ['Girashark', 'Girassaur', 'Crocoraffe', 'Giraevil'];
  const WILD = ['Girafclown', 'Mimicraffe'];
  // par válido: mesma girafa, ou um dos dois é coringa
  const pairs = (a, b) => !!a && !!b && a.kind !== b.kind && ['head', 'body'].includes(a.kind) && ['head', 'body'].includes(b.kind) && (a.match === b.match || a.wild || b.wild);

  // cor: R vermelho, B azul, G verde, Y amarelo, W branco
  const NECKS = [
    ['Azurite', 'R', 3], ['Geodes', 'R', 3], ['Nero', 'R', 3], ['Void', 'R', 3], ['Neural', 'R', 3],
    ["Deamon's", 'R', 3], ['Wyvern', 'R', 3], ['Bone', 'R', 2], ['Souls', 'R', 2], ['Serpent', 'R', 2],
    ['Plasma', 'B', 3], ['Bones', 'B', 3], ['Galaxy', 'B', 2], ['Sky', 'B', 2], ['Engine', 'B', 2],
    ['Reef', 'B', 2], ['Data', 'B', 2], ['Chrono', 'B', 2], ['Ice', 'B', 2], ['Coral', 'B', 2],
    ['Lava', 'G', 3], ['Snapper', 'G', 2], ['Bog', 'G', 2], ['Trunks', 'G', 2], ['Shrooms', 'G', 2],
    ['Sand', 'G', 2], ['Amber', 'G', 2], ['Tree', 'G', 2], ['Mycelium', 'G', 2], ['Banana', 'G', 1],
    ['Socks', 'Y', 2], ['Burger', 'Y', 2], ['Cats', 'Y', 2], ['Pizza', 'Y', 2], ['Paper', 'Y', 1],
    ['Tool', 'Y', 1], ['Jumper', 'Y', 1], ['Gnomes', 'Y', 1], ['Clock', 'Y', 1], ['Beer', 'Y', 1],
    ['Portal', 'W', 2], ['Spore Spine', 'W', 2], ['Geode Heart', 'W', 2], ['Holy', 'W', 2], ['Marble', 'W', 2],
    ['Time', 'W', 2], ['Prism Eye', 'W', 1], ['Crystal', 'W', 1], ['Kyanite', 'W', 1], ['Magical', 'W', 1],
  ];

  // [nome, tipo, dano]
  const ATTACKS = [
    ['Banana Phew', 'attack', 1], ['Jumpy Clown Box', 'attack', 1], ['Piano Mortale', 'attack', 1],
    ['Cactus Dance', 'attack', 1], ['Piranha Shake', 'attack', 1], ['Sk8 Brown Fall', 'attack', 1],
    ['Coconut Fall', 'attack', 1], ['Warp Machine', 'attack', 1], ['Catapult', 'attack', 1],
    ['Colorful Bucket', 'attack', 1], ['Cake Cannon Cake', 'attack', 1], ['Washing My Guts', 'attack', 1],
    ['Balloon Pop Pop', 'attack', 2], // carta vermelha = 2 de dano
    ['Tea Time Fall', 'attack', 2], ['Beesaster', 'attack', 2], ['Quick Quicksand', 'attack', 2],
    ['Toxic Ride', 'poison', 1], ['Jelly Belly', 'poison', 1], ['Scorpion Squeeze', 'poison', 1], ['Viper Venom', 'poison', 1],
    ['Deadly Comet', 'bomb', 3], ['Death by Strike', 'bomb', 3], ['Beyond the Sky', 'bomb', 3], ['Origami Knot', 'bomb', 3],
    ['Symbiotic Slug', 'medicine', 0], ['Amulet of Purity', 'medicine', 0], ['Geyser Gulp', 'medicine', 0], ['Toxin Tinkerer', 'medicine', 0],
  ];

  // [nome, imagem, tipo, parametro]
  const ACTIONS = [
    ['Magical Verse', 'x_magical_verse', 'defense'], ['Take That', 'x_take_that', 'defense'],
    ['Magic Mirror', 'x_magic_mirror', 'defense'], ['Steel Rampart', 'x_steel_rampart', 'defense'],
    ['Toe Splash', 'x_toe_splash', 'interrupt'], ['Toe Splash', 'x_toe_splash_2', 'interrupt'],
    ['No Way', 'x_no_way', 'interrupt'], ['No Way', 'x_no_way_2', 'interrupt'],
    ['Double Toe', 'x_double_toe', 'super'], ['Double Toe', 'x_double_toe_2', 'super'],
    ['Hocus Pocus', 'x_hocus_pocus', 'discard'], ['Banana Peel', 'x_banana_peel', 'discard'],
    ['Mad Genius', 'x_mad_genius', 'timetravel'], ['Here We Go', 'x_here_we_go', 'timetravel'],
    ['Jet Pack Ride', 'x_jet_pack_ride', 'steal'], ['Fury Boy', 'x_fury_boy', 'steal'],
    ['Magic Wonders', 'x_magic_wonders', 'steal'], ['Vampires Kiss', 'x_vampires_kiss', 'steal'],
    ['Happy Jumpy', 'x_happy_jumpy', 'sneaky'], ['Sneaky Shark', 'x_sneaky_shark', 'sneaky'],
    ['Cool Jump', 'x_cool_jump', 'sneaky'], ['Le King', 'x_le_king', 'sneaky'],
    ['Card Detective', 'x_card_detective', 'sneaky'], ['Levitation', 'x_levitation', 'sneaky'],
    ['Queen', 'x_queen', 'sneaky'], ['Mama Rock', 'x_mama_rock', 'sneaky'],
    ['Swap Swap', 'x_swap_swap', 'exchange'], ['Reality Warper', 'a_reality_warper', 'exchange'],
    ['Crystal Ball', 'x_crystal_ball', 'destiny'], ['Future Weaver', 'x_future_weaver', 'destiny'],
    ['Science Guru', 'a_science_guru', 'destiny'], ['Magic Cards', 'a_magic_cards', 'destiny'],
    ['Extra Galactic', 'x_extra_galactic', 'portal'], ['Push Pop', 'x_push_pop', 'portal'],
    ['Hands of Time', 'a_hands_of_time', 'portal'], ['Fast Forward', 'a_fast_forward', 'portal'],
    ['Chikaboom', 'x_chikaboom', 'mixup'], ['Chaos Carousel', 'a_chaos_carousel', 'mixup'],
    ['Sleepy Leak', 'x_sleepy_leak', 'sleep', 1], ['Chill Out', 'a_chill_out', 'sleep', 1],
    ['Flipped', 'x_flipped', 'sleep', 2], ['Lost in Limbo', 'a_lost_in_limbo', 'sleep', 2],
  ];

  // Objetivos: pontos + teste sobre as girafas do jogador (necks = lista de cores, base->topo)
  const OBJECTIVES = [
    { img: 'o_00', name: 'The Void Beckons', pts: 3, text: 'Pescoço nível 4 alternando as cores (nenhuma cor igual seguida).' },
    { img: 'o_01', name: 'Toxic Nibble', pts: 1, text: 'Ataque o mesmo jogador 3 vezes num único turno.' },
    { img: 'o_02', name: 'Warning Signs', pts: 2, text: 'Pescoço nível 3 com 3 cores diferentes.' },
    { img: 'o_03', name: 'First Omen', pts: 1, text: 'Estenda o pescoço com duas cores iguais.' },
    { img: 'o_04', name: 'Twin-Headed', pts: 2, text: 'Pescoço nível 4 em pares idênticos (ex.: 2 vermelhos e 2 verdes).' },
    { img: 'o_05', name: 'Pillars of Fire', pts: 3, text: 'Pescoço nível 4 com pelo menos 3 vermelhos.' },
    { img: 'o_06', name: 'Monolithic Tower', pts: 4, text: 'Pescoço nível 5 usando só 2 cores.' },
    { img: 'o_07', name: 'Perfect DNA Splicing', pts: 4, text: 'Pescoço nível 5 usando 3 cores.' },
    { img: 'o_08', name: 'Intertwined Mutations', pts: 5, text: '2 girafas com pescoço nível 4.' },
    { img: 'o_09', name: 'The Sacrifices', pts: 5, text: '1 girafa nível 5 e outras 2 girafas nível 1.' },
    { img: 'o_10', name: 'Bio-Hazard', pts: 3, text: 'Pescoço nível 4 sem vermelho nem azul.' },
    { img: 'o_11', name: 'Rise Above the Flames', pts: 1, text: 'Pescoço nível 2 com pelo menos 1 vermelho.' },
    { img: 'o_12', name: 'Slightly Mutated', pts: 1, text: 'Pescoço nível 2 com exatamente 2 brancos.' },
    { img: 'o_13', name: 'Looming Shadow', pts: 2, text: 'Pescoço nível 3 só com verde e azul.' },
    { img: 'o_14', name: 'Radioactive Stretch', pts: 2, text: 'Pescoço nível 3 com pelo menos 2 amarelos.' },
    { img: 'o_15', name: 'Almost to the Stars', pts: 3, text: 'Pescoço nível 4 com 4 cores diferentes.' },
    { img: 'o_16', name: 'The Zenith of Doom', pts: 4, text: 'Pescoço nível 5 com as 5 cores.' },
    { img: 'o_17', name: 'Toxic Core', pts: 4, text: 'Pescoço nível 5 com o 1º e o 5º da mesma cor.' },
    { img: 'o_18', name: 'The Twin Towers of Ruin', pts: 5, text: '2 girafas com pescoço nível 4.' },
    { img: 'o_19', name: 'The Apocalypse Herd', pts: 5, text: '3 girafas completas, cada uma com pelo menos 1 pescoço.' },
  ];

  const cnt = (arr, c) => arr.filter(x => x === c).length;
  const distinct = arr => new Set(arr).size;
  const any = (gs, f) => gs.some(g => f(g.necks));
  // nível da girafa: pescoços; girafas especiais contam como nível 1
  const lvl = g => g.special ? Math.max(1, g.necks.length) : g.necks.length;
  const CHECKS = [
    gs => any(gs, n => n.length >= 4 && n.every((c, i) => i === 0 || c !== n[i - 1])),
    (gs, st) => st.maxHitsOnOne >= 3,
    gs => any(gs, n => n.length >= 3 && distinct(n) >= 3),
    gs => any(gs, n => n.length >= 2 && n.some((c, i) => n.indexOf(c) !== i)),
    gs => any(gs, n => n.length >= 4 && ['R', 'B', 'G', 'Y', 'W'].every(c => cnt(n.slice(0, 4), c) % 2 === 0)),
    gs => any(gs, n => n.length >= 4 && cnt(n, 'R') >= 3),
    gs => any(gs, n => n.length >= 5 && distinct(n) === 2),
    gs => any(gs, n => n.length >= 5 && distinct(n) === 3),
    gs => gs.filter(g => lvl(g) >= 4).length >= 2,
    gs => gs.some(g => lvl(g) >= 5) && gs.filter(g => lvl(g) >= 1).length >= 3,
    gs => any(gs, n => n.length >= 4 && !n.includes('R') && !n.includes('B')),
    gs => any(gs, n => n.length >= 2 && n.includes('R')),
    gs => any(gs, n => n.length >= 2 && cnt(n, 'W') === 2),
    gs => any(gs, n => n.length >= 3 && n.every(c => c === 'G' || c === 'B')),
    gs => any(gs, n => n.length >= 3 && cnt(n, 'Y') >= 2),
    gs => any(gs, n => n.length >= 4 && distinct(n) >= 4),
    gs => any(gs, n => n.length >= 5 && distinct(n) === 5),
    gs => any(gs, n => n.length >= 5 && n[0] === n[4]),
    gs => gs.filter(g => lvl(g) >= 4).length >= 2,
    gs => gs.filter(g => lvl(g) >= 1).length >= 3,
  ];
  OBJECTIVES.forEach((o, i) => { o.id = 'obj' + i; o.check = CHECKS[i]; });

  // nomes em português, como impressos nas cartas
  const PT_HEAD = {"girafclown": "Girafalhaço", "giraffegun": "Girafarma", "girafknight": "Girafalheiro", "giraftus": "Giraftus", "giraflava": "Giraflava", "cyberaffe": "Cyberafa", "bubbleraffe": "Bolharafa", "girafurai": "Girafurai", "giraffanana": "Girafanana", "girafnaut": "Girafnauta", "girafwitch": "Girafruxa", "mimicraffe": "Mimicarafa", "giralactea": "Giralactea", "girafiking": "Girafiking", "giraffeon": "Girafeão", "ninjaraffe": "Ninjarafa", "piraffe": "Pirafa", "steamraffe": "Vaporafa", "girainbow": "Girafa-íris", "superaffe": "Superafa", "braveraffe": "Bravarafa", "bandgiraffe": "Bandirafa"};
  const PT_IMG = {"g_girashark": "Girafarão", "g_girassaur": "Girassauro", "g_crocoraffe": "Crocorafa", "g_giraevil": "Girapeta", "n_kyanite": "Pescoço Kyanite", "n_holy": "Pescoço Sagrado", "n_magical": "Pescoço Mágico", "n_time": "Pescoço do Tempo", "n_marble": "Pescoço de Mármore", "n_serpent": "Pescoço de Cobra", "n_souls": "Pescoço de Alma", "n_deamon_s": "Pescoço do Capeta", "n_wyvern": "Pescoço do Dragão", "n_bone": "Pescoço Ossudo", "n_beer": "Pescoço Cerveja", "n_cats": "Pescoço de Gatos", "n_pizza": "Pescoço de Pizza", "n_burger": "Pescoço Burger", "n_socks": "Pescoço de Meias", "n_coral": "Pescoço de Corais", "n_ice": "Pescoço de Gelo", "n_bones": "Pescoço de Coluna", "n_chrono": "Pescoço Mecânico", "n_data": "Pescoço de Dados", "n_mycelium": "Pescoço Micélio", "n_banana": "Pescoço Banana", "n_tree": "Pescoço Árvore", "n_amber": "Pescoço Âmbar", "n_lava": "Pescoço de Lava", "n_crystal": "Pescoço de Cristal", "n_portal": "Pescoço Portal", "n_prism_eye": "Pescoço Prisma", "n_spore_spine": "Pescoço de Espinha", "n_geode_heart": "Pescoço Coração", "n_azurite": "Pescoço Azurita", "n_geodes": "Pescoço Geodos", "n_nero": "Pescoço Preto", "n_void": "Pescoço Vazio", "n_neural": "Pescoço Neural", "n_jumper": "Pescoço Suéter", "n_gnomes": "Pescoço Gnomos", "n_clock": "Pescoço Relógio", "n_paper": "Pescoço Limpinho", "n_tool": "Pescoço Ferramenta", "n_galaxy": "Pescoço Galático", "n_sky": "Pescoço Céu", "n_plasma": "Pescoço de Plasma", "n_engine": "Pescoço Engenho", "n_reef": "Pescoço Mar", "n_sand": "Pescoço de Areia", "n_shrooms": "Pescoço Cogumelo", "n_trunks": "Pescoço Tronco", "n_bog": "Pescoço Pântano", "n_snapper": "Pescoço Carnívoro", "a_toxin_tinkerer": "Sem Toxinas", "a_symbiotic_slug": "Lesma Simbiótica", "a_amulet_of_purity": "Amuleto Purificado", "a_geyser_gulp": "Gole na Gêiser", "a_jelly_belly": "Água Viva Mata", "a_scorpion_squeeze": "Escorpião Bravão", "a_toxic_ride": "Carona Tóxica", "a_viper_venom": "Cobra Venenosa", "a_quick_quicksand": "Areia Movediça", "a_tea_time_fall": "Hora do Chá", "a_beesaster": "Abelhudas", "a_deadly_comet": "Cometa Fatal", "a_death_by_strike": "Raios e Trovões", "a_beyond_the_sky": "Além do Céu", "a_origami_knot": "Origami Nó", "a_jumpy_clown_box": "Caixa Surpresa", "a_banana_phew": "Casca de Banana", "a_cactus_dance": "Cacto Bailarino", "a_piano_mortale": "Piano Mortal", "a_washing_my_guts": "Barriga Limpa", "a_piranha_shake": "Piranha Agitada", "a_coconut_fall": "A Queda do Coco", "a_sk8_brown_fall": "Caindo do Sk8", "a_warp_machine": "Máquina Espacial", "a_cake_cannon_cake": "Canhão de Bolo", "a_catapult": "Catapulta", "a_colorful_bucket": "Lata Colorida", "a_balloon_pop_pop": "Bexiga Pop Pop", "a_science_guru": "Guru da Ciência", "a_magic_cards": "Cartomante", "a_chill_out": "Relaxando", "a_lost_in_limbo": "Perdido no Limbo", "a_hands_of_time": "Mãos do Tempo", "a_fast_forward": "Avançando", "a_chaos_carousel": "Carrossel do Caos", "a_reality_warper": "Realidade Confusa", "x_crystal_ball": "Bola Cristalina", "x_future_weaver": "Mudando Destino", "x_sleepy_leak": "Famoso Babão", "x_flipped": "Perdidão", "x_extra_galactic": "Extra Galático", "x_push_pop": "Pula Pula", "x_chikaboom": "Mexe Remexe", "x_banana_peel": "Nasca da Bacana", "x_no_way": "Rabada na Cara", "x_no_way_2": "Rabada na Cara", "x_toe_splash": "Aqui Não", "x_toe_splash_2": "Aqui Não", "x_double_toe": "Sai Pra Lá", "x_double_toe_2": "Sai Pra Lá", "x_magic_mirror": "Espelho Mágico", "x_steel_rampart": "Escudo de Aço", "x_swap_swap": "Troca Troca", "x_card_detective": "Detetive de Cartas", "x_levitation": "Levitação", "x_queen": "Rainha", "x_mama_rock": "Mama Rock", "x_magic_wonders": "Mágicaralha", "x_vampires_kiss": "Beijo do Vampiro", "x_here_we_go": "Lá Vamos Nós", "x_hocus_pocus": "Hocus Pocus", "x_take_that": "O Que Bate Volta", "x_magical_verse": "Verso Mágico", "x_le_king": "Le Rei", "x_sneaky_shark": "Tubarão Danado", "x_cool_jump": "Que Pulo Legal", "x_happy_jumpy": "Pulo Gazela", "x_jet_pack_ride": "Carona Voadora", "x_fury_boy": "Vaqueiro do Mal", "x_mad_genius": "Gênio Louco"};
  const PT_OBJ = {"o_00": "O Vazio Chama", "o_01": "Mordida Tóxica", "o_02": "Sinais de Alerta", "o_03": "Primeiro Presságio", "o_04": "Cabeça Dupla", "o_05": "Pilares de Fogo", "o_06": "Torre Monolítica", "o_07": "União de DNA Perfeita", "o_08": "Mutações Entrelaçadas", "o_09": "Os Sacrifícios", "o_10": "Risco Biológico", "o_11": "Supere as Chamas", "o_12": "Levemente Mutado", "o_13": "Sombra Ameaçadora", "o_14": "Esticada Radioativa", "o_15": "Quase nas Estrelas", "o_16": "O Zênito da Destruição", "o_17": "Centro Tóxico", "o_18": "As Torres Gêmeas da Ruína", "o_19": "O Rebanho Apocalíptico"};
  OBJECTIVES.forEach(o => { if (PT_OBJ[o.img]) o.name = PT_OBJ[o.img]; });

  function buildCards() {
    const cards = {};
    const add = c => { cards[c.id] = c; return c.id; };
    const out = { heads: [], bodies: [], specials: [], necks: [], main: [], bombs: [] };
    HEADS.forEach(([n, d]) => {
      const s = slug(n);
      const wild = WILD.includes(n); // cartas de fundo colorido são coringas
      out.heads.push(add({ id: 'h_' + s, kind: 'head', name: PT_HEAD[s] || n, def: d, img: 'h_' + s, match: s, wild }));
      out.bodies.push(add({ id: 'b_' + s, kind: 'body', name: PT_HEAD[s] || n, def: 0, img: 'b_' + s, match: s, wild }));
    });
    SPECIALS.forEach(n => out.specials.push(add({ id: 'g_' + slug(n), kind: 'special', name: PT_IMG['g_' + slug(n)] || n, def: 1, img: 'g_' + slug(n) })));
    NECKS.forEach(([n, c, d]) => out.necks.push(add({ id: 'n_' + slug(n), kind: 'neck', name: PT_IMG['n_' + slug(n)] || n + ' Neck', color: c, def: d, img: 'n_' + slug(n) })));
    ATTACKS.forEach(([n, t, d]) => {
      const id = add({ id: 'a_' + slug(n), kind: t, name: PT_IMG['a_' + slug(n)] || n, dmg: d, img: 'a_' + slug(n) });
      (t === 'bomb' ? out.bombs : out.main).push(id);
    });
    ACTIONS.forEach(([n, img, t, p]) => out.main.push(add({ id: img, kind: t, name: PT_IMG[img] || n, img, turns: p })));
    out.main.push(...out.necks); // girafas especiais vão para o bolo das cabeças
    return { cards, piles: out };
  }

  const KIND_LABEL = {
    head: 'Cabeça', body: 'Corpo', special: 'Girafa especial', neck: 'Pescoço',
    attack: 'Doom Ataque', poison: 'Doom Ataque Venenoso', bomb: 'Evento Doom', medicine: 'Medicina Mágica',
    defense: 'Defesa', interrupt: 'Pare!', super: 'Pare Agora!', discard: 'Descarte',
    timetravel: 'Viagem ao Tempo', steal: 'Missão Pescoço', sneaky: 'Pega Carta', exchange: 'Intercâmbio',
    destiny: 'Destino', portal: 'Portal', mixup: 'Embaralhe', sleep: 'Hora do Sono',
  };
  const KIND_HELP = {
    head: 'Baixe junto com o corpo da mesma girafa (ou com um corpo coringa). Se uma girafa sua foi baixada com cabeça coringa, num turno seguinte esta cabeça pode substituir o coringa, que volta para a mão; nesse turno você não baixa girafa nem pescoço.',
    body: 'Baixe junto com a cabeça da mesma girafa (ou com uma cabeça coringa). Se uma girafa sua foi baixada com corpo coringa, num turno seguinte este corpo pode substituir o coringa, que volta para a mão; nesse turno você não baixa girafa nem pescoço.',
    special: 'Girafa inteira numa carta só. Baixe na mesa. Ela não recebe pescoços e conta como girafa de nível 1 nos objetivos.',
    neck: 'Encaixe numa girafa sua (até 5 pescoços). A cor conta para os objetivos.',
    attack: 'Precisa ter pelo menos uma girafa sua na mesa. Escolha o oponente, a girafa e o pescoço que vai levar o dano. A cabeça só pode ser atacada quando a girafa não tem pescoços.',
    poison: 'Precisa ter pelo menos uma girafa sua na mesa. Escolha o oponente, a girafa e o pescoço: a carta fica em cima dele, que perde 1 ponto de defesa no início de cada turno do dono, por 3 turnos (sem pescoços, vai na cabeça). Os pontos perdidos não voltam. Só o antídoto (Medicina Mágica) para o veneno.',
    bomb: 'Campo minado! Quem compra leva 3 pontos de dano na girafa mais alta, somados de cima para baixo: quebra 3 pescoços de defesa 1, ou 1 de defesa 3, ou a combinação que somar 3.',
    medicine: 'Antídoto: tira todos os venenos das suas girafas. Os pontos já perdidos não voltam.',
    defense: 'Reação: devolve a ação para quem atacou.',
    interrupt: 'Reação: cancela a ação de outro jogador.',
    super: 'Reação: cancela todas as ações e reações. Ninguém pode responder.',
    discard: 'Obriga um jogador a descartar 1 carta aleatória.',
    timetravel: 'Você ganha um turno extra depois deste.',
    steal: 'Escolha o oponente, a girafa e o pescoço que vai roubar, e depois em qual girafa sua ele entra. Se nenhuma girafa sua puder receber (todas com 5 pescoços ou girafas inteiras), ele vai para a sua mão.',
    sneaky: 'Pegue 1 carta aleatória da mão de um jogador.',
    exchange: 'Troque uma carta sua por uma carta aleatória de outro jogador.',
    destiny: 'Veja as 2 cartas do topo do monte e fique com uma. Substitui a compra e encerra o turno.',
    portal: 'Pegue qualquer carta do descarte. Se escolher uma cabeça ou um corpo, leva a girafa completa (a outra parte vem junto, se estiver no descarte); as outras cartas, só uma. Substitui a compra e encerra o turno.',
    mixup: 'Embaralhe o monte que quiser: o de compra, o de corpos (a vitrine volta para o monte e sai uma nova) ou o de objetivos.',
    sleep: 'Você ou outro jogador dorme e pula a vez. Quem dorme não pode ser alvo.',
  };

  root.GD_CARDS = { pairs, buildCards, OBJECTIVES, KIND_LABEL, KIND_HELP };
  if (typeof module !== 'undefined') module.exports = root.GD_CARDS;
})(typeof window !== 'undefined' ? window : globalThis);
