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

Players connect directly (WebRTC). The free public PeerJS service is only used to find each other by code, so no game server is needed. The game keeps retrying for up to 30 seconds and resends its state several times a second, so a slow or dropped message doesn't break the link.

Once connected, players stay connected for as many matches as they like: either player can press **Play again** on the results screen. If the link drops mid-game, the game shows "Reconnecting…" and re-links automatically for up to 30 seconds.

### Built-in relay for different networks (recommended)

To make players on different networks connect reliably, give the site its own TURN relay through GitHub Actions secrets. Nobody then has to enter anything.

1. Make a free account at metered.ca (Open Relay) and copy the TURN details it gives you.
2. In the repository, open **Settings → Secrets and variables → Actions** and add three secrets: `TURN_URL` (one or more addresses separated by commas, for example `turn:global.relay.metered.ca:80,turns:global.relay.metered.ca:443?transport=tcp`), `TURN_USERNAME` and `TURN_CREDENTIAL`.
3. Re-run the workflow. The relay is built into the published game.

Like any key in a static site, these details end up in the page, so anyone who opens it could use your free relay quota. Use a free-tier account only.

Most home networks connect fine. Some networks (mobile data, offices, schools, strict routers) block direct links. If two players on different networks still can't connect, add a TURN relay under **Server settings** on the online screen. Metered's Open Relay (metered.ca) has a free tier. Both players should enter the same TURN address, username and password. A custom PeerJS server can also be set there.

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
