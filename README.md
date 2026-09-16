# AEROCRASH — Tactical Multiplayer Flight Simulator

A high-performance, real-time multiplayer crash game simulation built with HTML5 Canvas, modern CSS, and Firebase Realtime Cloud Firestore sync.

---

## 🚀 Features

- **Universal Real-Time Multiplayer Sync**:
  - Deterministic Epoch Clock fallback + Cloud Firestore live master sync (`game_state/current_round`).
  - 100% unified multiplayer rounds across all connected devices (phones, laptops, tablets).
- **Live Squadron Bets Table**:
  - Displays real-time stakes, cashouts, and profits placed by all active pilot accounts in the current round.
- **Dynamic Multi-Bet System**:
  - Add / remove simultaneous bet slots with individual stakes, Auto-Bet, and Auto-Cashout thresholds.
  - Stake limits configurable with ₹8,000 max stake cap.
- **Modern Tactical Jet & Radar Physics**:
  - Sleek aerodynamic fighter jet with twin afterburner glow, wingtip strobe lights, dynamic smoke trail, and smooth altitude rise (capped safely below the top screen edge).
  - Multiplier ceiling strictly capped at 200.00x.
- **Game Master Command Portal (Admin Only)**:
  - Accessible to authorized admin pilots (`carrentpedatabase@gmail.com`).
  - Instant Force Crash button, Pause/Resume simulation, quick target multiplier presets (`2x` to `100x`), and live engine telemetry.
- **Pilot Wallet & Instant IMPS / UPI Hub**:
  - Deposit and withdrawal flows with Bank Transfer (IMPS/NEFT) and UPI ID (VPA) payout support.
  - Autofill-safe dark UI.
- **Mobile-First Responsive Layout**:
  - Vertical layout with Flight Radar at the top, Bet & Cashout controls in the center, and Live Squadron Bets table at the bottom.

---

## 📁 Repository Structure

```
├── index.html          # Main application HTML & UI markup
├── style.css           # Modern dark-mode cockpit styling & responsive layout
├── script.js           # Core game engine, canvas physics, multiplayer sync
├── firebase-config.js  # Firebase SDK initialization & admin detection
├── firestore.rules     # Cloud Firestore security rules
├── FIREBASE-SETUP.md   # Firebase setup & deployment instructions
├── favicon.svg         # Tactical jet vector favicon
└── README.md           # Project documentation
```

---

## 🛠️ Getting Started

### Local Development
Open `index.html` directly in any modern browser, or run a local static server:

```bash
# Using Python
python -m http.server 8000

# Using Node.js http-server or npx
npx serve .
```

### Deploying to GitHub Pages
1. Push code to the `main` branch.
2. Go to **Repository Settings** -> **Pages**.
3. Under **Branch**, select `main` and `/ (root)`, then click **Save**.
4. Live site: `https://ayanchougle.github.io/aviator/`

---

## 🔒 Firestore Security Rules Deployment

Deploy the rules to Firebase project `aviator-66312`:

```bash
firebase login
firebase use aviator-66312
firebase deploy --only firestore:rules
```
