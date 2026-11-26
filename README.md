# Stick V1

A stick-figure fighting game. Pick one of 10 elements, build four moves and an ultimate with sliders, then fight a bot (which picks its own random element and moves) or anyone online with a 5-letter code.

## Folder layout

- `index.html`, `src/` — the game (`src/game.js` is the code, `src/style.css` the styles)
- `.github/workflows/deploy.yml` — builds and publishes to GitHub Pages automatically
- `server/` — the online-play relay (Cloudflare Worker), deployed by the workflow
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
   git commit -m "Stick V1"
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

- Keyboard: A/D move, Space or W jump (hold for higher, tap again to double jump), S drop. J K L I for moves 1–4, O for the ultimate. Attacks aim automatically, or switch to mouse aim on the menu.
- Mouse: Controls offers a gaming-mouse layout (left, right, two side buttons, left + right for the ultimate) and a normal-mouse layout (left, right, double left, double right, left + right).
- PlayStation or Xbox controller: left stick moves, right stick aims, A/✕ jumps, X/□ Y/△ B/○ RB/R1 for moves, LB/L1 for the ultimate. Every button can be changed under Controls.
