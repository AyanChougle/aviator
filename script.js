/**
 * AEROCRASH — TACTICAL HIGH-ALTITUDE FLIGHT SIMULATOR
 * Real-time Synchronized Multi-User Global Gameplay, Real-User Active Bets, Dynamic Multiple Betting System
 * Auto-Bet, Auto-Cashout, Bank & UPI Payout Persistence, Firestore Cloud Sync
 */

(function () {
  "use strict";

  //===================================================================
  // CONSTANTS & CONFIG
  //===================================================================
  const CONFIG = {
    STORAGE_KEY: "aero_crash_rupees_v2",
    INITIAL_BALANCE: 10.00, // ₹10 Free Starting Credit
    MIN_STAKE: 1,           // ₹1 minimum (no restrictive minimum)
    MAX_STAKE: 8000,        // ₹8,000 maximum stake limit (8K Cap)
    MIN_WITHDRAWAL: 50,     // ₹50 minimum withdrawal
    MAX_SIMULTANEOUS_BETS: Infinity, // No limit on simultaneous bets
    TIMINGS: {
      SPLASH_MS: 1400,
      BETTING_MS: 8000,
      LAUNCHING_MS: 1000,
      CRASHED_MS: 1600,
      RESULT_MS: 2000,
    },
  };

  let clientIP = "Detecting...";
  let clientGeo = {};

  let savedState = {
    callsign: "MAVERICK",
    userEmail: "",
    userRole: "user", // "user" | "admin"
    isLoggedIn: false,
    virtualBalance: CONFIG.INITIAL_BALANCE,
    bankDetails: {
      bankName: "",
      holder: "",
      account: "",
      ifsc: ""
    },
    upiDetails: {
      upiName: "",
      upiId: ""
    },
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

  function saveState() {
    try {
      localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(savedState));
    } catch (e) {
      console.warn("Failed to save storage", e);
    }
  }

  // Currency Formatter: Indian Rupee (₹)
  function formatRupees(amt) {
    if (typeof amt !== "number" || isNaN(amt)) amt = 0;
    return "₹" + amt.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // Audio Engine
  let audioContext = null;
  function initAudio() {
    if (!savedState.audioEnabled) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!audioContext && AudioCtx) audioContext = new AudioCtx();
      if (audioContext && audioContext.state === "suspended") audioContext.resume();
    } catch (e) {}
  }

  function playTone(freq, type, duration, vol) {
    if (!savedState.audioEnabled || !audioContext) return;
    try {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = type || "sine";
      osc.frequency.setValueAtTime(freq, audioContext.currentTime);
      gain.gain.setValueAtTime(vol || 0.15, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
      osc.connect(gain);
      gain.connect(audioContext.destination);
      osc.start();
      osc.stop(audioContext.currentTime + duration);
    } catch (e) {}
  }

  function soundCountdown() { playTone(440, "triangle", 0.08, 0.12); }
  function soundLaunch() { playTone(280, "sine", 0.4, 0.2); }
  function soundCashout() {
    playTone(587, "sine", 0.1, 0.2);
    setTimeout(function () { playTone(880, "sine", 0.25, 0.25); }, 90);
  }
  function soundCrash() { playTone(120, "sawtooth", 0.5, 0.3); }

  //===================================================================
  // ENGINE & MULTIPLAYER GAME STATE
  //===================================================================
  let gameState = "BETTING"; // "BETTING", "LAUNCHING", "RUNNING", "CRASHED", "RESULT"
  let roundNumber = 2848;
  let liveMultiplier = 1.00;
  let crashMultiplier = 2.50;
  let currentScreen = "SPLASH";
  let isGamePaused = false;
  let isManualCrashPending = false;
  let fleetCount = 150;

  // DYNAMIC MULTIPLE BET SLOTS
  let activeSlotIds = [1, 2];
  let bets = {
    1: {
      isPlaced: false,
      stake: 10,
      isCashedOut: false,
      cashoutMultiplier: 0.0,
      cashoutAmount: 0,
      autoBet: false,
      autoCashout: false,
      autoCashoutVal: 2.00
    },
    2: {
      isPlaced: false,
      stake: 10,
      isCashedOut: false,
      cashoutMultiplier: 0.0,
      cashoutAmount: 0,
      autoBet: false,
      autoCashout: false,
      autoCashoutVal: 3.00
    }
  };

  let currentAuthMode = "login";
  let userDocUnsubscribe = null;

  // Canvas Physics
  let canvasCtx = null;
  let canvasWidth = 800;
  let canvasHeight = 450;
  let debrisParticles = [];
  let liveTrail = [];

  // DOM Elements Cache
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

      // Left Navigation & Bet Panels Wrapper
      tabCtrlBetting: document.getElementById("tab-ctrl-betting"),
      tabCtrlHistory: document.getElementById("tab-ctrl-history"),
      controlsBettingView: document.getElementById("controls-betting-view"),
      controlsHistoryView: document.getElementById("controls-history-view"),
      betPanelsWrapper: document.getElementById("bet-panels-wrapper"),
      btnAddBetPanel: document.getElementById("btn-add-bet-panel"),
      actionFeedback: document.getElementById("action-feedback"),

      // Canvas & Flight Overlays (Matched 100% with index.html IDs)
      canvas: document.getElementById("flight-canvas"),
      hudContainer: document.getElementById("hud-multiplier-container"),
      hudMultiplier: document.getElementById("hud-multiplier"),
      countdownOverlay: document.getElementById("countdown-overlay"),
      countdownDigits: document.getElementById("countdown-digits"),
      crashOverlay: document.getElementById("crash-overlay"),
      crashMultiplier: document.getElementById("crash-multiplier"),
      playerResultBanner: document.getElementById("player-result-banner"),

      // Telemetry
      telemAlt: document.getElementById("telem-alt"),
      telemVel: document.getElementById("telem-vel"),
      telemTraj: document.getElementById("telem-traj"),

      // Squadron Live Bets Table
      squadronBetsTable: document.getElementById("squadron-bets-table"),
      squadronCountBadge: document.getElementById("squadron-count-badge"),
      activityFeedList: document.getElementById("activity-feed-list"),
      footerLiveClock: document.getElementById("footer-live-clock"),

      // Wallet / Payment
      cardWalletBottom: document.getElementById("card-wallet-bottom"),
      userBalanceDisplay: document.getElementById("user-vc-display"),
      totalStakedDisplay: document.getElementById("stat-total-staked"),
      totalWinsDisplay: document.getElementById("stat-total-wins"),
      paymentCurrentBalance: document.getElementById("payment-current-balance"),
      depositInput: document.getElementById("input-deposit-amount"),
      depositChips: document.querySelectorAll("#screen-payment .deposit-chip-btn"),
      btnConfirmDeposit: document.getElementById("btn-confirm-deposit"),
      btnPaymentProceed: document.getElementById("btn-payment-proceed"),
      depositAlert: document.getElementById("deposit-status-alert"),

      // Wallet Modal
      modalWallet: document.getElementById("modal-wallet"),
      tabWalletDeposit: document.getElementById("tab-wallet-deposit"),
      tabWalletWithdraw: document.getElementById("tab-wallet-withdraw"),
      walletPanelDeposit: document.getElementById("wallet-tab-content-deposit"),
      walletPanelWithdraw: document.getElementById("wallet-tab-content-withdraw"),
      btnWalletClose: document.getElementById("btn-wallet-close"),
      modalWalletBalanceVal: document.getElementById("modal-wallet-balance-val"),
      modalDepositInput: document.getElementById("modal-input-deposit-amount"),
      depositUtrInput: document.getElementById("deposit-utr-input"),
      modalDepositChips: document.querySelectorAll("#wallet-tab-content-deposit .deposit-chip-btn"),
      btnModalDepositConfirm: document.getElementById("btn-modal-deposit-confirm"),

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
      withdrawPercentChips: document.querySelectorAll(".btn-percent-chip"),
      btnSubmitWithdrawal: document.getElementById("btn-submit-withdrawal"),
      walletStatusAlert: document.getElementById("modal-wallet-status-alert"),

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
      personalLogsContainer: document.getElementById("personal-history-logs"),

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
    else if (screenName === "AUTH" && DOM.screenAuth) DOM.screenAuth.classList.add("active");
    else if (screenName === "PAYMENT" && DOM.screenPayment) DOM.screenPayment.classList.add("active");
    else if (screenName === "GAME" && DOM.screenGame) {
      DOM.screenGame.classList.add("active");
      resizeCanvas();
    }
  }

  function updatePlayerUIBalance() {
    const formatted = formatRupees(savedState.virtualBalance);
    if (DOM.headerBalanceVal) DOM.headerBalanceVal.textContent = formatted;
    if (DOM.userBalanceDisplay) DOM.userBalanceDisplay.textContent = formatted;
    if (DOM.paymentCurrentBalance) DOM.paymentCurrentBalance.textContent = formatted;
    if (DOM.modalWalletBalanceVal) DOM.modalWalletBalanceVal.textContent = formatted;
    if (DOM.dossierBalance) DOM.dossierBalance.textContent = formatted;

    if (DOM.chipName) DOM.chipName.textContent = savedState.callsign || "PILOT";
    if (DOM.chipAvatarLetter) DOM.chipAvatarLetter.textContent = (savedState.callsign || "P").charAt(0).toUpperCase();

    if (DOM.totalStakedDisplay) DOM.totalStakedDisplay.textContent = formatRupees(savedState.career.totalVcStaked);
    if (DOM.totalWinsDisplay) DOM.totalWinsDisplay.textContent = formatRupees(savedState.career.totalVcWon);
  }

  function showActionFeedback(text, type) {
    if (!DOM.actionFeedback) return;
    DOM.actionFeedback.textContent = text;
    DOM.actionFeedback.className = "action-feedback active " + (type || "info");
    setTimeout(function () {
      if (DOM.actionFeedback) DOM.actionFeedback.className = "action-feedback";
    }, 2800);
  }

  function addTickerBadge(multi) {
    if (!DOM.tickerList) return;
    const badge = document.createElement("div");
    badge.className = "ticker-badge" + (multi >= 2.0 ? " high" : "");
    badge.textContent = multi.toFixed(2) + "x";
    DOM.tickerList.insertBefore(badge, DOM.tickerList.firstChild);
    while (DOM.tickerList.children.length > 12) {
      DOM.tickerList.removeChild(DOM.tickerList.lastChild);
    }
  }

  function addFeedItem(msg, type) {
    if (!DOM.activityFeedList) return;
    const item = document.createElement("div");
    item.className = "feed-item" + (type ? " " + type : "");
    const timeStr = new Date().toLocaleTimeString();
    item.textContent = timeStr + "  " + msg;
    DOM.activityFeedList.insertBefore(item, DOM.activityFeedList.firstChild);
    while (DOM.activityFeedList.children.length > 25) {
      DOM.activityFeedList.removeChild(DOM.activityFeedList.lastChild);
    }
  }

  function updateLiveClock() {
    if (!DOM.footerLiveClock) return;
    const now = new Date();
    DOM.footerLiveClock.textContent = now.toTimeString().split(" ")[0];
  }
  setInterval(updateLiveClock, 1000);

  //====================================================================
  // UNPREDICTABLE MULTIPLIER & FLIGHT ENGINE (REALISTIC CEILING UP TO 1000.00x FOR MANUAL OVERRIDES)
  //====================================================================
  const MAX_POSSIBLE_MULTIPLIER = 1000.00;

  // High-performance deterministic pseudo-random generator (Mulberry32)
  function seededRandom(seed) {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function generateCrashPoint(roundSeed) {
    if (DOM.gmOverrideEnabled && DOM.gmOverrideEnabled.checked && DOM.gmTargetInput) {
      const manual = parseFloat(DOM.gmTargetInput.value);
      if (!isNaN(manual) && manual >= 1.05) {
        return Math.min(MAX_POSSIBLE_MULTIPLIER, Math.floor(manual * 100) / 100);
      }
    }
    const r = (typeof roundSeed === "number") ? seededRandom(roundSeed) : Math.random();
    let point = 1.15;
    if (r < 0.12) {
      point = 1.10 + (r / 0.12) * 0.25; // 1.10x - 1.35x
    } else if (r < 0.55) {
      point = 1.36 + ((r - 0.12) / 0.43) * 1.44; // 1.36x - 2.80x
    } else if (r < 0.82) {
      point = 2.81 + ((r - 0.55) / 0.27) * 2.69; // 2.81x - 5.50x
    } else if (r < 0.94) {
      point = 5.51 + ((r - 0.82) / 0.12) * 6.49; // 5.51x - 12.00x
    } else {
      point = 12.01 + ((r - 0.94) / 0.06) * 15.99; // 12.01x - 28.00x
    }
    return Math.min(30.00, Math.floor(point * 100) / 100);
  }

  function calculateMultiplier(elapsedSec) {
    if (typeof elapsedSec !== "number" || isNaN(elapsedSec) || elapsedSec <= 0) {
      return 1.00;
    }
    const safeSec = Math.max(0, elapsedSec);
    const exponent = 0.048 * Math.pow(safeSec, 1.10);
    const multi = Math.exp(exponent);
    if (isNaN(multi) || multi < 1.00) return 1.00;
    return Math.min(MAX_POSSIBLE_MULTIPLIER, multi);
  }

  //====================================================================
  // REAL-TIME MULTIPLAYER SYNCHRONIZED SQUADRON BETS
  // (ONLY REAL LOGGED-IN USERS ARE VISIBLE)
  //====================================================================
  let realSquadronBets = [];
  let activeBetsUnsubscribe = null;

  function subscribeToActiveBets(roundNum) {
    if (activeBetsUnsubscribe) {
      activeBetsUnsubscribe();
      activeBetsUnsubscribe = null;
    }
    realSquadronBets = [];

    if (!window.AERO_FIREBASE || !window.AERO_FIREBASE.db) {
      renderSquadronTable();
      return;
    }

    try {
      activeBetsUnsubscribe = window.AERO_FIREBASE.db.collection("active_bets")
        .where("round", "==", roundNum)
        .onSnapshot(function (snapshot) {
          const betsArr = [];
          snapshot.forEach(function (doc) {
            betsArr.push(doc.data());
          });
          realSquadronBets = betsArr;
          renderSquadronTable();
        }, function () {
          renderSquadronTable();
        });
    } catch (e) {
      renderSquadronTable();
    }
  }

  function renderSquadronTable() {
    if (!DOM.squadronBetsTable) return;
    const tbody = DOM.squadronBetsTable.querySelector("tbody");
    if (!tbody) return;

    if (realSquadronBets.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 22px; color: var(--text-dim); font-size:11px; font-family:var(--font-mono); letter-spacing:0.5px;">NO SQUADRON STAKES PLACED YET // PLACE YOUR STAKE</td></tr>';
      if (DOM.squadronCountBadge) DOM.squadronCountBadge.textContent = "● 0 BETS";
      return;
    }

    let html = "";
    realSquadronBets.forEach(function (b, index) {
      const isCashed = b.hasCashedOut;
      const isCrash = gameState === "CRASHED" && !isCashed;
      const statusClass = isCashed ? "cashed-out" : isCrash ? "crashed" : "placed-true";
      const cashoutText = isCashed ? formatRupees(b.cashoutValue || (b.stake * (b.targetMulti || 1))) : "—";
      const multiText = isCashed ? (b.targetMulti ? b.targetMulti.toFixed(2) + "x" : "—") : isCrash ? "1.00x" : "—";
      
      let profitHtml = '<span style="color:var(--text-dim);">—</span>';
      if (isCashed) {
        const profit = (b.cashoutValue || (b.stake * (b.targetMulti || 1))) - b.stake;
        profitHtml = '<span class="profit-pos">+' + formatRupees(profit) + '</span>';
      } else if (isCrash) {
        profitHtml = '<span class="profit-neg">-' + formatRupees(b.stake) + '</span>';
      }

      const pilotId = "#" + (8400 + (index % 100));
      const displayName = b.callsign || (b.email ? b.email.split("@")[0].toUpperCase() : "PILOT");
      const slotBadge = b.slot ? " (B" + b.slot + ")" : "";

      html += '<tr class="' + statusClass + '">' +
        '<td>' + pilotId + '</td>' +
        '<td style="font-weight:700; color:' + (displayName === savedState.callsign ? 'var(--accent-orange)' : 'var(--text-main)') + ';">' + displayName + slotBadge + '</td>' +
        '<td>' + formatRupees(b.stake) + '</td>' +
        '<td>' + cashoutText + '</td>' +
        '<td>' + multiText + '</td>' +
        '<td>' + profitHtml + '</td>' +
        '</tr>';
    });

    tbody.innerHTML = html;
    if (DOM.squadronCountBadge) {
      DOM.squadronCountBadge.textContent = "● " + realSquadronBets.length + (realSquadronBets.length === 1 ? " BET" : " BETS");
    }
  }

  //====================================================================
  // UNIVERSAL REAL-TIME MULTIPLAYER SYNCHRONIZATION ENGINE
  // (Deterministic Epoch Clock + Real-time Cloud Firestore Master Sync)
  //====================================================================
  const localSessionId = "pilot_" + Math.random().toString(36).substring(2, 9);
  let isGlobalSyncActive = false;
  let globalRoundUnsubscribe = null;
  let hasReceivedFirstSnapshot = false;

  // Compute deterministic flight time for a given crash multiplier
  function getFlightDurationSec(targetMulti) {
    if (targetMulti <= 1.0) return 0.5;
    // inverse of calculateMultiplier: multi = exp(0.048 * sec^1.10)
    // ln(multi) = 0.048 * sec^1.10  =>  sec = (ln(multi) / 0.048)^(1 / 1.10)
    const logM = Math.log(Math.max(1.001, targetMulti));
    const sec = Math.pow(logM / 0.048, 1 / 1.10);
    return Math.max(0.5, Math.min(60, sec));
  }

  // Get epoch deterministic round info for exact millisecond
  function getEpochDeterministicRound(epochMs) {
    const epochBase = 1710000000000; // Fixed reference epoch
    const now = (typeof epochMs === "number") ? epochMs : Date.now();
    const diff = Math.max(0, now - epochBase);

    // Approximate average cycle duration: 8000 + 1000 + ~8500 + 1600 + 2000 = 21100ms
    const estCycle = 21000;
    let roundIndex = Math.floor(diff / estCycle);

    // Seeded round calculation to find exact cycle boundaries
    let rNum = 3000 + roundIndex;
    let crashTarget = generateCrashPoint(rNum * 7919);
    let flightMs = Math.round(getFlightDurationSec(crashTarget) * 1000);
    let totalRoundMs = CONFIG.TIMINGS.BETTING_MS + CONFIG.TIMINGS.LAUNCHING_MS + flightMs + CONFIG.TIMINGS.CRASHED_MS + CONFIG.TIMINGS.RESULT_MS;

    let cycleStart = epochBase + (roundIndex * estCycle);
    // Align boundaries
    let offsetInCycle = (now - cycleStart) % totalRoundMs;
    if (offsetInCycle < 0) offsetInCycle += totalRoundMs;

    let rState = "BETTING";
    let bStart = now - offsetInCycle;
    let lStart = bStart + CONFIG.TIMINGS.BETTING_MS;
    let runStart = lStart + CONFIG.TIMINGS.LAUNCHING_MS;
    let crashStart = runStart + flightMs;
    let resStart = crashStart + CONFIG.TIMINGS.CRASHED_MS;

    if (offsetInCycle < CONFIG.TIMINGS.BETTING_MS) {
      rState = "BETTING";
    } else if (offsetInCycle < CONFIG.TIMINGS.BETTING_MS + CONFIG.TIMINGS.LAUNCHING_MS) {
      rState = "LAUNCHING";
    } else if (offsetInCycle < CONFIG.TIMINGS.BETTING_MS + CONFIG.TIMINGS.LAUNCHING_MS + flightMs) {
      rState = "RUNNING";
    } else if (offsetInCycle < CONFIG.TIMINGS.BETTING_MS + CONFIG.TIMINGS.LAUNCHING_MS + flightMs + CONFIG.TIMINGS.CRASHED_MS) {
      rState = "CRASHED";
    } else {
      rState = "RESULT";
    }

    return {
      roundNumber: rNum,
      state: rState,
      crashMultiplier: crashTarget,
      bettingStartTime: bStart,
      launchingStartTime: lStart,
      launchStartTime: runStart,
      crashedAt: crashStart,
      resultStartTime: resStart,
      masterId: "epoch_universal",
      updatedAt: now
    };
  }

  const initialEpochRound = getEpochDeterministicRound(Date.now());
  let sharedRound = Object.assign({}, initialEpochRound, { masterId: localSessionId });

  function isLocalMaster() {
    if (savedState.userRole === "admin") return true;
    if (DOM.gmOverrideEnabled && DOM.gmOverrideEnabled.checked) return true;
    if (sharedRound.masterId === localSessionId) return true;
    const timeSinceUpdate = Date.now() - (sharedRound.updatedAt || 0);
    if (timeSinceUpdate > 6000) return true;
    return false;
  }

  function initGlobalMultiplayerSync() {
    // Start with deterministic epoch round clock
    const currentEpochSync = getEpochDeterministicRound(Date.now());
    roundNumber = currentEpochSync.roundNumber;
    crashMultiplier = currentEpochSync.crashMultiplier;
    sharedRound = Object.assign(sharedRound, currentEpochSync);

    if (DOM.roundPill) DOM.roundPill.textContent = "ROUND #" + roundNumber;
    if (DOM.debugTargetMulti) DOM.debugTargetMulti.textContent = crashMultiplier.toFixed(2) + "x";
    subscribeToActiveBets(roundNumber);

    if (!window.AERO_FIREBASE || !window.AERO_FIREBASE.db) {
      hasReceivedFirstSnapshot = true;
      return;
    }
    if (isGlobalSyncActive) return;
    isGlobalSyncActive = true;

    const roundDocRef = window.AERO_FIREBASE.db.collection("game_state").doc("current_round");

    globalRoundUnsubscribe = roundDocRef.onSnapshot(function (doc) {
      if (!doc.exists) {
        publishSharedRoundState();
        hasReceivedFirstSnapshot = true;
        return;
      }

      const data = doc.data();
      hasReceivedFirstSnapshot = true;

      // Ignore stale document updates older than 15 seconds
      const now = Date.now();
      if (data.updatedAt && (now - data.updatedAt) > 15000) {
        return;
      }

      const oldRound = sharedRound.roundNumber;
      sharedRound = Object.assign(sharedRound, data);

      if (sharedRound.roundNumber && sharedRound.roundNumber !== oldRound) {
        roundNumber = sharedRound.roundNumber;
        if (DOM.roundPill) DOM.roundPill.textContent = "ROUND #" + roundNumber;
        subscribeToActiveBets(roundNumber);
      }

      if (typeof sharedRound.crashMultiplier === "number") {
        crashMultiplier = sharedRound.crashMultiplier;
        if (DOM.debugTargetMulti) DOM.debugTargetMulti.textContent = crashMultiplier.toFixed(2) + "x";
      }

      if (typeof sharedRound.isPaused === "boolean" && sharedRound.isPaused !== isGamePaused) {
        isGamePaused = sharedRound.isPaused;
        if (DOM.gmBtnPauseToggle) {
          DOM.gmBtnPauseToggle.textContent = isGamePaused ? "RESUME SIMULATION" : "PAUSE SIMULATION";
        }
      }

      if (sharedRound.state && sharedRound.state !== gameState) {
        applyStateTransition(sharedRound.state, true);
      }
    }, function (err) {
      console.warn("[AeroCrash] Multiplayer sync listener notice:", err.message);
    });
  }

  function publishSharedRoundState() {
    if (!window.AERO_FIREBASE || !window.AERO_FIREBASE.db) return;
    sharedRound.masterId = localSessionId;
    sharedRound.updatedAt = Date.now();

    window.AERO_FIREBASE.db.collection("game_state").doc("current_round").set(sharedRound, { merge: true })
      .then(function () {
        console.log("[AeroCrash Multiplayer] Synced state to cloud:", sharedRound.state, "Round #" + sharedRound.roundNumber, "Target:", sharedRound.crashMultiplier + "x");
      })
      .catch(function (err) {
        console.warn("[AeroCrash Multiplayer] Note on game_state write:", err.message);
      });
  }

  //====================================================================
  // DYNAMIC MULTI-BETTING CARDS MANAGER (ADD / REMOVE / AUTOBET)
  //====================================================================
  function renderDynamicBetPanels() {
    if (!DOM.betPanelsWrapper) return;
    DOM.betPanelsWrapper.innerHTML = "";

    activeSlotIds.forEach(function (slotId) {
      if (!bets[slotId]) {
        bets[slotId] = {
          isPlaced: false,
          stake: 10,
          isCashedOut: false,
          cashoutMultiplier: 0.0,
          cashoutAmount: 0,
          autoBet: false,
          autoCashout: false,
          autoCashoutVal: (1.5 + slotId * 0.5)
        };
      }

      const b = bets[slotId];
      const card = document.createElement("div");
      card.className = "single-bet-card active";
      card.id = "bet-card-" + slotId;
      card.setAttribute("data-slot", slotId);

      const canRemove = activeSlotIds.length > 1;
      const removeBtnHtml = canRemove 
        ? '<button type="button" class="btn-remove-bet-card" data-slot="' + slotId + '" title="Remove this bet panel">&times;</button>'
        : '';

      card.innerHTML = `
        <div class="card-slot-header">
          <div class="slot-badge-group">
            <span class="slot-dot ${b.isPlaced ? 'active' : ''}" id="slot-dot-${slotId}"></span>
            <span class="slot-title">BET 0${slotId}</span>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="slot-stake-summary" id="slot-summary-${slotId}">₹${b.stake.toFixed(2)}</span>
            ${removeBtnHtml}
          </div>
        </div>

        <div class="control-box stake-section">
          <label for="input-stake-${slotId}">STAKE AMOUNT (₹)</label>
          <div class="stake-stepper-card">
            <span class="currency-symbol">₹</span>
            <input type="number" id="input-stake-${slotId}" value="${b.stake.toFixed(2)}" min="1" step="any">
            <div class="stepper-arrows">
              <button type="button" class="btn-arrow-step btn-step-inc" data-slot="${slotId}">▲</button>
              <button type="button" class="btn-arrow-step btn-step-dec" data-slot="${slotId}">▼</button>
            </div>
          </div>

          <div class="quick-stake-grid" id="quick-grid-${slotId}">
            <button type="button" class="btn-chip ${b.stake === 10 ? 'active' : ''}" data-slot="${slotId}" data-val="10">10</button>
            <button type="button" class="btn-chip ${b.stake === 25 ? 'active' : ''}" data-slot="${slotId}" data-val="25">25</button>
            <button type="button" class="btn-chip ${b.stake === 50 ? 'active' : ''}" data-slot="${slotId}" data-val="50">50</button>
            <button type="button" class="btn-chip ${b.stake === 100 ? 'active' : ''}" data-slot="${slotId}" data-val="100">100</button>
            <button type="button" class="btn-chip ${b.stake === 200 ? 'active' : ''}" data-slot="${slotId}" data-val="200">200</button>
            <button type="button" class="btn-chip ${b.stake === 500 ? 'active' : ''}" data-slot="${slotId}" data-val="500">500</button>
            <button type="button" class="btn-chip ${b.stake === 1000 ? 'active' : ''}" data-slot="${slotId}" data-val="1000">1K</button>
            <button type="button" class="btn-chip ${b.stake === 5000 ? 'active' : ''}" data-slot="${slotId}" data-val="5000">5K</button>
          </div>
        </div>

        <div class="automation-dual-grid">
          <div class="auto-toggle-box">
            <div class="auto-header-row">
              <span class="auto-label">AUTO BET</span>
              <label class="switch-toggle">
                <input type="checkbox" id="check-auto-bet-${slotId}" ${b.autoBet ? 'checked' : ''}>
                <span class="slider round"></span>
              </label>
            </div>
          </div>

          <div class="auto-toggle-box">
            <div class="auto-header-row">
              <span class="auto-label">AUTO CASHOUT</span>
              <label class="switch-toggle">
                <input type="checkbox" id="check-auto-cashout-${slotId}" ${b.autoCashout ? 'checked' : ''}>
                <span class="slider round"></span>
              </label>
            </div>
            <div class="auto-input-card">
              <input type="number" id="input-auto-cashout-${slotId}" value="${b.autoCashoutVal.toFixed(2)}" min="1.05" max="30.00" step="0.05">
              <span class="multi-suffix">x</span>
              <button type="button" class="btn-clear-input btn-clear-auto" data-slot="${slotId}">&times;</button>
            </div>
          </div>
        </div>

        <div class="action-section">
          <button type="button" id="btn-action-${slotId}" class="btn-action-takeoff state-bet" data-slot="${slotId}">
            <svg class="action-plane-icon" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2 L14.5 9 L22 12.5 L22 14.5 L14.5 13 L14.5 18.5 L17.5 20.5 L17.5 22.5 L12 21 L6.5 22.5 L6.5 20.5 L9.5 18.5 L9.5 13 L2 14.5 L2 12.5 L9.5 9 Z"/>
            </svg>
            <div class="action-btn-content">
              <span id="action-btn-text-${slotId}">TAKEOFF (BET ${slotId})</span>
              <span id="action-btn-subtext-${slotId}" class="btn-subtext">Stake: ₹${b.stake.toFixed(2)}</span>
            </div>
          </button>
        </div>
      `;

      DOM.betPanelsWrapper.appendChild(card);
    });

    attachDynamicCardListeners();
    updateActionButtons();
  }

  function attachDynamicCardListeners() {
    activeSlotIds.forEach(function (slotId) {
      const b = bets[slotId];
      const stakeInput = document.getElementById("input-stake-" + slotId);
      const autoBetCheck = document.getElementById("check-auto-bet-" + slotId);
      const autoCashCheck = document.getElementById("check-auto-cashout-" + slotId);
      const autoCashInput = document.getElementById("input-auto-cashout-" + slotId);
      const actionBtn = document.getElementById("btn-action-" + slotId);

      if (stakeInput) {
        stakeInput.addEventListener("input", function () {
          const parsed = parseFloat(stakeInput.value);
          b.stake = (!isNaN(parsed) && parsed > 0) ? parsed : 0;
          const summary = document.getElementById("slot-summary-" + slotId);
          if (summary) summary.textContent = formatRupees(b.stake);
          updateActionButtons();
        });
      }

      if (autoBetCheck) {
        autoBetCheck.addEventListener("change", function () {
          b.autoBet = autoBetCheck.checked;
          if (b.autoBet && gameState === "BETTING" && !b.isPlaced) {
            placeBet(slotId);
          }
        });
      }

      if (autoCashCheck) {
        autoCashCheck.addEventListener("change", function () {
          b.autoCashout = autoCashCheck.checked;
        });
      }

      if (autoCashInput) {
        autoCashInput.addEventListener("input", function () {
          b.autoCashoutVal = Math.max(1.05, Math.min(30.00, parseFloat(autoCashInput.value) || 2.0));
        });
      }

      if (actionBtn) {
        actionBtn.addEventListener("click", function () {
          handleActionClickForSlot(slotId);
        });
      }
    });

    // Chips
    document.querySelectorAll(".quick-stake-grid .btn-chip").forEach(function (chip) {
      chip.addEventListener("click", function () {
        const slotId = parseInt(chip.getAttribute("data-slot"), 10);
        const val = parseFloat(chip.getAttribute("data-val")) || 10;
        if (bets[slotId]) {
          bets[slotId].stake = val;
          const inp = document.getElementById("input-stake-" + slotId);
          if (inp) inp.value = val.toFixed(2);
          const parentGrid = document.getElementById("quick-grid-" + slotId);
          if (parentGrid) {
            parentGrid.querySelectorAll(".btn-chip").forEach(function (c) { c.classList.remove("active"); });
            chip.classList.add("active");
          }
          const summary = document.getElementById("slot-summary-" + slotId);
          if (summary) summary.textContent = formatRupees(val);
          updateActionButtons();
        }
      });
    });

    // Steppers
    document.querySelectorAll(".btn-step-inc").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const slotId = parseInt(btn.getAttribute("data-slot"), 10);
        if (bets[slotId]) {
          bets[slotId].stake = Math.min(CONFIG.MAX_STAKE, (bets[slotId].stake || 0) + 10);
          const inp = document.getElementById("input-stake-" + slotId);
          if (inp) inp.value = bets[slotId].stake.toFixed(2);
          const summary = document.getElementById("slot-summary-" + slotId);
          if (summary) summary.textContent = formatRupees(bets[slotId].stake);
          updateActionButtons();
        }
      });
    });

    document.querySelectorAll(".btn-step-dec").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const slotId = parseInt(btn.getAttribute("data-slot"), 10);
        if (bets[slotId]) {
          bets[slotId].stake = Math.max(1, (bets[slotId].stake || 10) - 10);
          const inp = document.getElementById("input-stake-" + slotId);
          if (inp) inp.value = bets[slotId].stake.toFixed(2);
          const summary = document.getElementById("slot-summary-" + slotId);
          if (summary) summary.textContent = formatRupees(bets[slotId].stake);
          updateActionButtons();
        }
      });
    });

    // Remove buttons
    document.querySelectorAll(".btn-remove-bet-card").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const slotId = parseInt(btn.getAttribute("data-slot"), 10);
        if (activeSlotIds.length > 1) {
          if (bets[slotId] && bets[slotId].isPlaced && gameState === "BETTING") {
            cancelBet(slotId);
          }
          activeSlotIds = activeSlotIds.filter(function (id) { return id !== slotId; });
          delete bets[slotId];
          renderDynamicBetPanels();
        }
      });
    });

    // Clear auto
    document.querySelectorAll(".btn-clear-auto").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const slotId = parseInt(btn.getAttribute("data-slot"), 10);
        if (bets[slotId]) {
          bets[slotId].autoCashoutVal = 2.00;
          const inp = document.getElementById("input-auto-cashout-" + slotId);
          if (inp) inp.value = "2.00";
        }
      });
    });
  }

  function updateActionButtons() {
    activeSlotIds.forEach(function (slotId) {
      const b = bets[slotId];
      if (!b) return;

      const btn = document.getElementById("btn-action-" + slotId);
      const text = document.getElementById("action-btn-text-" + slotId);
      const sub = document.getElementById("action-btn-subtext-" + slotId);
      const summary = document.getElementById("slot-summary-" + slotId);
      const dot = document.getElementById("slot-dot-" + slotId);

      if (!btn) return;
      btn.className = "btn-action-takeoff";
      btn.disabled = false;

      if (summary) summary.textContent = formatRupees(b.stake);
      if (dot) {
        if (b.isPlaced) {
          dot.style.background = "var(--status-success)";
          dot.classList.add("active");
        } else {
          dot.style.background = "var(--text-dim)";
          dot.classList.remove("active");
        }
      }

      if (gameState === "BETTING" || gameState === "WAITING") {
        if (b.isPlaced) {
          btn.classList.add("state-cancel");
          if (text) text.textContent = "CANCEL (BET " + slotId + ")";
          if (sub) sub.textContent = "Staked: " + formatRupees(b.stake);
        } else {
          btn.classList.add("state-bet");
          if (text) text.textContent = "TAKEOFF (BET " + slotId + ")";
          if (sub) sub.textContent = "Stake: " + formatRupees(b.stake);
        }
      } else if (gameState === "LAUNCHING") {
        if (b.isPlaced) {
          btn.classList.add("state-cashout");
          if (text) text.textContent = "AIRBORNE SOON";
          if (sub) sub.textContent = "Engines Spooling...";
          btn.disabled = true;
        } else {
          btn.disabled = true;
          if (text) text.textContent = "TAKEOFF (BET " + slotId + ")";
          if (sub) sub.textContent = "Doors Closed";
        }
      } else if (gameState === "RUNNING") {
        if (b.isPlaced && !b.isCashedOut) {
          const currentPayout = Math.floor(b.stake * liveMultiplier * 100) / 100;
          btn.classList.add("state-cashout");
          if (text) text.textContent = "CASH OUT " + liveMultiplier.toFixed(2) + "x (B" + slotId + ")";
          if (sub) sub.textContent = "Payout: " + formatRupees(currentPayout);
        } else if (b.isCashedOut) {
          btn.disabled = true;
          btn.classList.add("state-cashout");
          if (text) text.textContent = "CASHED OUT (B" + slotId + ")";
          if (sub) sub.textContent = "Won: +" + formatRupees(b.cashoutAmount - b.stake);
        } else {
          btn.disabled = true;
          if (text) text.textContent = "IN FLIGHT";
          if (sub) sub.textContent = "Waiting for next round...";
        }
      } else {
        btn.disabled = true;
        if (text) text.textContent = "ROUND SETTLED";
        if (sub) sub.textContent = gameState === "CRASHED" ? "Flight crashed" : "Preparing round...";
      }
    });
  }

  function placeBet(slotId) {
    const b = bets[slotId];
    if (!b) return;

    if (b.stake < CONFIG.MIN_STAKE) {
      showActionFeedback("MINIMUM STAKE IS " + formatRupees(CONFIG.MIN_STAKE), "danger");
      return;
    }

    if (b.stake > CONFIG.MAX_STAKE) {
      showActionFeedback("MAXIMUM STAKE LIMIT IS " + formatRupees(CONFIG.MAX_STAKE), "danger");
      return;
    }

    if (savedState.virtualBalance < b.stake) {
      showActionFeedback("INSUFFICIENT BALANCE // ADD FUNDS", "danger");
      openWalletModal("deposit");
      return;
    }

    if (gameState !== "BETTING" && gameState !== "WAITING") {
      showActionFeedback("FLIGHT IN PROGRESS // WAIT FOR NEXT ROUND", "info");
      return;
    }

    savedState.virtualBalance -= b.stake;
    saveState();
    updatePlayerUIBalance();

    b.isPlaced = true;
    b.isCashedOut = false;
    b.cashoutMultiplier = 0.0;
    b.cashoutAmount = 0;

    showActionFeedback("BET " + slotId + " PLACED // " + formatRupees(b.stake), "success");
    addFeedItem(savedState.callsign + " staked " + formatRupees(b.stake) + " (Bet " + slotId + ")", "bet");

    if (window.AERO_FIREBASE && window.AERO_FIREBASE.db) {
      const userKey = (window.AERO_FIREBASE.auth && window.AERO_FIREBASE.auth.currentUser)
        ? window.AERO_FIREBASE.auth.currentUser.uid
        : (savedState.userEmail ? savedState.userEmail.replace(/[^a-zA-Z0-9]/g, "_") : "pilot_user");
      
      const betDocId = "r" + roundNumber + "_" + userKey + "_b" + slotId;
      window.AERO_FIREBASE.db.collection("active_bets").doc(betDocId).set({
        round: roundNumber,
        uid: userKey,
        slot: slotId,
        callsign: savedState.callsign || "PILOT",
        email: savedState.userEmail || "",
        stake: b.stake,
        hasCashedOut: false,
        status: "PLACED",
        placedAt: new Date()
      }).catch(function () {});

      window.AERO_FIREBASE.db.collection("users").doc(userKey).set({
        balance: savedState.virtualBalance
      }, { merge: true }).catch(function () {});
    }

    updateActionButtons();
  }

  function cancelBet(slotId) {
    const b = bets[slotId];
    if (!b || !b.isPlaced || gameState !== "BETTING") return;

    savedState.virtualBalance += b.stake;
    saveState();
    updatePlayerUIBalance();

    b.isPlaced = false;
    showActionFeedback("BET " + slotId + " CANCELLED // REFUNDED " + formatRupees(b.stake), "info");

    if (window.AERO_FIREBASE && window.AERO_FIREBASE.db) {
      const userKey = (window.AERO_FIREBASE.auth && window.AERO_FIREBASE.auth.currentUser)
        ? window.AERO_FIREBASE.auth.currentUser.uid
        : (savedState.userEmail ? savedState.userEmail.replace(/[^a-zA-Z0-9]/g, "_") : "pilot_user");
      
      const betDocId = "r" + roundNumber + "_" + userKey + "_b" + slotId;
      window.AERO_FIREBASE.db.collection("active_bets").doc(betDocId).delete().catch(function () {});

      window.AERO_FIREBASE.db.collection("users").doc(userKey).set({
        balance: savedState.virtualBalance
      }, { merge: true }).catch(function () {});
    }

    updateActionButtons();
  }

  function cashOut(slotId) {
    const b = bets[slotId];
    if (!b || !b.isPlaced || b.isCashedOut || gameState !== "RUNNING") return;

    soundCashout();
    b.isCashedOut = true;
    b.cashoutMultiplier = liveMultiplier;
    b.cashoutAmount = Math.floor(b.stake * liveMultiplier * 100) / 100;
    const profit = b.cashoutAmount - b.stake;

    savedState.virtualBalance += b.cashoutAmount;
    savedState.career.roundsPlayed++;
    savedState.career.roundsWon++;
    savedState.career.totalVcWon += profit;
    if (b.cashoutMultiplier > savedState.career.highestCashoutMulti) {
      savedState.career.highestCashoutMulti = b.cashoutMultiplier;
    }
    if (profit > savedState.career.bestPayoutVc) {
      savedState.career.bestPayoutVc = profit;
    }

    savedState.history.unshift({
      round: roundNumber,
      slot: slotId,
      stake: b.stake,
      multiplier: b.cashoutMultiplier,
      profit: profit,
      status: "WIN",
      time: new Date().toLocaleTimeString()
    });

    saveState();
    updatePlayerUIBalance();
    updateCareerTables();
    renderPersonalHistoryLogs();

    showActionFeedback("CASHOUT (BET " + slotId + ") // +" + formatRupees(profit) + " (" + b.cashoutMultiplier.toFixed(2) + "x)", "success");

    if (window.AERO_FIREBASE && window.AERO_FIREBASE.db) {
      const userKey = (window.AERO_FIREBASE.auth && window.AERO_FIREBASE.auth.currentUser)
        ? window.AERO_FIREBASE.auth.currentUser.uid
        : (savedState.userEmail ? savedState.userEmail.replace(/[^a-zA-Z0-9]/g, "_") : "pilot_user");
      
      const betDocId = "r" + roundNumber + "_" + userKey + "_b" + slotId;
      window.AERO_FIREBASE.db.collection("active_bets").doc(betDocId).update({
        hasCashedOut: true,
        targetMulti: b.cashoutMultiplier,
        cashoutValue: b.cashoutAmount,
        profit: profit,
        status: "CASHED_OUT"
      }).catch(function () {});

      window.AERO_FIREBASE.db.collection("users").doc(userKey).set({
        balance: savedState.virtualBalance
      }, { merge: true }).catch(function () {});
    }

    if (DOM.playerResultBanner) {
      DOM.playerResultBanner.textContent = "BET " + slotId + " CASHOUT " + formatRupees(b.cashoutAmount) + " (" + b.cashoutMultiplier.toFixed(2) + "x)";
      DOM.playerResultBanner.classList.add("active");
    }

    addFeedItem(savedState.callsign + " CASHOUT (B" + slotId + ") @" + b.cashoutMultiplier.toFixed(2) + "x (+" + formatRupees(b.cashoutAmount) + ")", "cashout");
    updateActionButtons();
  }

  function handleActionClickForSlot(slotId) {
    initAudio();
    if (gameState === "BETTING" || gameState === "WAITING") {
      if (bets[slotId] && bets[slotId].isPlaced) cancelBet(slotId);
      else placeBet(slotId);
    } else if (gameState === "RUNNING") {
      if (bets[slotId] && bets[slotId].isPlaced && !bets[slotId].isCashedOut) cashOut(slotId);
    }
  }

  //====================================================================
  // STATE MACHINE & TRANSITIONS
  //====================================================================
  function applyStateTransition(newState, fromRemote) {
    gameState = newState;

    if (DOM.statePill) DOM.statePill.textContent = newState;
    if (DOM.stateDot) {
      DOM.stateDot.className = "status-dot " + (newState === "RUNNING" ? "green" : newState === "BETTING" ? "amber" : "red");
    }

    switch (newState) {
      case "BETTING":
        if (DOM.roundPill) DOM.roundPill.textContent = "ROUND #" + roundNumber;
        if (DOM.statePill) DOM.statePill.textContent = "BETTING OPEN";

        // Reset all active bet slots for the new round
        activeSlotIds.forEach(function (slotId) {
          if (bets[slotId]) {
            bets[slotId].isPlaced = false;
            bets[slotId].isCashedOut = false;
            bets[slotId].cashoutMultiplier = 0.0;
            bets[slotId].cashoutAmount = 0;
          }
        });

        liveMultiplier = 1.00;
        liveTrail = [];

        subscribeToActiveBets(roundNumber);

        if (DOM.hudContainer) DOM.hudContainer.classList.add("hidden");
        if (DOM.crashOverlay) DOM.crashOverlay.classList.add("hidden");
        if (DOM.countdownOverlay) DOM.countdownOverlay.classList.remove("hidden");
        if (DOM.playerResultBanner) DOM.playerResultBanner.classList.remove("active");

        addFeedItem("ROUND #" + roundNumber + " BETS OPEN // TAKEOFF IN 8s");

        // Trigger Auto-Bet for all slots configured
        activeSlotIds.forEach(function (slotId) {
          if (bets[slotId] && bets[slotId].autoBet && !bets[slotId].isPlaced) {
            placeBet(slotId);
          }
        });

        updateActionButtons();
        break;

      case "LAUNCHING":
        if (DOM.countdownOverlay) DOM.countdownOverlay.classList.add("hidden");
        if (DOM.statePill) DOM.statePill.textContent = "LAUNCHING";
        soundLaunch();
        updateActionButtons();
        break;

      case "RUNNING":
        liveTrail = [];
        if (DOM.countdownOverlay) DOM.countdownOverlay.classList.add("hidden");
        if (DOM.crashOverlay) DOM.crashOverlay.classList.add("hidden");
        if (DOM.hudContainer) DOM.hudContainer.classList.remove("hidden");
        if (DOM.statePill) DOM.statePill.textContent = "IN PROGRESS";
        updateActionButtons();
        break;

      case "CRASHED":
        soundCrash();
        renderSquadronTable();
        addTickerBadge(liveMultiplier);
        addFeedItem("FLIGHT CRASHED @ " + liveMultiplier.toFixed(2) + "x", "crashed");

        if (DOM.hudContainer) DOM.hudContainer.classList.add("hidden");
        if (DOM.crashOverlay) DOM.crashOverlay.classList.remove("hidden");
        if (DOM.crashMultiplier) DOM.crashMultiplier.textContent = liveMultiplier.toFixed(2) + "x";
        if (DOM.statePill) DOM.statePill.textContent = "FLEW AWAY";

        // Settle uncashed bets for all active slots
        activeSlotIds.forEach(function (slotId) {
          const b = bets[slotId];
          if (b && b.isPlaced && !b.isCashedOut) {
            savedState.career.roundsPlayed++;
            savedState.career.roundsLost++;
            savedState.career.totalVcLost += b.stake;
            savedState.history.unshift({
              round: roundNumber,
              slot: slotId,
              stake: b.stake,
              multiplier: 0,
              profit: -b.stake,
              status: "LOSS",
              time: new Date().toLocaleTimeString()
            });
            showActionFeedback("BET " + slotId + " FLEW AWAY — Lost " + formatRupees(b.stake), "danger");
          }
          if (b) b.isPlaced = false;
        });

        saveState();
        updateCareerTables();
        renderPersonalHistoryLogs();
        updateActionButtons();
        break;

      case "RESULT":
        updateCareerTables();
        break;
    }
  }

  function transitionTo(newState) {
    applyStateTransition(newState, false);
  }

  //====================================================================
  // MAIN ANIMATION & UNIVERSAL SIMULATION LOOP
  //====================================================================
  function gameLoop() {
    if (isGamePaused) {
      requestAnimationFrame(gameLoop);
      return;
    }

    const nowEpoch = Date.now();
    const isMaster = isLocalMaster();

    if (gameState === "BETTING") {
      const bStart = sharedRound.bettingStartTime || nowEpoch;
      const elapsed = Math.max(0, nowEpoch - bStart);
      const remaining = Math.max(0, CONFIG.TIMINGS.BETTING_MS - elapsed);
      const secondsLeft = Math.ceil(remaining / 1000);

      if (DOM.countdownDigits) DOM.countdownDigits.textContent = secondsLeft;
      if (secondsLeft <= 3 && Math.floor(remaining) % 1000 < 50) soundCountdown();

      if (elapsed >= CONFIG.TIMINGS.BETTING_MS && isMaster) {
        sharedRound.state = "LAUNCHING";
        sharedRound.launchingStartTime = nowEpoch;
        publishSharedRoundState();
        applyStateTransition("LAUNCHING");
      }
    } else if (gameState === "LAUNCHING") {
      const lStart = sharedRound.launchingStartTime || nowEpoch;
      const elapsed = Math.max(0, nowEpoch - lStart);
      if (elapsed >= CONFIG.TIMINGS.LAUNCHING_MS && isMaster) {
        sharedRound.state = "RUNNING";
        sharedRound.launchStartTime = nowEpoch;
        publishSharedRoundState();
        applyStateTransition("RUNNING");
      }
    } else if (gameState === "RUNNING") {
      const fStart = sharedRound.launchStartTime || nowEpoch;
      const elapsedSec = Math.max(0, (nowEpoch - fStart) / 1000);
      liveMultiplier = calculateMultiplier(elapsedSec);

      if (DOM.hudMultiplier) DOM.hudMultiplier.textContent = liveMultiplier.toFixed(2) + "x";
      if (DOM.headerFlightMulti) DOM.headerFlightMulti.textContent = liveMultiplier.toFixed(2) + "x";
      if (DOM.debugLiveMulti) DOM.debugLiveMulti.textContent = liveMultiplier.toFixed(2) + "x";

      if (DOM.telemAlt) DOM.telemAlt.textContent = Math.floor(liveMultiplier * 1420).toLocaleString() + " FT";
      if (DOM.telemVel) DOM.telemVel.textContent = Math.floor(liveMultiplier * 360) + " KTS";
      if (DOM.telemTraj) DOM.telemTraj.textContent = Math.min(78, (liveMultiplier * 14.5)).toFixed(1) + "°";

      // Auto Cashout checks for all active slots
      activeSlotIds.forEach(function (slotId) {
        const b = bets[slotId];
        if (b && b.autoCashout && b.isPlaced && !b.isCashedOut) {
          if (b.autoCashoutVal > 1.0 && liveMultiplier >= b.autoCashoutVal) {
            cashOut(slotId);
          }
        }
      });

      // Crash trigger evaluated by Master Authority
      if ((isManualCrashPending || liveMultiplier >= crashMultiplier) && isMaster) {
        isManualCrashPending = false;
        sharedRound.state = "CRASHED";
        sharedRound.crashedAt = nowEpoch;
        sharedRound.crashedMultiplier = liveMultiplier;
        publishSharedRoundState();
        applyStateTransition("CRASHED");
      }

      updateActionButtons();
    } else if (gameState === "CRASHED") {
      const cStart = sharedRound.crashedAt || nowEpoch;
      const elapsed = Math.max(0, nowEpoch - cStart);
      if (elapsed >= CONFIG.TIMINGS.CRASHED_MS && isMaster) {
        sharedRound.state = "RESULT";
        sharedRound.resultStartTime = nowEpoch;
        publishSharedRoundState();
        applyStateTransition("RESULT");
      }
    } else if (gameState === "RESULT") {
      const rStart = sharedRound.resultStartTime || nowEpoch;
      const elapsed = Math.max(0, nowEpoch - rStart);
      if (elapsed >= CONFIG.TIMINGS.RESULT_MS && isMaster) {
        const nextRound = (sharedRound.roundNumber || roundNumber) + 1;
        sharedRound.roundNumber = nextRound;
        if (DOM.gmOverrideEnabled && DOM.gmOverrideEnabled.checked) {
          const manual = parseFloat(DOM.gmTargetInput ? DOM.gmTargetInput.value : 15.00) || 15.00;
          sharedRound.crashMultiplier = Math.min(MAX_POSSIBLE_MULTIPLIER, manual);
        } else {
          sharedRound.crashMultiplier = generateCrashPoint(nextRound * 7919);
        }
        crashMultiplier = sharedRound.crashMultiplier;
        sharedRound.state = "BETTING";
        sharedRound.bettingStartTime = nowEpoch;
        sharedRound.launchStartTime = 0;
        sharedRound.crashedAt = 0;
        publishSharedRoundState();
        applyStateTransition("BETTING");
      }
    }

    renderCanvas();
    requestAnimationFrame(gameLoop);
  }

  //====================================================================
  // CANVAS PHYSICS & FLIGHT RENDERING
  //====================================================================
  function resizeCanvas() {
    if (!DOM.canvas || !DOM.canvas.parentElement) return;
    const rect = DOM.canvas.parentElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const dpi = window.devicePixelRatio || 1;
    DOM.canvas.width = Math.floor(rect.width * dpi);
    DOM.canvas.height = Math.floor(rect.height * dpi);
    DOM.canvas.style.width = rect.width + "px";
    DOM.canvas.style.height = rect.height + "px";
    
    canvasWidth = rect.width;
    canvasHeight = rect.height;
    canvasCtx = DOM.canvas.getContext("2d");
    canvasCtx.setTransform(dpi, 0, 0, dpi, 0, 0);
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
        color: Math.random() < 0.6 ? "#ffffff" : (Math.random() < 0.5 ? "#a1a1aa" : "#ef4444"),
      });
    }
  }

  function drawRadarBackground(ctx) {
    const cx = canvasWidth * 0.58;
    const cy = canvasHeight * 0.55;

    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);

    [60, 130, 200, 280].forEach(function (r) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    });

    ctx.beginPath();
    ctx.moveTo(cx - 280, cy);
    ctx.lineTo(cx + 280, cy);
    ctx.moveTo(cx, cy - 280);
    ctx.lineTo(cx, cy + 280);
    ctx.stroke();

    const startY = canvasHeight - 28;
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
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
      ctx.shadowColor = "#ffffff";
      ctx.shadowBlur = 14;
      ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
      ctx.beginPath();
      ctx.arc(-14, 0, 3.5 + Math.random() * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    ctx.fillStyle = "#e4e4e7";
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

    if (gameState === "BETTING" || gameState === "WAITING" || gameState === "LAUNCHING") {
      drawPlane(ctx, startX, startY, 0);
      return;
    }

    if (gameState === "RUNNING") {
      const flightTime = Math.max(0, (Date.now() - (sharedRound.launchStartTime || Date.now())) / 1000);
      
      const spanX = canvasWidth * 0.76;
      const spanY = canvasHeight * 0.72;
      
      const t = flightTime;
      const factorX = 1 - Math.exp(-0.11 * t);
      const factorY = Math.pow(factorX, 1.25);
      const microTurbulence = Math.sin(t * 3.6) * (1.2 + Math.min(2.0, t * 0.1));

      const currX = startX + spanX * factorX;
      const currY = (startY - spanY * factorY) + microTurbulence;

      if (liveTrail.length === 0) {
        liveTrail.push({ x: startX, y: startY });
      }
      liveTrail.push({ x: currX, y: currY });

      if (liveTrail.length > 1) {
        ctx.save();
        const fillGrad = ctx.createLinearGradient(0, 0, 0, canvasHeight);
        fillGrad.addColorStop(0, "rgba(255, 255, 255, 0.14)");
        fillGrad.addColorStop(0.7, "rgba(255, 255, 255, 0.02)");
        fillGrad.addColorStop(1, "rgba(255, 255, 255, 0.0)");

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

        ctx.beginPath();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 3.0;
        ctx.shadowColor = "#ffffff";
        ctx.shadowBlur = 12;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.moveTo(liveTrail[0].x, liveTrail[0].y);
        for (let i = 1; i < liveTrail.length; i++) {
          ctx.lineTo(liveTrail[i].x, liveTrail[i].y);
        }
        ctx.stroke();
        ctx.restore();
      }

      let angle = -0.35;
      if (liveTrail.length >= 2) {
        const p1 = liveTrail[liveTrail.length - 2];
        const p2 = liveTrail[liveTrail.length - 1];
        angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      }

      drawPlane(ctx, currX, currY, angle);

    } else if (gameState === "CRASHED" || gameState === "RESULT") {
      if (liveTrail.length > 1) {
        ctx.save();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
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
  // WALLET & WITHDRAWAL CONTROLLER (WITH FIRESTORE & BANK PERSISTENCE)
  //====================================================================
  function populateSavedBankDetails() {
    if (savedState.bankDetails) {
      if (DOM.withdrawBankName && savedState.bankDetails.bankName) DOM.withdrawBankName.value = savedState.bankDetails.bankName;
      if (DOM.withdrawAccountHolder && savedState.bankDetails.holder) DOM.withdrawAccountHolder.value = savedState.bankDetails.holder;
      if (DOM.withdrawAccountNumber && savedState.bankDetails.account) DOM.withdrawAccountNumber.value = savedState.bankDetails.account;
      if (DOM.withdrawAccountNumberConfirm && savedState.bankDetails.account) DOM.withdrawAccountNumberConfirm.value = savedState.bankDetails.account;
      if (DOM.withdrawIfscCode && savedState.bankDetails.ifsc) DOM.withdrawIfscCode.value = savedState.bankDetails.ifsc;
    }
    if (savedState.upiDetails) {
      if (DOM.withdrawUpiName && savedState.upiDetails.upiName) DOM.withdrawUpiName.value = savedState.upiDetails.upiName;
      if (DOM.withdrawUpiId && savedState.upiDetails.upiId) DOM.withdrawUpiId.value = savedState.upiDetails.upiId;
    }
  }

  function saveCurrentBankDetailsToProfile() {
    const isBank = DOM.typeOptBank && DOM.typeOptBank.classList.contains("active");
    if (isBank) {
      const bName = (DOM.withdrawBankName ? DOM.withdrawBankName.value : "").trim();
      const bHolder = (DOM.withdrawAccountHolder ? DOM.withdrawAccountHolder.value : "").trim();
      const bNum = (DOM.withdrawAccountNumber ? DOM.withdrawAccountNumber.value : "").trim();
      const bIfsc = (DOM.withdrawIfscCode ? DOM.withdrawIfscCode.value : "").trim().toUpperCase();
      savedState.bankDetails = {
        bankName: bName,
        holder: bHolder,
        account: bNum,
        ifsc: bIfsc
      };
    } else {
      const uName = (DOM.withdrawUpiName ? DOM.withdrawUpiName.value : "").trim();
      const uId = (DOM.withdrawUpiId ? DOM.withdrawUpiId.value : "").trim();
      savedState.upiDetails = {
        upiName: uName,
        upiId: uId
      };
    }
    saveState();

    if (window.AERO_FIREBASE && window.AERO_FIREBASE.db) {
      const uid = (window.AERO_FIREBASE.auth && window.AERO_FIREBASE.auth.currentUser)
        ? window.AERO_FIREBASE.auth.currentUser.uid
        : (savedState.userEmail ? savedState.userEmail.replace(/[^a-zA-Z0-9]/g, "_") : null);
      if (uid) {
        window.AERO_FIREBASE.db.collection("users").doc(uid).set({
          bankDetails: savedState.bankDetails || {},
          upiDetails: savedState.upiDetails || {}
        }, { merge: true }).catch(function (e) {
          console.warn("[AeroCrash] Firestore bank save notice:", e.message);
        });
      }
    }
  }

  function openWalletModal(tab) {
    if (!DOM.modalWallet) return;
    DOM.modalWallet.classList.add("active");
    populateSavedBankDetails();
    switchWalletTab(tab || "deposit");
  }

  function closeWalletModal() {
    if (DOM.modalWallet) DOM.modalWallet.classList.remove("active");
  }

  function switchWalletTab(tabName) {
    if (tabName === "deposit") {
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
    DOM.walletStatusAlert.className = "deposit-status-alert active";
    DOM.walletStatusAlert.style.color = isSuccess ? "var(--status-success)" : "var(--status-danger)";
  }

  function setupWalletController() {
    if (DOM.tabWalletDeposit) DOM.tabWalletDeposit.addEventListener("click", function () { switchWalletTab("deposit"); });
    if (DOM.tabWalletWithdraw) DOM.tabWalletWithdraw.addEventListener("click", function () { switchWalletTab("withdraw"); });
    if (DOM.btnWalletClose) DOM.btnWalletClose.addEventListener("click", closeWalletModal);

    if (DOM.btnOpenWallet) DOM.btnOpenWallet.addEventListener("click", function () { openWalletModal("deposit"); });
    if (DOM.cardWalletBottom) DOM.cardWalletBottom.addEventListener("click", function () { openWalletModal("deposit"); });
    if (DOM.btnOpenWalletFromDossier) DOM.btnOpenWalletFromDossier.addEventListener("click", function () {
      if (DOM.modalProfile) DOM.modalProfile.classList.remove("active");
      openWalletModal("deposit");
    });

    const bankInputs = [DOM.withdrawBankName, DOM.withdrawAccountHolder, DOM.withdrawAccountNumber, DOM.withdrawAccountNumberConfirm, DOM.withdrawIfscCode, DOM.withdrawUpiName, DOM.withdrawUpiId];
    bankInputs.forEach(function (inp) {
      if (inp) {
        inp.addEventListener("change", saveCurrentBankDetailsToProfile);
        inp.addEventListener("blur", saveCurrentBankDetailsToProfile);
      }
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
        if (DOM.payoutUpiForm) DOM.payoutUpiForm.style.display = "flex";
        if (DOM.payoutBankForm) DOM.payoutBankForm.style.display = "none";
      });
    }

    // Modal Deposit Input & Dynamic Button Sync
    if (DOM.modalDepositInput) {
      const handleModalDepositChange = function () {
        const val = parseFloat(DOM.modalDepositInput.value) || 0;
        if (DOM.modalDepositChips) {
          DOM.modalDepositChips.forEach(function (c) {
            const chipAmt = parseFloat(c.getAttribute("data-amt"));
            if (chipAmt === val) c.classList.add("selected");
            else c.classList.remove("selected");
          });
        }
        if (DOM.btnModalDepositConfirm) {
          DOM.btnModalDepositConfirm.textContent = "ADD " + formatRupees(val) + " TO WALLET";
        }
      };
      DOM.modalDepositInput.addEventListener("input", handleModalDepositChange);
      DOM.modalDepositInput.addEventListener("change", handleModalDepositChange);
      DOM.modalDepositInput.addEventListener("keyup", handleModalDepositChange);
    }

    if (DOM.modalDepositChips) {
      DOM.modalDepositChips.forEach(function (chip) {
        chip.addEventListener("click", function () {
          DOM.modalDepositChips.forEach(function (c) { c.classList.remove("selected"); });
          chip.classList.add("selected");
          const amt = parseFloat(chip.getAttribute("data-amt")) || 100;
          if (DOM.modalDepositInput) DOM.modalDepositInput.value = amt;
          if (DOM.btnModalDepositConfirm) DOM.btnModalDepositConfirm.textContent = "ADD " + formatRupees(amt) + " TO WALLET";
        });
      });
    }

    // Modal Deposit Action (Adds the exact chosen/typed amount to wallet and cloud)
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
        showWalletAlert("Successfully added " + formatRupees(amt) + " to your Pilot Wallet!", true);

        if (window.AERO_FIREBASE && window.AERO_FIREBASE.db) {
          const uid = (window.AERO_FIREBASE.auth && window.AERO_FIREBASE.auth.currentUser) 
            ? window.AERO_FIREBASE.auth.currentUser.uid 
            : (savedState.userEmail ? savedState.userEmail.replace(/[^a-zA-Z0-9]/g, "_") : "pilot_user");
          
          const txId = "DEP_" + Date.now();
          window.AERO_FIREBASE.db.collection("deposits").doc(txId).set({
            txId: txId,
            uid: uid,
            email: savedState.userEmail || "pilot@aerocrash.com",
            callsign: savedState.callsign || "PILOT",
            amount: amt,
            utrNumber: utr || "DIRECT_ONLINE",
            ip: clientIP,
            status: "SUCCESS",
            timestamp: new Date()
          }).catch(function () {});

          window.AERO_FIREBASE.db.collection("users").doc(uid).set({
            balance: savedState.virtualBalance
          }, { merge: true }).catch(function () {});
        }
      });
    }

    if (DOM.depositInput) {
      const handlePaymentDepositChange = function () {
        const val = parseFloat(DOM.depositInput.value) || 0;
        if (DOM.depositChips) {
          DOM.depositChips.forEach(function (c) {
            const chipAmt = parseFloat(c.getAttribute("data-amt"));
            if (chipAmt === val) c.classList.add("selected");
            else c.classList.remove("selected");
          });
        }
        if (DOM.btnConfirmDeposit) {
          DOM.btnConfirmDeposit.textContent = "ADD " + formatRupees(val) + " TO WALLET";
        }
      };
      DOM.depositInput.addEventListener("input", handlePaymentDepositChange);
      DOM.depositInput.addEventListener("change", handlePaymentDepositChange);
    }

    if (DOM.depositChips) {
      DOM.depositChips.forEach(function (chip) {
        chip.addEventListener("click", function () {
          DOM.depositChips.forEach(function (c) { c.classList.remove("selected"); });
          chip.classList.add("selected");
          const amt = parseFloat(chip.getAttribute("data-amt")) || 100;
          if (DOM.depositInput) DOM.depositInput.value = amt;
          if (DOM.btnConfirmDeposit) DOM.btnConfirmDeposit.textContent = "ADD " + formatRupees(amt) + " TO WALLET";
        });
      });
    }

    // Modal Withdrawal Action
    if (DOM.btnSubmitWithdrawal) {
      DOM.btnSubmitWithdrawal.addEventListener("click", function () {
        const amt = parseFloat(DOM.withdrawAmountInput ? DOM.withdrawAmountInput.value : 50) || 50;
        if (amt < CONFIG.MIN_WITHDRAWAL) {
          showWalletAlert("Minimum withdrawal is " + formatRupees(CONFIG.MIN_WITHDRAWAL), false);
          return;
        }
        if (amt > savedState.virtualBalance) {
          showWalletAlert("Insufficient balance to withdraw " + formatRupees(amt), false);
          return;
        }

        const isBank = DOM.typeOptBank && DOM.typeOptBank.classList.contains("active");
        let details = {};

        if (isBank) {
          const bName = (DOM.withdrawBankName ? DOM.withdrawBankName.value : "").trim();
          const bHolder = (DOM.withdrawAccountHolder ? DOM.withdrawAccountHolder.value : "").trim();
          const bNum = (DOM.withdrawAccountNumber ? DOM.withdrawAccountNumber.value : "").trim();
          const bNumConf = (DOM.withdrawAccountNumberConfirm ? DOM.withdrawAccountNumberConfirm.value : "").trim();
          const bIfsc = (DOM.withdrawIfscCode ? DOM.withdrawIfscCode.value : "").trim().toUpperCase();

          if (!bHolder || !bNum || !bIfsc) {
            showWalletAlert("Please fill Account Holder, Account Number, and IFSC Code.", false);
            return;
          }
          if (bNum !== bNumConf) {
            showWalletAlert("Account numbers do not match.", false);
            return;
          }
          details = { method: "BANK_TRANSFER", bankName: bName, holder: bHolder, account: bNum, ifsc: bIfsc };
        } else {
          const upiName = (DOM.withdrawUpiName ? DOM.withdrawUpiName.value : "").trim();
          const upiId = (DOM.withdrawUpiId ? DOM.withdrawUpiId.value : "").trim();
          if (!upiId || !upiId.includes("@")) {
            showWalletAlert("Please enter a valid UPI ID (e.g. name@paytm).", false);
            return;
          }
          details = { method: "UPI", upiName: upiName, upiId: upiId };
        }

        saveCurrentBankDetailsToProfile();
        savedState.virtualBalance -= amt;
        saveState();
        updatePlayerUIBalance();

        showWalletAlert("Withdrawal Request of " + formatRupees(amt) + " Submitted! Payout is being routed.", true);

        if (window.AERO_FIREBASE && window.AERO_FIREBASE.db) {
          const uid = (window.AERO_FIREBASE.auth && window.AERO_FIREBASE.auth.currentUser) 
            ? window.AERO_FIREBASE.auth.currentUser.uid 
            : (savedState.userEmail ? savedState.userEmail.replace(/[^a-zA-Z0-9]/g, "_") : "pilot_user");
          
          const wId = "WD_" + Date.now();
          window.AERO_FIREBASE.db.collection("withdrawals").doc(wId).set({
            wId: wId,
            uid: uid,
            email: savedState.userEmail,
            callsign: savedState.callsign,
            amount: amt,
            details: details,
            ip: clientIP,
            status: "PENDING",
            timestamp: new Date()
          }).catch(function () {});

          window.AERO_FIREBASE.db.collection("users").doc(uid).set({
            balance: savedState.virtualBalance
          }, { merge: true }).catch(function () {});
        }
      });
    }

    if (DOM.withdrawPercentChips) {
      DOM.withdrawPercentChips.forEach(function (chip) {
        chip.addEventListener("click", function () {
          const pct = parseFloat(chip.getAttribute("data-percent")) || 100;
          const amt = Math.floor((savedState.virtualBalance * (pct / 100)) * 100) / 100;
          if (DOM.withdrawAmountInput) DOM.withdrawAmountInput.value = Math.max(50, amt);
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

    const rate = savedState.career.roundsPlayed > 0 ? ((savedState.career.roundsWon / savedState.career.roundsPlayed) * 100).toFixed(1) : "0.0";
    if (DOM.dossierWinRate) DOM.dossierWinRate.textContent = rate + "%";
    if (DOM.dossierHighestMulti) DOM.dossierHighestMulti.textContent = savedState.career.highestCashoutMulti.toFixed(2) + "x";
    if (DOM.dossierBestPayout) DOM.dossierBestPayout.textContent = formatRupees(savedState.career.bestPayoutVc);
  }

  function renderPersonalHistoryLogs() {
    if (!DOM.personalLogsContainer) return;
    if (!savedState.history || savedState.history.length === 0) {
      DOM.personalLogsContainer.innerHTML = '<div class="empty-logs">No completed flights yet. Stake or watch flights to see live history.</div>';
      return;
    }

    let html = "";
    savedState.history.slice(0, 30).forEach(function (h) {
      const isWin = h.status === "WIN";
      const isLoss = h.status === "LOSS";
      const isSpectate = h.status === "SPECTATE";

      let statusClass = isWin ? "win" : isLoss ? "loss" : "spectate";
      let multiBadge = '<span class="hist-multi-pill ' + (h.multiplier >= 2.0 ? 'high' : '') + '">' + h.multiplier.toFixed(2) + 'x</span>';

      let payoutHtml = '';
      if (isWin) {
        payoutHtml = '<strong style="color:var(--status-success);">+' + formatRupees(h.profit) + '</strong><br><small style="color:var(--text-dim);">Stake: ' + formatRupees(h.stake) + '</small>';
      } else if (isLoss) {
        payoutHtml = '<strong style="color:var(--status-danger);">-' + formatRupees(h.stake) + '</strong><br><small style="color:var(--text-dim);">Lost</small>';
      } else {
        payoutHtml = '<span style="color:var(--text-dim); font-size:10px;">SPECTATED</span><br><small style="color:var(--text-dim);">No Stake</small>';
      }

      const slotBadge = h.slot ? ' (B' + h.slot + ')' : '';

      html += '<div class="personal-log-row ' + statusClass + '">' +
        '<div><strong>ROUND #' + h.round + '</strong>' + slotBadge + '<br><small style="color:var(--text-muted);">' + (h.time || "") + '</small></div>' +
        '<div style="text-align:center;">' + multiBadge + '</div>' +
        '<div style="text-align:right;">' + payoutHtml + '</div>' +
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
      .catch(function () {
        tbody.innerHTML = '<tr>' +
          '<td style="color:var(--accent-amber); font-weight:700;">' + (savedState.callsign || "PILOT") + ' (ACTIVE)</td>' +
          '<td>' + (savedState.userEmail || "pilot@aerocrash.com") + '</td>' +
          '<td style="color:var(--status-info);">' + clientIP + '</td>' +
          '<td style="color:var(--status-success); font-weight:700;">' + formatRupees(savedState.virtualBalance) + '</td>' +
          '</tr>';
      });
  }

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
              if (uid && refundAmt > 0) {
                const userRef = window.AERO_FIREBASE.db.collection("users").doc(uid);
                userRef.get().then(function (uDoc) {
                  if (uDoc.exists) {
                    const curBal = uDoc.data().balance || 0;
                    userRef.update({ balance: curBal + refundAmt });
                  }
                });
              }
              fetchAdminWithdrawals();
            });
          });
        });
      })
      .catch(function () {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-dim);">No pending withdrawal requests.</td></tr>';
      });
  }

  //====================================================================
  // EVENT LISTENERS & SETUP
  //====================================================================
  function setupEventListeners() {
    if (DOM.btnAddBetPanel) {
      DOM.btnAddBetPanel.addEventListener("click", function () {
        const nextId = (activeSlotIds.length > 0 ? Math.max.apply(null, activeSlotIds) : 0) + 1;
        activeSlotIds.push(nextId);
        renderDynamicBetPanels();
      });
    }

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

    if (DOM.btnSoundToggle) {
      DOM.btnSoundToggle.addEventListener("click", function () {
        savedState.audioEnabled = !savedState.audioEnabled;
        if (savedState.audioEnabled) initAudio();
        DOM.btnSoundToggle.style.opacity = savedState.audioEnabled ? "1" : "0.4";
        saveState();
      });
    }

    if (DOM.btnFullscreenToggle) {
      DOM.btnFullscreenToggle.addEventListener("click", function () {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(function () {});
        } else {
          document.exitFullscreen().catch(function () {});
        }
      });
    }

    if (DOM.btnRulesToggle) {
      DOM.btnRulesToggle.addEventListener("click", function () {
        if (DOM.modalOnboarding) DOM.modalOnboarding.classList.add("active");
      });
    }
    if (DOM.btnRulesClose) {
      DOM.btnRulesClose.addEventListener("click", function () {
        if (DOM.modalOnboarding) DOM.modalOnboarding.classList.remove("active");
      });
    }
    if (DOM.btnOnboardingDismiss) {
      DOM.btnOnboardingDismiss.addEventListener("click", function () {
        if (DOM.modalOnboarding) DOM.modalOnboarding.classList.remove("active");
      });
    }

    if (DOM.profileChip) {
      DOM.profileChip.addEventListener("click", function () {
        updateCareerTables();
        if (DOM.modalProfile) DOM.modalProfile.classList.add("active");
      });
    }
    if (DOM.btnProfileClose) {
      DOM.btnProfileClose.addEventListener("click", function () {
        if (DOM.modalProfile) DOM.modalProfile.classList.remove("active");
      });
    }
    if (DOM.btnDossierCloseBottom) {
      DOM.btnDossierCloseBottom.addEventListener("click", function () {
        if (DOM.modalProfile) DOM.modalProfile.classList.remove("active");
      });
    }
    if (DOM.btnResetStats) {
      DOM.btnResetStats.addEventListener("click", function () {
        savedState.career = {
          roundsPlayed: 0, roundsWon: 0, roundsLost: 0, totalVcStaked: 0, totalVcWon: 0, totalVcLost: 0,
          highestCashoutMulti: 0.0, bestPayoutVc: 0
        };
        savedState.history = [];
        saveState();
        updateCareerTables();
        renderPersonalHistoryLogs();
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
        if (DOM.debugTargetMulti) DOM.debugTargetMulti.textContent = crashMultiplier.toFixed(2) + "x";
        if (DOM.debugLiveMulti) DOM.debugLiveMulti.textContent = liveMultiplier.toFixed(2) + "x";
        if (DOM.gmTargetInput && (!DOM.gmOverrideEnabled || !DOM.gmOverrideEnabled.checked)) {
          DOM.gmTargetInput.value = crashMultiplier.toFixed(2);
          gmPresetBtns.forEach(function (b) {
            const bVal = parseFloat(b.getAttribute("data-multi"));
            if (Math.abs(bVal - crashMultiplier) < 0.01) b.classList.add("selected");
            else b.classList.remove("selected");
          });
        }
      });
    }
    if (DOM.btnGmClose) {
      DOM.btnGmClose.addEventListener("click", function () {
        if (DOM.drawerGM) DOM.drawerGM.classList.remove("active");
      });
    }
    // Game Master preset chips (2.00x, 3.00x, 5.00x, 10.00x, 15.00x, 25.00x, 50.00x, 100.00x)
    const gmPresetBtns = document.querySelectorAll(".gm-preset-btn");
    gmPresetBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        const multiVal = parseFloat(btn.getAttribute("data-multi"));
        if (isNaN(multiVal)) return;

        if (DOM.gmTargetInput) DOM.gmTargetInput.value = multiVal.toFixed(2);
        if (DOM.gmOverrideEnabled) DOM.gmOverrideEnabled.checked = true;

        gmPresetBtns.forEach(function (b) { b.classList.remove("selected"); });
        btn.classList.add("selected");

        crashMultiplier = Math.min(MAX_POSSIBLE_MULTIPLIER, multiVal);
        sharedRound.crashMultiplier = crashMultiplier;
        if (DOM.debugTargetMulti) DOM.debugTargetMulti.textContent = crashMultiplier.toFixed(2) + "x";
        publishSharedRoundState();
        console.log("[Game Master] Target multiplier set via preset:", crashMultiplier.toFixed(2) + "x");
      });
    });

    if (DOM.gmBtnForceCrash) {
      DOM.gmBtnForceCrash.addEventListener("click", function () {
        if (gameState === "RUNNING") {
          isManualCrashPending = true;
          sharedRound.state = "CRASHED";
          sharedRound.crashedAt = Date.now();
          sharedRound.crashedMultiplier = liveMultiplier;
          publishSharedRoundState();
          applyStateTransition("CRASHED");
          console.log("[Game Master] Force Crash executed at", liveMultiplier.toFixed(2) + "x");
        }
      });
    }
    if (DOM.gmBtnPauseToggle) {
      DOM.gmBtnPauseToggle.addEventListener("click", function () {
        isGamePaused = !isGamePaused;
        DOM.gmBtnPauseToggle.textContent = isGamePaused ? "RESUME SIMULATION" : "PAUSE SIMULATION";
        sharedRound.isPaused = isGamePaused;
        publishSharedRoundState();
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
        const manual = parseFloat(DOM.gmTargetInput.value);
        if (!isNaN(manual) && manual >= 1.05) {
          if (DOM.gmOverrideEnabled) DOM.gmOverrideEnabled.checked = true;

          gmPresetBtns.forEach(function (b) {
            const bVal = parseFloat(b.getAttribute("data-multi"));
            if (bVal === manual) b.classList.add("selected");
            else b.classList.remove("selected");
          });

          crashMultiplier = Math.min(MAX_POSSIBLE_MULTIPLIER, manual);
          sharedRound.crashMultiplier = crashMultiplier;
          if (DOM.debugTargetMulti) DOM.debugTargetMulti.textContent = crashMultiplier.toFixed(2) + "x";
          publishSharedRoundState();
        }
      });
    }
    if (DOM.gmOverrideEnabled) {
      DOM.gmOverrideEnabled.addEventListener("change", function () {
        if (DOM.gmOverrideEnabled.checked) {
          const manual = parseFloat(DOM.gmTargetInput ? DOM.gmTargetInput.value : 15.0) || 15.0;
          crashMultiplier = Math.min(MAX_POSSIBLE_MULTIPLIER, manual);
        } else {
          crashMultiplier = generateCrashPoint(roundNumber * 7919);
        }
        sharedRound.crashMultiplier = crashMultiplier;
        if (DOM.debugTargetMulti) DOM.debugTargetMulti.textContent = crashMultiplier.toFixed(2) + "x";
        publishSharedRoundState();
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

        if (DOM.authStatusBox) {
          DOM.authStatusBox.textContent = "";
          DOM.authStatusBox.className = "auth-status-box";
        }

        if (currentAuthMode === "register") {
          if (DOM.authGroupCallsign) DOM.authGroupCallsign.style.display = "flex";
          if (DOM.authTitle) DOM.authTitle.textContent = "PILOT REGISTRATION";
          if (DOM.authDesc) DOM.authDesc.textContent = "Create your Pilot ID and get ₹10 Free Bonus credits instantly.";
          if (DOM.authSubmit) DOM.authSubmit.textContent = "REGISTER & GET ₹10 BONUS";
        } else {
          if (DOM.authGroupCallsign) DOM.authGroupCallsign.style.display = "none";
          if (DOM.authTitle) DOM.authTitle.textContent = "PILOT SIGN IN";
          if (DOM.authDesc) DOM.authDesc.textContent = "Sign in to access your Pilot cockpit, telemetry and wallet balance.";
          if (DOM.authSubmit) DOM.authSubmit.textContent = "SIGN IN & PROCEED";
        }
      });
    });

    if (DOM.authSubmit) {
      DOM.authSubmit.addEventListener("click", function () {
        handleAuthSubmit();
      });
    }

    const authInputs = [DOM.authCallsignInput, DOM.authEmailInput, DOM.authPasswordInput];
    authInputs.forEach(function (inp) {
      if (inp) {
        inp.addEventListener("keydown", function (e) {
          if (e.key === "Enter") {
            e.preventDefault();
            handleAuthSubmit();
          }
        });
      }
    });

    if (window.AERO_FIREBASE && window.AERO_FIREBASE.auth) {
      window.AERO_FIREBASE.auth.onAuthStateChanged(function (user) {
        if (user && !savedState.isLoggedIn) {
          detectAndSyncBackend(user, "session_restore", "");
        }
      });
    }
  }

  function handleAuthSubmit() {
    const rawEmail = (DOM.authEmailInput ? DOM.authEmailInput.value : "").trim();
    const password = (DOM.authPasswordInput ? DOM.authPasswordInput.value : "").trim();
    const rawCallsign = (DOM.authCallsignInput ? DOM.authCallsignInput.value : "").trim();

    if (!rawEmail || !password) {
      showAuthStatus("Please enter your Email/Callsign and Password.", "error");
      return;
    }

    if (password.length < 6) {
      showAuthStatus("Password must be at least 6 characters.", "error");
      return;
    }

    let normalizedEmail = rawEmail;
    if (!normalizedEmail.includes("@")) {
      normalizedEmail = normalizedEmail.toLowerCase().replace(/[^a-z0-9._-]/g, "") + "@aerocrash.com";
    }

    const pilotCallsign = rawCallsign || rawEmail.split("@")[0].toUpperCase() || "MAVERICK";

    if (DOM.authSubmit) {
      DOM.authSubmit.disabled = true;
      DOM.authSubmit.textContent = currentAuthMode === "register" ? "CREATING ID..." : "AUTHENTICATING...";
    }
    showAuthStatus("Connecting to flight deck cloud...", "success");

    function resetSubmitBtn() {
      if (DOM.authSubmit) {
        DOM.authSubmit.disabled = false;
        DOM.authSubmit.textContent = currentAuthMode === "register" ? "REGISTER & GET ₹10 BONUS" : "SIGN IN & PROCEED";
      }
    }

    if (!window.AERO_FIREBASE || !window.AERO_FIREBASE.auth) {
      savedState.isLoggedIn = true;
      savedState.userEmail = normalizedEmail;
      savedState.callsign = pilotCallsign;
      savedState.userRole = (window.AERO_FIREBASE && window.AERO_FIREBASE.isAdminEmail && window.AERO_FIREBASE.isAdminEmail(normalizedEmail)) ? "admin" : "user";
      saveState();
      completeLoginRouting(currentAuthMode);
      resetSubmitBtn();
      return;
    }

    const auth = window.AERO_FIREBASE.auth;

    if (currentAuthMode === "register") {
      auth.createUserWithEmailAndPassword(normalizedEmail, password)
        .then(function (cred) {
          showAuthStatus("ID Created! Loading flight deck...", "success");
          detectAndSyncBackend(cred.user, "register", pilotCallsign);
          resetSubmitBtn();
        })
        .catch(function (err) {
          resetSubmitBtn();
          if (err.code === "auth/email-already-in-use") {
            showAuthStatus("This Pilot ID is already registered. Please click PILOT LOGIN.", "error");
          } else if (err.code === "auth/invalid-email") {
            showAuthStatus("Invalid email address format.", "error");
          } else if (err.code === "auth/weak-password") {
            showAuthStatus("Password is too weak. Must be 6+ characters.", "error");
          } else {
            showAuthStatus(err.message || "Registration failed.", "error");
          }
        });
    } else {
      auth.signInWithEmailAndPassword(normalizedEmail, password)
        .then(function (cred) {
          showAuthStatus("Authentication verified! Launching cockpit...", "success");
          detectAndSyncBackend(cred.user, "login", pilotCallsign);
          resetSubmitBtn();
        })
        .catch(function (err) {
          resetSubmitBtn();
          if (err.code === "auth/user-not-found") {
            showAuthStatus("No Pilot found with this ID. Click CREATE ID to register.", "error");
          } else if (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
            showAuthStatus("Incorrect password. Please verify credentials.", "error");
          } else if (err.code === "auth/invalid-email") {
            showAuthStatus("Invalid Pilot ID format.", "error");
          } else {
            showAuthStatus(err.message || "Authentication failed.", "error");
          }
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
      populateSavedBankDetails();
      completeLoginRouting(authMode);
      return;
    }

    const userRef = db.collection("users").doc(uid);
    userRef.get().then(function (doc) {
      if (doc.exists) {
        const data = doc.data();
        savedState.callsign = data.callsign || customCallsign || savedState.callsign;
        savedState.virtualBalance = typeof data.balance === "number" ? data.balance : savedState.virtualBalance;
        if (data.bankDetails) savedState.bankDetails = Object.assign(savedState.bankDetails || {}, data.bankDetails);
        if (data.upiDetails) savedState.upiDetails = Object.assign(savedState.upiDetails || {}, data.upiDetails);
        if (data.career) savedState.career = Object.assign(savedState.career, data.career);

        userRef.set({
          uid: uid,
          email: email,
          callsign: savedState.callsign,
          role: role,
          balance: savedState.virtualBalance,
          bankDetails: savedState.bankDetails || {},
          upiDetails: savedState.upiDetails || {},
          lastIP: clientIP,
          lastLoginAt: new Date()
        }, { merge: true }).catch(function () {});
      } else {
        savedState.callsign = customCallsign || email.split("@")[0].toUpperCase() || "MAVERICK";
        savedState.virtualBalance = CONFIG.INITIAL_BALANCE;
        userRef.set({
          uid: uid,
          email: email,
          callsign: savedState.callsign,
          role: role,
          balance: savedState.virtualBalance,
          bankDetails: savedState.bankDetails || {},
          upiDetails: savedState.upiDetails || {},
          createdAt: new Date(),
          lastIP: clientIP,
          lastLoginAt: new Date(),
          career: savedState.career
        }).catch(function () {});
      }

      saveState();
      populateSavedBankDetails();
      listenToUserDoc(uid);
      completeLoginRouting(authMode);
    }).catch(function (err) {
      console.warn("[AeroCrash] Backend sync fallback to local state:", err);
      saveState();
      populateSavedBankDetails();
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


  // Immediate Cloud Firestore Synchronizer for Active Profile
  function syncUserProfileToFirestore() {
    if (!window.AERO_FIREBASE || !window.AERO_FIREBASE.db) return;
    const db = window.AERO_FIREBASE.db;
    const auth = window.AERO_FIREBASE.auth;
    
    let uid = (auth && auth.currentUser) ? auth.currentUser.uid : null;
    if (!uid) {
      if (savedState.userEmail) {
        uid = savedState.userEmail.replace(/[^a-zA-Z0-9]/g, "_");
      } else {
        uid = "pilot_" + (savedState.callsign || "guest").toLowerCase();
      }
    }

    const email = savedState.userEmail || (savedState.callsign ? savedState.callsign.toLowerCase() + "@aerocrash.com" : "pilot@aerocrash.com");
    const isAdmin = (window.AERO_FIREBASE.isAdminEmail && window.AERO_FIREBASE.isAdminEmail(email));
    const role = isAdmin ? "admin" : (savedState.userRole || "user");
    savedState.userRole = role;

    db.collection("users").doc(uid).set({
      uid: uid,
      email: email,
      callsign: savedState.callsign || "PILOT",
      role: role,
      balance: typeof savedState.virtualBalance === "number" ? savedState.virtualBalance : CONFIG.INITIAL_BALANCE,
      bankDetails: savedState.bankDetails || {},
      upiDetails: savedState.upiDetails || {},
      lastIP: clientIP,
      lastActiveAt: new Date(),
      career: savedState.career || {}
    }, { merge: true }).then(function () {
      console.log("[AeroCrash Firestore] Successfully stored/updated user in Firestore:", uid);
    }).catch(function (err) {
      console.warn("[AeroCrash Firestore] Notice: Could not sync user doc (check Rules tab in Firebase Console):", err.message);
    });

    listenToUserDoc(uid);
  }

  function completeLoginRouting(authMode) {
    updatePlayerUIBalance();
    syncUserProfileToFirestore();
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
    initGlobalMultiplayerSync();
    renderDynamicBetPanels();
    resizeCanvas();
    updateActionButtons();

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
        syncUserProfileToFirestore();
        if (!hasReceivedFirstSnapshot || !sharedRound.state) {
          applyStateTransition("BETTING", false);
        } else {
          applyStateTransition(sharedRound.state, true);
        }
        requestAnimationFrame(gameLoop);
      }
    }, 35);
  }

  window.addEventListener("DOMContentLoaded", init);
})();
