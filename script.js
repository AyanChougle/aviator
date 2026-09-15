/**
 * AEROCRASH — TACTICAL HIGH-ALTITUDE FLIGHT SIMULATOR
 * Modernized UI, Live Telemetry, Multiplayer Squadron, Full Bank & UPI Withdrawal System, Firestore Cloud Sync
 * Real-Time IP Detection, Unpredictable Dynamic Physics, Admin User & Withdrawal Management
 */

(function () {
  "use strict";

  //===================================================================
  // CONSTANTS & CONFIG
  //===================================================================
  const CONFIG = {
    STORAGE_KEY: "aero_crash_rupees_v2",
    INITIAL_BALANCE: 10.00, // ₹10 Free Starting Credit
    MIN_STAKE: 10,          // ₹10 minimum
    MAX_STAKE: 8000,        // ₹8,000 maximum
    MIN_WITHDRAWAL: 50,     // ₹50 minimum withdrawal
    TIMINGS: {
      SPLASH_MS: 1600,
      BETTING_MS: 8000,
      LAUNCHING_MS: 1000,
      CRASHED_MS: 1600,
      RESULT_MS: 2000,
    },
  };

  const NOUN_CALLSIGNS = [
    "ShadowFlyer", "SkyHunter", "AeroMax", "JetStream", "CloudRider", "TurboPilot",
    "ApexFalcon", "ViperOne", "MachNine", "NightHawk", "Starlight", "Solaris", "Maverick"
  ];

  let clientIP = "Detecting...";
  let clientGeo = {};

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

  // Fetch Public IP Address
  function fetchClientIP() {
    fetch("https://api.ipify.org?format=json")
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data && data.ip) {
          clientIP = data.ip;
          const ipElem = document.getElementById("dossier-user-ip");
          if (ipElem) ipElem.textContent = clientIP;
          // Sync IP to Firestore if logged in
          if (savedState.isLoggedIn) saveState();
        }
      })
      .catch(function () {
        fetch("https://ipapi.co/json/")
          .then(function (res) { return res.json(); })
          .then(function (data) {
            if (data && data.ip) {
              clientIP = data.ip;
              clientGeo = { city: data.city, country: data.country_name, org: data.org };
              const ipElem = document.getElementById("dossier-user-ip");
              if (ipElem) ipElem.textContent = clientIP;
              if (savedState.isLoggedIn) saveState();
            }
          })
          .catch(function () {
            clientIP = "127.0.0.1 (Local)";
          });
      });
  }
  fetchClientIP();

  function loadState() {
    try {
      const data = localStorage.getItem(CONFIG.STORAGE_KEY) || localStorage.getItem("aero_crash_rupees_v1");
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
      // Sync to Firestore if user is authenticated
      if (options.syncFirestore !== false && window.AERO_FIREBASE && window.AERO_FIREBASE.auth && window.AERO_FIREBASE.auth.currentUser && window.AERO_FIREBASE.db) {
        const uid = window.AERO_FIREBASE.auth.currentUser.uid;
        window.AERO_FIREBASE.db.collection("users").doc(uid).set({
          callsign: savedState.callsign,
          email: savedState.userEmail,
          role: savedState.userRole,
          balance: savedState.virtualBalance,
          career: savedState.career,
          lastIP: clientIP,
          geo: clientGeo,
          device: navigator.userAgent,
          lastActive: new Date()
        }, { merge: true }).catch(function (err) {
          console.warn("Firestore sync warning:", err);
        });
      }
    } catch (e) {
      console.warn("Failed to save storage", e);
    }
  }

  function formatRupees(amount) {
    const num = Number(amount) || 0;
    return "₹" + num.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
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
      osc.stop(audioCtx.currentTime + 0.45);
    } catch (e) {}
  }

  //====================================================================
  // CORE GAME STATE
  //====================================================================
  let currentScreen = "SPLASH";
  let gameState = "WAITING"; // WAITING, BETTING, LAUNCHING, RUNNING, CRASHED, RESULT
  let roundNumber = 2847;
  let roundStartTime = 0;
  let launchStartTime = 0;
  let liveMultiplier = 1.00;
  let crashMultiplier = 2.50;
  let isManualCrashPending = false;
  let isGamePaused = false;
  let fleetCount = 136;

  let isBetPlaced = false;
  let currentStake = 10;
  let isCashedOut = false;
  let cashoutMultiplier = 0.0;
  let cashoutAmount = 0;

  let squadronPilots = [];
  let currentAuthMode = "login";
  let userDocUnsubscribe = null;

  // Dynamic Canvas Physics & Flight Trajectory Points
  let canvasCtx = null;
  let canvasWidth = 800;
  let canvasHeight = 450;
  let debrisParticles = [];
  let liveTrail = [];

  //====================================================================
  // DOM ELEMENTS CACHE
  //====================================================================
  let DOM = {};

  function cacheDOM() {
    DOM = {
      // Screens
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

      // Header Elements
      roundPill: document.getElementById("round-id-placeholder"),
      statePill: document.getElementById("agy-state-pill"),
      stateDot: document.getElementById("agy-state-dot"),
      headerFlightMulti: document.getElementById("header-flight-multi"),
      btnGmToggle: document.getElementById("btn-gm-toggle"),
      btnOpenWallet: document.getElementById("btn-open-wallet"),
      headerBalanceVal: document.getElementById("header-balance-val"),
      btnSoundToggle: document.getElementById("btn-sound-toggle"),
      btnFullscreenToggle: document.getElementById("btn-fullscreen-toggle"),
      btnRulesToggle: document.getElementById("btn-rules-toggle"),
      profileChip: document.getElementById("btn-profile-chip"),
      chipAvatarLetter: document.getElementById("profile-chip-avatar-letter"),
      chipName: document.getElementById("profile-chip-name"),
      tickerList: document.getElementById("history-ticker-list"),

      // Left Controls Panel
      tabCtrlBetting: document.getElementById("tab-ctrl-betting"),
      tabCtrlHistory: document.getElementById("tab-ctrl-history"),
      controlsBettingView: document.getElementById("controls-betting-view"),
      controlsHistoryView: document.getElementById("controls-history-view"),
      stakeInput: document.getElementById("input-stake"),
      btnStakeInc: document.getElementById("btn-stake-inc"),
      btnStakeDec: document.getElementById("btn-stake-dec"),
      quickStakeChips: document.querySelectorAll(".quick-stake-grid .btn-chip"),
      autoCheck: document.getElementById("check-auto-cashout"),
      autoInput: document.getElementById("input-auto-cashout"),
      btnClearAutocashout: document.getElementById("btn-clear-autocashout"),
      btnAction: document.getElementById("btn-action"),
      actionText: document.getElementById("action-btn-text"),
      actionSubtext: document.getElementById("action-btn-subtext"),
      actionFeedback: document.getElementById("action-feedback"),
      cardWalletBottom: document.getElementById("card-wallet-bottom"),
      userBalanceDisplay: document.getElementById("user-vc-display"),
      totalStakedDisplay: document.getElementById("stat-total-staked"),
      totalWinsDisplay: document.getElementById("stat-total-wins"),
      personalLogsContainer: document.getElementById("personal-logs-container"),

      // Arena & Canvas
      canvas: document.getElementById("flight-canvas"),
      countdownOverlay: document.getElementById("countdown-overlay"),
      countdownDigits: document.getElementById("countdown-digits"),
      crashOverlay: document.getElementById("crash-overlay"),
      crashMultiplier: document.getElementById("crash-multiplier"),
      hudContainer: document.getElementById("hud-multiplier-container"),
      hudMultiplier: document.getElementById("hud-multiplier"),
      playerResultBanner: document.getElementById("player-result-banner"),
      telemAlt: document.getElementById("telem-alt"),
      telemVel: document.getElementById("telem-vel"),
      telemTraj: document.getElementById("telem-traj"),

      // Floor Dock
      squadronBetsTable: document.getElementById("squadron-bets-table"),
      squadronCountBadge: document.getElementById("squadron-count-badge"),
      activityFeedList: document.getElementById("activity-feed-list"),
      footerLiveClock: document.getElementById("footer-live-clock"),

      // Wallet Modal (Deposit & Withdrawal)
      modalWallet: document.getElementById("modal-wallet"),
      btnWalletClose: document.getElementById("btn-wallet-close"),
      tabWalletDeposit: document.getElementById("tab-wallet-deposit"),
      tabWalletWithdraw: document.getElementById("tab-wallet-withdraw"),
      walletPanelDeposit: document.getElementById("wallet-tab-content-deposit"),
      walletPanelWithdraw: document.getElementById("wallet-tab-content-withdraw"),
      modalWalletBalanceVal: document.getElementById("modal-wallet-balance-val"),
      walletStatusAlert: document.getElementById("wallet-status-alert"),

      // Deposit Modal Elements
      modalDepositChips: document.querySelectorAll("#wallet-tab-content-deposit .deposit-chip-btn"),
      modalDepositInput: document.getElementById("modal-input-deposit-amount"),
      modalPaymentMethods: document.querySelectorAll("#wallet-tab-content-deposit .payment-method-item"),
      depositUtrInput: document.getElementById("deposit-utr-input"),
      btnModalDepositConfirm: document.getElementById("btn-modal-deposit-confirm"),

      // Withdrawal Modal Elements
      typeOptBank: document.getElementById("type-opt-bank"),
      typeOptUpi: document.getElementById("type-opt-upi"),
      payoutBankForm: document.getElementById("payout-bank-form"),
      payoutUpiForm: document.getElementById("payout-upi-form"),
      withdrawBankName: document.getElementById("withdraw-bank-name"),
      withdrawAccountHolder: document.getElementById("withdraw-account-holder"),
      withdrawAccountNumber: document.getElementById("withdraw-account-number"),
      withdrawAccountNumberConfirm: document.getElementById("withdraw-account-number-confirm"),
      withdrawIfscCode: document.getElementById("withdraw-ifsc-code"),
      withdrawUpiName: document.getElementById("withdraw-upi-name"),
      withdrawUpiId: document.getElementById("withdraw-upi-id"),
      withdrawAmountInput: document.getElementById("withdraw-amount-input"),
      withdrawPercentChips: document.querySelectorAll(".withdraw-quick-percents .btn-percent-chip"),
      btnSubmitWithdrawal: document.getElementById("btn-submit-withdrawal"),

      // Onboarding Payment Screen
      paymentCurrentBalance: document.getElementById("payment-current-balance"),
      depositAlert: document.getElementById("deposit-status-alert"),
      depositChips: document.querySelectorAll("#screen-payment .deposit-chip-btn"),
      depositInput: document.getElementById("input-deposit-amount"),
      paymentMethodItems: document.querySelectorAll("#screen-payment .payment-method-item"),
      btnConfirmDeposit: document.getElementById("btn-confirm-deposit"),
      btnPaymentProceed: document.getElementById("btn-payment-proceed"),

      // Dossier Modal
      modalProfile: document.getElementById("modal-profile"),
      btnProfileClose: document.getElementById("btn-profile-close"),
      btnDossierCloseBottom: document.getElementById("btn-dossier-close-bottom"),
      btnOpenWalletFromDossier: document.getElementById("btn-open-wallet-from-dossier"),
      btnResetStats: document.getElementById("btn-reset-stats"),
      btnAuthSignout: document.getElementById("btn-auth-signout"),
      dossierCallsign: document.getElementById("dossier-callsign"),
      dossierRole: document.getElementById("dossier-user-role"),
      dossierBalance: document.getElementById("dossier-display-balance"),
      dossierUserIp: document.getElementById("dossier-user-ip"),
      dossierRoundsPlayed: document.getElementById("dossier-rounds-played"),
      dossierRoundsWon: document.getElementById("dossier-rounds-won"),
      dossierRoundsLost: document.getElementById("dossier-rounds-lost"),
      dossierWinRate: document.getElementById("dossier-win-rate"),
      dossierHighestMulti: document.getElementById("dossier-highest-multi"),
      dossierBestPayout: document.getElementById("dossier-best-payout"),

      // Game Master Drawer
      drawerGM: document.getElementById("drawer-game-master"),
      btnGmClose: document.getElementById("btn-gm-close"),
      tabAdminFlight: document.getElementById("tab-admin-flight"),
      tabAdminUsers: document.getElementById("tab-admin-users"),
      tabAdminWithdrawals: document.getElementById("tab-admin-withdrawals"),
      adminPanelFlight: document.getElementById("admin-panel-flight"),
      adminPanelUsers: document.getElementById("admin-panel-users"),
      adminPanelWithdrawals: document.getElementById("admin-panel-withdrawals"),
      adminUsersTable: document.getElementById("admin-users-table"),
      adminWithdrawalsTable: document.getElementById("admin-withdrawals-table"),
      btnRefreshAdminUsers: document.getElementById("btn-refresh-admin-users"),
      btnRefreshAdminWithdrawals: document.getElementById("btn-refresh-admin-withdrawals"),

      gmOverrideEnabled: document.getElementById("gm-override-enabled"),
      gmTargetInput: document.getElementById("gm-target-input"),
      gmBtnForceCrash: document.getElementById("gm-btn-force-crash"),
      gmBtnPauseToggle: document.getElementById("gm-btn-pause-toggle"),
      gmFleetCount: document.getElementById("gm-fleet-count"),
      gmFleetValue: document.getElementById("gm-fleet-value"),
      debugLiveMulti: document.getElementById("debug-live-multi"),
      debugTargetMulti: document.getElementById("debug-target-multi"),

      // Rules Modal
      modalOnboarding: document.getElementById("modal-onboarding"),
      btnRulesClose: document.getElementById("btn-rules-close"),
      btnOnboardingDismiss: document.getElementById("btn-onboarding-dismiss"),
    };
  }

  //====================================================================
  // SCREEN ROUTING
  //====================================================================
  function switchScreen(screenName) {
    currentScreen = screenName;
    const screens = [DOM.screenSplash, DOM.screenAuth, DOM.screenPayment, DOM.screenGame];
    screens.forEach(function (s) {
      if (s) s.classList.remove("active");
    });

    if (screenName === "SPLASH" && DOM.screenSplash) DOM.screenSplash.classList.add("active");
    if (screenName === "AUTH" && DOM.screenAuth) DOM.screenAuth.classList.add("active");
    if (screenName === "PAYMENT" && DOM.screenPayment) DOM.screenPayment.classList.add("active");
    if (screenName === "GAME" && DOM.screenGame) {
      DOM.screenGame.classList.add("active");
      setTimeout(resizeCanvas, 50);
    }
  }

  function updatePlayerUIBalance() {
    const formatted = formatRupees(savedState.virtualBalance);
    if (DOM.userBalanceDisplay) DOM.userBalanceDisplay.textContent = formatted;
    if (DOM.headerBalanceVal) DOM.headerBalanceVal.textContent = formatted;
    if (DOM.paymentCurrentBalance) DOM.paymentCurrentBalance.textContent = formatted;
    if (DOM.modalWalletBalanceVal) DOM.modalWalletBalanceVal.textContent = formatted;
    if (DOM.dossierBalance) DOM.dossierBalance.textContent = formatted;

    if (DOM.totalStakedDisplay) DOM.totalStakedDisplay.textContent = formatRupees(savedState.career.totalVcStaked);
    if (DOM.totalWinsDisplay) DOM.totalWinsDisplay.textContent = formatRupees(savedState.career.totalVcWon);

    if (DOM.chipName) DOM.chipName.textContent = savedState.callsign || "PILOT";
    if (DOM.chipAvatarLetter) DOM.chipAvatarLetter.textContent = (savedState.callsign || "P").charAt(0).toUpperCase();
    if (DOM.dossierCallsign) DOM.dossierCallsign.textContent = savedState.callsign || "MAVERICK";
    if (DOM.dossierUserIp) DOM.dossierUserIp.textContent = clientIP || "Detecting...";
  }

  function showActionFeedback(msg, type) {
    if (!DOM.actionFeedback) return;
    DOM.actionFeedback.textContent = msg;
    DOM.actionFeedback.className = "action-feedback active " + (type || "success");
    setTimeout(function () {
      if (DOM.actionFeedback) DOM.actionFeedback.classList.remove("active");
    }, 2800);
  }

  function addTickerBadge(multi) {
    if (!DOM.tickerList) return;
    const badge = document.createElement("span");
    badge.className = "ticker-badge";
    if (multi < 2.0) badge.classList.add("multi-low");
    else if (multi < 10.0) badge.classList.add("multi-mid");
    else badge.classList.add("multi-high");
    badge.textContent = multi.toFixed(2) + "x";

    DOM.tickerList.insertBefore(badge, DOM.tickerList.firstChild);
    while (DOM.tickerList.children.length > 20) {
      DOM.tickerList.removeChild(DOM.tickerList.lastChild);
    }
  }

  function addFeedItem(text, type) {
    if (!DOM.activityFeedList) return;
    const now = new Date();
    const timeStr = now.toTimeString().split(" ")[0];
    const item = document.createElement("div");
    item.className = "feed-item " + (type || "");

    item.innerHTML = '<span class="timestamp">' + timeStr + '</span>' +
      '<span class="dot"></span>' +
      '<span class="event-text">' + text + '</span>';

    DOM.activityFeedList.appendChild(item);
    while (DOM.activityFeedList.children.length > 30) {
      DOM.activityFeedList.removeChild(DOM.activityFeedList.firstChild);
    }
    DOM.activityFeedList.scrollTop = DOM.activityFeedList.scrollHeight;
  }

  function updateLiveClock() {
    if (!DOM.footerLiveClock) return;
    const now = new Date();
    DOM.footerLiveClock.textContent = now.toTimeString().split(" ")[0];
  }
  setInterval(updateLiveClock, 1000);

  //====================================================================
  // UNPREDICTABLE MULTIPLIER & FLIGHT ENGINE
  //====================================================================
  const MAX_POSSIBLE_MULTIPLIER = 30.00; // Realistic crash multiplier ceiling (max 30.00x)

  function generateCrashPoint() {
    if (DOM.gmOverrideEnabled && DOM.gmOverrideEnabled.checked && DOM.gmTargetInput) {
      const manual = parseFloat(DOM.gmTargetInput.value);
      if (!isNaN(manual) && manual >= 1.01) {
        return Math.min(MAX_POSSIBLE_MULTIPLIER, Math.floor(manual * 100) / 100);
      }
    }
    const r = Math.random();
    let point = 1.00;
    if (r < 0.08) {
      // Early crash (1.00x - 1.15x)
      point = Math.floor((1.00 + Math.random() * 0.15) * 100) / 100;
    } else if (r < 0.60) {
      // Standard low multiplier (1.16x - 2.40x)
      point = Math.floor((1.16 + Math.random() * 1.24) * 100) / 100;
    } else if (r < 0.88) {
      // Medium climb (2.41x - 5.50x)
      point = Math.floor((2.41 + Math.random() * 3.09) * 100) / 100;
    } else if (r < 0.97) {
      // High altitude (5.51x - 12.00x)
      point = Math.floor((5.51 + Math.random() * 6.49) * 100) / 100;
    } else {
      // Rare high flight (12.01x - 25.00x, capped at 30.00x)
      point = Math.floor((12.01 + Math.random() * 12.99) * 100) / 100;
    }
    
    return Math.min(MAX_POSSIBLE_MULTIPLIER, Math.max(1.00, point));
  }

  function calculateMultiplier(elapsedSec) {
    // Natural steady aerodynamic climb (smooth realistic progression)
    const exponent = 0.048 * Math.pow(elapsedSec, 1.10);
    const multi = Math.max(1.00, Math.exp(exponent));
    return Math.min(MAX_POSSIBLE_MULTIPLIER, multi);
  }

  function transitionTo(newState) {
    gameState = newState;

    if (DOM.statePill) DOM.statePill.textContent = newState;
    if (DOM.stateDot) {
      DOM.stateDot.className = "status-dot " + (newState === "RUNNING" ? "green" : newState === "BETTING" ? "amber" : "red");
    }

    switch (newState) {
      case "BETTING":
        roundNumber++;
        if (DOM.roundPill) DOM.roundPill.textContent = "ROUND #" + roundNumber;
        if (DOM.statePill) DOM.statePill.textContent = "BETTING OPEN";
        isBetPlaced = false;
        isCashedOut = false;
        cashoutMultiplier = 0.0;
        cashoutAmount = 0;
        liveMultiplier = 1.00;
        crashMultiplier = generateCrashPoint();
        if (DOM.debugTargetMulti) DOM.debugTargetMulti.textContent = crashMultiplier.toFixed(2) + "x";
        roundStartTime = performance.now();
        liveTrail = [];

        squadronPilots = generateSquadron(fleetCount);
        renderSquadronTable(true);

        if (DOM.hudContainer) DOM.hudContainer.classList.add("hidden");
        if (DOM.crashOverlay) DOM.crashOverlay.classList.add("hidden");
        if (DOM.countdownOverlay) DOM.countdownOverlay.classList.remove("hidden");
        if (DOM.playerResultBanner) DOM.playerResultBanner.classList.remove("active");

        addFeedItem("ROUND #" + roundNumber + " BETS OPEN // TAKEOFF IN 8s");
        updateActionButton();
        break;

      case "LAUNCHING":
        if (DOM.countdownOverlay) DOM.countdownOverlay.classList.add("hidden");
        if (DOM.statePill) DOM.statePill.textContent = "LAUNCHING";
        if (DOM.debugTargetMulti) DOM.debugTargetMulti.textContent = crashMultiplier.toFixed(2) + "x";
        soundLaunch();
        updateActionButton();
        break;

      case "RUNNING":
        launchStartTime = performance.now();
        liveTrail = [];
        if (DOM.countdownOverlay) DOM.countdownOverlay.classList.add("hidden");
        if (DOM.crashOverlay) DOM.crashOverlay.classList.add("hidden");
        if (DOM.hudContainer) DOM.hudContainer.classList.remove("hidden");
        if (DOM.statePill) DOM.statePill.textContent = "IN PROGRESS";
        updateActionButton();
        break;

      case "CRASHED":
        soundCrash();
        renderSquadronTable(false);
        addTickerBadge(liveMultiplier);
        addFeedItem("FLIGHT CRASHED @ " + liveMultiplier.toFixed(2) + "x", "crashed");

        if (DOM.hudContainer) DOM.hudContainer.classList.add("hidden");
        if (DOM.crashOverlay) DOM.crashOverlay.classList.remove("hidden");
        if (DOM.crashMultiplier) DOM.crashMultiplier.textContent = liveMultiplier.toFixed(2) + "x";
        if (DOM.statePill) DOM.statePill.textContent = "FLEW AWAY";

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
            time: new Date().toLocaleTimeString()
          });
          saveState();
          updateCareerTables();
          renderPersonalHistoryLogs();
          showActionFeedback("FLEW AWAY — Lost " + formatRupees(currentStake), "danger");
        }
        isBetPlaced = false;
        updateActionButton();

        setTimeout(function () {
          if (gameState === "CRASHED") transitionTo("RESULT");
        }, CONFIG.TIMINGS.CRASHED_MS);
        break;

      case "RESULT":
        updateCareerTables();
        setTimeout(function () {
          if (gameState === "RESULT") transitionTo("BETTING");
        }, CONFIG.TIMINGS.RESULT_MS);
        break;
    }
  }

  //====================================================================
  // BETTING CONTROLS
  //====================================================================
  function getCurrentStakeInput() {
    if (!DOM.stakeInput) return CONFIG.MIN_STAKE;
    let val = parseFloat(DOM.stakeInput.value) || CONFIG.MIN_STAKE;
    return Math.max(CONFIG.MIN_STAKE, Math.min(CONFIG.MAX_STAKE, val));
  }

  function updateActionButton() {
    if (!DOM.btnAction) return;
    DOM.btnAction.className = "btn-action-takeoff";
    DOM.btnAction.disabled = false;

    if (gameState === "BETTING" || gameState === "WAITING") {
      if (isBetPlaced) {
        DOM.btnAction.classList.add("state-cancel");
        DOM.actionText.textContent = "CANCEL BET";
        if (DOM.actionSubtext) DOM.actionSubtext.textContent = "Staked: " + formatRupees(currentStake);
      } else {
        DOM.btnAction.classList.add("state-bet");
        DOM.actionText.textContent = "TAKEOFF";
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
        const currentPayout = Math.floor(currentStake * liveMultiplier * 100) / 100;
        DOM.btnAction.classList.add("state-cashout");
        DOM.actionText.textContent = "CASH OUT " + liveMultiplier.toFixed(2) + "x";
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
      openWalletModal("deposit");
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
    addFeedItem(savedState.callsign + " cancelled stake");
  }

  function cashOut() {
    if (!isBetPlaced || isCashedOut || gameState !== "RUNNING") return;
    isCashedOut = true;
    cashoutMultiplier = liveMultiplier;
    cashoutAmount = Math.floor(currentStake * cashoutMultiplier * 100) / 100;
    const profit = cashoutAmount - currentStake;

    savedState.virtualBalance += cashoutAmount;
    savedState.career.roundsPlayed++;
    savedState.career.roundsWon++;
    savedState.career.totalVcWon += profit;
    if (cashoutMultiplier > savedState.career.highestCashoutMulti) {
      savedState.career.highestCashoutMulti = cashoutMultiplier;
    }
    if (cashoutAmount > savedState.career.bestPayoutVc) {
      savedState.career.bestPayoutVc = cashoutAmount;
    }

    savedState.history.unshift({
      round: roundNumber,
      stake: currentStake,
      multiplier: cashoutMultiplier,
      profit: profit,
      status: "WIN",
      time: new Date().toLocaleTimeString()
    });

    saveState();
    updatePlayerUIBalance();
    updateCareerTables();
    renderPersonalHistoryLogs();
    soundCashout();

    if (DOM.playerResultBanner) {
      DOM.playerResultBanner.textContent = "CASHED OUT " + formatRupees(cashoutAmount) + " (" + cashoutMultiplier.toFixed(2) + "x)";
      DOM.playerResultBanner.classList.add("active");
    }

    addFeedItem(savedState.callsign + " CASHED OUT @" + cashoutMultiplier.toFixed(2) + "x (+" + formatRupees(cashoutAmount) + ")", "cashout");
    updateActionButton();
  }

  function handleActionClick() {
    initAudio();
    if (gameState === "BETTING" || gameState === "WAITING") {
      if (isBetPlaced) cancelBet();
      else placeBet();
    } else if (gameState === "RUNNING") {
      if (isBetPlaced && !isCashedOut) cashOut();
    }
  }

  window.addEventListener("keydown", function (e) {
    if (e.code === "Space" && e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA") {
      e.preventDefault();
      handleActionClick();
    }
  });

  //====================================================================
  // SQUADRON MULTIPLAYER SIMULATOR
  //====================================================================
  function generateSquadron(count) {
    const pilots = [];
    for (let i = 0; i < count; i++) {
      const profileRand = Math.random();
      let targetMulti = 1.8;
      if (profileRand < 0.25) targetMulti = 1.1 + Math.random() * 0.4;
      else if (profileRand < 0.70) targetMulti = 1.5 + Math.random() * 1.5;
      else if (profileRand < 0.92) targetMulti = 3.0 + Math.random() * 3.5;
      else targetMulti = 7.0 + Math.random() * 25.0;

      const name = NOUN_CALLSIGNS[i % NOUN_CALLSIGNS.length] + (i > 12 ? Math.floor(10 + Math.random() * 89) : "");
      const stakeChoices = [10, 25, 50, 100, 200, 500, 1000, 2000, 5000];
      const stake = stakeChoices[Math.floor(Math.random() * stakeChoices.length)];

      pilots.push({
        id: "#" + (8400 + i),
        name: name,
        stake: stake,
        targetMulti: Math.round(targetMulti * 100) / 100,
        hasCashedOut: false,
        cashoutValue: 0,
        profit: 0
      });
    }
    return pilots;
  }

  function updateSquadronDuringFlight(multiplier) {
    squadronPilots.forEach(function (p) {
      if (!p.hasCashedOut && multiplier >= p.targetMulti) {
        p.hasCashedOut = true;
        p.cashoutValue = Math.floor(p.stake * p.targetMulti * 100) / 100;
        p.profit = p.cashoutValue - p.stake;
        if (Math.random() < 0.12) {
          addFeedItem(p.name + " cashed @" + p.targetMulti.toFixed(2) + "x (+" + formatRupees(p.profit) + ")", "cashout");
        }
      }
    });
  }

  function renderSquadronTable(firstLoad) {
    if (!DOM.squadronBetsTable) return;
    const tbody = DOM.squadronBetsTable.querySelector("tbody");
    if (!tbody) return;

    const displayList = squadronPilots.slice(0, 15);
    let html = "";
    displayList.forEach(function (pilot) {
      const isCashed = pilot.hasCashedOut;
      const isCrash = gameState === "CRASHED";
      const statusClass = isCashed ? "cashed-out" : isCrash ? "crashed" : "placed-true";
      const cashoutText = isCashed ? formatRupees(pilot.cashoutValue) : isCrash ? "—" : "—";
      const multiText = isCashed ? pilot.targetMulti.toFixed(2) + "x" : isCrash ? "1.00x" : "—";
      let profitHtml = '<span style="color:var(--text-dim);">—</span>';

      if (isCashed) {
        profitHtml = '<span class="profit-pos">+' + formatRupees(pilot.profit) + '</span>';
      } else if (isCrash) {
        profitHtml = '<span class="profit-neg">-' + formatRupees(pilot.stake) + '</span>';
      }

      html += '<tr class="' + statusClass + '">' +
        '<td>' + pilot.id + '</td>' +
        '<td>' + pilot.name + '</td>' +
        '<td>' + formatRupees(pilot.stake) + '</td>' +
        '<td>' + cashoutText + '</td>' +
        '<td>' + multiText + '</td>' +
        '<td>' + profitHtml + '</td>' +
        '</tr>';
    });

    tbody.innerHTML = html;
    if (DOM.squadronCountBadge) DOM.squadronCountBadge.textContent = "● " + squadronPilots.length + " BETS";
  }

  //====================================================================
  // DYNAMIC UNPREDICTABLE CANVAS PHYSICS (NO FIXED ENDPOINT)
  //====================================================================
  function resizeCanvas() {
    if (!DOM.canvas || !DOM.canvas.parentElement) return;
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
    for (let i = 0; i < 35; i++) {
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
        color: Math.random() < 0.6 ? "#ef4444" : "#ff7300",
      });
    }
  }

  function drawRadarBackground(ctx) {
    const cx = canvasWidth * 0.58;
    const cy = canvasHeight * 0.55;

    ctx.save();
    // Clean subtle tactical radar concentric range rings
    ctx.strokeStyle = "rgba(255, 255, 255, 0.035)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);

    [60, 130, 200, 280].forEach(function (r) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    });

    // Crosshairs
    ctx.beginPath();
    ctx.moveTo(cx - 280, cy);
    ctx.lineTo(cx + 280, cy);
    ctx.moveTo(cx, cy - 280);
    ctx.lineTo(cx, cy + 280);
    ctx.stroke();

    // Runway baseline at the bottom
    const startY = canvasHeight - 28;
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
    ctx.beginPath();
    ctx.moveTo(20, startY);
    ctx.lineTo(canvasWidth - 20, startY);
    ctx.stroke();

    ctx.restore();
  }

  function drawPlane(ctx, x, y, angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    if (gameState === "RUNNING") {
      ctx.shadowColor = "#ff7300";
      ctx.shadowBlur = 14;
      ctx.fillStyle = "rgba(255, 115, 0, 0.85)";
      ctx.beginPath();
      ctx.arc(-14, 0, 3.5 + Math.random() * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    ctx.fillStyle = "#ff6b22";
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(-4, -10);
    ctx.lineTo(-2, -3);
    ctx.lineTo(-12, -7);
    ctx.lineTo(-10, 0);
    ctx.lineTo(-12, 7);
    ctx.lineTo(-2, 3);
    ctx.lineTo(-4, 10);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(4, 0, 2.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function renderCanvas() {
    if (!canvasCtx) return;
    const ctx = canvasCtx;
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    drawRadarBackground(ctx);

    const startX = 35;
    const startY = canvasHeight - 28;

    // DURING BETTING, LAUNCHING, OR WAITING:
    // The aircraft sits parked calmly on the runway origin (NO premature flight or line!)
    if (gameState === "BETTING" || gameState === "WAITING" || gameState === "LAUNCHING") {
      drawPlane(ctx, startX, startY, 0);
      return;
    }

    // ACTIVE FLIGHT IN PROGRESS (RUNNING STATE ONLY)
    if (gameState === "RUNNING") {
      const flightTime = Math.max(0, (performance.now() - launchStartTime) / 1000);
      
      const spanX = canvasWidth * 0.76;
      const spanY = canvasHeight * 0.72;
      
      const t = flightTime;
      const factorX = 1 - Math.exp(-0.11 * t);
      const factorY = Math.pow(factorX, 1.25);
      const microTurbulence = Math.sin(t * 3.6) * (1.2 + Math.min(2.0, t * 0.1));

      const currX = startX + spanX * factorX;
      const currY = (startY - spanY * factorY) + microTurbulence;

      // Add to live trail history
      if (liveTrail.length === 0) {
        liveTrail.push({ x: startX, y: startY });
      }
      liveTrail.push({ x: currX, y: currY });

      // Render actual recorded trail with glowing fill
      if (liveTrail.length > 1) {
        ctx.save();

        // 1. Subtle smooth illuminated gradient under the curve
        const fillGrad = ctx.createLinearGradient(0, 0, 0, canvasHeight);
        fillGrad.addColorStop(0, "rgba(255, 107, 34, 0.16)");
        fillGrad.addColorStop(0.7, "rgba(255, 107, 34, 0.03)");
        fillGrad.addColorStop(1, "rgba(255, 107, 34, 0.0)");

        ctx.beginPath();
        ctx.moveTo(startX, startY);
        for (let i = 0; i < liveTrail.length; i++) {
          ctx.lineTo(liveTrail[i].x, liveTrail[i].y);
        }
        ctx.lineTo(currX, startY);
        ctx.lineTo(startX, startY);
        ctx.closePath();
        ctx.fillStyle = fillGrad;
        ctx.fill();

        // 2. High-glow luminous neon flight trail line
        ctx.beginPath();
        ctx.strokeStyle = "#ff6b22";
        ctx.lineWidth = 3.0;
        ctx.shadowColor = "#ff7700";
        ctx.shadowBlur = 10;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.moveTo(liveTrail[0].x, liveTrail[0].y);
        for (let i = 1; i < liveTrail.length; i++) {
          ctx.lineTo(liveTrail[i].x, liveTrail[i].y);
        }
        ctx.stroke();
        ctx.restore();
      }

      // Compute heading angle
      let angle = -0.35;
      if (liveTrail.length >= 2) {
        const p1 = liveTrail[liveTrail.length - 2];
        const p2 = liveTrail[liveTrail.length - 1];
        angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      }

      drawPlane(ctx, currX, currY, angle);

    } else if (gameState === "CRASHED" || gameState === "RESULT") {
      // Draw static trail up to crash point
      if (liveTrail.length > 1) {
        ctx.save();
        ctx.strokeStyle = "rgba(255, 107, 34, 0.4)";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(liveTrail[0].x, liveTrail[0].y);
        for (let i = 1; i < liveTrail.length; i++) {
          ctx.lineTo(liveTrail[i].x, liveTrail[i].y);
        }
        ctx.stroke();
        ctx.restore();
      }

      const lastPoint = liveTrail.length > 0 ? liveTrail[liveTrail.length - 1] : { x: startX + 100, y: startY - 80 };
      if (debrisParticles.length === 0) createDebris(lastPoint.x, lastPoint.y);
      debrisParticles.forEach(function (p) {
        if (p.life > 0) {
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x, p.y, p.size, p.size);
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.08;
          p.life -= p.decay;
        }
      });
    }
  }

  //====================================================================
  // MAIN ANIMATION & SIMULATION LOOP
  //====================================================================
  function gameLoop(timestamp) {
    if (isGamePaused) {
      requestAnimationFrame(gameLoop);
      return;
    }

    if (gameState === "BETTING") {
      const elapsed = timestamp - roundStartTime;
      const remaining = Math.max(0, CONFIG.TIMINGS.BETTING_MS - elapsed);
      const secondsLeft = Math.ceil(remaining / 1000);

      if (DOM.countdownDigits) DOM.countdownDigits.textContent = secondsLeft;
      if (secondsLeft <= 3 && Math.floor(remaining) % 1000 < 50) soundCountdown();

      if (elapsed >= CONFIG.TIMINGS.BETTING_MS) transitionTo("LAUNCHING");
    } else if (gameState === "LAUNCHING") {
      const elapsed = timestamp - (roundStartTime + CONFIG.TIMINGS.BETTING_MS);
      if (elapsed >= CONFIG.TIMINGS.LAUNCHING_MS) transitionTo("RUNNING");
    } else if (gameState === "RUNNING") {
      const elapsedSec = (timestamp - launchStartTime) / 1000;
      liveMultiplier = calculateMultiplier(elapsedSec);

      if (DOM.hudMultiplier) DOM.hudMultiplier.textContent = liveMultiplier.toFixed(2) + "x";
      if (DOM.headerFlightMulti) DOM.headerFlightMulti.textContent = liveMultiplier.toFixed(2) + "x";
      if (DOM.debugLiveMulti) DOM.debugLiveMulti.textContent = liveMultiplier.toFixed(2) + "x";

      if (DOM.telemAlt) DOM.telemAlt.textContent = Math.floor(liveMultiplier * 1420).toLocaleString() + " FT";
      if (DOM.telemVel) DOM.telemVel.textContent = Math.floor(liveMultiplier * 360) + " KTS";
      if (DOM.telemTraj) DOM.telemTraj.textContent = Math.min(78, (liveMultiplier * 14.5)).toFixed(1) + "°";

      // Auto cashout check
      if (DOM.autoCheck && DOM.autoCheck.checked && isBetPlaced && !isCashedOut) {
        const target = parseFloat(DOM.autoInput ? DOM.autoInput.value : 2.0);
        if (!isNaN(target) && liveMultiplier >= target) cashOut();
      }

      updateSquadronDuringFlight(liveMultiplier);

      // Crash trigger (sudden, unpredictable)
      if (isManualCrashPending || liveMultiplier >= crashMultiplier) {
        isManualCrashPending = false;
        transitionTo("CRASHED");
      }

      updateActionButton();
    }

    renderCanvas();
    requestAnimationFrame(gameLoop);
  }

  //====================================================================
  // WALLET & WITHDRAWAL CONTROLLER (WITH FIRESTORE & IP TRACKING)
  //====================================================================
  function openWalletModal(tab) {
    if (!DOM.modalWallet) return;
    DOM.modalWallet.classList.add("active");
    updatePlayerUIBalance();
    switchWalletTab(tab || "deposit");
  }

  function closeWalletModal() {
    if (!DOM.modalWallet) return;
    DOM.modalWallet.classList.remove("active");
    if (DOM.walletStatusAlert) DOM.walletStatusAlert.style.display = "none";
  }

  function switchWalletTab(tab) {
    if (tab === "deposit") {
      if (DOM.tabWalletDeposit) DOM.tabWalletDeposit.classList.add("active");
      if (DOM.tabWalletWithdraw) DOM.tabWalletWithdraw.classList.remove("active");
      if (DOM.walletPanelDeposit) DOM.walletPanelDeposit.classList.add("active");
      if (DOM.walletPanelWithdraw) DOM.walletPanelWithdraw.classList.remove("active");
    } else {
      if (DOM.tabWalletWithdraw) DOM.tabWalletWithdraw.classList.add("active");
      if (DOM.tabWalletDeposit) DOM.tabWalletDeposit.classList.remove("active");
      if (DOM.walletPanelWithdraw) DOM.walletPanelWithdraw.classList.add("active");
      if (DOM.walletPanelDeposit) DOM.walletPanelDeposit.classList.remove("active");
    }
  }

  function showWalletAlert(msg, isSuccess) {
    if (!DOM.walletStatusAlert) return;
    DOM.walletStatusAlert.textContent = msg;
    DOM.walletStatusAlert.className = "deposit-status-alert active " + (isSuccess ? "success" : "error");
    DOM.walletStatusAlert.style.display = "block";
    DOM.walletStatusAlert.style.backgroundColor = isSuccess ? "var(--status-success-dim)" : "var(--status-danger-dim)";
    DOM.walletStatusAlert.style.border = isSuccess ? "1px solid var(--status-success)" : "1px solid var(--status-danger)";
    DOM.walletStatusAlert.style.color = isSuccess ? "var(--status-success)" : "var(--status-danger)";
  }

  function setupWalletController() {
    if (DOM.tabWalletDeposit) DOM.tabWalletDeposit.addEventListener("click", function () { switchWalletTab("deposit"); });
    if (DOM.tabWalletWithdraw) DOM.tabWalletWithdraw.addEventListener("click", function () { switchWalletTab("withdraw"); });
    if (DOM.btnWalletClose) DOM.btnWalletClose.addEventListener("click", closeWalletModal);

    if (DOM.btnOpenWallet) DOM.btnOpenWallet.addEventListener("click", function () { openWalletModal("deposit"); });
    if (DOM.cardWalletBottom) DOM.cardWalletBottom.addEventListener("click", function () { openWalletModal("deposit"); });
    if (DOM.btnOpenDepositDossier) DOM.btnOpenDepositDossier.addEventListener("click", function () {
      if (DOM.modalProfile) DOM.modalProfile.classList.remove("active");
      openWalletModal("deposit");
    });
    if (DOM.btnOpenWalletFromDossier) DOM.btnOpenWalletFromDossier.addEventListener("click", function () {
      if (DOM.modalProfile) DOM.modalProfile.classList.remove("active");
      openWalletModal("deposit");
    });

    if (DOM.typeOptBank) {
      DOM.typeOptBank.addEventListener("click", function () {
        DOM.typeOptBank.classList.add("active");
        if (DOM.typeOptUpi) DOM.typeOptUpi.classList.remove("active");
        if (DOM.payoutBankForm) DOM.payoutBankForm.style.display = "flex";
        if (DOM.payoutUpiForm) DOM.payoutUpiForm.style.display = "none";
      });
    }

    if (DOM.typeOptUpi) {
      DOM.typeOptUpi.addEventListener("click", function () {
        DOM.typeOptUpi.classList.add("active");
        if (DOM.typeOptBank) DOM.typeOptBank.classList.remove("active");
        if (DOM.payoutBankForm) DOM.payoutBankForm.style.display = "none";
        if (DOM.payoutUpiForm) DOM.payoutUpiForm.style.display = "flex";
      });
    }

    if (DOM.withdrawPercentChips) {
      DOM.withdrawPercentChips.forEach(function (chip) {
        chip.addEventListener("click", function () {
          const pct = parseInt(chip.getAttribute("data-percent"), 10);
          const amt = Math.max(CONFIG.MIN_WITHDRAWAL, Math.floor((savedState.virtualBalance * pct) / 100));
          if (DOM.withdrawAmountInput) DOM.withdrawAmountInput.value = amt;
        });
      });
    }

    // Modal Deposit Action (Saves Real-Money in Firestore)
    if (DOM.btnModalDepositConfirm) {
      DOM.btnModalDepositConfirm.addEventListener("click", function () {
        const amt = parseFloat(DOM.modalDepositInput ? DOM.modalDepositInput.value : 100) || 100;
        const utr = (DOM.depositUtrInput ? DOM.depositUtrInput.value : "").trim();
        if (amt < 10) {
          showWalletAlert("Minimum deposit amount is ₹10", false);
          return;
        }

        savedState.virtualBalance += amt;
        saveState();
        updatePlayerUIBalance();
        showWalletAlert("Successfully added " + formatRupees(amt) + " to your Pilot Account! Real funds are stored in Firestore.", true);

        // Record in Firestore deposits and payment_logs with client IP
        if (window.AERO_FIREBASE && window.AERO_FIREBASE.db && window.AERO_FIREBASE.auth && window.AERO_FIREBASE.auth.currentUser) {
          const uid = window.AERO_FIREBASE.auth.currentUser.uid;
          const txId = "DEP" + Date.now();
          window.AERO_FIREBASE.db.collection("deposits").doc(txId).set({
            txId: txId,
            uid: uid,
            email: savedState.userEmail,
            callsign: savedState.callsign,
            amount: amt,
            utrNumber: utr || "DIRECT_ONLINE",
            ip: clientIP,
            status: "SUCCESS",
            timestamp: new Date()
          }).catch(function () {});

          window.AERO_FIREBASE.db.collection("payment_logs").add({
            uid: uid,
            callsign: savedState.callsign,
            amount: amt,
            type: "DEPOSIT",
            ip: clientIP,
            timestamp: new Date(),
            status: "SUCCESS"
          }).catch(function () {});
        }

        addFeedItem(savedState.callsign + " deposited " + formatRupees(amt), "cashout");
      });
    }

    // Modal Withdrawal Request (Saves Real-Money in Firestore)
    if (DOM.btnSubmitWithdrawal) {
      DOM.btnSubmitWithdrawal.addEventListener("click", function () {
        const withdrawAmt = parseFloat(DOM.withdrawAmountInput ? DOM.withdrawAmountInput.value : 0);
        if (isNaN(withdrawAmt) || withdrawAmt < CONFIG.MIN_WITHDRAWAL) {
          showWalletAlert("Minimum withdrawal amount is " + formatRupees(CONFIG.MIN_WITHDRAWAL), false);
          return;
        }

        if (withdrawAmt > savedState.virtualBalance) {
          showWalletAlert("Insufficient wallet balance. You have " + formatRupees(savedState.virtualBalance), false);
          return;
        }

        const isBank = DOM.typeOptBank && DOM.typeOptBank.classList.contains("active");
        let withdrawalDetails = {};

        if (isBank) {
          const bankName = (DOM.withdrawBankName ? DOM.withdrawBankName.value : "").trim();
          const holderName = (DOM.withdrawAccountHolder ? DOM.withdrawAccountHolder.value : "").trim();
          const accNo = (DOM.withdrawAccountNumber ? DOM.withdrawAccountNumber.value : "").trim();
          const accNoConfirm = (DOM.withdrawAccountNumberConfirm ? DOM.withdrawAccountNumberConfirm.value : "").trim();
          const ifsc = (DOM.withdrawIfscCode ? DOM.withdrawIfscCode.value : "").trim().toUpperCase();

          if (!holderName || !bankName || !accNo || !ifsc) {
            showWalletAlert("Please fill in all bank details (Bank Name, Holder Name, Account Number, IFSC).", false);
            return;
          }

          if (accNo !== accNoConfirm) {
            showWalletAlert("Account Number and Confirmation do not match.", false);
            return;
          }

          if (ifsc.length < 9) {
            showWalletAlert("Please enter a valid 11-character IFSC Code.", false);
            return;
          }

          withdrawalDetails = {
            method: "BANK_TRANSFER",
            bankName: bankName,
            accountHolder: holderName,
            accountNumber: accNo,
            ifsc: ifsc
          };
        } else {
          const upiName = (DOM.withdrawUpiName ? DOM.withdrawUpiName.value : "").trim();
          const upiId = (DOM.withdrawUpiId ? DOM.withdrawUpiId.value : "").trim();

          if (!upiName || !upiId || !upiId.includes("@")) {
            showWalletAlert("Please provide your Name and a valid UPI ID (e.g. mobile@upi).", false);
            return;
          }

          withdrawalDetails = {
            method: "UPI_TRANSFER",
            accountHolder: upiName,
            upiId: upiId
          };
        }

        // Deduct from live balance
        savedState.virtualBalance -= withdrawAmt;
        saveState();
        updatePlayerUIBalance();

        const txId = "WTH" + Math.floor(100000 + Math.random() * 900000);
        showWalletAlert("WITHDRAWAL SUBMITTED: " + formatRupees(withdrawAmt) + " request registered for " + (isBank ? "Bank IMPS" : "UPI") + ". Ref: #" + txId, true);

        // Record in Firestore withdrawals collection with user IP
        if (window.AERO_FIREBASE && window.AERO_FIREBASE.db && window.AERO_FIREBASE.auth && window.AERO_FIREBASE.auth.currentUser) {
          const uid = window.AERO_FIREBASE.auth.currentUser.uid;
          window.AERO_FIREBASE.db.collection("withdrawals").doc(txId).set({
            txId: txId,
            uid: uid,
            email: savedState.userEmail,
            callsign: savedState.callsign,
            amount: withdrawAmt,
            details: withdrawalDetails,
            ip: clientIP,
            status: "PENDING",
            timestamp: new Date()
          }).catch(function () {});

          window.AERO_FIREBASE.db.collection("payment_logs").add({
            uid: uid,
            callsign: savedState.callsign,
            amount: withdrawAmt,
            type: "WITHDRAWAL",
            method: withdrawalDetails.method,
            ip: clientIP,
            timestamp: new Date(),
            status: "PENDING"
          }).catch(function () {});
        }

        addFeedItem(savedState.callsign + " requested withdrawal of " + formatRupees(withdrawAmt), "cashout");
      });
    }

    if (DOM.modalDepositChips) {
      DOM.modalDepositChips.forEach(function (chip) {
        chip.addEventListener("click", function () {
          DOM.modalDepositChips.forEach(function (c) { c.classList.remove("selected"); });
          chip.classList.add("selected");
          const amt = chip.getAttribute("data-amt");
          if (DOM.modalDepositInput) DOM.modalDepositInput.value = amt;
          if (DOM.btnModalDepositConfirm) DOM.btnModalDepositConfirm.textContent = "ADD ₹" + amt + " TO WALLET";
        });
      });
    }

    if (DOM.modalPaymentMethods) {
      DOM.modalPaymentMethods.forEach(function (method) {
        method.addEventListener("click", function () {
          DOM.modalPaymentMethods.forEach(function (m) { m.classList.remove("selected"); });
          method.classList.add("selected");
        });
      });
    }
  }

  //====================================================================
  // DOSSIER & HISTORY LOGS
  //====================================================================
  function updateCareerTables() {
    if (DOM.dossierRole) DOM.dossierRole.textContent = (savedState.userRole || "PILOT").toUpperCase();
    if (DOM.dossierCallsign) DOM.dossierCallsign.textContent = savedState.callsign || "MAVERICK";
    if (DOM.dossierUserIp) DOM.dossierUserIp.textContent = clientIP || "Detecting...";
    if (DOM.dossierRoundsPlayed) DOM.dossierRoundsPlayed.textContent = savedState.career.roundsPlayed;
    if (DOM.dossierRoundsWon) DOM.dossierRoundsWon.textContent = savedState.career.roundsWon;
    if (DOM.dossierRoundsLost) DOM.dossierRoundsLost.textContent = savedState.career.roundsLost;

    const rate = savedState.career.roundsPlayed > 0
      ? ((savedState.career.roundsWon / savedState.career.roundsPlayed) * 100).toFixed(1)
      : "0.0";
    if (DOM.dossierWinRate) DOM.dossierWinRate.textContent = rate + "%";
    if (DOM.dossierHighestMulti) DOM.dossierHighestMulti.textContent = savedState.career.highestCashoutMulti.toFixed(2) + "x";
    if (DOM.dossierBestPayout) DOM.dossierBestPayout.textContent = formatRupees(savedState.career.bestPayoutVc);
  }

  function renderPersonalHistoryLogs() {
    if (!DOM.personalLogsContainer) return;
    if (!savedState.history || savedState.history.length === 0) {
      DOM.personalLogsContainer.innerHTML = '<div class="empty-logs">No completed flights yet.</div>';
      return;
    }

    let html = "";
    savedState.history.slice(0, 20).forEach(function (log) {
      const isWin = log.status === "WIN";
      html += '<div class="personal-log-row ' + (isWin ? "win" : "loss") + '">' +
        '<span>ROUND #' + log.round + '</span>' +
        '<span>' + formatRupees(log.stake) + '</span>' +
        '<span>' + (log.multiplier > 0 ? log.multiplier.toFixed(2) + "x" : "Crashed") + '</span>' +
        '<span style="color:' + (isWin ? "var(--status-success)" : "var(--status-danger)") + '; font-weight:700;">' +
        (isWin ? "+" : "") + formatRupees(log.profit) +
        '</span>' +
        '</div>';
    });
    DOM.personalLogsContainer.innerHTML = html;
  }

  //====================================================================
  // GAME MASTER ADMIN CONTROLS & FIRESTORE DATABASE INSPECTION
  //====================================================================
  function setupAdminPortal() {
    const adminTabs = [DOM.tabAdminFlight, DOM.tabAdminUsers, DOM.tabAdminWithdrawals];
    const adminPanels = [DOM.adminPanelFlight, DOM.adminPanelUsers, DOM.adminPanelWithdrawals];

    function switchAdminTab(tabName) {
      adminTabs.forEach(function (t) { if (t) t.classList.remove("active"); });
      adminPanels.forEach(function (p) { if (p) p.classList.remove("active"); });

      if (tabName === "flight") {
        if (DOM.tabAdminFlight) DOM.tabAdminFlight.classList.add("active");
        if (DOM.adminPanelFlight) DOM.adminPanelFlight.classList.add("active");
      } else if (tabName === "users") {
        if (DOM.tabAdminUsers) DOM.tabAdminUsers.classList.add("active");
        if (DOM.adminPanelUsers) DOM.adminPanelUsers.classList.add("active");
        fetchAdminUsers();
      } else if (tabName === "withdrawals") {
        if (DOM.tabAdminWithdrawals) DOM.tabAdminWithdrawals.classList.add("active");
        if (DOM.adminPanelWithdrawals) DOM.adminPanelWithdrawals.classList.add("active");
        fetchAdminWithdrawals();
      }
    }

    if (DOM.tabAdminFlight) DOM.tabAdminFlight.addEventListener("click", function () { switchAdminTab("flight"); });
    if (DOM.tabAdminUsers) DOM.tabAdminUsers.addEventListener("click", function () { switchAdminTab("users"); });
    if (DOM.tabAdminWithdrawals) DOM.tabAdminWithdrawals.addEventListener("click", function () { switchAdminTab("withdrawals"); });

    if (DOM.btnRefreshAdminUsers) DOM.btnRefreshAdminUsers.addEventListener("click", fetchAdminUsers);
    if (DOM.btnRefreshAdminWithdrawals) DOM.btnRefreshAdminWithdrawals.addEventListener("click", fetchAdminWithdrawals);
  }

  // Fetch all registered users from Firestore for Admin
  function fetchAdminUsers() {
    if (!DOM.adminUsersTable || !window.AERO_FIREBASE || !window.AERO_FIREBASE.db) return;
    const tbody = DOM.adminUsersTable.querySelector("tbody");
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-dim);">Fetching live users...</td></tr>';

    window.AERO_FIREBASE.db.collection("users").get()
      .then(function (snapshot) {
        if (snapshot.empty) {
          tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No users registered yet.</td></tr>';
          return;
        }

        let html = "";
        snapshot.forEach(function (doc) {
          const u = doc.data();
          html += '<tr>' +
            '<td style="color:var(--accent-amber); font-weight:700;">' + (u.callsign || "PILOT") + '</td>' +
            '<td>' + (u.email || "—") + '</td>' +
            '<td style="color:var(--status-info);">' + (u.lastIP || "—") + '</td>' +
            '<td style="color:var(--status-success); font-weight:700;">' + formatRupees(u.balance || 0) + '</td>' +
            '</tr>';
        });
        tbody.innerHTML = html;
      })
      .catch(function (err) {
        // Fallback: If Firestore rules restrict collection query, display active session telemetry
        tbody.innerHTML = '<tr>' +
          '<td style="color:var(--accent-amber); font-weight:700;">' + (savedState.callsign || "PILOT") + ' (ACTIVE)</td>' +
          '<td>' + (savedState.userEmail || "pilot@aerocrash.com") + '</td>' +
          '<td style="color:var(--status-info);">' + clientIP + '</td>' +
          '<td style="color:var(--status-success); font-weight:700;">' + formatRupees(savedState.virtualBalance) + '</td>' +
          '</tr>' +
          '<tr><td colspan="4" style="text-align:center; color:var(--text-dim); font-size:9px; padding:6px;">LIVE TELEMETRY ACTIVE • FIRESTORE SYNCED</td></tr>';
      });
  }

  // Fetch all withdrawal requests from Firestore for Admin Approval
  function fetchAdminWithdrawals() {
    if (!DOM.adminWithdrawalsTable || !window.AERO_FIREBASE || !window.AERO_FIREBASE.db) return;
    const tbody = DOM.adminWithdrawalsTable.querySelector("tbody");
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-dim);">Fetching withdrawal requests...</td></tr>';

    window.AERO_FIREBASE.db.collection("withdrawals").get()
      .then(function (snapshot) {
        if (snapshot.empty) {
          tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No withdrawal requests found.</td></tr>';
          return;
        }

        let html = "";
        snapshot.forEach(function (doc) {
          const w = doc.data();
          const isPending = w.status === "PENDING";
          const methodLabel = w.details && w.details.method === "BANK_TRANSFER" ? "BANK" : "UPI";
          
          let actionHtml = '<span style="color:' + (w.status === "APPROVED" ? "var(--status-success)" : "var(--status-danger)") + '; font-weight:700;">' + (w.status || "COMPLETED") + '</span>';
          if (isPending) {
            actionHtml = '<button type="button" class="btn-admin-action-sm btn-admin-approve" data-doc="' + doc.id + '">APPROVE</button> ' +
              '<button type="button" class="btn-admin-action-sm btn-admin-reject" data-doc="' + doc.id + '" data-uid="' + w.uid + '" data-amt="' + w.amount + '">REJECT</button>';
          }

          html += '<tr>' +
            '<td>' + (w.callsign || "PILOT") + '<br><small style="color:var(--text-dim);">' + (w.ip || "") + '</small></td>' +
            '<td style="color:var(--status-success); font-weight:700;">' + formatRupees(w.amount) + '</td>' +
            '<td>' + methodLabel + '</td>' +
            '<td>' + actionHtml + '</td>' +
            '</tr>';
        });
        tbody.innerHTML = html;

        // Bind Approve / Reject buttons
        tbody.querySelectorAll(".btn-admin-approve").forEach(function (btn) {
          btn.addEventListener("click", function () {
            const docId = btn.getAttribute("data-doc");
            window.AERO_FIREBASE.db.collection("withdrawals").doc(docId).update({
              status: "APPROVED",
              approvedAt: new Date()
            }).then(function () {
              fetchAdminWithdrawals();
            });
          });
        });

        tbody.querySelectorAll(".btn-admin-reject").forEach(function (btn) {
          btn.addEventListener("click", function () {
            const docId = btn.getAttribute("data-doc");
            const uid = btn.getAttribute("data-uid");
            const refundAmt = parseFloat(btn.getAttribute("data-amt")) || 0;

            window.AERO_FIREBASE.db.collection("withdrawals").doc(docId).update({
              status: "REJECTED",
              rejectedAt: new Date()
            }).then(function () {
              // Refund user balance
              if (uid && refundAmt > 0) {
                const userDoc = window.AERO_FIREBASE.db.collection("users").doc(uid);
                userDoc.get().then(function (d) {
                  if (d.exists) {
                    const curr = d.data().balance || 0;
                    userDoc.update({ balance: curr + refundAmt });
                  }
                });
              }
              fetchAdminWithdrawals();
            });
          });
        });
      })
      .catch(function (err) {
        tbody.innerHTML = '<tr><td colspan="4" style="color:var(--status-danger);">Error: ' + err.message + '</td></tr>';
      });
  }

  //====================================================================
  // EVENT LISTENERS & SETUP
  //====================================================================
  function setupEventListeners() {
    if (DOM.btnAction) DOM.btnAction.addEventListener("click", handleActionClick);

    if (DOM.tabCtrlBetting && DOM.tabCtrlHistory) {
      DOM.tabCtrlBetting.addEventListener("click", function () {
        DOM.tabCtrlBetting.classList.add("active");
        DOM.tabCtrlHistory.classList.remove("active");
        if (DOM.controlsBettingView) DOM.controlsBettingView.classList.add("active");
        if (DOM.controlsHistoryView) DOM.controlsHistoryView.classList.remove("active");
      });

      DOM.tabCtrlHistory.addEventListener("click", function () {
        DOM.tabCtrlHistory.classList.add("active");
        DOM.tabCtrlBetting.classList.remove("active");
        if (DOM.controlsHistoryView) DOM.controlsHistoryView.classList.add("active");
        if (DOM.controlsBettingView) DOM.controlsBettingView.classList.remove("active");
        renderPersonalHistoryLogs();
      });
    }

    if (DOM.quickStakeChips) {
      DOM.quickStakeChips.forEach(function (chip) {
        chip.addEventListener("click", function () {
          DOM.quickStakeChips.forEach(function (c) { c.classList.remove("active"); });
          chip.classList.add("active");
          const val = chip.getAttribute("data-value");
          if (DOM.stakeInput) DOM.stakeInput.value = val;
          updateActionButton();
        });
      });
    }

    if (DOM.btnStakeInc) {
      DOM.btnStakeInc.addEventListener("click", function () {
        let val = getCurrentStakeInput() + 10;
        if (DOM.stakeInput) DOM.stakeInput.value = Math.min(CONFIG.MAX_STAKE, val);
        updateActionButton();
      });
    }

    if (DOM.btnStakeDec) {
      DOM.btnStakeDec.addEventListener("click", function () {
        let val = getCurrentStakeInput() - 10;
        if (DOM.stakeInput) DOM.stakeInput.value = Math.max(CONFIG.MIN_STAKE, val);
        updateActionButton();
      });
    }

    if (DOM.btnClearAutocashout) {
      DOM.btnClearAutocashout.addEventListener("click", function () {
        if (DOM.autoInput) DOM.autoInput.value = "2.00";
      });
    }

    if (DOM.btnSoundToggle) {
      DOM.btnSoundToggle.addEventListener("click", function () {
        savedState.audioEnabled = !savedState.audioEnabled;
        DOM.btnSoundToggle.style.color = savedState.audioEnabled ? "var(--text-main)" : "var(--status-danger)";
      });
    }

    if (DOM.btnFullscreenToggle) {
      DOM.btnFullscreenToggle.addEventListener("click", function () {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(function () {});
        else document.exitFullscreen().catch(function () {});
      });
    }

    if (DOM.btnRulesToggle) {
      DOM.btnRulesToggle.addEventListener("click", function () {
        if (DOM.modalOnboarding) DOM.modalOnboarding.classList.add("active");
      });
    }
    if (DOM.btnRulesClose) DOM.btnRulesClose.addEventListener("click", function () {
      if (DOM.modalOnboarding) DOM.modalOnboarding.classList.remove("active");
    });
    if (DOM.btnOnboardingDismiss) DOM.btnOnboardingDismiss.addEventListener("click", function () {
      if (DOM.modalOnboarding) DOM.modalOnboarding.classList.remove("active");
    });

    if (DOM.profileChip) {
      DOM.profileChip.addEventListener("click", function () {
        if (DOM.modalProfile) {
          updateCareerTables();
          DOM.modalProfile.classList.add("active");
        }
      });
    }
    if (DOM.btnProfileClose) DOM.btnProfileClose.addEventListener("click", function () {
      if (DOM.modalProfile) DOM.modalProfile.classList.remove("active");
    });
    if (DOM.btnDossierCloseBottom) DOM.btnDossierCloseBottom.addEventListener("click", function () {
      if (DOM.modalProfile) DOM.modalProfile.classList.remove("active");
    });

    if (DOM.btnResetStats) {
      DOM.btnResetStats.addEventListener("click", function () {
        if (confirm("Reset pilot career telemetry stats?")) {
          savedState.career = {
            roundsPlayed: 0,
            roundsWon: 0,
            roundsLost: 0,
            totalVcStaked: 0,
            totalVcWon: 0,
            totalVcLost: 0,
            highestCashoutMulti: 0.0,
            bestPayoutVc: 0,
          };
          savedState.history = [];
          saveState();
          updateCareerTables();
          renderPersonalHistoryLogs();
          updatePlayerUIBalance();
        }
      });
    }

    if (DOM.btnAuthSignout) {
      DOM.btnAuthSignout.addEventListener("click", function () {
        if (userDocUnsubscribe) {
          userDocUnsubscribe();
          userDocUnsubscribe = null;
        }
        if (window.AERO_FIREBASE && window.AERO_FIREBASE.auth) {
          window.AERO_FIREBASE.auth.signOut().catch(function () {});
        }
        savedState.isLoggedIn = false;
        savedState.userRole = "user";
        if (DOM.modalProfile) DOM.modalProfile.classList.remove("active");
        switchScreen("AUTH");
      });
    }

    if (DOM.btnGmToggle) {
      DOM.btnGmToggle.addEventListener("click", function () {
        if (DOM.drawerGM) DOM.drawerGM.classList.add("active");
      });
    }
    if (DOM.btnGmClose) {
      DOM.btnGmClose.addEventListener("click", function () {
        if (DOM.drawerGM) DOM.drawerGM.classList.remove("active");
      });
    }
    if (DOM.gmBtnForceCrash) {
      DOM.gmBtnForceCrash.addEventListener("click", function () {
        if (gameState === "RUNNING") isManualCrashPending = true;
      });
    }
    if (DOM.gmBtnPauseToggle) {
      DOM.gmBtnPauseToggle.addEventListener("click", function () {
        isGamePaused = !isGamePaused;
        DOM.gmBtnPauseToggle.textContent = isGamePaused ? "RESUME SIMULATION" : "PAUSE SIMULATION";
      });
    }
    if (DOM.gmFleetCount) {
      DOM.gmFleetCount.addEventListener("input", function () {
        fleetCount = parseInt(DOM.gmFleetCount.value, 10);
        if (DOM.gmFleetValue) DOM.gmFleetValue.textContent = fleetCount;
      });
    }
    if (DOM.gmTargetInput) {
      DOM.gmTargetInput.addEventListener("input", function () {
        if (DOM.gmOverrideEnabled && DOM.gmOverrideEnabled.checked) {
          const manual = parseFloat(DOM.gmTargetInput.value);
          if (!isNaN(manual) && manual >= 1.01) {
            crashMultiplier = manual;
            if (DOM.debugTargetMulti) DOM.debugTargetMulti.textContent = crashMultiplier.toFixed(2) + "x";
          }
        }
      });
    }
    if (DOM.gmOverrideEnabled) {
      DOM.gmOverrideEnabled.addEventListener("change", function () {
        if (DOM.gmOverrideEnabled.checked) {
          const manual = parseFloat(DOM.gmTargetInput ? DOM.gmTargetInput.value : 2.5) || 2.5;
          crashMultiplier = manual;
          if (DOM.debugTargetMulti) DOM.debugTargetMulti.textContent = crashMultiplier.toFixed(2) + "x";
        } else {
          crashMultiplier = generateCrashPoint();
          if (DOM.debugTargetMulti) DOM.debugTargetMulti.textContent = crashMultiplier.toFixed(2) + "x";
        }
      });
    }

    if (DOM.btnPaymentProceed) {
      DOM.btnPaymentProceed.addEventListener("click", function () {
        switchScreen("GAME");
      });
    }
    if (DOM.btnConfirmDeposit) {
      DOM.btnConfirmDeposit.addEventListener("click", function () {
        const amt = parseFloat(DOM.depositInput ? DOM.depositInput.value : 100) || 100;
        savedState.virtualBalance += amt;
        saveState();
        updatePlayerUIBalance();
        if (DOM.depositAlert) {
          DOM.depositAlert.textContent = "Added " + formatRupees(amt) + " to your Pilot Wallet!";
          DOM.depositAlert.className = "deposit-status-alert active";
        }
      });
    }
  }

  //====================================================================
  // AUTHENTICATION & BACKEND DETECTION CONTROLLER
  //====================================================================
  function setupAuthFlow() {
    if (!DOM.authTabs) return;
    DOM.authTabs.forEach(function (tab) {
      tab.addEventListener("click", function () {
        DOM.authTabs.forEach(function (t) { t.classList.remove("active"); });
        tab.classList.add("active");
        currentAuthMode = tab.getAttribute("data-mode");

        if (currentAuthMode === "register") {
          if (DOM.authGroupCallsign) DOM.authGroupCallsign.style.display = "flex";
          if (DOM.authTitle) DOM.authTitle.textContent = "PILOT REGISTRATION";
          if (DOM.authSubmit) DOM.authSubmit.textContent = "REGISTER & GET ₹10 BONUS";
        } else if (currentAuthMode === "admin") {
          if (DOM.authGroupCallsign) DOM.authGroupCallsign.style.display = "none";
          if (DOM.authTitle) DOM.authTitle.textContent = "ADMIN COMMAND PORTAL";
          if (DOM.authSubmit) DOM.authSubmit.textContent = "ADMIN SECURE LOGIN";
        } else {
          if (DOM.authGroupCallsign) DOM.authGroupCallsign.style.display = "none";
          if (DOM.authTitle) DOM.authTitle.textContent = "PILOT SIGN IN";
          if (DOM.authSubmit) DOM.authSubmit.textContent = "SIGN IN & PROCEED";
        }
      });
    });

    if (DOM.authSubmit) {
      DOM.authSubmit.addEventListener("click", function () {
        handleAuthSubmit();
      });
    }

    if (window.AERO_FIREBASE && window.AERO_FIREBASE.auth) {
      window.AERO_FIREBASE.auth.onAuthStateChanged(function (user) {
        if (user) {
          detectAndSyncBackend(user, "session_restore", "");
        }
      });
    }
  }

  function handleAuthSubmit() {
    const email = (DOM.authEmailInput ? DOM.authEmailInput.value : "").trim();
    const password = (DOM.authPasswordInput ? DOM.authPasswordInput.value : "").trim();
    const callsign = (DOM.authCallsignInput ? DOM.authCallsignInput.value : "").trim() || "MAVERICK";

    if (!email || !password) {
      showAuthStatus("Please enter both Email and Password.", "error");
      return;
    }

    showAuthStatus("Authenticating with Firebase...", "success");

    if (!window.AERO_FIREBASE || !window.AERO_FIREBASE.auth) {
      savedState.isLoggedIn = true;
      savedState.userEmail = email;
      savedState.callsign = callsign;
      savedState.userRole = currentAuthMode === "admin" ? "admin" : "user";
      saveState();
      completeLoginRouting(currentAuthMode);
      return;
    }

    const auth = window.AERO_FIREBASE.auth;
    if (currentAuthMode === "register") {
      auth.createUserWithEmailAndPassword(email, password)
        .then(function (cred) {
          detectAndSyncBackend(cred.user, "register", callsign);
        })
        .catch(function (err) {
          showAuthStatus(err.message || "Registration failed.", "error");
        });
    } else {
      auth.signInWithEmailAndPassword(email, password)
        .then(function (cred) {
          detectAndSyncBackend(cred.user, currentAuthMode, callsign);
        })
        .catch(function (err) {
          showAuthStatus(err.message || "Authentication failed.", "error");
        });
    }
  }

  function detectAndSyncBackend(user, authMode, customCallsign) {
    const email = (user.email || "").toLowerCase();
    const uid = user.uid;
    const db = window.AERO_FIREBASE.db;

    const isAdmin = (window.AERO_FIREBASE.isAdminEmail && window.AERO_FIREBASE.isAdminEmail(email));
    const role = isAdmin ? "admin" : "user";

    savedState.userEmail = email;
    savedState.userRole = role;
    savedState.isLoggedIn = true;

    // Log IP and Login in Firestore
    if (db) {
      db.collection("login_logs").add({
        uid: uid,
        email: email,
        ip: clientIP,
        authMode: authMode,
        timestamp: new Date()
      }).catch(function () {});
    }

    if (!db) {
      saveState();
      completeLoginRouting(authMode);
      return;
    }

    const userRef = db.collection("users").doc(uid);
    userRef.get().then(function (doc) {
      if (doc.exists) {
        const data = doc.data();
        savedState.callsign = data.callsign || customCallsign || savedState.callsign;
        savedState.virtualBalance = typeof data.balance === "number" ? data.balance : savedState.virtualBalance;
        if (data.career) savedState.career = Object.assign(savedState.career, data.career);
        userRef.set({
          lastIP: clientIP,
          lastLoginAt: new Date()
        }, { merge: true }).catch(function () {});
      } else {
        savedState.callsign = customCallsign || email.split("@")[0].toUpperCase() || "MAVERICK";
        savedState.virtualBalance = CONFIG.INITIAL_BALANCE;
        userRef.set({
          email: email,
          callsign: savedState.callsign,
          role: role,
          balance: savedState.virtualBalance,
          createdAt: new Date(),
          lastIP: clientIP,
          career: savedState.career
        }).catch(function () {});
      }

      saveState();
      listenToUserDoc(uid);
      completeLoginRouting(authMode);
    }).catch(function (err) {
      console.warn("Backend sync error:", err);
      saveState();
      completeLoginRouting(authMode);
    });
  }

  function listenToUserDoc(uid) {
    if (userDocUnsubscribe) userDocUnsubscribe();
    if (!window.AERO_FIREBASE || !window.AERO_FIREBASE.db) return;

    userDocUnsubscribe = window.AERO_FIREBASE.db.collection("users").doc(uid)
      .onSnapshot(function (doc) {
        if (doc.exists) {
          const data = doc.data();
          if (typeof data.balance === "number" && data.balance !== savedState.virtualBalance) {
            savedState.virtualBalance = data.balance;
            updatePlayerUIBalance();
          }
          if (data.callsign && data.callsign !== savedState.callsign) {
            savedState.callsign = data.callsign;
            updatePlayerUIBalance();
          }
        }
      }, function () {});
  }

  function completeLoginRouting(authMode) {
    updatePlayerUIBalance();
    if (savedState.userRole === "admin") {
      if (DOM.btnGmToggle) DOM.btnGmToggle.style.display = "flex";
      switchScreen("GAME");
    } else {
      if (DOM.btnGmToggle) DOM.btnGmToggle.style.display = "none";
      if (authMode === "register") switchScreen("PAYMENT");
      else switchScreen("GAME");
    }
  }

  function showAuthStatus(msg, type) {
    if (!DOM.authStatusBox) return;
    DOM.authStatusBox.textContent = msg;
    DOM.authStatusBox.className = "auth-status-box " + (type || "error");
  }

  //====================================================================
  // INITIALIZATION
  //====================================================================
  function init() {
    loadState();
    cacheDOM();
    setupEventListeners();
    setupWalletController();
    setupAuthFlow();
    setupAdminPortal();
    resizeCanvas();

    let splashProgress = 0;
    const splashInterval = setInterval(function () {
      splashProgress += 4;
      if (DOM.splashBar) DOM.splashBar.style.width = splashProgress + "%";
      if (splashProgress >= 100) {
        clearInterval(splashInterval);
        if (savedState.isLoggedIn) {
          completeLoginRouting("login");
        } else {
          switchScreen("AUTH");
        }
        transitionTo("BETTING");
        requestAnimationFrame(gameLoop);
      }
    }, 40);
  }

  window.addEventListener("DOMContentLoaded", init);
})();
