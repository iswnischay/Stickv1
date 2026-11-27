# Stick v1

*Stick vs 1*: one stick figure against one opponent.

A stick-figure fighting game. Pick one of 10 elements, build four moves and an ultimate with sliders, then fight a bot (which picks its own random element and moves) or anyone online with a 5-letter code.

## How it plays

- **Play**: against the bot (it picks a random element and kit) or online with a friend by code. In prep you pick your element and swap between moves you own; stats can't be edited mid-match.
- **Practice**: pick an element and try your moves on a dummy with endless mana.
- **Build**: browse every element's moves, click any move to watch it in action, and make your own moves or ultimates with sliders. Saved moves show up in the swap lists in prep.

## Accounts and the AI move builder

Sign-in is optional (Google, through Firebase). Signed-in players pick a unique username, their moves are saved to their account, and they can use **Build → Describe it to the AI**: write an idea ("five swords of light thrown in a fan", "blind the enemy so their screen goes dark for 5 seconds"), watch the move the AI builds, ask for changes, then add it to your moves. The AI only combines the game's building blocks, and every move is trimmed to fit the normal limits, so AI moves are never overpowered. Each player gets 40 AI moves a day.

Setup (once):
1. Firebase project `stickv1-36a11`: Authentication → Sign-in method → Google (on). Authentication → Settings → Authorized domains → add `YOUR-USERNAME.github.io`.
2. Firestore Database → Rules: paste the contents of `firestore.rules` and **Publish**.
3. Get a free Gemini key at aistudio.google.com and add it as the repository secret `GEMINI_API_KEY`. The workflow hands it to the Cloudflare relay; it never appears in the web page.

## Doolers

Doolers are the in-game currency (shown with a gold **d**). New players start with 100.

- **Beat the bot:** Easy 30 · Normal 60 · Hard 100 (wins only; at least a minute between rewards, 800 a day max).
- **Beat a friend online:** +50, of which 25 comes from the loser's balance and 25 from the game. Both games report the result and doolers only move when they agree. If the loser closes the game, the winner still gets the game's 25 after 90 seconds.
- **Spend:** keeping a move built by the AI costs 100. Without enough doolers you can save it as a draft, keep improving it with the AI, and pay for it later. Slider edits stay free.

**Tester code:** add a repository secret `TESTER_CODE` (any word you like). Signed-in players who enter it under Settings → Tester code get 500 doolers each time. The code stays on the server and never appears in the page.

Balances live on the Cloudflare relay (one record per player), not in the browser, so they can't be edited from the page.

## Folder layout

- `index.html`, `src/` — the game (`src/game.js` is the code, `src/style.css` the styles)
- `.github/workflows/deploy.yml` — builds and publishes to GitHub Pages automatically
- `server/` — the online-play relay and AI move endpoint (Cloudflare Worker), deployed by the workflow
- `src/account.js` — Google sign-in, usernames and cloud-saved moves (Firebase)
- `firestore.rules` — database security rules to paste into Firebase
- `desktop/` — optional Windows/Mac app wrapper

## Run it on your computer

Install Node.js 22 or newer, then in this folder:

```
npm install
npm run dev
```

Open the address it prints (usually http://localhost:5173).

## Publish to GitHub Pages

1. Create an empty repository on GitHub, for example `stickv1`.
2. Push this folder to it:
   ```
   git init
   git add .
   git commit -m "Stick v1"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/stickv1.git
   git push -u origin main
   ```
3. In the repository, open **Settings → Pages** and set **Source** to **GitHub Actions**.
4. Open the **Actions** tab and re-run the workflow (or push again). When it finishes, the game is live at `https://YOUR-USERNAME.github.io/stickv1/`.

Every push builds the game. Pushes to the default branch also publish it. Pull requests are built as a check but are never published.

## Online play

Online games go through a small relay server that lives in `server/` and runs free on Cloudflare Workers. Because it's normal web traffic, it works on any network: different Wi-Fi, mobile data, offices, schools. GitHub Actions deploys it for you.

### Set up the relay (once, free)

1. Sign up at dash.cloudflare.com (free plan).
2. Open **Workers & Pages**. If asked, pick a `workers.dev` subdomain.
3. Copy your **Account ID** (shown on the Workers & Pages page).
4. **My Profile → API Tokens → Create Token →** template **Edit Cloudflare Workers** → create and copy the token.
5. In this GitHub repo: **Settings → Secrets and variables → Actions**, add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
6. Push (or re-run the workflow). The workflow deploys the relay, then builds the game with the relay's address baked in.

Rooms hold exactly two players. Players stay connected across matches (either can press **Play again**), and a dropped link re-joins automatically. Two players fit easily in Cloudflare's free limits; if a daily limit were ever hit, the relay simply refuses new messages until midnight UTC, never a bill.

Without the Cloudflare secrets the game falls back to direct peer-to-peer links (WebRTC through the free PeerJS service), which work on most home networks but can be blocked elsewhere. For that fallback you can also add a TURN relay with the `TURN_URL`, `TURN_USERNAME` and `TURN_CREDENTIAL` secrets, or enter one under **Server settings** in the game.

To run the relay locally: `cd server && npm install && npm run dev`.

## Desktop app (optional)

```
npm install && npm run build:single
cd desktop
npm install
npm run dist:win    # on Windows
npm run dist:mac    # on a Mac
```

## Controls

- Keyboard: A/D move, Space or W jump (hold for higher, tap again to double jump), S drop, Shift or H dodge (a quick roll you can't be hit during; hold a direction to pick which way). J K L I for moves 1–4, O for the ultimate. Attacks aim automatically, or switch to mouse aim on the menu.
- Mouse: Controls offers a gaming-mouse layout (left, right, two side buttons, left + right for the ultimate) and a normal-mouse layout (left, right, double left, double right, left + right).
- PlayStation or Xbox controller: left stick moves, right stick aims, A/✕ jumps, RT/R2 or LT/L2 dodges, X/□ Y/△ B/○ RB/R1 for moves, LB/L1 for the ultimate. Every button can be changed under Controls.
