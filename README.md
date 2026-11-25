# Stick V1

A stick-figure fighting game. Pick one of 10 elements, build four moves and an ultimate with sliders, then fight a bot (which picks its own random element and moves) or anyone online with a 5-letter code.

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

Players connect to each other directly (WebRTC), using the free public PeerJS service only to find each other by code, so no game server is needed. A few strict networks (some offices and schools) block direct connections; for those, a custom PeerJS server can be entered under **Settings**.

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
