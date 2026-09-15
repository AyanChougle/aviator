/**
 * AEROCRASH — TACTICAL HIGH-ALTITUDE FLIGHT SIMULATOR
 * Modernized UI, Live Telemetry, Multiplayer Squadron, Full Bank & UPI Withdrawal System, Firestore Cloud Sync
 * Real-Time IP Detection, Unpredictable Dynamic Physics, Admin User & Withdrawal Management
 * Real-time Synchronized Multi-User Global Gameplay, Real-User Active Bets, Dual/Multiple Betting System
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
  // ENGINE & GAME STATE VARIABLES
  //===================================================================
  let gameState = "BETTING"; // "BETTING", "LAUNCHING", "RUNNING", "CRASHED", "RESULT"
  let roundNumber = 2848;
  let liveMultiplier = 1.00;
  let crashMultiplier = 2.50;
  let roundStartTime = 0;
  let launchingStartTime = 0;
  let launchStartTime = 0;
  let currentScreen = "SPLASH";
  let isGamePaused = false;
  let isManualCrashPending = false;
  let fleetCount = 150;

  // DUAL BET SLOTS (MULTIPLE BETS IN ONE)
  let bets = {
    1: {
      isPlaced: false,
      stake: 10,
      isCashedOut: false,
      cashoutMultiplier: 0.0,
      cashoutAmount: 0,
      autoEnabled: false,
      autoValue: 2.00
    },
    2: {
      isPlaced: false,
      stake: 10,
      isCashedOut: false,
      cashoutMultiplier: 0.0,
      cashoutAmount: 0,
      autoEnabled: false,
      autoValue: 3.00
    }
  };

  let activeBetSlotTab = 1;
  let isDualViewMode = false;

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

      // Left Controls Navigation
      tabCtrlBetting: document.getElementById("tab-ctrl-betting"),
      tabCtrlHistory: document.getElementById("tab-ctrl-history"),
      controlsBettingView: document.getElementById("controls-betting-view"),
      controlsHistoryView: document.getElementById("controls-history-view"),

      // Dual Bet Slots Tabs & Container
      tabSlot1: document.getElementById("tab-bet-slot-1"),
      tabSlot2: document.getElementById("tab-bet-slot-2"),
      slotDot1: document.getElementById("slot-dot-1"),
      slotDot2: document.getElementById("slot-dot-2"),
      btnToggleDual: document.getElementById("btn-toggle-dual-mode"),
      betPanelsWrapper: document.getElementById("bet-panels-wrapper"),
      betCard1: document.getElementById("bet-card-1"),
      betCard2: document.getElementById("bet-card-2"),
      slotSummary1: document.getElementById("slot-summary-1"),
      slotSummary2: document.getElementById("slot-summary-2"),

      // Slot 1 Controls
      stakeInput1: document.getElementById("input-stake-1"),
      btnStakeInc1: document.getElementById("btn-stake-inc-1"),
      btnStakeDec1: document.getElementById("btn-stake-dec-1"),
      chips1: document.querySelectorAll("#quick-grid-1 .btn-chip"),
      autoCheck1: document.getElementById("check-auto-cashout-1"),
      autoInput1: document.getElementById("input-auto-cashout-1"),
      btnClearAuto1: document.getElementById("btn-clear-autocashout-1"),
      btnAction1: document.getElementById("btn-action-1"),
      actionText1: document.getElementById("action-btn-text-1"),
      actionSubtext1: document.getElementById("action-btn-subtext-1"),

      // Slot 2 Controls
      stakeInput2: document.getElementById("input-stake-2"),
      btnStakeInc2: document.getElementById("btn-stake-inc-2"),
      btnStakeDec2: document.getElementById("btn-stake-dec-2"),
      chips2: document.querySelectorAll("#quick-grid-2 .btn-chip"),
      autoCheck2: document.getElementById("check-auto-cashout-2"),
      autoInput2: document.getElementById("input-auto-cashout-2"),
      btnClearAuto2: document.getElementById("btn-clear-autocashout-2"),
      btnAction2: document.getElementById("btn-action-2"),
      actionText2: document.getElementById("action-btn-text-2"),
      actionSubtext2: document.getElementById("action-btn-subtext-2"),

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
  // UNPREDICTABLE MULTIPLIER & FLIGHT ENGINE (REALISTIC CEILING 30.00x)
  //====================================================================
  const MAX_POSSIBLE_MULTIPLIER = 30.00;

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
      point = Math.floor((1.00 + Math.random() * 0.15) * 100) / 100;
    } else if (r < 0.60) {
      point = Math.floor((1.16 + Math.random() * 1.24) * 100) / 100;
    } else if (r < 0.88) {
      point = Math.floor((2.41 + Math.random() * 3.09) * 100) / 100;
    } else if (r < 0.97) {
      point = Math.floor((5.51 + Math.random() * 6.49) * 100) / 100;
    } else {
      point = Math.floor((12.01 + Math.random() * 12.99) * 100) / 100;
    }
    return Math.min(MAX_POSSIBLE_MULTIPLIER, Math.max(1.00, point));
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

      html += '<tr class="' + statusClass + '">' +
        '<td>' + pilotId + '</td>' +
        '<td style="font-weight:700; color:' + (displayName === savedState.callsign ? 'var(--accent-orange)' : 'var(--text-main)') + ';">' + displayName + '</td>' +
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
  // GLOBAL REAL-TIME MULTIPLAYER SYNCHRONIZATION ENGINE (LEADER / MASTER)
  //====================================================================
  let isGlobalSyncActive = false;
  let globalRoundUnsubscribe = null;
  const localSessionId = "pilot_session_" + Math.random().toString(36).substring(2, 9);
  let isMasterAuthority = false;
  let lastRemoteUpdate = Date.now();

  function isLocalMaster() {
    // Admin always takes master authority
    if (savedState.userRole === "admin") return true;
    return isMasterAuthority;
  }

  function initGlobalMultiplayerSync() {
    if (!window.AERO_FIREBASE || !window.AERO_FIREBASE.db) {
      isMasterAuthority = true;
      return;
    }
    if (isGlobalSyncActive) return;
    isGlobalSyncActive = true;

    const roundDocRef = window.AERO_FIREBASE.db.collection("game_state").doc("current_round");

    globalRoundUnsubscribe = roundDocRef.onSnapshot(function (doc) {
      if (!doc.exists) {
        isMasterAuthority = true;
        publishGlobalRoundState("BETTING", roundNumber, crashMultiplier);
        return;
      }

      const data = doc.data();
      const serverNow = Date.now();
      lastRemoteUpdate = serverNow;

      // Master coordination determination
      if (savedState.userRole === "admin") {
        isMasterAuthority = true;
      } else if (data.masterId === localSessionId) {
        isMasterAuthority = true;
      } else {
        // If master has gone stale (> 25 seconds without update), claim authority
        if (data.updatedAt && (serverNow - data.updatedAt > 25000)) {
          isMasterAuthority = true;
        } else {
          isMasterAuthority = false;
        }
      }

      // Sync round number and crash target from master
      if (data.roundNumber && data.roundNumber !== roundNumber) {
        roundNumber = data.roundNumber;
        crashMultiplier = typeof data.crashMultiplier === "number" ? data.crashMultiplier : generateCrashPoint();
        if (DOM.roundPill) DOM.roundPill.textContent = "ROUND #" + roundNumber;
        if (DOM.debugTargetMulti) DOM.debugTargetMulti.textContent = crashMultiplier.toFixed(2) + "x";
        subscribeToActiveBets(roundNumber);
      }

      if (typeof data.crashMultiplier === "number" && Math.abs(data.crashMultiplier - crashMultiplier) > 0.001) {
        crashMultiplier = data.crashMultiplier;
        if (DOM.debugTargetMulti) DOM.debugTargetMulti.textContent = crashMultiplier.toFixed(2) + "x";
      }

      // Sync phase from master if not local master
      if (!isLocalMaster() && data.state && data.state !== gameState) {
        if (data.state === "RUNNING") {
          const elapsedServer = data.launchStartTime ? Math.max(0, serverNow - data.launchStartTime) : 0;
          launchStartTime = performance.now() - elapsedServer;
          transitionTo("RUNNING", true);
        } else if (data.state === "CRASHED") {
          liveMultiplier = typeof data.crashMultiplier === "number" ? data.crashMultiplier : crashMultiplier;
          transitionTo("CRASHED", true);
        } else if (data.state === "BETTING") {
          const elapsedServer = data.bettingStartTime ? Math.max(0, serverNow - data.bettingStartTime) : 0;
          roundStartTime = performance.now() - elapsedServer;
          transitionTo("BETTING", true);
        } else if (data.state === "LAUNCHING") {
          transitionTo("LAUNCHING", true);
        }
      }
    }, function (err) {
      console.warn("[AeroCrash] Multiplayer sync notice:", err.message);
      isMasterAuthority = true;
    });
  }

  function publishGlobalRoundState(state, rNum, cMulti) {
    if (!window.AERO_FIREBASE || !window.AERO_FIREBASE.db) return;
    if (!isLocalMaster()) return; // Followers do not overwrite global game state

    const nowEpoch = Date.now();
    window.AERO_FIREBASE.db.collection("game_state").doc("current_round").set({
      roundNumber: rNum,
      state: state,
      crashMultiplier: cMulti,
      bettingStartTime: state === "BETTING" ? nowEpoch : 0,
      launchStartTime: state === "RUNNING" ? nowEpoch : 0,
      masterId: localSessionId,
      updatedAt: nowEpoch
    }, { merge: true }).catch(function () {});
  }

  //====================================================================
  // DUAL BETTING CONTROLLER (SLOT 1 & SLOT 2)
  //====================================================================
  function getStakeForSlot(slot) {
    const input = slot === 2 ? DOM.stakeInput2 : DOM.stakeInput1;
    let val = parseFloat(input ? input.value : 10) || 10;
    return Math.max(CONFIG.MIN_STAKE, Math.min(CONFIG.MAX_STAKE, val));
  }

  function updateActionButtons() {
    [1, 2].forEach(function (slot) {
      const b = bets[slot];
      const btn = slot === 2 ? DOM.btnAction2 : DOM.btnAction1;
      const text = slot === 2 ? DOM.actionText2 : DOM.actionText1;
      const sub = slot === 2 ? DOM.actionSubtext2 : DOM.actionSubtext1;
      const summary = slot === 2 ? DOM.slotSummary2 : DOM.slotSummary1;
      const dot = slot === 2 ? DOM.slotDot2 : DOM.slotDot1;
      const tab = slot === 2 ? DOM.tabSlot2 : DOM.tabSlot1;

      if (!btn) return;
      btn.className = "btn-action-takeoff";
      btn.disabled = false;

      if (summary) summary.textContent = formatRupees(getStakeForSlot(slot));

      if (b.isPlaced) {
        if (dot) dot.style.background = "var(--status-success)";
        if (tab) tab.classList.add("has-bet");
      } else {
        if (dot) dot.style.background = "var(--text-dim)";
        if (tab) tab.classList.remove("has-bet");
      }

      if (gameState === "BETTING" || gameState === "WAITING") {
        if (b.isPlaced) {
          btn.classList.add("state-cancel");
          text.textContent = "CANCEL (BET " + slot + ")";
          if (sub) sub.textContent = "Staked: " + formatRupees(b.stake);
        } else {
          btn.classList.add("state-bet");
          text.textContent = "TAKEOFF (BET " + slot + ")";
          if (sub) sub.textContent = "Stake: " + formatRupees(getStakeForSlot(slot));
        }
      } else if (gameState === "LAUNCHING") {
        if (b.isPlaced) {
          btn.classList.add("state-cashout");
          text.textContent = "AIRBORNE SOON";
          if (sub) sub.textContent = "Engines Spooling...";
          btn.disabled = true;
        } else {
          btn.disabled = true;
          text.textContent = "TAKEOFF (BET " + slot + ")";
          if (sub) sub.textContent = "Doors Closed";
        }
      } else if (gameState === "RUNNING") {
        if (b.isPlaced && !b.isCashedOut) {
          const currentPayout = Math.floor(b.stake * liveMultiplier * 100) / 100;
          btn.classList.add("state-cashout");
          text.textContent = "CASH OUT " + liveMultiplier.toFixed(2) + "x (B" + slot + ")";
          if (sub) sub.textContent = "Payout: " + formatRupees(currentPayout);
        } else if (b.isCashedOut) {
          btn.disabled = true;
          btn.classList.add("state-cashout");
          text.textContent = "CASHED OUT (B" + slot + ")";
          if (sub) sub.textContent = "Won: +" + formatRupees(b.cashoutAmount - b.stake);
        } else {
          btn.disabled = true;
          text.textContent = "IN FLIGHT";
          if (sub) sub.textContent = "Waiting for next round...";
        }
      } else {
        btn.disabled = true;
        text.textContent = "ROUND SETTLED";
        if (sub) sub.textContent = gameState === "CRASHED" ? "Flight crashed" : "Preparing round...";
      }
    });
  }

  function placeBet(slot) {
    const stake = getStakeForSlot(slot);
    if (savedState.virtualBalance < stake) {
      showActionFeedback("INSUFFICIENT BALANCE // ADD FUNDS", "danger");
      openWalletModal("deposit");
      return;
    }

    savedState.virtualBalance -= stake;
    savedState.career.totalVcStaked += stake;
    bets[slot].stake = stake;
    bets[slot].isPlaced = true;
    bets[slot].isCashedOut = false;
    bets[slot].cashoutAmount = 0;
    bets[slot].cashoutMultiplier = 0.0;

    saveState();
    updatePlayerUIBalance();
    updateActionButtons();
    addFeedItem(savedState.callsign + " placed Bet " + slot + " of " + formatRupees(stake));

    // Sync real bet to Firestore active_bets collection
    if (window.AERO_FIREBASE && window.AERO_FIREBASE.db) {
      const userKey = (savedState.userEmail || "guest_" + savedState.callsign).replace(/[^a-zA-Z0-9]/g, "_");
      const betDocId = "r" + roundNumber + "_" + userKey + "_b" + slot;
      window.AERO_FIREBASE.db.collection("active_bets").doc(betDocId).set({
        round: roundNumber,
        slot: slot,
        email: savedState.userEmail || "pilot@aerocrash.com",
        callsign: savedState.callsign || "PILOT",
        stake: stake,
        targetMulti: 0,
        cashoutValue: 0,
        profit: 0,
        hasCashedOut: false,
        status: "ACTIVE",
        placedAt: new Date()
      }).catch(function () {});
    }
  }

  function cancelBet(slot) {
    if (!bets[slot].isPlaced || gameState !== "BETTING") return;
    const refundAmt = bets[slot].stake;
    savedState.virtualBalance += refundAmt;
    savedState.career.totalVcStaked -= refundAmt;
    bets[slot].isPlaced = false;

    saveState();
    updatePlayerUIBalance();
    updateActionButtons();
    addFeedItem(savedState.callsign + " cancelled Bet " + slot);

    if (window.AERO_FIREBASE && window.AERO_FIREBASE.db) {
      const userKey = (savedState.userEmail || "guest_" + savedState.callsign).replace(/[^a-zA-Z0-9]/g, "_");
      const betDocId = "r" + roundNumber + "_" + userKey + "_b" + slot;
      window.AERO_FIREBASE.db.collection("active_bets").doc(betDocId).delete().catch(function () {});
    }
  }

  function cashOut(slot) {
    const b = bets[slot];
    if (!b.isPlaced || b.isCashedOut || gameState !== "RUNNING") return;

    b.isCashedOut = true;
    b.cashoutMultiplier = liveMultiplier;
    b.cashoutAmount = Math.floor(b.stake * b.cashoutMultiplier * 100) / 100;
    const profit = b.cashoutAmount - b.stake;

    savedState.virtualBalance += b.cashoutAmount;
    savedState.career.roundsPlayed++;
    savedState.career.roundsWon++;
    savedState.career.totalVcWon += profit;
    if (b.cashoutMultiplier > savedState.career.highestCashoutMulti) {
      savedState.career.highestCashoutMulti = b.cashoutMultiplier;
    }
    if (b.cashoutAmount > savedState.career.bestPayoutVc) {
      savedState.career.bestPayoutVc = b.cashoutAmount;
    }

    savedState.history.unshift({
      round: roundNumber,
      slot: slot,
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
    soundCashout();

    // Sync cashout to Firestore active_bets
    if (window.AERO_FIREBASE && window.AERO_FIREBASE.db) {
      const userKey = (savedState.userEmail || "guest_" + savedState.callsign).replace(/[^a-zA-Z0-9]/g, "_");
      const betDocId = "r" + roundNumber + "_" + userKey + "_b" + slot;
      window.AERO_FIREBASE.db.collection("active_bets").doc(betDocId).update({
        hasCashedOut: true,
        targetMulti: b.cashoutMultiplier,
        cashoutValue: b.cashoutAmount,
        profit: profit,
        status: "CASHED_OUT"
      }).catch(function () {});
    }

    if (DOM.playerResultBanner) {
      DOM.playerResultBanner.textContent = "BET " + slot + " CASHOUT " + formatRupees(b.cashoutAmount) + " (" + b.cashoutMultiplier.toFixed(2) + "x)";
      DOM.playerResultBanner.classList.add("active");
    }

    addFeedItem(savedState.callsign + " CASHOUT (B" + slot + ") @" + b.cashoutMultiplier.toFixed(2) + "x (+" + formatRupees(b.cashoutAmount) + ")", "cashout");
    updateActionButtons();
  }

  function handleActionClickForSlot(slot) {
    initAudio();
    if (gameState === "BETTING" || gameState === "WAITING") {
      if (bets[slot].isPlaced) cancelBet(slot);
      else placeBet(slot);
    } else if (gameState === "RUNNING") {
      if (bets[slot].isPlaced && !bets[slot].isCashedOut) cashOut(slot);
    }
  }

  window.addEventListener("keydown", function (e) {
    if (e.code === "Space" && e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA") {
      e.preventDefault();
      // Spacebar triggers primary active bet (or whichever is uncashed)
      if (gameState === "RUNNING") {
        if (bets[1].isPlaced && !bets[1].isCashedOut) cashOut(1);
        else if (bets[2].isPlaced && !bets[2].isCashedOut) cashOut(2);
      } else if (gameState === "BETTING") {
        handleActionClickForSlot(activeBetSlotTab);
      }
    }
  });

  //====================================================================
  // STATE MACHINE & TRANSITIONS
  //====================================================================
  function transitionTo(newState, fromRemote) {
    gameState = newState;
    const now = performance.now();

    if (DOM.statePill) DOM.statePill.textContent = newState;
    if (DOM.stateDot) {
      DOM.stateDot.className = "status-dot " + (newState === "RUNNING" ? "green" : newState === "BETTING" ? "amber" : "red");
    }

    switch (newState) {
      case "BETTING":
        if (!fromRemote) {
          roundNumber++;
          crashMultiplier = generateCrashPoint();
        }
        if (DOM.roundPill) DOM.roundPill.textContent = "ROUND #" + roundNumber;
        if (DOM.statePill) DOM.statePill.textContent = "BETTING OPEN";

        // Reset both bets for the new round
        [1, 2].forEach(function (slot) {
          bets[slot].isPlaced = false;
          bets[slot].isCashedOut = false;
          bets[slot].cashoutMultiplier = 0.0;
          bets[slot].cashoutAmount = 0;
        });

        liveMultiplier = 1.00;
        if (DOM.debugTargetMulti) DOM.debugTargetMulti.textContent = crashMultiplier.toFixed(2) + "x";
        roundStartTime = now;
        liveTrail = [];

        subscribeToActiveBets(roundNumber);
        if (!fromRemote && isLocalMaster()) {
          publishGlobalRoundState("BETTING", roundNumber, crashMultiplier);
        }

        if (DOM.hudContainer) DOM.hudContainer.classList.add("hidden");
        if (DOM.crashOverlay) DOM.crashOverlay.classList.add("hidden");
        if (DOM.countdownOverlay) DOM.countdownOverlay.classList.remove("hidden");
        if (DOM.playerResultBanner) DOM.playerResultBanner.classList.remove("active");

        addFeedItem("ROUND #" + roundNumber + " BETS OPEN // TAKEOFF IN 8s");
        updateActionButtons();
        break;

      case "LAUNCHING":
        launchingStartTime = now;
        if (DOM.countdownOverlay) DOM.countdownOverlay.classList.add("hidden");
        if (DOM.statePill) DOM.statePill.textContent = "LAUNCHING";
        if (DOM.debugTargetMulti) DOM.debugTargetMulti.textContent = crashMultiplier.toFixed(2) + "x";
        soundLaunch();
        if (!fromRemote && isLocalMaster()) {
          publishGlobalRoundState("LAUNCHING", roundNumber, crashMultiplier);
        }
        updateActionButtons();
        break;

      case "RUNNING":
        launchStartTime = now;
        liveTrail = [];
        if (DOM.countdownOverlay) DOM.countdownOverlay.classList.add("hidden");
        if (DOM.crashOverlay) DOM.crashOverlay.classList.add("hidden");
        if (DOM.hudContainer) DOM.hudContainer.classList.remove("hidden");
        if (DOM.statePill) DOM.statePill.textContent = "IN PROGRESS";
        if (!fromRemote && isLocalMaster()) {
          publishGlobalRoundState("RUNNING", roundNumber, crashMultiplier);
        }
        updateActionButtons();
        break;

      case "CRASHED":
        soundCrash();
        if (!fromRemote && isLocalMaster()) {
          publishGlobalRoundState("CRASHED", roundNumber, liveMultiplier);
        }
        renderSquadronTable();
        addTickerBadge(liveMultiplier);
        addFeedItem("FLIGHT CRASHED @ " + liveMultiplier.toFixed(2) + "x", "crashed");

        if (DOM.hudContainer) DOM.hudContainer.classList.add("hidden");
        if (DOM.crashOverlay) DOM.crashOverlay.classList.remove("hidden");
        if (DOM.crashMultiplier) DOM.crashMultiplier.textContent = liveMultiplier.toFixed(2) + "x";
        if (DOM.statePill) DOM.statePill.textContent = "FLEW AWAY";

        // Settle uncashed bets for both slots
        [1, 2].forEach(function (slot) {
          const b = bets[slot];
          if (b.isPlaced && !b.isCashedOut) {
            savedState.career.roundsPlayed++;
            savedState.career.roundsLost++;
            savedState.career.totalVcLost += b.stake;
            savedState.history.unshift({
              round: roundNumber,
              slot: slot,
              stake: b.stake,
              multiplier: 0,
              profit: -b.stake,
              status: "LOSS",
              time: new Date().toLocaleTimeString()
            });
            showActionFeedback("BET " + slot + " FLEW AWAY — Lost " + formatRupees(b.stake), "danger");
          }
          b.isPlaced = false;
        });

        saveState();
        updateCareerTables();
        renderPersonalHistoryLogs();
        updateActionButtons();

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
  // CANVAS PHYSICS & FLIGHT RENDERING
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
    ctx.strokeStyle = "rgba(255, 255, 255, 0.035)";
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

    if (gameState === "BETTING" || gameState === "WAITING" || gameState === "LAUNCHING") {
      drawPlane(ctx, startX, startY, 0);
      return;
    }

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

      if (liveTrail.length === 0) {
        liveTrail.push({ x: startX, y: startY });
      }
      liveTrail.push({ x: currX, y: currY });

      if (liveTrail.length > 1) {
        ctx.save();
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

    const now = performance.now();

    if (gameState === "BETTING") {
      if (!roundStartTime || isNaN(roundStartTime)) roundStartTime = now;
      const elapsed = Math.max(0, now - roundStartTime);
      const remaining = Math.max(0, CONFIG.TIMINGS.BETTING_MS - elapsed);
      const secondsLeft = Math.ceil(remaining / 1000);

      if (DOM.countdownDigits) DOM.countdownDigits.textContent = secondsLeft;
      if (secondsLeft <= 3 && Math.floor(remaining) % 1000 < 50) soundCountdown();

      if (elapsed >= CONFIG.TIMINGS.BETTING_MS) {
        transitionTo("LAUNCHING");
      }
    } else if (gameState === "LAUNCHING") {
      if (!launchingStartTime || isNaN(launchingStartTime)) launchingStartTime = now;
      const elapsed = Math.max(0, now - launchingStartTime);
      if (elapsed >= CONFIG.TIMINGS.LAUNCHING_MS) {
        transitionTo("RUNNING");
      }
    } else if (gameState === "RUNNING") {
      if (!launchStartTime || isNaN(launchStartTime) || launchStartTime > now) {
        launchStartTime = now;
      }
      const elapsedSec = Math.max(0, (now - launchStartTime) / 1000);
      liveMultiplier = calculateMultiplier(elapsedSec);

      if (DOM.hudMultiplier) DOM.hudMultiplier.textContent = liveMultiplier.toFixed(2) + "x";
      if (DOM.headerFlightMulti) DOM.headerFlightMulti.textContent = liveMultiplier.toFixed(2) + "x";
      if (DOM.debugLiveMulti) DOM.debugLiveMulti.textContent = liveMultiplier.toFixed(2) + "x";

      if (DOM.telemAlt) DOM.telemAlt.textContent = Math.floor(liveMultiplier * 1420).toLocaleString() + " FT";
      if (DOM.telemVel) DOM.telemVel.textContent = Math.floor(liveMultiplier * 360) + " KTS";
      if (DOM.telemTraj) DOM.telemTraj.textContent = Math.min(78, (liveMultiplier * 14.5)).toFixed(1) + "°";

      // Auto cashout checks for both Bet 1 and Bet 2
      if (DOM.autoCheck1 && DOM.autoCheck1.checked && bets[1].isPlaced && !bets[1].isCashedOut) {
        const target1 = parseFloat(DOM.autoInput1 ? DOM.autoInput1.value : 2.0) || 2.0;
        if (target1 > 1.0 && liveMultiplier >= target1) cashOut(1);
      }

      if (DOM.autoCheck2 && DOM.autoCheck2.checked && bets[2].isPlaced && !bets[2].isCashedOut) {
        const target2 = parseFloat(DOM.autoInput2 ? DOM.autoInput2.value : 3.0) || 3.0;
        if (target2 > 1.0 && liveMultiplier >= target2) cashOut(2);
      }

      // Crash trigger
      if (isManualCrashPending || liveMultiplier >= crashMultiplier) {
        isManualCrashPending = false;
        transitionTo("CRASHED");
      }

      updateActionButtons();
    }

    renderCanvas();
    requestAnimationFrame(gameLoop);
  }

  //====================================================================
  // WALLET & WITHDRAWAL CONTROLLER (WITH FIRESTORE & IP TRACKING)
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

    // Auto-save bank & UPI details on input changes
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

    // Dynamic sync for deposit inputs & buttons
    if (DOM.modalDepositInput) {
      DOM.modalDepositInput.addEventListener("input", function () {
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
      });
    }

    if (DOM.depositInput) {
      DOM.depositInput.addEventListener("input", function () {
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
      });
    }

    // Modal Deposit Action (Saves Real-Money in Firestore & LocalState)
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

    // Quick percentages for withdrawal
    if (DOM.withdrawPercentChips) {
      DOM.withdrawPercentChips.forEach(function (chip) {
        chip.addEventListener("click", function () {
          const pct = parseFloat(chip.getAttribute("data-percent")) || 100;
          const amt = Math.floor((savedState.virtualBalance * (pct / 100)) * 100) / 100;
          if (DOM.withdrawAmountInput) DOM.withdrawAmountInput.value = Math.max(50, amt);
        });
      });
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
      DOM.personalLogsContainer.innerHTML = '<div class="empty-logs">No completed flights yet.</div>';
      return;
    }

    let html = "";
    savedState.history.slice(0, 20).forEach(function (h) {
      const isWin = h.status === "WIN";
      html += '<div class="personal-log-row ' + (isWin ? "win" : "loss") + '">' +
        '<div><strong>ROUND #' + h.round + '</strong> (B' + (h.slot || 1) + ')<br><small>' + (h.time || "") + '</small></div>' +
        '<div>Stake: ' + formatRupees(h.stake) + '</div>' +
        '<div style="text-align:right;"><strong>' + (isWin ? "+" + formatRupees(h.profit) : "-" + formatRupees(h.stake)) + '</strong><br>' +
        '<small>' + (isWin ? h.multiplier.toFixed(2) + "x" : "FLEW AWAY") + '</small></div>' +
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
          '</tr>' +
          '<tr><td colspan="4" style="text-align:center; color:var(--text-dim); font-size:9px; padding:6px;">LIVE TELEMETRY ACTIVE • FIRESTORE SYNCED</td></tr>';
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
    // Bet Slot Tabs Switcher
    if (DOM.tabSlot1 && DOM.tabSlot2) {
      DOM.tabSlot1.addEventListener("click", function () {
        activeBetSlotTab = 1;
        DOM.tabSlot1.classList.add("active");
        DOM.tabSlot2.classList.remove("active");
        if (DOM.betCard1) DOM.betCard1.classList.add("active");
        if (DOM.betCard2 && !isDualViewMode) DOM.betCard2.classList.remove("active");
      });

      DOM.tabSlot2.addEventListener("click", function () {
        activeBetSlotTab = 2;
        DOM.tabSlot2.classList.add("active");
        DOM.tabSlot1.classList.remove("active");
        if (DOM.betCard2) DOM.betCard2.classList.add("active");
        if (DOM.betCard1 && !isDualViewMode) DOM.betCard1.classList.remove("active");
      });
    }

    if (DOM.btnToggleDual) {
      DOM.btnToggleDual.addEventListener("click", function () {
        isDualViewMode = !isDualViewMode;
        DOM.btnToggleDual.classList.toggle("active", isDualViewMode);
        if (DOM.betPanelsWrapper) {
          DOM.betPanelsWrapper.classList.toggle("dual-mode", isDualViewMode);
        }
        if (isDualViewMode) {
          if (DOM.betCard1) DOM.betCard1.classList.add("active");
          if (DOM.betCard2) DOM.betCard2.classList.add("active");
        } else {
          if (activeBetSlotTab === 1) {
            if (DOM.betCard1) DOM.betCard1.classList.add("active");
            if (DOM.betCard2) DOM.betCard2.classList.remove("active");
          } else {
            if (DOM.betCard2) DOM.betCard2.classList.add("active");
            if (DOM.betCard1) DOM.betCard1.classList.remove("active");
          }
        }
      });
    }

    // Action Buttons for Slot 1 and Slot 2
    if (DOM.btnAction1) DOM.btnAction1.addEventListener("click", function () { handleActionClickForSlot(1); });
    if (DOM.btnAction2) DOM.btnAction2.addEventListener("click", function () { handleActionClickForSlot(2); });

    // Steppers for Slot 1
    if (DOM.btnStakeInc1 && DOM.stakeInput1) {
      DOM.btnStakeInc1.addEventListener("click", function () {
        let val = parseFloat(DOM.stakeInput1.value) || 10;
        val = Math.min(CONFIG.MAX_STAKE, val + 10);
        DOM.stakeInput1.value = val.toFixed(2);
        updateActionButtons();
      });
    }
    if (DOM.btnStakeDec1 && DOM.stakeInput1) {
      DOM.btnStakeDec1.addEventListener("click", function () {
        let val = parseFloat(DOM.stakeInput1.value) || 10;
        val = Math.max(CONFIG.MIN_STAKE, val - 10);
        DOM.stakeInput1.value = val.toFixed(2);
        updateActionButtons();
      });
    }

    // Steppers for Slot 2
    if (DOM.btnStakeInc2 && DOM.stakeInput2) {
      DOM.btnStakeInc2.addEventListener("click", function () {
        let val = parseFloat(DOM.stakeInput2.value) || 10;
        val = Math.min(CONFIG.MAX_STAKE, val + 10);
        DOM.stakeInput2.value = val.toFixed(2);
        updateActionButtons();
      });
    }
    if (DOM.btnStakeDec2 && DOM.stakeInput2) {
      DOM.btnStakeDec2.addEventListener("click", function () {
        let val = parseFloat(DOM.stakeInput2.value) || 10;
        val = Math.max(CONFIG.MIN_STAKE, val - 10);
        DOM.stakeInput2.value = val.toFixed(2);
        updateActionButtons();
      });
    }

    // Quick chips for Slot 1
    if (DOM.chips1) {
      DOM.chips1.forEach(function (chip) {
        chip.addEventListener("click", function () {
          DOM.chips1.forEach(function (c) { c.classList.remove("active"); });
          chip.classList.add("active");
          const val = chip.getAttribute("data-val");
          if (DOM.stakeInput1) DOM.stakeInput1.value = parseFloat(val).toFixed(2);
          updateActionButtons();
        });
      });
    }

    // Quick chips for Slot 2
    if (DOM.chips2) {
      DOM.chips2.forEach(function (chip) {
        chip.addEventListener("click", function () {
          DOM.chips2.forEach(function (c) { c.classList.remove("active"); });
          chip.classList.add("active");
          const val = chip.getAttribute("data-val");
          if (DOM.stakeInput2) DOM.stakeInput2.value = parseFloat(val).toFixed(2);
          updateActionButtons();
        });
      });
    }

    if (DOM.stakeInput1) DOM.stakeInput1.addEventListener("input", updateActionButtons);
    if (DOM.stakeInput2) DOM.stakeInput2.addEventListener("input", updateActionButtons);

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

    if (DOM.btnClearAuto1) {
      DOM.btnClearAuto1.addEventListener("click", function () {
        if (DOM.autoInput1) DOM.autoInput1.value = "2.00";
      });
    }
    if (DOM.btnClearAuto2) {
      DOM.btnClearAuto2.addEventListener("click", function () {
        if (DOM.autoInput2) DOM.autoInput2.value = "3.00";
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
            crashMultiplier = Math.min(MAX_POSSIBLE_MULTIPLIER, manual);
            if (DOM.debugTargetMulti) DOM.debugTargetMulti.textContent = crashMultiplier.toFixed(2) + "x";
            publishGlobalRoundState(gameState, roundNumber, crashMultiplier, Date.now());
          }
        }
      });
    }
    if (DOM.gmOverrideEnabled) {
      DOM.gmOverrideEnabled.addEventListener("change", function () {
        if (DOM.gmOverrideEnabled.checked) {
          const manual = parseFloat(DOM.gmTargetInput ? DOM.gmTargetInput.value : 2.5) || 2.5;
          crashMultiplier = Math.min(MAX_POSSIBLE_MULTIPLIER, manual);
          if (DOM.debugTargetMulti) DOM.debugTargetMulti.textContent = crashMultiplier.toFixed(2) + "x";
          publishGlobalRoundState(gameState, roundNumber, crashMultiplier, Date.now());
        } else {
          crashMultiplier = generateCrashPoint();
          if (DOM.debugTargetMulti) DOM.debugTargetMulti.textContent = crashMultiplier.toFixed(2) + "x";
          publishGlobalRoundState(gameState, roundNumber, crashMultiplier, Date.now());
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
      }).catch(function (e) {
        console.warn("[AeroCrash] Login audit log:", e.message);
      });
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
        }, { merge: true }).then(function () {
          console.log("[AeroCrash] Firestore profile synced for user:", uid);
        }).catch(function (e) {
          console.warn("[AeroCrash] Firestore user sync notice:", e.message);
        });
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
        }).then(function () {
          console.log("[AeroCrash] New Pilot account registered in Firestore:", uid);
        }).catch(function (e) {
          console.error("[AeroCrash] Firestore new user creation error:", e);
        });
      }

      saveState();
      populateSavedBankDetails();
      listenToUserDoc(uid);
      completeLoginRouting(authMode);
    }).catch(function (err) {
      console.warn("[AeroCrash] Backend sync error, falling back to local state:", err);
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
    initGlobalMultiplayerSync();
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
        transitionTo("BETTING");
        requestAnimationFrame(gameLoop);
      }
    }, 40);
  }

  window.addEventListener("DOMContentLoaded", init);
})();
