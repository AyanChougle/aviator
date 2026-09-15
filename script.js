/**
 * AERO CRASH - TACTICAL FLIGHT SIMULATOR
 * Firebase Authenticated // Role-Based Game Master // ₹10 - ₹8,000 INR Staking
 */

(function () {
  "use strict";

  //===================================================================
  // CONSTANTS & CONFIG
  //===================================================================
  const CONFIG = {
    STORAGE_KEY: "aero_crash_rupees_v1",
    INITIAL_BALANCE: 10, // ₹10 Free Credit
    MIN_STAKE: 10,       // ₹10 minimum
    MAX_STAKE: 8000,     // ₹8,000 maximum
    TIMINGS: {
      SPLASH_MS: 1800,
      BETTING_MS: 8000,
      LAUNCHING_MS: 1000,
      CRASHED_MS: 1500,
      RESULT_MS: 2000,
    },
  };

  const NOUN_CALLSIGNS = [
    "FALCON", "STORM", "VECTOR", "BLADE", "UMBRA", "NEBULA",
    "NOVA_X", "CHAOS", "QUARK", "HYDRA", "ZEPHYR", "SHADOW", "TITAN", "VIPER"
  ];

  let savedState = {
    callsign: "MAVERICK",
    userEmail: "",
    userRole: "user", // "user" | "admin"
    isLoggedIn: false,
    virtualBalance: CONFIG.INITIAL_BALANCE,
    career: {
      roundsPlayed: 0,
      roundsWon: 0,
      roundsLost: 0,
      totalVcStaked: 0,
      totalVcWon: 0,
      totalVcLost: 0,
      highestCashoutMulti: 0.0,
      bestPayoutVc: 0,
    },
    history: [],
    autoStake: 10,
    autoCashoutEnabled: false,
    autoCashoutValue: 2.0,
    audioEnabled: true,
  };

  function loadState() {
    try {
      const data = localStorage.getItem(CONFIG.STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        savedState = Object.assign(savedState, parsed);
      }
    } catch (e) {
      console.warn("Failed to load storage", e);
    }
  }

  function saveState(options) {
    options = options || {};
    try {
      localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(savedState));
      // Also sync to Firestore if user is authenticated
      if (options.syncFirestore !== false && window.AERO_FIREBASE && window.AERO_FIREBASE.auth && window.AERO_FIREBASE.auth.currentUser && window.AERO_FIREBASE.db) {
        const uid = window.AERO_FIREBASE.auth.currentUser.uid;
        window.AERO_FIREBASE.db.collection("users").doc(uid).set({
          callsign: savedState.callsign,
          role: savedState.userRole,
          balance: savedState.virtualBalance,
          career: savedState.career,
          lastActive: new Date()
        }, { merge: true }).catch(function() {});
      }
    } catch (e) {
      console.warn("Failed to save storage", e);
    }
  }

  //====================================================================
  // WEB AUDIO SYNTHESIZER
  //====================================================================
  let audioCtx = null;
  function initAudio() {
    if (!audioCtx) {
      const ACtx = window.AudioContext || window.webkitAudioContext;
      if (ACtx) audioCtx = new ACtx();
    }
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume();
    }
  }

  function playBeep(freq, duration, type) {
    if (!audioCtx || !savedState.audioEnabled) return;
    type = type || "square";
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

  function soundCountdown() { playBeep(440, 0.08, "square"); }
  function soundLaunch() { playBeep(880, 0.25, "triangle"); }
  function soundCashout() {
    playBeep(523, 0.1, "sine");
    setTimeout(function () { playBeep(659, 0.15, "sine"); }, 90);
    setTimeout(function () { playBeep(784, 0.25, "sine"); }, 180);
  }
  function soundCrash() {
    if (!audioCtx || !savedState.audioEnabled) return;
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(160, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(30, audioCtx.currentTime + 0.45);
      gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.45);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch (e) {}
  }

  //====================================================================
  // CORE GAME STATE
  //====================================================================
  let currentScreen = "SPLASH";
  let gameState = "WAITING";
  let roundNumber = 10189;
  let roundStartTime = 0;
  let launchStartTime = 0;
  let liveMultiplier = 1.0;
  let crashMultiplier = 2.5;
  let isManualCrashPending = false;
  let isGamePaused = false;
  let fleetCount = 150;
  let sqTableUpdateTimer = 0;

  let isBetPlaced = false;
  let currentStake = 10;
  let isCashedOut = false;
  let cashoutMultiplier = 0.0;
  let cashoutAmount = 0;

  let squadronPilots = [];
  let currentAuthMode = "login"; // "login" | "register" | "admin"

  //====================================================================
  // DOM ELEMENTS CACHE
  //====================================================================
  const DOM = {
    screenSplash: document.getElementById("screen-splash"),
    screenAuth: document.getElementById("screen-auth"),
    screenPayment: document.getElementById("screen-payment"),
    screenGame: document.getElementById("screen-game"),

    splashBar: document.getElementById("splash-bar"),
    splashStatus: document.getElementById("splash-status"),

    // Auth
    authTabs: document.querySelectorAll(".auth-tab-btn"),
    authTitle: document.getElementById("auth-main-title"),
    authDesc: document.getElementById("auth-main-desc"),
    authStatusBox: document.getElementById("auth-status-box"),
    authGroupCallsign: document.getElementById("group-auth-callsign"),
    authCallsignInput: document.getElementById("auth-callsign-input"),
    authEmailInput: document.getElementById("auth-email-input"),
    authPasswordInput: document.getElementById("auth-password-input"),
    authSubmit: document.getElementById("btn-auth-submit"),

    // Payment / Wallet
    paymentBalance: document.getElementById("payment-current-balance"),
    depositAlert: document.getElementById("deposit-status-alert"),
    depositChips: document.querySelectorAll(".deposit-chip-btn"),
    depositInput: document.getElementById("input-deposit-amount"),
    paymentMethodItems: document.querySelectorAll(".payment-method-item"),
    btnConfirmDeposit: document.getElementById("btn-confirm-deposit"),
    btnPaymentProceed: document.getElementById("btn-payment-proceed"),
    btnOpenDepositHeader: document.getElementById("btn-open-deposit"),
    btnOpenDepositDossier: document.getElementById("btn-open-deposit-from-dossier"),

    // Cockpit
    roundPill: document.getElementById("round-id-placeholder"),
    statePill: document.getElementById("agy-state-pill"),
    btnGmToggle: document.getElementById("btn-gm-toggle"),
    profileChip: document.getElementById("btn-profile-chip"),
    chipName: document.getElementById("profile-chip-name"),
    chipVal: document.getElementById("profile-chip-balance"),
    tickerList: document.getElementById("history-ticker-list"),

    // Controls
    stakeInput: document.getElementById("input-stake"),
    btnDec: document.getElementById("btn-stake-dec"),
    btnInc: document.getElementById("btn-stake-inc"),
    autoCheck: document.getElementById("check-auto-cashout"),
    autoInput: document.getElementById("input-auto-cashout"),
    btnAction: document.getElementById("btn-action"),
    actionText: document.getElementById("action-btn-text"),
    actionSub: document.getElementById("action-btn-subtext"),
    actionSubtext: document.getElementById("action-btn-subtext"),
    actionFeedback: document.getElementById("action-feedback"),
    userBalanceDisplay: document.getElementById("user-vc-display"),
    totalStakedDisplay: document.getElementById("stat-total-staked"),

    // Arena & Canvas
    canvas: document.getElementById("flight-canvas"),
    countdownOverlay: document.getElementById("countdown-overlay"),
    countdownDigits: document.getElementById("countdown-digits"),
    crashOverlay: document.getElementById("crash-overlay"),
    crashMultiplier: document.getElementById("crash-multiplier"),
    hudContainer: document.getElementById("hud-multiplier-container"),
    hudMultiplier: document.getElementById("hud-multiplier"),
    playerResultBanner: document.getElementById("player-result-banner"),

    // Floor dock
    squadronBetsTable: document.getElementById("squadron-bets-table"),
    squadronCountBadge: document.getElementById("squadron-count-badge"),
    activityFeedList: document.getElementById("activity-feed-list"),

    // Modals
    modalProfile: document.getElementById("modal-profile"),
    btnProfileClose: document.getElementById("btn-profile-close"),
    btnAuthSignout: document.getElementById("btn-auth-signout"),
    dossierRole: document.getElementById("dossier-user-role"),
    dossierBalance: document.getElementById("dossier-display-balance"),
    drawerGM: document.getElementById("drawer-game-master"),
    btnGmClose: document.getElementById("btn-gm-close"),
    modalOnboarding: document.getElementById("modal-onboarding"),
    btnRulesToggle: document.getElementById("btn-rules-toggle"),
    btnOnboardingDismiss: document.getElementById("btn-onboarding-dismiss"),
    debugOverlay: document.getElementById("debug-overlay"),
    liveMultiDebug: document.getElementById("debug-live-multi"),
    liveTargetDebug: document.getElementById("debug-target-multi"),
    btnSoundToggle: document.getElementById("btn-sound-toggle"),
    btnFullscreenToggle: document.getElementById("btn-fullscreen-toggle"),

    // GM Controls
    gmTargetInput: document.getElementById("gm-target-input"),
    gmOverrideEnabled: document.getElementById("gm-override-enabled"),
    gmFleetSlider: document.getElementById("gm-fleet-count"),
    gmFleetValue: document.getElementById("gm-fleet-value"),
    gmBtnForceCrash: document.getElementById("gm-btn-force-crash"),
    gmBtnPauseToggle: document.getElementById("gm-btn-pause-toggle"),
  };

  //====================================================================
  // SCREEN NAVIGATION
  //====================================================================
  function switchScreen(newScreen) {
    [DOM.screenSplash, DOM.screenAuth, DOM.screenPayment, DOM.screenGame].forEach(function (s) {
      if (s) s.classList.remove("active");
    });
    currentScreen = newScreen;

    if (newScreen === "SPLASH" && DOM.screenSplash) DOM.screenSplash.classList.add("active");
    if (newScreen === "AUTH" && DOM.screenAuth) DOM.screenAuth.classList.add("active");
    if (newScreen === "PAYMENT" && DOM.screenPayment) {
      DOM.screenPayment.classList.add("active");
      updatePaymentUI();
    }
    if (newScreen === "GAME" && DOM.screenGame) {
      DOM.screenGame.classList.add("active");
      applyRoleAccess();
      updatePlayerUIBalance();
      resizeCanvas();
    }
  }

  //====================================================================
  // ROLE-BASED ACCESS CONTROL (GAME MASTER: ADMIN ONLY)
  //====================================================================
  function applyRoleAccess() {
    const isAdmin = savedState.userRole === "admin";
    if (DOM.btnGmToggle) {
      DOM.btnGmToggle.style.display = isAdmin ? "inline-flex" : "none";
    }
    if (DOM.dossierRole) {
      DOM.dossierRole.textContent = isAdmin ? "GAME MASTER (ADMIN)" : "LICENSED PILOT";
      DOM.dossierRole.style.color = isAdmin ? "var(--status-warning)" : "var(--status-success)";
    }
  }

  function generateCrashMultiplier() {
    const ovInput = DOM.gmTargetInput;
    const ovCheck = DOM.gmOverrideEnabled;
    if (savedState.userRole === "admin" && ovInput && ovCheck && ovCheck.checked) {
      const override = parseFloat(ovInput.value);
      if (override && override >= 1.01) return override;
    }
    const r = Math.random();
    if (r < 0.03) return 1.0;
    const e = 0.97 / (1 - r);
    return Math.max(1.01, Math.min(1000.0, Math.round(e * 100) / 100));
  }

  function calculateMultiplier(seconds) {
    return Math.max(1.0, 1 + 0.18 * seconds + 0.04 * Math.pow(seconds, 2.1));
  }

  //====================================================================
  // BALANCE & UI RENDERING IN RUPEES (₹)
  //====================================================================
  function formatRupees(amount) {
    return "₹" + Number(amount || 0).toLocaleString("en-IN");
  }

  function updatePlayerUIBalance() {
    const formatted = formatRupees(savedState.virtualBalance);
    if (DOM.chipVal) DOM.chipVal.textContent = formatted;
    if (DOM.chipName) DOM.chipName.textContent = savedState.callsign;
    if (DOM.userBalanceDisplay) DOM.userBalanceDisplay.textContent = formatted;
    if (DOM.dossierBalance) DOM.dossierBalance.textContent = formatted;
    if (DOM.totalStakedDisplay) DOM.totalStakedDisplay.textContent = formatRupees(savedState.career.totalVcStaked);
    updatePaymentUI();
  }

  function updatePaymentUI() {
    if (DOM.paymentBalance) {
      DOM.paymentBalance.textContent = formatRupees(savedState.virtualBalance);
    }
    if (DOM.btnPaymentProceed) {
      DOM.btnPaymentProceed.textContent = "ENTER FLIGHT DECK (" + formatRupees(savedState.virtualBalance) + " AVAILABLE)";
    }
  }

  function addTickerBadge(multiplier) {
    if (!DOM.tickerList) return;
    const span = document.createElement("span");
    span.className = "ticker-badge " + (multiplier < 2.0 ? "multi-low" : multiplier < 10.0 ? "multi-mid" : "multi-high");
    span.textContent = multiplier.toFixed(2) + "x";
    DOM.tickerList.insertBefore(span, DOM.tickerList.firstChild);
    while (DOM.tickerList.children.length > 25) {
      DOM.tickerList.removeChild(DOM.tickerList.lastChild);
    }
  }

  function addFeedItem(message, className) {
    if (!DOM.activityFeedList) return;
    className = className || "";
    const div = document.createElement("div");
    div.className = "feed-item " + className;
    const now = new Date();
    const timeStr = now.getHours().toString().padStart(2, "0") + ":" +
                    now.getMinutes().toString().padStart(2, "0") + ":" +
                    now.getSeconds().toString().padStart(2, "0");
    div.innerHTML = '<span class="timestamp">[' + timeStr + "]</span> " + message;
    DOM.activityFeedList.insertBefore(div, DOM.activityFeedList.firstChild);
    while (DOM.activityFeedList.children.length > 50) {
      DOM.activityFeedList.removeChild(DOM.activityFeedList.lastChild);
    }
  }

  function updateCareerTables() {
    const pl = document.getElementById("dossier-rounds-played");
    if (pl) pl.textContent = savedState.career.roundsPlayed;
    const wn = document.getElementById("dossier-rounds-won");
    if (wn) wn.textContent = savedState.career.roundsWon;
    const ls = document.getElementById("dossier-rounds-lost");
    if (ls) ls.textContent = savedState.career.roundsLost;
    const wr = document.getElementById("dossier-win-rate");
    if (wr) {
      const r = savedState.career.roundsPlayed > 0
        ? ((savedState.career.roundsWon / savedState.career.roundsPlayed) * 100).toFixed(1) + "%"
        : "0.0%";
      wr.textContent = r;
    }
    const hm = document.getElementById("dossier-highest-multi");
    if (hm) hm.textContent = savedState.career.highestCashoutMulti.toFixed(2) + "x";
    const bp = document.getElementById("dossier-best-payout");
    if (bp) bp.textContent = formatRupees(savedState.career.bestPayoutVc);

    const tbody = document.querySelector(".personal-history-table tbody");
    if (tbody) {
      tbody.innerHTML = "";
      savedState.history.slice(0, 15).forEach(function (row) {
        const tr = document.createElement("tr");
        const statColor = row.status === "WON" ? "var(--status-success)" : "var(--status-danger)";
        const profColor = row.profit >= 0 ? "var(--status-success)" : "var(--status-danger)";
        const multTx = row.status === "WON" ? row.multiplier.toFixed(2) + "x" : "CRASHED";
        const profTx = (row.profit >= 0 ? "+" : "") + formatRupees(row.profit);

        tr.innerHTML =
          "<td>#" + row.round + "</td>" +
          "<td>" + formatRupees(row.stake) + "</td>" +
          '<td style="color:' + statColor + '">' + multTx + "</td>" +
          '<td style="color:' + profColor + '">' + profTx + "</td>";
        tbody.appendChild(tr);
      });
    }
  }

  //====================================================================
  // STATE MACHINE TRANSITIONS (NO OVERLAPPING MULTIPLIER NUMBERS)
  //====================================================================
  function transitionTo(newState) {
    gameState = newState;
    if (DOM.statePill) {
      DOM.statePill.textContent = newState;
      DOM.statePill.className = "state-pill state-" + newState.toLowerCase();
    }

    switch (newState) {
      case "BETTING":
        roundNumber++;
        if (DOM.roundPill) DOM.roundPill.textContent = "#" + roundNumber;
        roundStartTime = performance.now();
        liveMultiplier = 1.0;
        isCashedOut = false;
        cashoutMultiplier = 0.0;
        cashoutAmount = 0;
        isManualCrashPending = false;
        squadronPilots = generateSquadron(fleetCount);
        renderSquadronTable(true);

        // SHOW countdown, HIDE multiplier (NO COLLISION!)
        if (DOM.countdownOverlay) DOM.countdownOverlay.classList.remove("hidden");
        if (DOM.crashOverlay) DOM.crashOverlay.classList.add("hidden");
        if (DOM.hudContainer) DOM.hudContainer.classList.add("hidden");
        if (DOM.playerResultBanner) DOM.playerResultBanner.classList.remove("active");
        if (DOM.hudMultiplier) DOM.hudMultiplier.textContent = "1.00x";

        updateActionButton();
        break;

      case "LAUNCHING":
        // HIDE countdown, SHOW multiplier upon takeoff!
        if (DOM.countdownOverlay) DOM.countdownOverlay.classList.add("hidden");
        if (DOM.crashOverlay) DOM.crashOverlay.classList.add("hidden");
        if (DOM.hudContainer) DOM.hudContainer.classList.remove("hidden");
        if (DOM.hudMultiplier) DOM.hudMultiplier.textContent = "1.00x";

        crashMultiplier = generateCrashMultiplier();
        if (DOM.liveTargetDebug) DOM.liveTargetDebug.textContent = crashMultiplier.toFixed(2) + "x";
        soundLaunch();
        updateActionButton();
        break;

      case "RUNNING":
        launchStartTime = performance.now();
        // Ensure multiplier container is visible and countdown is hidden
        if (DOM.countdownOverlay) DOM.countdownOverlay.classList.add("hidden");
        if (DOM.crashOverlay) DOM.crashOverlay.classList.add("hidden");
        if (DOM.hudContainer) DOM.hudContainer.classList.remove("hidden");
        updateActionButton();
        break;

      case "CRASHED":
        soundCrash();
        updateSquadronUponCrash();
        renderSquadronTable(false);
        addTickerBadge(liveMultiplier);
        addFeedItem("FLIGHT CRASHED @ " + liveMultiplier.toFixed(2) + "x", "crashed");

        // HIDE multiplier, SHOW crash overlay
        if (DOM.hudContainer) DOM.hudContainer.classList.add("hidden");
        if (DOM.crashOverlay) DOM.crashOverlay.classList.remove("hidden");
        if (DOM.crashMultiplier) DOM.crashMultiplier.textContent = liveMultiplier.toFixed(2) + "x";

        if (isBetPlaced && !isCashedOut) {
          savedState.career.roundsPlayed++;
          savedState.career.roundsLost++;
          savedState.career.totalVcLost += currentStake;
          savedState.history.unshift({
            round: roundNumber,
            stake: currentStake,
            multiplier: 0,
            profit: -currentStake,
            status: "LOSS",
          });
          saveState();
          updateCareerTables();
          showActionFeedback("CRASHED - Lost " + formatRupees(currentStake), "danger");
        }
        isBetPlaced = false;
        updateActionButton();

        setTimeout(function () {
          if (gameState === "CRASHED") {
            transitionTo("RESULT");
          }
        }, CONFIG.TIMINGS.CRASHED_MS);
        break;

      case "RESULT":
        updateCareerTables();
        setTimeout(function () {
          if (gameState === "RESULT") {
            transitionTo("BETTING");
          }
        }, CONFIG.TIMINGS.RESULT_MS);
        break;
    }
  }

  //====================================================================
  // ACTION BUTTON & BETTING LOGIC (₹10 - ₹8,000)
  //====================================================================
  function getCurrentStakeInput() {
    if (!DOM.stakeInput) return CONFIG.MIN_STAKE;
    let val = parseInt(DOM.stakeInput.value, 10) || CONFIG.MIN_STAKE;
    return Math.max(CONFIG.MIN_STAKE, Math.min(CONFIG.MAX_STAKE, val));
  }

  function updateActionButton() {
    if (!DOM.btnAction) return;
    DOM.btnAction.className = "btn-action-main";
    DOM.btnAction.disabled = false;

    if (gameState === "BETTING" || gameState === "WAITING") {
      if (isBetPlaced) {
        DOM.btnAction.classList.add("state-cancel");
        DOM.actionText.textContent = "CANCEL BET";
        if (DOM.actionSubtext) DOM.actionSubtext.textContent = "Staked: " + formatRupees(currentStake);
      } else {
        DOM.btnAction.classList.add("state-bet");
        DOM.actionText.textContent = "ENTER BETTING";
        if (DOM.actionSubtext) DOM.actionSubtext.textContent = "Stake: " + formatRupees(getCurrentStakeInput());
      }
    } else if (gameState === "LAUNCHING") {
      if (isBetPlaced) {
        DOM.btnAction.classList.add("state-cashout");
        DOM.actionText.textContent = "AIRBORNE SOON";
        if (DOM.actionSubtext) DOM.actionSubtext.textContent = "Engines Spooling...";
        DOM.btnAction.disabled = true;
      } else {
        DOM.btnAction.disabled = true;
        DOM.actionText.textContent = "TAKEOFF";
        if (DOM.actionSubtext) DOM.actionSubtext.textContent = "Doors Closed";
      }
    } else if (gameState === "RUNNING") {
      if (isBetPlaced && !isCashedOut) {
        const currentPayout = Math.floor(currentStake * liveMultiplier);
        DOM.btnAction.classList.add("state-cashout");
        DOM.actionText.textContent = "CASH OUT (" + liveMultiplier.toFixed(2) + "x)";
        if (DOM.actionSubtext) DOM.actionSubtext.textContent = "Payout: " + formatRupees(currentPayout);
      } else if (isCashedOut) {
        DOM.btnAction.disabled = true;
        DOM.btnAction.classList.add("state-cashout");
        DOM.actionText.textContent = "CASHED OUT";
        if (DOM.actionSubtext) DOM.actionSubtext.textContent = "Won: +" + formatRupees(cashoutAmount - currentStake);
      } else {
        DOM.btnAction.disabled = true;
        DOM.actionText.textContent = "IN FLIGHT";
        if (DOM.actionSubtext) DOM.actionSubtext.textContent = "Waiting for next round...";
      }
    } else {
      DOM.btnAction.disabled = true;
      DOM.actionText.textContent = "ROUND SETTLED";
      if (DOM.actionSubtext) DOM.actionSubtext.textContent = gameState === "CRASHED" ? "Flight crashed" : "Preparing round...";
    }
  }

  function placeBet() {
    const stake = getCurrentStakeInput();
    if (savedState.virtualBalance < stake) {
      showActionFeedback("INSUFFICIENT BALANCE // ADD FUNDS", "danger");
      // Open payment deposit
      switchScreen("PAYMENT");
      return;
    }
    savedState.virtualBalance -= stake;
    savedState.career.totalVcStaked += stake;
    currentStake = stake;
    isBetPlaced = true;
    saveState();
    updatePlayerUIBalance();
    updateActionButton();
    addFeedItem(savedState.callsign + " staked " + formatRupees(stake));
  }

  function cancelBet() {
    if (!isBetPlaced || gameState !== "BETTING") return;
    savedState.virtualBalance += currentStake;
    savedState.career.totalVcStaked -= currentStake;
    isBetPlaced = false;
    saveState();
    updatePlayerUIBalance();
    updateActionButton();
    addFeedItem(savedState.callsign + " cancelled bet");
  }

  function cashOut() {
    if (!isBetPlaced || isCashedOut || gameState !== "RUNNING") return;
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
      status: "WON",
    });
    saveState();

    soundCashout();
    updatePlayerUIBalance();
    updateCareerTables();
    showActionFeedback("WON (" + cashoutMultiplier.toFixed(2) + "x) +" + formatRupees(netProfit), "success");
    if (DOM.playerResultBanner) {
      DOM.playerResultBanner.textContent = "CASHOUT @" + cashoutMultiplier.toFixed(2) + "x (+" + formatRupees(netProfit) + ")";
      DOM.playerResultBanner.classList.add("active");
    }
    addFeedItem(savedState.callsign + " cashed out @" + cashoutMultiplier.toFixed(2) + "x (+" + formatRupees(netProfit) + ")", "cashout");
    updateActionButton();
  }

  function showActionFeedback(message, type) {
    if (!DOM.actionFeedback) return;
    DOM.actionFeedback.textContent = message;
    DOM.actionFeedback.className = "action-feedback active " + type;
    setTimeout(function () {
      if (DOM.actionFeedback) DOM.actionFeedback.classList.remove("active");
    }, 3000);
  }

  //====================================================================
  // SQUADRON SIMULATION (Stakes in ₹)
  //====================================================================
  function generateSquadron(count) {
    const pilots = [];
    for (let i = 0; i < count; i++) {
      const profileRand = Math.random();
      let profile = "NORMAL";
      let targetMulti = 1.8;

      if (profileRand < 0.25) {
        profile = "EARLY";
        targetMulti = 1.1 + Math.random() * 0.4;
      } else if (profileRand < 0.7) {
        profile = "NORMAL";
        targetMulti = 1.5 + Math.random() * 1.2;
      } else if (profileRand < 0.92) {
        profile = "AGGRESSIVE";
        targetMulti = 2.7 + Math.random() * 3.0;
      } else {
        profile = "RISKY";
        targetMulti = 5.7 + Math.random() * 20.0;
      }

      const name = NOUN_CALLSIGNS[i % NOUN_CALLSIGNS.length] + "_" + Math.floor(10 + Math.random() * 89);
      // Stakes from ₹10 to ₹8000
      const stakeChoices = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 8000];
      const stake = stakeChoices[Math.floor(Math.random() * stakeChoices.length)];

      pilots.push({
        id: i,
        name: name,
        profile: profile,
        stake: stake,
        targetMulti: Math.round(targetMulti * 100) / 100,
        hasCashedOut: false,
        cashoutValue: 0,
        isBetActive: true,
      });
    }
    return pilots;
  }

  function updateSquadronDuringFlight(multiplier) {
    squadronPilots.forEach(function (pilot) {
      if (!pilot.hasCashedOut && pilot.isBetActive && multiplier >= pilot.targetMulti) {
        pilot.hasCashedOut = true;
        pilot.cashoutValue = Math.floor(pilot.stake * pilot.targetMulti);
        if (Math.random() < 0.15) {
          addFeedItem(pilot.name + " cashed @" + pilot.targetMulti.toFixed(2) + "x (+" + formatRupees(pilot.cashoutValue) + ")", "cashout");
        }
      }
    });
  }

  function updateSquadronUponCrash() {}

  function renderSquadronTable(firstLoad) {
    if (!DOM.squadronBetsTable) return;
    const tbody = DOM.squadronBetsTable.querySelector("tbody");
    if (!tbody) return;

    const displayList = squadronPilots.slice(0, 25);
    let html = "";
    displayList.forEach(function (pilot) {
      const statusClass = pilot.hasCashedOut ? "cashed-out" : gameState === "CRASHED" ? "crashed" : "placed-true";
      const multiText = pilot.hasCashedOut ? pilot.targetMulti.toFixed(2) + "x" : gameState === "CRASHED" ? "Crashed" : "--";
      const payText = pilot.hasCashedOut ? formatRupees(pilot.cashoutValue) : gameState === "CRASHED" ? "₹0" : "--";

      html += '<tr class="' + statusClass + '">' +
        "<td>" + pilot.name + "</td>" +
        "<td>" + formatRupees(pilot.stake) + "</td>" +
        "<td>" + multiText + "</td>" +
        "<td>" + payText + "</td>" +
        "</tr>";
    });

    tbody.innerHTML = html;
    if (DOM.squadronCountBadge) DOM.squadronCountBadge.textContent = squadronPilots.length + " PILOTS";
  }

  //====================================================================
  // CANVAS ENGINE (FLIGHT PATH & PARTICLES)
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
    canvasHeight = rect.height;
    canvasCtx = DOM.canvas.getContext("2d");
    canvasCtx.scale(dpi, dpi);
  }

  window.addEventListener("resize", resizeCanvas);

  function createDebris(x, y) {
    debrisParticles = [];
    for (let i = 0; i < 30; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 5.0;
      debrisParticles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        decay: 0.02 + Math.random() * 0.02,
        size: 2 + Math.random() * 3,
        color: Math.random() < 0.5 ? "#bc3636" : "#d97718",
      });
    }
  }

  function renderCanvas(now) {
    if (!canvasCtx) return;
    const ctx = canvasCtx;

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Tactical Coord Grid Lines
    ctx.beginPath();
    ctx.strokeStyle = "#18202c";
    ctx.lineWidth = 1;
    for (let x = 50; x < canvasWidth; x += 80) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvasHeight);
    }
    for (let y = 40; y < canvasHeight; y += 60) {
      ctx.moveTo(0, y);
      ctx.lineTo(canvasWidth, y);
    }
    ctx.stroke();

    // Baseline Axis
    ctx.beginPath();
    ctx.strokeStyle = "#252b36";
    ctx.lineWidth = 2;
    ctx.moveTo(40, canvasHeight - 30);
    ctx.lineTo(canvasWidth - 20, canvasHeight - 30);
    ctx.stroke();

    if (gameState === "BETTING" || gameState === "WAITING") {
      drawPlane(ctx, 60, canvasHeight - 30, 0);
      return;
    }

    const startX = 40;
    const startY = canvasHeight - 30;
    const endX = canvasWidth - 80;
    const endY = 60;

    let progress = 0;
    if (gameState === "LAUNCHING") {
      progress = 0.05;
    } else if (gameState === "RUNNING") {
      progress = Math.min(1.0, (liveMultiplier - 1) / (crashMultiplier - 1) || 0.01);
    } else {
      progress = 1.0;
    }

    const currX = startX + (endX - startX) * progress;
    const currY = startY - (startY - endY) * Math.pow(progress, 1.8);

    ctx.beginPath();
    ctx.strokeStyle = "#d97718";
    ctx.lineWidth = 2;
    ctx.moveTo(startX, startY);
    ctx.quadraticCurveTo(startX + (currX - startX) * 0.6, startY, currX, currY);
    ctx.stroke();

    const dx = 1.0;
    const dy = -1.8 * Math.pow(progress, 0.8) * ((startY - endY) / (endX - startX));
    const angle = Math.atan2(dy, dx);

    if (gameState === "RUNNING" || gameState === "LAUNCHING") {
      drawPlane(ctx, currX, currY, angle);
    } else if (gameState === "CRASHED" || gameState === "RESULT") {
      if (debrisParticles.length === 0) {
        createDebris(currX, currY);
      }
      debrisParticles.forEach(function (p) {
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

    ctx.fillStyle = "#d97718";
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-12, -9);
    ctx.lineTo(-7, 0);
    ctx.lineTo(-12, 9);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#11141a";
    ctx.fillRect(-1, -2, 6, 4);

    ctx.restore();
  }

  //====================================================================
  // RAF GAME LOOP (REAL-TIME MULTIPLIER DISPLAY)
  //====================================================================
  let lastCountdownSecond = -1;

  function gameLoop(now) {
    requestAnimationFrame(gameLoop);
    if (isGamePaused) return;

    if (DOM.liveMultiDebug) DOM.liveMultiDebug.textContent = liveMultiplier.toFixed(2) + "x";

    switch (gameState) {
      case "BETTING": {
        const elapsed = now - roundStartTime;
        const remaining = Math.max(0, CONFIG.TIMINGS.BETTING_MS - elapsed);
        const sec = Math.ceil(remaining / 1000);

        if (DOM.countdownDigits) DOM.countdownDigits.textContent = sec;

        if (sec !== lastCountdownSecond && sec <= 3 && sec > 0) {
          lastCountdownSecond = sec;
          soundCountdown();
        }

        if (remaining <= 0) {
          transitionTo("LAUNCHING");
        }
        break;
      }

      case "LAUNCHING": {
        const elapsed = now - roundStartTime;
        if (elapsed >= CONFIG.TIMINGS.BETTING_MS + CONFIG.TIMINGS.LAUNCHING_MS) {
          transitionTo("RUNNING");
        }
        break;
      }

      case "RUNNING": {
        const flightSeconds = (now - launchStartTime) / 1000;
        liveMultiplier = calculateMultiplier(flightSeconds);

        // UPDATE HUD MULTIPLIER NUMBERS IN REAL-TIME!
        if (DOM.hudMultiplier) {
          DOM.hudMultiplier.textContent = liveMultiplier.toFixed(2) + "x";
        }
        if (DOM.hudContainer) {
          DOM.hudContainer.classList.remove("hidden");
        }

        if (isBetPlaced && !isCashedOut && savedState.autoCashoutEnabled) {
          const autoTarget = parseFloat(savedState.autoCashoutValue) || 2.0;
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
          transitionTo("CRASHED");
        }
        break;
      }

      case "CRASHED":
      case "RESULT":
        break;
    }

    renderCanvas(now);
  }

  //====================================================================
  // FIREBASE AUTHENTICATION & BACKEND DETECTION CONTROLLER
  //====================================================================
  let userDocUnsubscribe = null;

  function listenToUserDoc(uid) {
    if (userDocUnsubscribe) {
      userDocUnsubscribe();
      userDocUnsubscribe = null;
    }
    const fb = window.AERO_FIREBASE;
    if (!fb || !fb.db || !uid) return;

    userDocUnsubscribe = fb.db.collection("users").doc(uid).onSnapshot(function (doc) {
      if (!doc.exists) return;
      const d = doc.data() || {};
      let changed = false;
      if (typeof d.balance === "number" && Math.abs(d.balance - savedState.virtualBalance) > 0.001) {
        savedState.virtualBalance = d.balance;
        changed = true;
      }
      if (d.role && d.role !== savedState.userRole) {
        savedState.userRole = d.role;
        changed = true;
        applyRoleAccess();
      }
      if (d.callsign && d.callsign !== savedState.callsign) {
        savedState.callsign = d.callsign;
        changed = true;
      }
      if (d.career && typeof d.career === "object") {
        savedState.career = Object.assign(savedState.career, d.career);
        changed = true;
      }
      if (changed) {
        saveState({ syncFirestore: false });
        updatePlayerUIBalance();
        if (DOM.paymentBalance) DOM.paymentBalance.textContent = formatRupees(savedState.virtualBalance);
      }
    }, function (err) {
      // A denied listener must not spam the console or break the local session.
      if (err && err.code === "permission-denied") {
        if (userDocUnsubscribe) userDocUnsubscribe();
        userDocUnsubscribe = null;
        return;
      }
      console.warn("[AeroCrash] Firestore snapshot warning:", err && err.message ? err.message : err);
    });
  }

  function detectAndSyncBackend(user, authMode, callsignInput) {
    const fb = window.AERO_FIREBASE;
    showAuthStatus("Loading pilot profile...", "info");

    if (!user) {
      throw new Error("No authenticated Firebase user was supplied.");
    }

    const isAdminByEmail = fb ? fb.isAdminEmail(user.email) : false;
    const defaultRole = isAdminByEmail ? "admin" : "user";
    const defaultCallsign = callsignInput || (user.email ? user.email.split("@")[0].toUpperCase() : "MAVERICK");

    function applyLocalProfile(data) {
      data = data || {};
      const finalRole = (data.role === "admin" || isAdminByEmail) ? "admin" : (data.role || defaultRole);
      const balance = typeof data.balance === "number" ? data.balance : CONFIG.INITIAL_BALANCE;
      const callsign = data.callsign || defaultCallsign;

      if (authMode === "admin" && finalRole !== "admin") {
        if (fb && fb.auth) fb.auth.signOut().catch(function () {});
        throw new Error("Access Denied: Account '" + user.email + "' is not authorized as Game Master.");
      }

      savedState.userEmail = user.email || "";
      savedState.callsign = callsign;
      savedState.userRole = finalRole;
      savedState.virtualBalance = balance;
      savedState.isLoggedIn = true;
      if (data.career && typeof data.career === "object") {
        savedState.career = Object.assign(savedState.career, data.career);
      }
      saveState({ syncFirestore: false });
      updatePlayerUIBalance();
      applyRoleAccess();
      return { finalRole: finalRole, balance: balance, callsign: callsign };
    }

    // Firebase Auth is authoritative for identity. Firestore is profile persistence only.
    // If Firestore is unavailable/denied, keep the authenticated session alive locally.
    if (!fb || !fb.db) {
      applyLocalProfile();
      completeLoginRouting(authMode);
      return Promise.resolve();
    }

    const userRef = fb.db.collection("users").doc(user.uid);
    return userRef.get().then(function (docSnap) {
      const data = docSnap.exists ? (docSnap.data() || {}) : {};
      const profile = applyLocalProfile(data);

      const userUpdate = {
        uid: user.uid,
        email: user.email || "",
        role: profile.finalRole,
        callsign: profile.callsign,
        balance: profile.balance,
        lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
        lastDevice: navigator.userAgent
      };
      if (!docSnap.exists) {
        userUpdate.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        userUpdate.loginCount = 1;
      } else {
        userUpdate.loginCount = firebase.firestore.FieldValue.increment(1);
      }

      // Profile write is best-effort. Rules should allow only the user's own document.
      return userRef.set(userUpdate, { merge: true })
        .catch(function (err) {
          if (!err || err.code !== "permission-denied") {
            console.warn("[AeroCrash] Firestore profile sync warning:", err && err.message ? err.message : err);
          }
        })
        .then(function () {
          // Audit logging is also best-effort; failure must never invalidate authentication.
          return fb.db.collection("login_logs").add({
            uid: user.uid,
            email: user.email || "",
            role: profile.finalRole,
            authMode: authMode,
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            balanceSnapshot: profile.balance,
            device: navigator.userAgent,
            status: "AUTHENTICATED"
          }).catch(function (err) {
            if (!err || err.code !== "permission-denied") {
              console.warn("[AeroCrash] Login audit warning:", err && err.message ? err.message : err);
            }
          });
        })
        .then(function () {
          console.log("[AeroCrash] Authentication/session sync complete for:", user.email, "Role:", profile.finalRole);
          listenToUserDoc(user.uid);
          completeLoginRouting(authMode);
        });
    }).catch(function (err) {
      if (err && err.code === "permission-denied") {
        // Do not turn a Firestore rules problem into an authentication failure.
        applyLocalProfile();
        showAuthStatus("Authenticated. Cloud profile sync is unavailable; using local session.", "success");
        completeLoginRouting(authMode);
        return;
      }
      throw err;
    });
  }

  function completeLoginRouting(authMode) {
    const isAdmin = savedState.userRole === "admin";
    showAuthStatus("Verified by Backend! Security: " + (isAdmin ? "GAME MASTER (ADMIN)" : "LICENSED PILOT"), "success");

    setTimeout(function () {
      if (DOM.authSubmit) {
        DOM.authSubmit.disabled = false;
        DOM.authSubmit.textContent = authMode === "admin"
          ? "SIGN IN AS GAME MASTER"
          : (authMode === "register" ? "CREATE ID & GET ₹10 BONUS" : "SIGN IN & PROCEED");
      }

      if (isAdmin) {
        switchScreen("GAME");
        transitionTo("BETTING");
      } else {
        switchScreen("PAYMENT");
      }
    }, 600);
  }

  function setupAuthFlow() {
    // Mode tab switching
    DOM.authTabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        DOM.authTabs.forEach(function (t) { t.classList.remove("active"); });
        tab.classList.add("active");
        currentAuthMode = tab.dataset.mode || "login";

        hideAuthStatus();

        const noticeEl = document.getElementById("auth-notice-text");
        const hintEl = document.getElementById("auth-hint");

        if (currentAuthMode === "register") {
          DOM.authTitle.textContent = "CREATE PILOT ID";
          DOM.authDesc.textContent = "Register a new pilot callsign. Free ₹10 signup credit allotted instantly.";
          DOM.authGroupCallsign.style.display = "flex";
          DOM.authSubmit.textContent = "CREATE ID & GET ₹10 BONUS";
          if (hintEl) hintEl.textContent = "FREE ₹10 SIGNUP ALLOTMENT APPLIED AUTOMATICALLY";
          if (noticeEl) noticeEl.innerHTML = "New registrations receive <strong>₹10 Free Credits</strong> instantly. Stake per bet: <strong>₹10 to ₹8,000</strong>.";
          if (DOM.authEmailInput) DOM.authEmailInput.placeholder = "pilot@aerocrash.com";
        } else if (currentAuthMode === "admin") {
          DOM.authTitle.textContent = "ADMINISTRATOR ACCESS";
          DOM.authDesc.textContent = "Sign in with admin credentials to unlock Game Master telemetry overrides.";
          DOM.authGroupCallsign.style.display = "none";
          DOM.authSubmit.textContent = "SIGN IN AS GAME MASTER";
          if (hintEl) hintEl.textContent = "AUTHORIZED: carrentpedatabase@gmail.com / PROJECT: CARRENTPEWEB";
          if (noticeEl) noticeEl.innerHTML = "Authorized Admin: <strong>carrentpedatabase@gmail.com</strong>. Unlocks Game Master Drawer, Multiplier Override & Live Flight Control.";
          if (DOM.authEmailInput && !DOM.authEmailInput.value) DOM.authEmailInput.placeholder = "carrentpedatabase@gmail.com";
        } else {
          DOM.authTitle.textContent = "OPERATOR LOGIN";
          DOM.authDesc.textContent = "Sign in with your registered Pilot ID to access the flight arena.";
          DOM.authGroupCallsign.style.display = "none";
          DOM.authSubmit.textContent = "SIGN IN & PROCEED";
          if (hintEl) hintEl.textContent = "FIREBASE SECURE CLOUD AUTHENTICATION [CARRENTPEWEB]";
          if (noticeEl) noticeEl.innerHTML = "Registered pilots: Sign in to resume flight telemetry with your saved wallet balance.";
          if (DOM.authEmailInput) DOM.authEmailInput.placeholder = "pilot@aerocrash.com";
        }
      });
    });

    // Form submission
    if (DOM.authSubmit) {
      DOM.authSubmit.addEventListener("click", handleAuthSubmit);
    }
  }

  function showAuthStatus(msg, type) {
    if (!DOM.authStatusBox) return;
    DOM.authStatusBox.textContent = msg;
    DOM.authStatusBox.className = "auth-status-box " + type;
  }

  function hideAuthStatus() {
    if (!DOM.authStatusBox) return;
    DOM.authStatusBox.className = "auth-status-box";
    DOM.authStatusBox.textContent = "";
  }

  function handleAuthSubmit() {
    initAudio();
    hideAuthStatus();

    const email = (DOM.authEmailInput ? DOM.authEmailInput.value.trim() : "");
    const password = (DOM.authPasswordInput ? DOM.authPasswordInput.value : "");
    const callsign = (DOM.authCallsignInput ? DOM.authCallsignInput.value.trim().toUpperCase() : "") || "PILOT_" + Math.floor(100 + Math.random() * 899);

    if (!email || !password) {
      showAuthStatus("Please enter both email address and password.", "error");
      return;
    }

    DOM.authSubmit.disabled = true;
    DOM.authSubmit.textContent = "AUTHENTICATING...";

    const fb = window.AERO_FIREBASE;

    if (fb && fb.auth) {
      if (currentAuthMode === "register") {
        fb.auth.createUserWithEmailAndPassword(email, password)
          .then(function (cred) {
            return detectAndSyncBackend(cred.user, "register", callsign);
          })
          .catch(function (err) {
            DOM.authSubmit.disabled = false;
            DOM.authSubmit.textContent = "CREATE ID & GET ₹10 BONUS";
            if (err.code === "auth/email-already-in-use") {
              showAuthStatus("This email is already registered. Please use PILOT LOGIN tab.", "error");
            } else if (err.code === "auth/weak-password") {
              showAuthStatus("Password should be at least 6 characters.", "error");
            } else {
              showAuthStatus("Registration failed: " + err.message, "error");
            }
          });
      } else {
        // Login or Admin
        fb.auth.signInWithEmailAndPassword(email, password)
          .then(function (cred) {
            return detectAndSyncBackend(cred.user, currentAuthMode, callsign);
          })
          .catch(function (err) {
            console.warn("[AeroCrash] Signin attempt failed:", err.code, err.message);

            DOM.authSubmit.disabled = false;
            DOM.authSubmit.textContent = currentAuthMode === "admin" ? "SIGN IN AS GAME MASTER" : "SIGN IN & PROCEED";

            if (err.code === "auth/user-not-found") {
              showAuthStatus("Pilot account not found. Click 'CREATE ID' to register and claim ₹10 bonus.", "error");
            } else if (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
              showAuthStatus("Invalid password or credentials for this account.", "error");
            } else {
              showAuthStatus("Authentication failed: " + err.message, "error");
            }
          });
      }
    } else {
      // Offline mock fallback
      const isAdmin = (currentAuthMode === "admin") || email.toLowerCase().includes("admin") || (fb && fb.isAdminEmail(email));
      savedState.userEmail = email;
      savedState.callsign = callsign || email.split("@")[0].toUpperCase();
      savedState.userRole = isAdmin ? "admin" : "user";
      savedState.isLoggedIn = true;
      saveState();

      showAuthStatus("Offline login verified! Redirecting...", "success");
      completeLoginRouting(currentAuthMode);
    }
  }

  //====================================================================
  // PAYMENT & WALLET DEPOSIT CONTROLLER
  //====================================================================
  function setupPaymentFlow() {
    // Quick deposit chip buttons
    DOM.depositChips.forEach(function (btn) {
      btn.addEventListener("click", function () {
        DOM.depositChips.forEach(function (b) { b.classList.remove("selected"); });
        btn.classList.add("selected");
        const amt = parseInt(btn.dataset.amt, 10) || 100;
        if (DOM.depositInput) DOM.depositInput.value = amt;
        if (DOM.btnConfirmDeposit) DOM.btnConfirmDeposit.textContent = "ADD " + formatRupees(amt) + " TO WALLET";
      });
    });

    if (DOM.depositInput) {
      DOM.depositInput.addEventListener("input", function () {
        const amt = parseInt(DOM.depositInput.value, 10) || 0;
        DOM.depositChips.forEach(function (b) { b.classList.remove("selected"); });
        if (DOM.btnConfirmDeposit) DOM.btnConfirmDeposit.textContent = "ADD " + formatRupees(amt) + " TO WALLET";
      });
    }

    // Payment methods
    DOM.paymentMethodItems.forEach(function (item) {
      item.addEventListener("click", function () {
        DOM.paymentMethodItems.forEach(function (m) { m.classList.remove("selected"); });
        item.classList.add("selected");
      });
    });

    // Confirm deposit
    if (DOM.btnConfirmDeposit) {
      DOM.btnConfirmDeposit.addEventListener("click", function () {
        initAudio();
        const amt = parseInt(DOM.depositInput ? DOM.depositInput.value : 100, 10) || 100;
        if (amt < 10) {
          showDepositAlert("Minimum deposit amount is ₹10.", "danger");
          return;
        }

        DOM.btnConfirmDeposit.disabled = true;
        DOM.btnConfirmDeposit.textContent = "PROCESSING PAYMENT...";

        setTimeout(function () {
          savedState.virtualBalance += amt;
          saveState();
          updatePlayerUIBalance();

          // Sync deposit to backend Firestore
          const fb = window.AERO_FIREBASE;
          if (fb && fb.auth && fb.auth.currentUser && fb.db) {
            const uid = fb.auth.currentUser.uid;
            fb.db.collection("users").doc(uid).set({
              balance: savedState.virtualBalance,
              lastDepositAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            fb.db.collection("payment_logs").add({
              uid: uid,
              email: savedState.userEmail,
              amount: amt,
              newBalance: savedState.virtualBalance,
              timestamp: firebase.firestore.FieldValue.serverTimestamp(),
              status: "COMPLETED"
            }).catch(function() {});
          }

          DOM.btnConfirmDeposit.disabled = false;
          DOM.btnConfirmDeposit.textContent = "ADD " + formatRupees(amt) + " TO WALLET";

          showDepositAlert("Success! " + formatRupees(amt) + " deposited to your pilot wallet.", "success");
          soundCashout();
        }, 600);
      });
    }

    // Proceed to cockpit
    if (DOM.btnPaymentProceed) {
      DOM.btnPaymentProceed.addEventListener("click", function () {
        initAudio();
        switchScreen("GAME");
        transitionTo("BETTING");
      });
    }

    // Open deposit from game header
    if (DOM.btnOpenDepositHeader) {
      DOM.btnOpenDepositHeader.addEventListener("click", function () {
        switchScreen("PAYMENT");
      });
    }
    if (DOM.btnOpenDepositDossier) {
      DOM.btnOpenDepositDossier.addEventListener("click", function () {
        if (DOM.modalProfile) DOM.modalProfile.classList.remove("active");
        switchScreen("PAYMENT");
      });
    }
  }

  function showDepositAlert(msg, type) {
    if (!DOM.depositAlert) return;
    DOM.depositAlert.textContent = msg;
    DOM.depositAlert.className = "deposit-status-alert active " + (type === "success" ? "auth-status-box success" : "auth-status-box error");
    setTimeout(function () {
      if (DOM.depositAlert) DOM.depositAlert.className = "deposit-status-alert";
    }, 4000);
  }

  //====================================================================
  // EVENT LISTENERS & COCKPIT CONTROLS
  //====================================================================
  function setupEventListeners() {
    document.addEventListener("click", function () { initAudio(); }, { once: true });

    // Firebase Auth session listener with backend sync
    const fb = window.AERO_FIREBASE;
    if (fb && fb.auth) {
      fb.auth.onAuthStateChanged(function (user) {
        if (user && !savedState.isLoggedIn) {
          console.log("[AeroCrash] Active session detected in backend:", user.email);
          detectAndSyncBackend(user, "session_restore", "").catch(function (err) {
            console.warn("[AeroCrash] Session restore warning:", err && err.message ? err.message : err);
            savedState.isLoggedIn = false;
          });
        }
      });
    }

    // Splash progress
    let splashProgress = 0;
    const splashTimer = setInterval(function () {
      splashProgress += 4;
      if (DOM.splashBar) DOM.splashBar.style.width = splashProgress + "%";
      if (DOM.splashStatus) {
        if (splashProgress < 30) DOM.splashStatus.textContent = "CONNECTING TELEMETRY SERVER...";
        else if (splashProgress < 70) DOM.splashStatus.textContent = "SYNCHRONIZING SQUADRON HUD...";
        else DOM.splashStatus.textContent = "SYSTEM READY.";
      }
      if (splashProgress >= 100) {
        clearInterval(splashTimer);
        // Role-based routing after splash
        if (savedState.isLoggedIn && savedState.userEmail) {
          if (savedState.userRole === "admin") {
            switchScreen("GAME");
            transitionTo("BETTING");
          } else {
            switchScreen("PAYMENT");
          }
        } else {
          switchScreen("AUTH");
        }
      }
    }, 40);

    setupAuthFlow();
    setupPaymentFlow();

    // Action button (Stake / Cashout)
    if (DOM.btnAction) {
      DOM.btnAction.addEventListener("click", function () {
        initAudio();
        if (gameState === "BETTING" || gameState === "WAITING") {
          if (isBetPlaced) cancelBet();
          else placeBet();
        } else if (gameState === "RUNNING") {
          if (isBetPlaced && !isCashedOut) cashOut();
        }
      });
    }

    // Stake steppers (Limits: ₹10 - ₹8,000)
    if (DOM.btnDec && DOM.stakeInput) {
      DOM.btnDec.addEventListener("click", function () {
        let val = parseInt(DOM.stakeInput.value, 10) || CONFIG.MIN_STAKE;
        val = Math.max(CONFIG.MIN_STAKE, val - (val <= 100 ? 10 : 50));
        DOM.stakeInput.value = val;
        updateActionButton();
      });
    }

    if (DOM.btnInc && DOM.stakeInput) {
      DOM.btnInc.addEventListener("click", function () {
        let val = parseInt(DOM.stakeInput.value, 10) || CONFIG.MIN_STAKE;
        val = Math.min(CONFIG.MAX_STAKE, val + (val < 100 ? 10 : 50));
        DOM.stakeInput.value = val;
        updateActionButton();
      });
    }

    if (DOM.stakeInput) {
      DOM.stakeInput.addEventListener("input", function () {
        updateActionButton();
      });
    }

    // Quick stake buttons (₹10 - ₹8000)
    const quickBtns = document.querySelectorAll(".quick-stake-grid button");
    quickBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        const val = btn.dataset.value;
        let num = 10;
        if (val === "MAX") num = Math.min(CONFIG.MAX_STAKE, savedState.virtualBalance);
        else num = parseInt(val, 10) || 10;

        num = Math.max(CONFIG.MIN_STAKE, Math.min(CONFIG.MAX_STAKE, num));
        if (DOM.stakeInput) DOM.stakeInput.value = num;
        updateActionButton();
      });
    });

    // Auto cashout
    if (DOM.autoCheck) {
      DOM.autoCheck.checked = savedState.autoCashoutEnabled;
      DOM.autoCheck.addEventListener("change", function () {
        savedState.autoCashoutEnabled = DOM.autoCheck.checked;
        saveState();
      });
    }

    if (DOM.autoInput) {
      DOM.autoInput.value = savedState.autoCashoutValue || 2.0;
      DOM.autoInput.addEventListener("change", function () {
        let val = parseFloat(DOM.autoInput.value) || 2.0;
        val = Math.max(1.05, Math.min(100.0, Math.round(val * 100) / 100));
        DOM.autoInput.value = val.toFixed(2);
        savedState.autoCashoutValue = val;
        saveState();
      });
    }

    // Sound toggle
    if (DOM.btnSoundToggle) {
      DOM.btnSoundToggle.addEventListener("click", function () {
        savedState.audioEnabled = !savedState.audioEnabled;
        DOM.btnSoundToggle.textContent = savedState.audioEnabled ? "SND: ON" : "SND: OFF";
        saveState();
      });
    }

    // Fullscreen toggle
    if (DOM.btnFullscreenToggle) {
      DOM.btnFullscreenToggle.addEventListener("click", function () {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(function () {});
        } else {
          document.exitFullscreen().catch(function () {});
        }
      });
    }

    // Profile modal
    if (DOM.profileChip && DOM.modalProfile) {
      DOM.profileChip.addEventListener("click", function () {
        updateCareerTables();
        applyRoleAccess();
        DOM.modalProfile.classList.add("active");
      });
    }

    if (DOM.btnProfileClose && DOM.modalProfile) {
      DOM.btnProfileClose.addEventListener("click", function () {
        DOM.modalProfile.classList.remove("active");
      });
    }

    // Sign out button
    if (DOM.btnAuthSignout) {
      DOM.btnAuthSignout.addEventListener("click", function () {
        if (confirm("Sign out from your current pilot session?")) {
          if (userDocUnsubscribe) {
            userDocUnsubscribe();
            userDocUnsubscribe = null;
          }
          if (window.AERO_FIREBASE && window.AERO_FIREBASE.auth) {
            window.AERO_FIREBASE.auth.signOut().catch(function() {});
          }
          savedState.isLoggedIn = false;
          savedState.userRole = "user";
          savedState.userEmail = "";
          saveState();
          if (DOM.modalProfile) DOM.modalProfile.classList.remove("active");
          switchScreen("AUTH");
        }
      });
    }

    // Reset stats
    const btnResetStats = document.getElementById("btn-reset-stats");
    if (btnResetStats) {
      btnResetStats.addEventListener("click", function () {
        if (confirm("Reset your flight statistics?")) {
          savedState.career = {
            roundsPlayed: 0, roundsWon: 0, roundsLost: 0,
            totalVcStaked: 0, totalVcWon: 0, totalVcLost: 0,
            highestCashoutMulti: 0.0, bestPayoutVc: 0,
          };
          savedState.history = [];
          saveState();
          updatePlayerUIBalance();
          updateCareerTables();
        }
      });
    }

    // Game Master Drawer (ADMIN ONLY)
    if (DOM.btnGmToggle && DOM.drawerGM) {
      DOM.btnGmToggle.addEventListener("click", function () {
        if (savedState.userRole !== "admin") {
          alert("Unauthorized: Game Master console is restricted to Admins.");
          return;
        }
        DOM.drawerGM.classList.toggle("active");
      });
    }

    if (DOM.btnGmClose && DOM.drawerGM) {
      DOM.btnGmClose.addEventListener("click", function () {
        DOM.drawerGM.classList.remove("active");
      });
    }

    if (DOM.gmBtnForceCrash) {
      DOM.gmBtnForceCrash.addEventListener("click", function () {
        if (savedState.userRole === "admin" && gameState === "RUNNING") {
          isManualCrashPending = true;
        }
      });
    }

    if (DOM.gmBtnPauseToggle) {
      DOM.gmBtnPauseToggle.addEventListener("click", function () {
        if (savedState.userRole === "admin") {
          isGamePaused = !isGamePaused;
          DOM.gmBtnPauseToggle.textContent = isGamePaused ? "RESUME SIMULATION" : "PAUSE SIMULATION";
        }
      });
    }

    if (DOM.gmFleetSlider) {
      DOM.gmFleetSlider.addEventListener("input", function () {
        fleetCount = parseInt(DOM.gmFleetSlider.value, 10);
        if (DOM.gmFleetValue) DOM.gmFleetValue.textContent = fleetCount;
      });
    }

    // Rules modal
    if (DOM.btnRulesToggle && DOM.modalOnboarding) {
      DOM.btnRulesToggle.addEventListener("click", function () {
        DOM.modalOnboarding.classList.add("active");
      });
    }

    if (DOM.btnOnboardingDismiss && DOM.modalOnboarding) {
      DOM.btnOnboardingDismiss.addEventListener("click", function () {
        DOM.modalOnboarding.classList.remove("active");
      });
    }

    // Keyboard Hotkeys
    window.addEventListener("keydown", function (e) {
      if (e.ctrlKey && e.shiftKey && e.key.toUpperCase() === "D") {
        if (DOM.debugOverlay) DOM.debugOverlay.classList.toggle("active");
      } else if (e.code === "Space" && currentScreen === "GAME") {
        if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
        e.preventDefault();
        if (DOM.btnAction && !DOM.btnAction.disabled) {
          DOM.btnAction.click();
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
    updatePlayerUIBalance();

    [1.85, 2.4, 1.25, 4.1, 1.15, 8.42, 1.05, 3.2, 1.95, 2.1].forEach(function (m) {
      addTickerBadge(m);
    });

    requestAnimationFrame(gameLoop);
  }

  window.addEventListener("DOMContentLoaded", init);
})();
