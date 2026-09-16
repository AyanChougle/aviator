# AeroCrash Firebase Setup & Architecture Guide

## 1. Cloud Firestore Collections

The AeroCrash multiplayer engine uses the following Firestore collections:

| Collection | Document ID | Purpose |
| :--- | :--- | :--- |
| `game_state` | `current_round` | Master multiplayer state (`roundNumber`, `state`, `crashMultiplier`, `launchStartTime`, `isManualOverride`) |
| `active_bets` | `r{round}_{uid}_b{slot}` | Real-time player stakes, cashout multipliers, profits, and statuses |
| `users` | `{uid}` | Pilot profiles, balances, bank/UPI payout details, career stats |
| `deposits` | `{depositId}` | Deposit transaction records and audit history |
| `withdrawals` | `{withdrawalId}` | IMPS / UPI payout requests with Admin approval workflow |
| `login_logs` | `{logId}` | Best-effort sign-in & security telemetry |

---

## 2. Deploy Firestore Rules

Deploy `firestore.rules` using the Firebase CLI:

```bash
firebase login
firebase use aviator-66312
firebase deploy --only firestore:rules
```

---

## 3. Game Master & Admin Authorization

Authorized Game Master account:
- `carrentpedatabase@gmail.com`

When logged in with this account, the Game Master Command Portal (`btn-gm-toggle`) is automatically unlocked with manual multiplier override controls, instant force crash, and live payout approval tools.
