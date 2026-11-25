# Stick V1

A stick-figure fighting game. Pick one of 10 elements, build four moves with sliders, describe an ultimate in your own words and let AI forge it, then fight a bot or anyone online with a 5-letter code.

## Folder layout

- `index.html`, `src/` — the game (`src/game.js` is the code, `src/style.css` the styles)
- `.github/workflows/deploy.yml` — builds and publishes to GitHub Pages automatically
- `desktop/` — optional Windows/Mac app wrapper

## Run it on your computer

Install Node.js 22 or newer, then in this folder:

```
npm install
npm run dev
```

Open the address it prints (usually http://localhost:5173). To test the shared AI key locally, copy `.env.example` to `.env.local` and put the key in it. `.env.local` is ignored by git.

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
4. Open **Settings → Secrets and variables → Actions → New repository secret**. Name it `API_KEY` and paste your Google AI Studio key.
5. Open the **Actions** tab and re-run the workflow (or push again). When it finishes, the game is live at `https://YOUR-USERNAME.github.io/stickv1/`.

Every push builds the game. Pushes to the default branch also publish it. Pull requests are built as a check but are never published and never receive the key.

### About the shared key — read this

GitHub Pages only serves static files, so the build has to put the key inside the game's JavaScript. That means **anyone who opens the site can find the key** and use your free quota, even though it's stored as a secret on GitHub. To keep that safe:

- Use a key from a Google AI Studio project with **no billing attached**, so the worst case is hitting the free limit, never a bill.
- In Google Cloud Console → **APIs & Services → Credentials**, edit the key: under **Application restrictions** choose **Websites** and add `https://YOUR-USERNAME.github.io/*`; under **API restrictions** allow only the **Generative Language API**.
- If the site gets popular, everyone shares one free quota. Players can paste their own free key under **Settings** in the game, which is then used instead.

## Online play

Players connect to each other directly (WebRTC), using the free public PeerJS service only to find each other by code, so no game server is needed. A few strict networks (some offices and schools) block direct connections; for those, a custom PeerJS server can be entered under **Settings**.

## Desktop app (optional)

```
npm install && npm run build:single
cd desktop
npm install
npm run dist:win    # on Windows
npm run dist:mac    # on a Mac
```

The desktop build never contains the shared key; players add their own under Settings.

## Controls

- Keyboard: A/D move, Space or W jump (hold for higher, tap again to double jump), S drop. J K L I for moves 1–4, O for the ultimate. Attacks aim automatically, or switch to mouse aim on the menu.
- Mouse: Controls offers a gaming-mouse layout (left, right, two side buttons, left + right for the ultimate) and a normal-mouse layout (left, right, double left, double right, left + right).
- PlayStation or Xbox controller: left stick moves, right stick aims, A/✕ jumps, X/□ Y/△ B/○ RB/R1 for moves, LB/L1 for the ultimate. Every button can be changed under Controls.
