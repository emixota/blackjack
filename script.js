// Blackjack : split 10/J/Q/K, sons, anti-F5, euros, UI casino, bulle de score
(() => {
  const STORAGE_KEY_BANK = 'blackjack_bank_v1';
  const STORAGE_KEY_BET  = 'blackjack_bet_v1';

  // DOM
  const dealerHandEl   = document.getElementById('dealerHand');
  const playerHandsEl  = document.getElementById('playerHands');
  const dealerValueEl  = document.getElementById('dealerValue');
  const playerValueEl  = document.getElementById('playerValue');
  const dealerBadgeEl  = document.getElementById('dealerBadge');
  const playerBadgeEl  = document.getElementById('playerBadge');
  const activeScoreBubbleEl = document.getElementById('activeScoreBubble');

  const dealBtn   = document.getElementById('dealBtn');
  const hitBtn    = document.getElementById('hitBtn');
  const standBtn  = document.getElementById('standBtn');
  const doubleBtn = document.getElementById('doubleBtn');
  const splitBtn  = document.getElementById('splitBtn');
  const resetBtn  = document.getElementById('resetBtn');

  const betInput      = document.getElementById('bet');
  const bankEl        = document.getElementById('bank');
  const currentBetEl  = document.getElementById('currentBet');
  const logEl         = document.getElementById('log');
  const historyEl     = document.getElementById('history');
  const bankDeltaEl   = document.getElementById('bankDelta');

  const chipButtons   = document.querySelectorAll('.chip');

  // Sons
  const cardSound = document.getElementById('cardSound');
  const winSound  = document.getElementById('winSound');
  const loseSound = document.getElementById('loseSound');

  function playSound(audio) {
    if (!audio) return;
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }

  function formatEuro(n) {
    return `${n.toLocaleString('fr-FR')} €`;
  }

  // État
  let deck = [];
  let dealer = [];
  let playerHands = []; // [{cards:[], bet:number, finished:boolean, busted:boolean}]
  let activeHandIndex = 0;

  let bank = loadBank();
  let baseBet = 0;
  let currentBet = 0; // somme des mises posées sur la table
  let inRound = false;
  let dealerHidden = true;
  let roundStartBank = bank;

  // --- Persistence solde / mise ---
  function loadBank() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_BANK);
      const n = Number(raw);
      if (!Number.isNaN(n) && n >= 0) return n;
    } catch (e) {}
    return 100; // solde de départ par défaut
  }

  function saveBank() {
    try {
      localStorage.setItem(STORAGE_KEY_BANK, String(bank));
    } catch (e) {}
  }

  function saveBetValue(value) {
    try {
      localStorage.setItem(STORAGE_KEY_BET, String(value));
    } catch (e) {}
  }

  function loadBetValue() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_BET);
      const n = Number(raw);
      if (!Number.isNaN(n) && n >= 1) return n;
    } catch (e) {}
    return 10;
  }

  // Deck & cartes
  function createDeck() {
    const suits = ['♠','♥','♦','♣'];
    const names = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
    const d = [];
    for (const s of suits) {
      for (const n of names) {
        d.push({ suit:s, rank:n });
      }
    }
    return d;
  }

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function cardToText(c) {
    return `${c.rank}${c.suit}`;
  }

  function cardElement(c, hidden = false) {
    const div = document.createElement('div');
    div.className = 'card' + (hidden ? ' back' : '');
    if (!hidden) {
      div.textContent = cardToText(c);
      div.dataset.rank = c.rank;
      div.dataset.suit = c.suit;
      if (c.suit === '♥' || c.suit === '♦') {
        div.classList.add('red');
      }
    } else {
      div.dataset.rank = '';
      div.dataset.suit = '';
    }
    return div;
  }

  function handValue(hand) {
    let total = 0;
    let aces = 0;
    for (const c of hand) {
      if (c.rank === 'A') {
        aces++; total += 11;
      } else if (['J','Q','K'].includes(c.rank)) {
        total += 10;
      } else {
        total += Number(c.rank);
      }
    }
    while (total > 21 && aces > 0) {
      total -= 10;
      aces--;
    }
    return total;
  }

  function isTenValue(card) {
    if (!card) return false;
    return card.rank === '10' || card.rank === 'J' || card.rank === 'Q' || card.rank === 'K';
  }

  function makeHand(cards, bet) {
    return {
      cards: cards.slice(),
      bet,
      finished: false,
      busted: false,
    };
  }

  function log(txt) {
    const p = document.createElement('div');
    p.textContent = txt;
    logEl.prepend(p);
  }

  function updateHistory(txt) {
    const el = document.createElement('div');
    el.textContent = txt;
    el.className = 'history-entry';
    historyEl.prepend(el);
  }

  function showBankDelta(delta) {
    if (!delta) {
      bankDeltaEl.classList.remove('show','gain','loss');
      bankDeltaEl.textContent = '';
      return;
    }
    bankDeltaEl.classList.remove('show','gain','loss');
    void bankDeltaEl.offsetWidth; // force reflow

    const signed = (delta > 0 ? '+' : '-') + formatEuro(Math.abs(delta));
    bankDeltaEl.textContent = signed;
    bankDeltaEl.classList.add(delta > 0 ? 'gain' : 'loss');
    bankDeltaEl.classList.add('show');

    setTimeout(() => {
      bankDeltaEl.classList.remove('show');
    }, 1200);
  }

  function updateBadges() {
    if (!inRound) {
      dealerBadgeEl.textContent = 'En attente';
      dealerBadgeEl.className = 'badge';
      playerBadgeEl.textContent = 'Cliquez sur Distribuer';
      playerBadgeEl.className = 'badge green';
      return;
    }

    const dealerTurn = activeHandIndex >= playerHands.length;
    if (dealerTurn) {
      dealerBadgeEl.textContent = 'Tour du dealer';
      dealerBadgeEl.className = 'badge green turn';
      playerBadgeEl.textContent = 'Attendez la résolution';
      playerBadgeEl.className = 'badge';
    } else {
      dealerBadgeEl.textContent = 'En attente';
      dealerBadgeEl.className = 'badge';
      playerBadgeEl.textContent = 'Main ' + (activeHandIndex + 1);
      playerBadgeEl.className = 'badge green turn';
    }
  }

  function render() {
    // Dealer
    dealerHandEl.innerHTML = '';
    dealer.forEach((c, i) => {
      const hidden = dealerHidden && i === 0;
      dealerHandEl.appendChild(cardElement(c, hidden));
    });
    dealerValueEl.textContent = dealer.length ? (dealerHidden ? '??' : handValue(dealer)) : 0;

    // Player hands
    playerHandsEl.innerHTML = '';
    playerHands.forEach((hand, idx) => {
      const row = document.createElement('div');
      row.className = 'player-hand-row';
      if (idx === activeHandIndex && inRound) {
        row.classList.add('active');
      }

      const header = document.createElement('div');
      header.className = 'hand-header';

      const left = document.createElement('div');
      left.className = 'hand-header-left';
      const title = document.createElement('span');
      title.textContent = 'Main ' + (idx + 1);
      left.appendChild(title);

      if (hand.finished) {
        const tag = document.createElement('span');
        tag.className = 'hand-tag';
        if (hand.busted) {
          tag.classList.add('bust');
          tag.textContent = 'Bust';
        } else {
          tag.textContent = 'Terminé';
        }
        left.appendChild(tag);
      }

      header.appendChild(left);

      const right = document.createElement('span');
      right.textContent = `${handValue(hand.cards)} pts • Mise ${formatEuro(hand.bet)}`;
      header.appendChild(right);

      row.appendChild(header);

      const cardsDiv = document.createElement('div');
      cardsDiv.className = 'hand';
      hand.cards.forEach(c => cardsDiv.appendChild(cardElement(c, false)));
      row.appendChild(cardsDiv);

      playerHandsEl.appendChild(row);
    });

    let activeScore = 0;
    const activeHand = playerHands[activeHandIndex];
    if (activeHand) {
      activeScore = handValue(activeHand.cards);
    } else if (playerHands[0]) {
      activeScore = handValue(playerHands[0].cards);
    }

    playerValueEl.textContent = activeScore;

    // Bulle de score
    if (activeScoreBubbleEl) {
      activeScoreBubbleEl.textContent = activeScore || 0;
      if (inRound && playerHands.length) {
        activeScoreBubbleEl.classList.remove('score-bubble-hidden');
      } else {
        activeScoreBubbleEl.classList.add('score-bubble-hidden');
      }
    }

    bankEl.textContent = formatEuro(bank);
    currentBetEl.textContent = formatEuro(currentBet);

    updateBadges();
    updateControls();
  }

  function updateControls() {
    if (!inRound) {
      dealBtn.disabled   = false;
      hitBtn.disabled    = true;
      standBtn.disabled  = true;
      doubleBtn.disabled = true;
      splitBtn.disabled  = true;
      betInput.disabled  = false;
      return;
    }

    betInput.disabled = true;
    dealBtn.disabled  = true;

    const hand = playerHands[activeHandIndex];
    if (!hand || hand.finished) {
      hitBtn.disabled    = true;
      standBtn.disabled  = true;
      doubleBtn.disabled = true;
      splitBtn.disabled  = true;
      return;
    }

    hitBtn.disabled   = false;
    standBtn.disabled = false;

    const canDouble = hand.cards.length === 2 && bank >= hand.bet;
    doubleBtn.disabled = !canDouble;

    const sameRank   = hand.cards.length === 2 && hand.cards[0].rank === hand.cards[1].rank;
    const bothTenVal = hand.cards.length === 2 && isTenValue(hand.cards[0]) && isTenValue(hand.cards[1]);

    const canSplit =
      playerHands.length === 1 &&
      hand.cards.length === 2 &&
      (sameRank || bothTenVal) &&
      bank >= baseBet;

    splitBtn.disabled = !canSplit;
  }

  function resetForNextRound() {
    deck = [];
    dealer = [];
    playerHands = [];
    activeHandIndex = 0;
    inRound = false;
    dealerHidden = true;
    baseBet = 0;
    currentBet = 0;
    betInput.disabled = false;
    render();
  }

  function applyPayout(bet, multiplier, outcomeText) {
    if (multiplier > 0) {
      const gain = Math.floor(bet * multiplier);
      bank += gain;
      saveBank();
      updateHistory(`${outcomeText} ( +${formatEuro(gain)} )`);
      log(outcomeText + ' — vous gagnez ! 🤑');
      playSound(winSound);
    } else if (multiplier === 0) {
      bank += bet;
      saveBank();
      updateHistory(`${outcomeText} ( mise retournée )`);
      log(outcomeText + ' — push.');
    } else {
      // perte : la mise a déjà été retirée du solde
      updateHistory(`${outcomeText} ( -${formatEuro(bet)} )`);
      log(outcomeText + ' — vous perdez.');
      playSound(loseSound);
    }
  }

  function settleHands() {
    const dVal = handValue(dealer);

    playerHands.forEach((hand, index) => {
      const pVal = handValue(hand.cards);
      let outcome;
      let multiplier = -1; // défaut = perte

      if (pVal > 21) {
        outcome = `Main ${index + 1}: bust (${pVal})`;
        multiplier = -1;
      } else if (dVal > 21) {
        outcome = `Main ${index + 1}: dealer bust (${dVal})`;
        multiplier = 2;
      } else if (pVal > dVal) {
        outcome = `Main ${index + 1}: ${pVal} contre ${dVal}`;
        multiplier = 2;
      } else if (pVal < dVal) {
        outcome = `Main ${index + 1}: ${pVal} contre ${dVal} — dealer gagne`;
        multiplier = -1;
      } else {
        outcome = `Main ${index + 1}: égalité (${pVal})`;
        multiplier = 0;
      }

      applyPayout(hand.bet, multiplier, outcome);
    });

    const delta = bank - roundStartBank;
    showBankDelta(delta);

    inRound = false;
    setTimeout(() => {
      resetForNextRound();
    }, 1000);
    render();
  }

  function dealerPlay() {
    // Révéler la carte cachée puis tirage avec délai
    dealerHidden = false;
    render();

    const step = () => {
      if (handValue(dealer) < 17) {
        dealer.push(deck.pop());
        playSound(cardSound);
        render();
        setTimeout(step, 650); // délai entre chaque carte du dealer
      } else {
        // petite pause avant la résolution
        setTimeout(() => settleHands(), 500);
      }
    };

    setTimeout(step, 650);
  }

  function gotoNextHandOrDealer() {
    // Si une main suivante existe, on la joue
    if (activeHandIndex < playerHands.length - 1) {
      activeHandIndex++;
      log('Tour de la main ' + (activeHandIndex + 1));
      render();
      return;
    }

    // Sinon, toutes les mains sont finies -> tour du dealer
    activeHandIndex = playerHands.length; // pour le badge "dealer"
    render();
    setTimeout(() => dealerPlay(), 600);
  }

  // ---- Actions ----

  function onDeal() {
    if (dealBtn.disabled) return;

    let bet = Math.floor(Number(betInput.value) || 0);
    if (bet < 1) bet = 1;
    if (bet > bank) {
      alert('Mise supérieure au solde disponible');
      return;
    }

    betInput.value = bet;
    saveBetValue(bet);

    // Nouvelle manche : on garde le solde de départ pour le delta
    roundStartBank = bank;

    deck = shuffle(createDeck());
    dealer = [];
    playerHands = [];
    activeHandIndex = 0;
    inRound = true;
    dealerHidden = true;

    baseBet = bet;
    currentBet = bet;
    bank -= bet;
    saveBank();

    // distribution initiale (dealer + joueur)
    dealer.push(deck.pop());
    playSound(cardSound);
    dealer.push(deck.pop());
    playSound(cardSound);

    const pHand = [deck.pop(), deck.pop()];
    playSound(cardSound);
    playSound(cardSound);

    playerHands.push(makeHand(pHand, bet));

    log('Distribution — mise ' + formatEuro(bet));
    render();

    // Vérifier Blackjack immédiat
    const pVal = handValue(playerHands[0].cards);
    const dVal = handValue(dealer);

    if (pVal === 21) {
      dealerHidden = false;
      render();
      if (dVal === 21) {
        applyPayout(baseBet, 0, 'Blackjack des deux — égalité');
      } else {
        applyPayout(baseBet, 2.5, 'Blackjack !');
      }
      const delta = bank - roundStartBank;
      showBankDelta(delta);
      inRound = false;
      setTimeout(() => {
        resetForNextRound();
      }, 1000);
    }
  }

  function onHit() {
    if (hitBtn.disabled || !inRound) return;
    const hand = playerHands[activeHandIndex];
    if (!hand || hand.finished) return;

    hand.cards.push(deck.pop());
    playSound(cardSound);
    const val = handValue(hand.cards);
    log(`Hit sur la main ${activeHandIndex + 1} (${val})`);

    if (val > 21) {
      hand.finished = true;
      hand.busted = true;
      log(`Main ${activeHandIndex + 1} bust (${val})`);
      render();
      setTimeout(() => gotoNextHandOrDealer(), 400);
    } else {
      render();
    }
  }

  function onStand() {
    if (standBtn.disabled || !inRound) return;
    const hand = playerHands[activeHandIndex];
    if (!hand || hand.finished) return;

    hand.finished = true;
    log(`Stand sur la main ${activeHandIndex + 1} (${handValue(hand.cards)})`);
    render();
    setTimeout(() => gotoNextHandOrDealer(), 350);
  }

  function onDouble() {
    if (doubleBtn.disabled || !inRound) return;
    const hand = playerHands[activeHandIndex];
    if (!hand || hand.finished) return;

    if (bank < hand.bet) {
      alert('Pas assez de solde pour doubler');
      return;
    }

    bank -= hand.bet;
    saveBank();
    currentBet += hand.bet;
    hand.bet *= 2;

    hand.cards.push(deck.pop());
    playSound(cardSound);
    hand.finished = true;

    const val = handValue(hand.cards);
    log(`Double sur la main ${activeHandIndex + 1} (${val})`);

    render();
    setTimeout(() => gotoNextHandOrDealer(), 400);
  }

  function onSplit() {
    if (splitBtn.disabled || !inRound) return;
    if (playerHands.length !== 1) return;

    const hand = playerHands[0];
    if (!hand || hand.cards.length !== 2) return;

    const sameRank   = hand.cards[0].rank === hand.cards[1].rank;
    const bothTenVal = isTenValue(hand.cards[0]) && isTenValue(hand.cards[1]);

    if (!sameRank && !bothTenVal) {
      alert('Split autorisé seulement sur cartes de même rang ou toutes les cartes valant 10 (10, J, Q, K).');
      return;
    }
    if (bank < baseBet) {
      alert('Pas assez de solde pour splitter');
      return;
    }

    bank -= baseBet;
    saveBank();
    currentBet += baseBet;

    const [c1, c2] = hand.cards;
    const newHand1 = makeHand([c1, deck.pop()], baseBet);
    const newHand2 = makeHand([c2, deck.pop()], baseBet);
    playSound(cardSound);
    playSound(cardSound);

    playerHands = [newHand1, newHand2];
    activeHandIndex = 0;

    log('Split effectué — deux mains créées');
    render();
  }

  function onReset() {
    if (!confirm('Réinitialiser le solde à 100 € ?')) return;
    bank = 100;
    saveBank();
    roundStartBank = bank;
    historyEl.innerHTML = '';
    log('Solde réinitialisé à 100 €');
    showBankDelta(0);
    resetForNextRound();
  }

  // ---- Chips ----
  chipButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      if (betInput.disabled) return;
      const delta = Number(btn.dataset.amount);
      let current = Math.floor(Number(betInput.value) || 0);
      current += delta;
      if (current < 1) current = 1;
      betInput.value = current;
      saveBetValue(current);
    });
  });

  betInput.addEventListener('change', () => {
    let v = Math.floor(Number(betInput.value) || 0);
    if (v < 1) v = 1;
    betInput.value = v;
    saveBetValue(v);
  });

  // Boutons
  dealBtn.addEventListener('click', onDeal);
  hitBtn.addEventListener('click', onHit);
  standBtn.addEventListener('click', onStand);
  doubleBtn.addEventListener('click', onDouble);
  splitBtn.addEventListener('click', onSplit);
  resetBtn.addEventListener('click', onReset);

  // Raccourcis clavier
  window.addEventListener('keydown', e => {
    const key = e.key.toLowerCase();
    if (key === 'd') onDeal();
    if (key === 'h') onHit();
    if (key === 's') onStand();
  });

  // Initialisation : charge mise & solde depuis le stockage
  betInput.value = loadBetValue();
  render();
})();
