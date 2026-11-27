// Accounts: Google sign-in through Firebase, a unique username, and the player's moves saved to Firestore.
// Everything here is optional; the game works as a guest and keeps moves on the device.
// The Firebase web config below is meant to be public (access is controlled by firestore.rules).
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged, browserLocalPersistence, setPersistence } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, runTransaction, serverTimestamp } from 'firebase/firestore/lite';

const firebaseConfig = {
  apiKey: 'AIzaSyC3reVWHyKjVPcSc1R5BHV8HkaKHuTeJnw',
  authDomain: 'stickv1-36a11.firebaseapp.com',
  projectId: 'stickv1-36a11',
  storageBucket: 'stickv1-36a11.firebasestorage.app',
  messagingSenderId: '589848161757',
  appId: '1:589848161757:web:aa854c18e6cc09e99cda34'
};

let auth = null, db = null, available = false;
try {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app); db = getFirestore(app); available = /^https?:$/.test(location.protocol);
} catch (e) { available = false; }

const listeners = new Set();
const state = { user: null, username: null, lib: null, ready: false, error: '' };
const emit = () => listeners.forEach(fn => { try { fn(state); } catch (e) {} });

// Never wait forever on the network: give up after a few seconds with a readable message.
const withTimeout = (p, ms, msg) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]);
const explain = e => {
  const c = String((e && (e.code || e.message)) || e);
  if (/permission-denied|insufficient permissions/i.test(c)) return 'The database refused access. Publish the rules from firestore.rules in Firebase (Firestore → Rules).';
  if (/not-found|NOT_FOUND|does not exist/i.test(c)) return 'No Firestore database found. Create one in Firebase (Firestore Database → Create database).';
  if (/timed out/i.test(c)) return c;
  return 'Couldn’t reach your profile (' + c + ').';
};
let authSeq = 0;
if (available) {
  setPersistence(auth, browserLocalPersistence).catch(() => {});
  getRedirectResult(auth).catch(e => { state.error = 'Sign-in failed: ' + String((e && e.code) || e); state.ready = true; emit(); });
  // if Firebase never answers at all, stop showing "Checking sign-in…"
  setTimeout(() => { if (!state.ready) { state.ready = true; emit(); } }, 8000);
  onAuthStateChanged(auth, async user => {
    const seq = ++authSeq;
    state.user = user ? { uid: user.uid, name: user.displayName || '', email: user.email || '', photo: user.photoURL || '' } : null;
    state.username = null; state.lib = null; state.error = ''; state.loading = !!user;
    state.ready = !user; emit(); // signed out: show the sign-in button straight away
    if (!user) return;
    try {
      const snap = await withTimeout(getDoc(doc(db, 'users', user.uid)), 8000, 'Loading your profile timed out. Check your connection and reload.');
      if (seq !== authSeq) return;
      if (snap.exists()) { const d = snap.data(); state.username = d.username || null; state.lib = d.lib || null; }
    } catch (e) { if (seq !== authSeq) return; state.error = explain(e); }
    state.loading = false; state.ready = true; emit();
  });
} else { state.ready = true; }

const USERNAME_RE = /^[a-z0-9_]{3,16}$/;
let saveTimer = null, pendingLib = null;

window.StickAccount = {
  available: () => available,
  state: () => state,
  onChange: fn => { listeners.add(fn); if (state.ready) fn(state); return () => listeners.delete(fn); },
  async signIn() {
    if (!available) throw new Error('Sign-in only works on the website.');
    const provider = new GoogleAuthProvider(); provider.setCustomParameters({ prompt: 'select_account' });
    try { await signInWithPopup(auth, provider); }
    catch (e) {
      // popups blocked or not allowed in this browser: fall back to a full-page redirect
      if (/popup-blocked|operation-not-supported|web-storage-unsupported/.test(String(e && e.code))) { await signInWithRedirect(auth, provider); return; }
      throw e;
    }
  },
  async signOut() { if (auth) await signOut(auth); },
  validUsername: n => USERNAME_RE.test(String(n || '').toLowerCase()),
  // Usernames are unique: usernames/{name} points at the owner, written in one transaction with the profile.
  async claimUsername(name) {
    const u = auth && auth.currentUser; if (!u) throw new Error('Sign in first.');
    const lower = String(name || '').trim().toLowerCase();
    if (!USERNAME_RE.test(lower)) throw new Error('Use 3–16 letters, numbers or _.');
    await withTimeout(runTransaction(db, async tx => {
      const ref = doc(db, 'usernames', lower), taken = await tx.get(ref);
      if (taken.exists() && taken.data().uid !== u.uid) throw new Error('That username is taken.');
      const meRef = doc(db, 'users', u.uid), me = await tx.get(meRef);
      const old = me.exists() ? me.data().username : null;
      if (old && old !== lower) tx.delete(doc(db, 'usernames', old));
      tx.set(ref, { uid: u.uid });
      tx.set(meRef, { username: lower, updatedAt: serverTimestamp() }, { merge: true });
    }), 10000, 'Saving timed out. Check your connection and try again.').catch(e => { throw new Error(/taken|Use 3/.test(e.message) ? e.message : explain(e)); });
    state.username = lower; emit();
  },
  // Saves are batched so dragging a slider doesn't write on every step.
  saveLib(lib) {
    const u = auth && auth.currentUser; if (!u) return;
    pendingLib = lib; clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const data = pendingLib; pendingLib = null;
      try { await setDoc(doc(db, 'users', u.uid), { lib: JSON.parse(JSON.stringify(data)), updatedAt: serverTimestamp() }, { merge: true }); }
      catch (e) { console.warn('save failed', e); }
    }, 1200);
  },
  async idToken() { const u = auth && auth.currentUser; return u ? u.getIdToken() : null; }
};
