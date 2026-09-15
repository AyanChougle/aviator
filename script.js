/**
 * AERO CRASH - PREMIUM COCKPIT EXPERIENCE
 * Strictly Vanilla JavaScript - No External Dependencies
 */

(function() {
  'use strict';

  //===================================================================
  // CONSTANTS & CONFIG
  //===================================================================
  const CONFIG = {
    STORAGE_KEY: 'aero_crash_savings_v1',
    INITIAL_VS: 10000,
    MIN_STAKE: 10,
    MAX_STAKE: 10000,
    TIMINGS: {
      SPLASH_MS: 2000,
      BETTING_MS: 8000,
      LAUNCHING_MS: 1000,
      CRASHED_MS: 1500,
      RESULT_MS: 2000
    },
    SAMPLE_CALLSIGNS: [
      'ACE_05', 'GHOST_99', 'ROGUE_01', 'TITAN_X', 'VIPER_7', 'METUROR'
    ]
  };

  const NOUN_CALLSIGNS = [
    'FALCON', 'STORM', 'VECTOR0', 'BLADE', 'UMBRA', 'NEBULY', 'ARGKUSN_', 'PROLOG',
    'NOVA_X', 'CHAOS', 'QUARK', 'HYDRA', 'ZEPHYR', 'PATHCHIFE', 'IRARUMI', 'SHADOW'
  ];

let savedState = {
    callsign: 'ACE_05',
    avatar: 'falcon',
    virtualBalance: CONFIG.INITIAL_VS,
    career: {
      roundsPlayed: 0,
      roundsWon: 0,
      roundsLost: 0,
      totalVcStaked: 0,
      totalVcWon: 0,
      totalVcLost: 0,
      highestCashoutMulti: 0.0,
      bestPayoutVc: 0
    },
    history: [],
    autoStake: 100,
    autoCashoutEnabled: false,
    autoCashoutValue: 2.00,
    audioEnabled: true
  };

  function loadState() {
    try {
      const data = localStorage.getItem(CONFIG.STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        savedState = Object.assign(savedState, parsed);
      }
    } catch (e) {
      console.warn('Failed to load storage', e);
    }
  }

  function saveState() {
    try {
      localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(savedState));
    } catch (e) {
      console.warn('Failed to save storage', e);
    }
  }

  //====================================================================
  // WEB AUDIO SYNTHESIZER (NO EXTERNAL FILES)
  //====================================================================
  let audioCtx = null;
  function initAudio() {
    if (!audioCtx) {
      const ACtx = window.AudioContext || window.webkitAudioContext;
      if (ACtx) audioCtx = new ACtx();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function playBeep(freq, duration, type) {
    if (!audioCtx || !savedState.audioEnabled) return;
    type = type || 'square';
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (e) {}
  }

  function soundCountdown() { playBeep(440, 0.08, 'square'); }
  function soundLaunch() { playBeep(880, 0.25, 'triangle'); }
  function soundCashout() {
    playBeep(523, 0.1, 'sine');
    setTimeout(function() { playBeep(659, 0.15, 'sine'); }, 90);
    setTimeout(function() { playBeep(784, 0.25, 'sine'); }, 180);
  }
  function soundCrash() {
    if (!audioCtx || !savedState.audioEnabled) return;
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(160, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(30, audioCtx.currentTime + 0.45);
      gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.45);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.45);
    } catch (e) {}
  }

  //====================================================================
  // CORE GAME MACHINE STATE
  //====================================================================
  let currentScreen = 'SPLASH';
  let gameState = 'WAITING';
  let roundNumber = 10189;
  let roundStartTime = 0;
  let launchStartTime = 0;
  let liveMultiplier = 1.00;
  let crashMultiplier = 2.50;
  let isManualCrashPending = false;
  let isGamePaused = false;
  let fleetCount = 150;
  let sqTableUpdateTimer = 0;

  let isBetPlaced = false;
  let currentStake = 100;
  let isCashedOut = false;
  let cashoutMultiplier = 0.00;
  let cashoutAmount = 0;

  let squadronPilots = [];

  //====================================================================
  // DOM ELEMENTS CACHE
  //====================================================================
  const DOM = {
    screenSplash: document.getElementById('screen-splash'),
    screenAuth: document.getElementById('screen-auth'),
    screenGame: document.getElementById('screen-game'),
    splashBar: document.getElementById('splash-bar'),
    splashStatus: document.getElementById('splash-status'),
    authInput: document.getElementById('auth-callsign-input'),
    authSubmit: document.getElementById('btn-auth-submit'),
    roundPill: document.getElementById('round-id-placeholder'),
    statePill: document.getElementById('agy-state-pill'),
    profileChip: document.getElementById('btn-profile-chip'),
    chipName: document.getElementById('profile-chip-name'),
    chipVal: document.getElementById('profile-chip-balance'),
    tickerList: document.getElementById('history-ticker-list'),
    stakeInput: document.getElementById('input-stake'),
    btnDec: document.getElementById('btn-stake-dec'),
    btnInc: document.getElementById('btn-stake-inc'),
    autoCheck: document.getElementById('check-auto-cashout'),
    autoInput: document.getElementById('input-auto-cashout'),
    btnAction: document.getElementById('btn-action'),
    actionText: document.getElementById('action-btn-text'),
    actionSub: document.getElementById('action-btn-subtext'),
    actionFeedback: document.getElementById('action-feedback'),
    canvas: document.getElementById('flight-canvas'),
    countdownOverlay: document.getElementById('countdown-overlay'),
    countdownDigits: document.getElementById('countdown-digits'),
    crashOverlay: document.getElementById('crash-overlay'),
    crashMultiplier: document.getElementById('crash-multiplier'),
    hudMultiplier: document.getElementById('hud-multiplier'),
    squadronBetsTable: document.getElementById('squadron-bets-table'),
    activityFeedList: document.getElementById('activity-feed-list'),
    modalProfile: document.getElementById('modal-profile'),
    drawerGM: document.getElementById('drawer-game-master'),
    modalOnboarding: document.getElementById('modal-onboarding'),
    debugOverlay: document.getElementById('debug-overlay'),
    liveMultiDebug: document.getElementById('debug-live-multi'),
    liveTargetDebug: document.getElementById('debug-target-multi'),
    btnSoundToggle: document.getElementById('btn-sound-toggle'),
    gmTargetInput: document.getElementById('gm-target-input'),
    gmFleetSlider: document.getElementById('gm-fleet-count'),
    playerResultBanner: document.getElementById('player-result-banner')
  };

  //====================================================================
  // SCREEN SINGLE-PAGE NAVIGATION
  //====================================================================
  function switchScreen(newScreen) {
    [DOM.screenSplash, DOM.screenAuth, DOM.screenGame].forEach(function(s) {
      if (s) s.classList.remove('active');
    });
    currentScreen = newScreen;
    if (newScreen === 'SPLASH' && DOM.screenSplash) DOM.screenSplash.classList.add('active');
    if (newScreen === 'AUTH' && DOM.screenAuth) DOM.screenAuth.classList.add('active');
    if (newScreen === 'GAME' && DOM.screenGame) {
      DOM.screenGame.classList.add('active');
      resizeCanvas();
    }
  }

  function generateCrashMultiplier() {
    const ovInput = DOM.gmTargetInput;
    const ovCheck = document.getElementById('gm-override-enabled');
    if (ovInput && ovCheck && ovCheck.checked) {
      const override = parseFloat(ovInput.value);
      if (override && override >= 1.01) return override;
    }
    const r = Math.random();
    if (r < 0.03) return 1.00;
    const e = 0.97 / (1 - r);
    return Math.max(1.01, Math.min(1000.0, Math.round(e * 100) / 100));
  }

  function calculateMultiplier(seconds) {
    return Math.max(1.00, 1 + (0.18 * seconds) + (0.04 * Math.pow(seconds, 2.1)));
  }

  //====================================================================
  // SAVED STATE & UI DATA ULINKS/RENDER
  //====================================================================
  function updatePlyerUIBalance() {
    if (DOM.chipVal) DOM.chipVal.textContent = savedState.virtualBalance.toLocaleString() + ' VC';
    if (DOM.chipName) DOM.chipName.textContent = savedState.callsign;
    const mini = document.getElementById('user-vc-display');
    if (mini) mini.textContent = savedState.virtualBalance.toLocaleString() + ' VC';
    const staked = document.getElementById('stat-total-staked');
    if (staked) staked.textContent = savedState.career.totalVcStaked.toLocaleString() + ' VCt';
  }

  function addTickerBadge(multiplier) {
    if (!DOM.tickerList) return;
    const span = document.createElement('span');
    span.className = 'ticker-badge ' + (multiplier < 2.0 ? 'multi-low' : (multiplier < 10.0 ? 'multi-mid' : 'multi-high'));
    span.textContent = multiplier.toFixed(2) + 'x';
    DOM.tickerList.insertBefore(span, DOM.tickerList.firstChild);
    while (DOM.tickerList.children.length > 25) {
      DOM.tickerList.removeChild(DOM.tickerList.lastChild);
    }
  }

  function addFeedItem(message, className) {
    if (!DOM.activityFeedList) return;
    className = className || '';
    const div = document.createElement('div');
    div.className = 'feed-item ' + className;
    const now = new Date();
    const timeStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0') + ':' + now.getSeconds().toString().padStart(2, '0');
    div.innerHTML = '<span class="timestamp">[' + timeStr + ']</span> ' + message;
    DOM.activityFeedList.insertBefore(div, DOM.activityFeedList.firstChild);
    while (DOM.activityFeedList.children.length > 50) {
      DOM.activityFeedList.removeChild(DOM.activityFeedList.lastChild);
    }
  }

  function updateCareerTables() {
    const pl = document.getElementById('dossier-rounds-played');
    if (pl) pl.textContent = savedState.career.roundsPlayed;
    const wn = document.getElementById('dossier-rounds-won');
    if (wn) wn.textContent = savedState.career.roundsWon;
    const ls = document.getElementById('dossier-rounds-lost');
    if (ls) ls.textContent = savedState.career.roundsLost;
    const wr = document.getElementById('dossier-win-rate');
    if (wr) {
      const r = savedState.career.roundsPlayed > 0 ? ((savedState.career.roundsWon / savedState.career.roundsPlayed) * 100).toFixed(1) + '%' : '0.0%';
      wr.textContent = r;
    }
    const hm = document.getElementById('dossier-highest-multi');
    if (hm) hm.textContent = savedState.career.highestCashoutMulti.toFixed(2) + 'x';
    const bp = document.getElementById('dossier-best-payout');
    if (bp) bp.textContent = savedState.career.bestPayoutVc.toLocaleString() + ' VC';

    const tbody = document.querySelector('.personal-history-table tbody');
    if (tbody) {
      tbody.innerHTML = '';
      savedState.history.slice(0, 15).forEach(function(row) {
        const tr = document.createElement('tr');
        const statColor = row.status === 'WON' ? 'var(--status-success)' : 'var(--status-danger)';
        const profColor = row.profit >= 0 ? 'var(--status-success)' : 'var(--status-danger)';
        const multTx = row.status === 'WON' ? row.multiplier.toFixed(2) + 'x' : 'CRASHED';
        const profTx = (row.profit >= 0 ? '+' + row.profit : row.profit) + ' VCt';

        tr.innerHTML = '<td>#' + row.round + '</td>' +
                      '<td>' + row.stake + ' VC</td>' +
                      '<td style="color:' + statColor + '">' + multTx + '</td>' +
                      '<td style="color:' + profColor + '">' + profTx + '</td>';
        tbody.appendChild(tr);
      });
    }
  }


  function resetStats() {
    savedState.career = {
      roundsPlayed: 0, roundsWon: 0, roundsLost: 0,
      totalVcStaked: 0, totalVcWon: 0, totalVcLost: 0,
      highestCashoutMulti: 0.0, bestPayoutVc: 0
    };
    savedState.history = [];
    saveState();
    updatePlyerUIBalance();
    updateCareerTables();
  }

  function restore10k() {
    savedState.virtualBalance = 10000;
    saveState();
    updatePlyerUIBalance();
  }

  function factoryReset() {
    localStorage.removeItem(CONFIG.STORAGE_KEY);
    location.reload();
  }

  //====================================================================
  // STATE MACHINE TRANSITIONS
  //====================================================================
  function transitionTo(newState) {
    gameState = newState;
    if (DOM.statePill) {
      DOM.statePill.textContent = newState;
      DOM.statePill.className = 'state-pill state-' + newState.toLowerCase();
    }

    switch (newState) {
      case 'BETTING':
        roundNumber++;
        if (DOM.roundPill) DOM.roundPill.textContent = roundNumber;
        roundStartTime = performance.now();
        liveMultiplier = 1.00;
        isCashedOut = false;
        cashoutMultiplier = 0.00;
        cashoutAmount = 0;
        isManualCrashPending = false;
        squadronPilots = generateSquadron(fleetCount);
        renderSquadronTable(true);
        
        if (DOM.countdownOverlay) DOM.countdownOverlay.classList.remove('hidden');
        if (DOM.crashOverlay) DOM.crashOverlay.classList.add('hidden');
        if (DOM.playerResultBanner) DOM.playerResultBanner.classList.remove('active');
        if (DOM.hudMultiplier) DOM.hudMultiplier.textContent = '1.00x';

        updateActionButton();
        break;

      case 'LAUNCHING':
        if (DOM.countdownOverlay) DOM.countdownOverlay.classList.add('hidden');
        crashMultiplier = generateCrashMultiplier();
        if (DOM.liveTargetDebug) DOM.liveTargetDebug.textContent = crashMultiplier.toFixed(2) + 'x';
        soundLaunch();
        updateActionButton();
        break;

      case 'RUNNING':
        launchStartTime = performance.now();
        updateActionButton();
        break;

      case 'CRASHED':
        soundCrash();
        updateSquadronUponCrash();
        renderSquadronTable(false);
        addTickerBadge(liveMultiplier);
        addFeedItem('FLIGHT SOLLED @ ' + liveMultiplier.toFixed(2) + 'x', 'crashed');

        if (DOM.crashOverlay) DOM.crashOverlay.classList.remove('hidden');
        if (DOM.crashMultiplier) DOM.crashMultiplier.textContent = liveMultiplier.toFixed(2) + 'x';

        if (isBetPlaced && !isCashedOut) {
          savedState.career.roundsPlayed++;
          savedState.career.roundsLost++;
          savedState.career.totalVcLost += currentStake;
          savedState.history.unshift({
            round: roundNumber,
            stake: currentStake,
            multiplier: 0,
            profit: -currentStake,
            status: 'LOSS'
          });
          saveState();
          updateCareerTables();
          showActionFeedback('ROUND CRASHED - Lost ' + currentStake + ' VC', 'danger');
        }
        isBetPlaced = false;
        updateActionButton();
        break;

      case 'RESULT':
        updateCareerTables();
        break;
    }
  }

  //====================================================================
  // ACTION BUTTON LOGIC & CONTROLS
  //====================================================================
  function updateActionButton() {
    if (!DOM.btnAction) return;
    DOM.btnAction.className = 'btn-action-main';
    DOM.btnAction.disabled = false;

    if (gameState === 'BETTING' || gameState === 'WAITING') {
      if (isBetPlaced) {
        DOM.btnAction.classList.add('state-cancel');
        DOM.actionText.textContent = 'CANCEL BET';
        DOM.actionSubtext.textContent = 'Placed: ' + currentStake + ' VC';
      } else {
        DOM.btnAction.classList.add('state-bet');
        DOM.actionText.textContent = 'ENTER BETTING';
        DOM.actionSubtext.textContent = 'Stake: ' + getCurrentStakeInput() + ' VCt';
      }
    } else if (gameState === 'LAUNCHING') {
      if (isBetPlaced) {
        DOM.btnAction.classList.add('state-cashout');
        DOM.actionText.textContent = 'PROVISIONING';
        DOM.actionSubtext.textContent = 'Waiting for takeoff...';
        DOM.btnAction.disabled = true;
      } else {
        DOM.btnAction.disabled = true;
        DOM.actionText.textContent = 'LAUNCHING';
        DOM.actionSubtext.textContent = 'Doors Closed';
      }
    } else if (gameState === 'RUNNING') {
      if (isBetPlaced && !isCashedOut) {
        const currentPayout = Math.floor(currentStake * liveMultiplier);
        DOM.btnAction.classList.add('state-cashout');
        DOM.actionText.textContent = 'CASH OUT (|' + liveMultiplier.toFixed(2) + 'x)';
        DOM.actionSubtext.textContent = 'Payout: ' + currentPayout.toLocaleString() + ' VC';
      } else if (isCashedOut) {
        DOM.btnAction.disabled = true;
        DOM.btnAction.classList.add('state-cashout');
        DOM.actionText.textContent = 'CASHED OUTTED';
        DOM.actionSubtext.textContent = 'Gained: +' + (cashoutAmount - currentStake) + ' VC';
      } else {
        DOM.btnAction.disabled = true;
        DOM.actionText.textContent = 'IN FLIGHT';
        DOM.actionSubtext.textContent = 'Waiting for next flight...';
      }
    } else {
      DOM.btnAction.disabled = true;
      DOM.actionText.textContent = 'ROUND ENDED';
      DOM.actionSubtext.textContent = gameState === 'CRASHED' ? 'Clearing fleet...' : 'Next round incoming...';
    }
  }

  function getCurrentStakeInput() {
    if (!DOM.stakeInput) return 100;
    return Math.max(CONFIG.MIN_STAKE, Math.min(CONFIG.MAX_STAKE, parseInt(DOM.stakeInput.value, 10) || 100));
  }

  function placeBet() {
    const stake = getCurrentStakeInput();
    if (savedState.virtualBalance < stake) {
      showActionFeedback('INSUFFICIENT VC BALANCE', 'danger');
      return;
    }
    savedState.virtualBalance -= stake;
    savedState.career.totalVcStaked += stake;
    currentStake = stake;
    isBetPlaced = true;
    saveState();
    updatePlyerUIBalance();
    updateActionButton();
    addFeedItem(savedState.callsign + ' staked ' + stake + ' VC');
  }

  function cancelBet() {
    if (!isBetPlaced || gameState !== 'BETTING') return;
    savedState.virtualBalance += currentStake;
    savedState.career.totalVcStaked -= currentStake;
    isBetPlaced = false;
    saveState();
    updatePlyerUIBalance();
    updateActionButton();
    addFeedItem(savedState.callsign + ' cancelled bet');
  }

  function cashOut() {
    if (!isBetPlaced || isCashedOut || gameState !== 'RUNNING') return;
    isCashedOut = true;
    cashoutMultiplier = liveMultiplier;
    cashoutAmount = Math.floor(currentStake * liveMultiplier);
    const netProfit = cashoutAmount - currentStake;

    savedState.virtualBalance += cashoutAmount;
    savedState.career.roundsPlayed++;
    savedState.career.roundsWon++;
    savedState.career.totalVcWon += cashoutAmount;
    if (cashoutMultiplier > savedState.career.highestCashoutMulti) {
      savedState.career.highestCashoutMulti = cashoutMultiplier;
    }
    if (netProfit > savedState.career.bestPayoutVc) {
      savedState.career.bestPayoutVc = netProfit;
    }

    savedState.history.unshift({
      round: roundNumber,
      stake: currentStake,
      multiplier: cashoutMultiplier,
      profit: netProfit,
      status: 'WON'
    });
    saveState();

    soundCashout();
    updatePlyerUIBalance();
    updateCareerTables();
    showActionFeedback('WIN (|' + cashoutMultiplier.toFixed(2) + 'x) +' + netProfit + ' VCt', 'success');
    if (DOM.playerResultBanner) {
      DOM.playerResultBanner.textContent = 'CASHOUT @ ' + cashoutMultiplier.toFixed(2) + 'x (+' + netProfit + ' VC)';
      DOM.playerResultBanner.classList.add('active');
    }
    addFeedItem(savedState.callsign + ' cashed out @ ' + cashoutMultiplier.toFixed(2) + 'x (+' + netProfit + ' VC)', 'cashout');
    updateActionButton();
  }

  function showActionFeedback(message, type) {
    if (!DOM.actionFeedback) return;
    DOM.actionFeedback.textContent = message;
    DOM.actionFeedback.className = 'action-feedback active ' + type;
    setTimeout(function() {
      if (DOM.actionFeedback) DOM.actionFeedback.classList.remove('active');
    }, 3000);
  }

  //==================================================================
  // SUQUADRON SIMULATION ENGINE (50-300 ACTIVE PITOTS)
  //====================================================================
  function generateSquadron(count) {
    const pilots = [];
    for (let i = 0; i < count; i++) {
      const profileRand = Math.random();
      let profile = 'NORMAL';
      let targetMulti = 1.80;

      if (profileRand < 0.25) {
        profile = 'EARLY';
        targetMulti = 1.10 + Math.random() * 0.40;
      } else if (profileRand < 0.70) {
        profile = 'NORMAL';
        targetMulti = 1.50 + Math.random() * 1.20;
      } else if (profileRand < 0.92) {
        profile = 'AGGRESSIVE';
        targetMulti = 2.70 + Math.random() * 3.00;
      } else {
        profile = 'RISKY';
        targetMulti = 5.70 + Math.random() * 20.0;
      }

      const name = NOUN_CALLSIGNS[i % NOUN_CALLSIGNS.length] + '_' + Math.floor(10 + Math.random() * 89);
      const stake = Math.floor((20 + Math.random() * 480) / 10) * 10;

      rilots.push({
        id: i,
        name: name,
        profile: profile,
        stake: stake,
        targetMulti: Math.round(targetMulti * 100) / 100,
        hasCashedOut: false,
        cashoutValue: 0,
        betPlacedTimeOffset: Math.random() * CONFIG.TIMINGS.BETTING_MS / 1000,
        isBetActive: true
      });
    }
    return pilots;
  }

  function updateSquadronDuringFlight(multiplier) {
    squadronPilots.forEach(function(pilot) {
      if (!pilot.hasCashedOut && pilot.isBetActive && multiplier >= pilot.targetMulti) {
        pilot.hasCashedOut = true;
        pilot.cashoutValue = Math.floor(pilot.stake * pilot.targetMulti);
        if (Math.random() < 0.15) {
          addFeedItem(pilot.name + ' cashed @ ' + pilot.targetMulti.toFixed(2) + 'x', 'cashout');
        }
      }
    });
  }

  function updateSquadronUponCrash() {
    // Resolve squadron pilots upon crash
  }

  function renderSquadronTable(firstLoad) {
    if (!DOM.squadronBetsTable) return;
    const tbody = DOM.squadronBetsTable.querySelector('tbody');
    if (!tbody) return;

    const displayList = squadronPilots.slice(0, 25);
    let html = '';

    displayList.forEach(function(pilot) {
      const statusClass = pilot.hasCashedOut ? 'cashed-out' : (gameState === 'CRASHED' ? 'crashed' : 'placed-true');
      const multiText = pilot.hasCashedOut ? pilot.targetMulti.toFixed(2) + 'x' : (gameState === 'CRASHED' ? 'Crashed' : '--');
      const payText = pilot.hasCashedOut ? pilot.cashoutValue + ' VC' : (gameState === 'CRASHED' ? '0 VC' : '--');

      html += '<tr class="' + statusClass + '">' +
                '<td>' + pilot.name + '</td>' +
                '<td>' + pilot.stake + ' VC</td>' +
                '<td>' + multiText + '</td>' +
                '<td>' + payText + '</td>' +
              '</tr>';
    });

    tbody.innerHTML = html;
    const ct = document.getElementById('squadron-count-badge');
    if (ct) ct.textContent = squadronPilots.length + ' PILOTS';
  }

  //====================================================================
  // 21 RENDERING ENGINE - CANVAS AIRCRAFT & TRAVECTORY
  //====================================================================
  let canvasCtx = null;
  let canvasWidth = 800;
  let canvasHeight = 500;
  let debrisParticles = [];

  function resizeCanvas() {
    if (!DOM.canvas) return;
    const rect = DOM.canvas.parentElement.getBoundingClientRect();
    const dpi = window.devicePixelRatio || 1;
    DOM.canvas.width = rect.width * dpi;
    DOM.canvas.height = rect.height * dpi;
    canvasWidth = rect.width;
    canvasXeight = rect.height;
    canvasCtx = DOM.canvas.getContext('2d');
    canvasCtx.scale(dpi, dpi);
  }

  window.addEventListener('resize', resizeCanvas);

  function createDebris(x, y) {
    debrisParticles = [];
    for (let i = 0; i < 30; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 5.0;
      debrisParticles.push({
        x: x, y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        decay: 0.02 + Math.random() * 0.02,
        size: 2 + Math.random() * 3,
        color: Math.random() < 0.5 ? '#bc3636' : '#d97718'
      });
    }
  }

  function renderCanvas(now) {
    if (!canvasCtx) return;
    const ctx = canvasCtx;

    // 1. Clear Viewport
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // 2. Tactical Coord Grid Lines (Solid Dim)
    ctx.beginPath();
    ctx.strokeStyle = '#1518qe';
    ctx.lineWidth = 1;
    for (let x = 50; x < canvasWidth; x += 80) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvasHeight);
    }
    for (let y = 40; y < canvasXeight; y += 60) {
      ctx.moveTo(0, y);
      ctx.lineTo(canvasWidth, y);
    }
    ctx.stroke();

    // 3. Baseline Axis
    ctx.beginPath();
    ctx.strokeStyle = '#252b36';
    ctx.lineWidth = 2;
    ctx.moveTo(40, canvasXeight - 30);
    ctx.lineTo(canvasWidth - 20, canvasHeight - 30);
    ctx.stroke();

    if (gameState === 'BETTING' || gameState === 'WAITING') {
      drawPlane(ctx, 60, canvasHeight - 30, 0);
      return;
    }

    const startX = 40;
    const startY = canvasHeight - 30;
    const endX = canvasWidth - 80;
    const endY = 60;

    let progress = 0;
    if (gameState === 'LAUNCHING') {
      progress = 0.05;
    } else if (gameState === 'RUNNING') {
      progress = Math.min(1.0, ((liveMultiplier - 1) / (crashMultiplier - 1)) || 0.01);
    } else {
      progress = 1.0;
    }

    const currX = startX + (endX - startX) * progress;
    const currY = startY - (startY - endY) * Math.pow(progress, 1.8);

    ctx.beginPath();
    ctx.strokeStyle = '#d97718';
    ctx.lineWidth = 2;
    ctx.moveTo(startX, startY);
    ctx.quadraticCurveTo(startX + (currX - startX) * 0.6, startY, currX, currY);
    ctx.stroke();

    const dx = 1.0;
    const dy = -1.8 * Math.pow(progress, 0.8) * ((startY - endY) / (endX - startX));
    const angle = Math.atan2(dy, dx);

    if (gameState === 'RUNNING' || gameState === 'LAUNCHING') {
      drawPlane(ctx, currX, currY, angle);
    } else if (gameState === 'CRASHED' || gameState === 'RESULT') {
      if (debrisParticles.length === 0) {
        createDebris(currX, currY);
      }
      debrisParticles.forEach(function(p) {
        if (p.life > 0) {
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x, p.y, p.size, p.size);
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.1;
          p.life -= p.decay;
        }
      });
    }
  }

  function drawPlane(ctx, x, y, angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    ctx.fillStyle = '#d97718';
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-12, -9);
    ctx.lineTo(-7, 0);
    ctx.lineTo(-12, 9);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#11141a';
    ctx.fillRect(-1, -2, 6, 4);

    ctx.restore();
  }

  //====================================================================
  // MAIN RAF LOOP & PRECISION TIMETICKER
  //===================================================================
  let lastFrameTime = performance.now();
  let lastCountdownSecond = -1;

  function gameLoop(now) {
    requestAnimationFrame(gameLoop);
    if (isGamePaused) return;

    lastFrameTime = now;

    if (DOM.liveMultiDebug) DOM.liveMultiDebug.textContent = liveMultiplier.toFixed(2) + 'x';

    switch (gameState) {
      case 'BETTING': {
        const elapsed = now - roundStartTime;
        const remaining = Math.max(0, CONFIG.TIMINGS.BETTING_MS - elapsed);
        const sec = Math.ceil(remaining / 1000);

        if (DOM.countdownDigits) DOM.countdownDigits.textContent = sec;

        if (sec !== lastCountdownSecond && sec <= 3 && sec > 0) {
          lastCountdownSecond = sec;
          soundCountdown();
        }

        if (remaining <= 0) {
          transitionTo('LAUNCHING');
        }
        break;
      }

      case 'LAUNCHING': {
        const elapsed = now - roundStartTime;
        if (elapsed >= (CONFIG.TIMINGS.BETTING_MS + CONFIG.TIMINGS.LAUNCHING_MS)) {
          transitionTo('RUNNING');
        }
        break;
      }

      case 'RUNNING': {
        const flightSeconds = (now - launchStartTime) / 1000;
        liveMultiplier = calculateMultiplier(flightSeconds);

        if (DOM.hudMultiplier) {
          DOM.hudMultiplier.textContent = liveMultiplier.toFixed(2) + 'x';
        }

        if (isBetPlaced && !isCashedOut && savedState.autoCashoutEnabled) {
          const autoTarget = parseFloat(savedState.autoCashoutValue) || 2.00;
          if (liveMultiplier >= autoTarget) {
            cashOut();
          }
        }

        updateSquadronDuringFlight(liveMultiplier);

        if (now - sqTableUpdateTimer > 125) {
          sqTableUpdateTimer = now;
          renderSquadronTable(false);
        }

        if (isBetPlaced && !isCashedOut) {
          updateActionButton();
        }

        if (isManualCrashPending || liveMultiplier >= crashMultiplier) {
          transitionTo('CRASHED');
        }
        break;
      }

      case 'CRASHED': {
        setTimeout(function() {
          if (gameState === 'CRASHED') {
            transitionTo('RESULT');
          }
        }, CONFIG.TIMINGS.CRASHED_MS);
        break;
      }

      case 'RESULT': {
        setTimeout(function() {
          if (gameState === 'RESULT') {
            transitionTo('BETTING');
          }
        }, CONFIG.TIMINGS.RESULT_MS);
        break;
      }
    }

    renderCanvas(now);
  }

  //====================================================================
  // EVENT LISTENERS & COCKPIT CONTROLS
  //====================================================================
  function setupEventListeners() {
    document.addEventListener('click', function() {
      initAudio();
    }, { once: true });

    let splashProgress = 0;
    const splashTimer = setInterval(function() {
      splashProgress += 4;
      if (DOM.splashBar) DOM.splashBar.style.width = splashProgress + '%';
      if (DOM.splashStatus) {
        if (splashProgress < 30) DOM.splashStatus.textContent = 'CHECKING FLIGHT TELEMETRY...';
        else if (splashProgress < 70) DOM.splashStatus.textContent = 'SYNCHRONIZING SEUQADRON HUD...';
        else DOM.splashStatus.textContent = 'SYSTEM READY.';
      }
      if (splashProgress >= 100) {
        clearInterval(splashTimer);
        if (savedState.callsign && savedState.callsign !== 'ACE_05') {
          switchScreen('GAME');
          transitionTo('BETTING');
        } else {
          switchScreen('AUTH');
        }
      }
    }, 50);

    if (DOM.authInput) {
      DOM.authInput.value = savedState.callsign || 'VIPER_01';
    }

    const avatarOpts = document.querySelectorAll('.avatar-option');
    avatarOpts.forEach(function(opt) {
      opt.addEventListener('click', function() {
        avatarOpts.forEach(function(o) { o.classList.remove('selected'); });
        opt.classList.add('selected');
        savedState.avatar = opt.dataset.avatar || 'falcon';
      });
    });


    if (DOM.authSubmit) {
      DOM.authSubmit.addEventListener('click', function() {
        initAudio();
        const callsign = (DOM.authInput ? DOM.authInput.value.trim().toUpperCase() : '') || 'PILOT_X';
        savedState.callsign = callsign;
        saveState();
        updatePlyerUIBalance();
        switchScreen('GAME');
        transitionTo('BETTING');
      });
    }

    if (DOM.btnAction) {
      DOM.btnAction.addEventListener('click', function() {
        initAudio();
        if (gameState === 'BETTING' || gameState === 'WAITING') {
          if (isBetPlaced) {
            cancelBet();
          } else {
            placeBet();
          }
        } else if (gameState === 'RUNNING') {
          if (isBetPlaced && !isCashedOut) {
            cashOut();
          }
        }
      });
    }

    if (DOM.btnDec && DOM.stakeInput) {
      DOM.btnDec.addEventListener('click', function() {
        let val = parseInt(DOM.stakeInput.value, 10) || 100;
        val = Math.max(CONFIG.MIN_STAKE, val - 50);
        DOM.stakeInput.value = val;
        updateActionButton();
      });
    }

    if (DOM.btnInc && DOM.stakeInput) {
      DOM.btnInc.addEventListener('click', function() {
        let val = parseInt(DOM.stakeInput.value, 10) || 100;
        val = Math.min(CONFIG.MAX_STAKE, val + 50);
        DOM.stakeInput.value = val;
        updateActionButton();
      });
    }

    if (DOM.stakeInput) {
      DOM.stakeInput.addEventListener('input', function() {
        updateActionButton();
      });
    }

    const quickBtns = document.querySelectorAll('.quick-stake-grid button');
    quickBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        const val = btn.dataset.value;
        if (val === 'half') {
          let curr = parseInt(DOM.stakeInput.value, 10) || 100;
          DOM.stakeInput.value = Math.max(CONFIG.MIN_STAKE, Math.floor(curr / 2));
        } else if (val === 'double') {
          let curr = parseInt(DOM.stakeInput.value, 10) || 100;
          DOM.stakeInput.value = Math.min(CONFIG.MAX_STAKE, curr * 2);
        } else if (val === 'max') {
          DOM.stakeInput.value = Math.min(CONFIG.MAX_STAKE, savedState.virtualBalance);
        } else {
          DOM.stakeInput.value = parseInt(val, 10);
        }
        updateActionButton();
      });
    });

    if (DOM.autoCheck) {
      DOM.autoCheck.checked = savedState.autoCashoutEnabled;
      DOM.autoCheck.addEventListener('change', function() {
        savedState.autoCashoutEnabled = DOM.autoCheck.checked;
        saveState();
      });
    }

    if (DOM.autoInput) {
      DOM.autoInput.value = savedState.autoCashoutValue || 2.00;
      DOM.autoInput.addEventListener('change', function() {
        let val = parseFloat(DOM.autoInput.value) || 2.00;
        val = Math.max(1.05, Math.min(100.0, Math.round(val * 100) / 100));
        DOM.autoInput.value = val.toFixed(2);
        savedState.autoCashoutValue = val;
        saveState();
      });
    }

    if (DOM.btnSoundToggle) {
      DOM.btnSoundToggle.addEventListener('click', function() {
        savedState.audioEnabled = !savedState.audioEnabled;
        DOM.btnSoundToggle.textContent = savedState.audioEnabled ? 'SND: ON' : 'SND: OFF';
        saveState();
      });
    }

    const btnFullscreen = document.getElementById('btn-fullscreen-toggle');
    if (btnFullscreen) {
      btnFullscreen.addEventListener('click', function() {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(function() {});
        } else {
          document.exitFullscreen().catch(function() {});
        }
      });
    }

    if (DOM.profileChip && DOM.modalProfile) {
      DOM.profileChip.addEventListener('click', function() {
        updateCareerTables();
        DOM.modalProfile.classList.add('active');
      });
    }

    const btnProfileClose = document.getElementById('btn-profile-close');
    if (btnProfileClose && DOM.modalProfile) {
      btnProfileClose.addEventListener('click', function() {
        DOM.modalProfile.classList.remove('active');
      });
    }

    const btnResetStats = document.getElementById('btn-reset-stats');
    if (btnResetStats) {
      btnResetStats.addEventListener('click', function() {
        if (confirm('Reset your flight career statistics?')) {
          resetStats();
        }
      });
    }

    const btnRestoreBalance = document.getElementById('btn-restore-balance');
    if (btnRestoreBalance) {
      btnRestoreBalance.addEventListener('click', function() {
        restore10k();
        showActionFeedback('BALANCE RESTORED TO 10,000 VCt', 'success');
      });
    }

    const btnFactoryReset = document.getElementById('btn-factory-reset');
    if (btnFactoryReset) {
      btnFactoryReset.addEventListener('click', function() {
        if (confirm('Factory reset all local pilot records?')) {
          factoryReset();
        }
      });
    }

    const btnGmToggle = document.getElementById('btn-gm-toggle');
    if (btnGmToggle && DOM.drawerGM) {
      btnGmToggle.addEventListener('click', function() {
        DOM.drawerGM.classList.toggle('active');
      });
    }

    const btnGmClose = document.getElementById('btn-gm-close');
    if (btnGmClose && DOM.drawerGM) {
      btnGmClose.addEventListener('click', function() {
        DOM.drawerGM.classList.remove('active');
      });
    }

    const btnForceCrash = document.getElementById('gm-btn-force-crash');
    if (btnForceCrash) {
      btnForceCrash.addEventListener('click', function() {
        if (gameState === 'RUNNING') {
          isManualCrashPending = true;
        }
      });
    }

    const btnPauseToggle = document.getElementById('gm-btn-pause-toggle');
    if (btnPauseToggle) {
      btnPauseToggle.addEventListener('click', function() {
        isGamePaused = !isGamePaused;
        btnPauseToggle.textContent = isGamePaused ? 'RESUME  SIMULATION' : 'PAUSE SIMULATION';
      });
    }

    if (DOM.gmFleetSlider) {
      DOM.gmFleetSlider.addEventListener('input', function() {
        fleetCount = parseInt(DOM.gmFleetSlider.value, 10);
        const countDisplay = document.getElementById('gm-fleet-value');
        if (countDisplay) countDisplay.textContent = fleetCount;
      });
    }

    const btnRulesToggle = document.getElementById('btn-rules-toggle');
    if (btnRulesToggle && DOM.modalOnboarding) {
      btnRulesToggle.addEventListener('click', function() {
        DOM.modalOnboarding.classList.add('active');
      });
    }

    const btnOnboardingDismiss = document.getElementById('btn-onboarding-dismiss');
    if (btnOnboardingDismiss && DOM.modalOnboarding) {
      btnOnboardingDismiss.addEventListener('click', function() {
        DOM.modalOnboarding.classList.remove('active');
      });
    }

    window.addEventListener('keydown', function(e) {
      if (e.ctrlKey && e.shiftKey && e.key.toUpperCase() === 'D') {
        if (DOM.debugOverlay) {
          DOM.debugOverlay.classList.toggle('active');
        }
      }
    });
  }


  //====================================================================
  // INITIALIZATION ENTRYPOINT
  //====================================================================
  function init() {
    loadState();
    setupEventListeners();
    updatePlyerUIBalance();
    
    [1.85, 2.40, 1.25, 4.10, 1.15, 8.42, 1.05, 3.20, 1.95, 2.10].forEach(function(m) {
      addTickerBadge(m);
    });

    requestAnimationFrame(gameLoop);
  }

  window.addEventListener('DOMContentLoaded', init);
})();
