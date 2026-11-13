import "./fx.js";   // menu button, sparkles, confetti and other extras for every page
import { settings } from "./security-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithPopup, signInAnonymously,
         GoogleAuthProvider, OAuthProvider, sendEmailVerification, getAdditionalUserInfo, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);

// App Check: stops bots and copies of your site from using your database. Off until a key is pasted in security-config.js.
if (settings.appCheckSiteKey) {
  try {
    const { initializeAppCheck, ReCaptchaV3Provider } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-check.js");
    if (["localhost", "127.0.0.1"].includes(location.hostname)) self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    initializeAppCheck(app, { provider: new ReCaptchaV3Provider(settings.appCheckSiteKey), isTokenAutoRefreshEnabled: true });
  } catch (e) { console.error("App Check could not start", e); }
}

export const auth = getAuth(app);
export const db = getFirestore(app);
let busy = false;
const UNI = settings.uniDomain;

// Where each kind of person lands after logging in
export const home = role => (role === "leader" ? "leader.html" : "member.html");

// Who is this? Leaders only count as leaders when they logged in with a password.
// "approved" = verified university email, or a verified email that is on the talent list.
export async function profile(user) {
  let how = "password";
  try { how = (await user.getIdTokenResult()).signInProvider || "password"; } catch (e) { console.error(e); }
  const guest = how === "anonymous";
  const email = (user.email || "").toLowerCase();
  let approved = false;
  if (!guest && user.emailVerified && email) {
    if (email.endsWith("@" + UNI)) approved = true;
    else { try { approved = (await getDoc(doc(db, "talents", email))).exists(); } catch (e) { approved = false; } }
  }
  try {
    const s = await getDoc(doc(db, "users", user.uid));
    const d = s.exists() ? s.data() : {};
    const role = d.role === "leader" && how === "password" ? "leader" : "member";
    const name = d.name || user.email || "Guest";
    // Leaders can preview the member site: member.html?preview=member or ?preview=visitor (nothing is saved)
    const pv = role === "leader" ? new URLSearchParams(location.search).get("preview") : null;
    if (pv === "member" || pv === "visitor") return { user, role: "member", guest: pv === "visitor", how, approved: pv === "member", preview: pv, name };
    return { user, role, guest, how, approved, name };
  } catch (e) { console.error(e); return { user, role: "member", guest, how, approved, name: user.email || "Guest" }; }
}

// Yellow banner for accounts whose email is not verified yet
function verifyBanner(user) {
  const main = document.querySelector("main");
  if (!main || document.querySelector(".verify-banner")) return;
  const b = document.createElement("p"); b.className = "verify-banner"; b.setAttribute("role", "note");
  const text = document.createTextNode("Please verify your email: we sent you a link. Click it, then refresh this page. ");
  const btn = document.createElement("button"); btn.type = "button"; btn.textContent = "Send the link again";
  btn.onclick = async () => {
    btn.disabled = true;
    try { await sendEmailVerification(user); text.nodeValue = "Link sent. Check your inbox and Junk folder, click it, then refresh this page. "; }
    catch (e) { text.nodeValue = friendly(e) + " "; }
    btn.disabled = false;
  };
  b.append(text, btn); main.before(b);
}

// cb gets {user, role, name, guest, approved}, or null when nobody is logged in
export function onUser(cb) {
  onAuthStateChanged(auth, async u => {
    if (busy) return;
    if (u && !u.isAnonymous && !u.emailVerified) {   // maybe they just clicked the verification link
      try { await u.reload(); if (u.emailVerified) await u.getIdToken(true); } catch (e) { /* ignore */ }
    }
    const p = u ? await profile(u) : null;
    if (p && p.role !== "leader" && !p.approved) {   // quick entry, unverified, or not a university email
      document.body.classList.add("limited");
      if (p.guest) document.body.classList.add("guest");
      import("./guest-ui.js");
    }
    if (p && !p.guest && u.email && !u.emailVerified && p.role !== "leader" && !p.preview) verifyBanner(u);
    if (p && p.preview) { document.body.classList.add("preview"); import("./preview-ui.js"); }
    cb(p);
  });
}
export async function logIn(email, password) {
  const c = await signInWithEmailAndPassword(auth, email, password);
  return profile(c.user);
}
export async function signUp(name, email, password) {
  busy = true;
  try {
    const c = await createUserWithEmailAndPassword(auth, email, password);
    // Everyone starts as a member. Leaders are set by hand in Firebase.
    await setDoc(doc(db, "users", c.user.uid), { name, email, role: "member", createdAt: serverTimestamp() });
    try { await sendEmailVerification(c.user); } catch (e) { console.error(e); }
    return profile(c.user);
  } finally { busy = false; }
}

// Quick entry: just a name. No email, no password, limited access.
export async function guestSignIn(name) {
  busy = true;
  try {
    const c = await signInAnonymously(auth);
    await setDoc(doc(db, "users", c.user.uid), { name, email: "", role: "member", guest: true, createdAt: serverTimestamp() });
    return profile(c.user);
  } finally { busy = false; }
}

// Google and Microsoft (Outlook): no password. The first time, a member profile is created automatically.
// If "domain" is given, only emails ending with it are allowed.
async function social(provider, params, domain) {
  busy = true;
  try {
    provider.setCustomParameters({ prompt: "select_account", ...params });
    const c = await signInWithPopup(auth, provider);
    const email = (c.user.email || "").toLowerCase();
    if (domain && !email.endsWith("@" + domain)) {
      const isNew = getAdditionalUserInfo(c)?.isNewUser;
      if (isNew) { try { await c.user.delete(); } catch (e) { await signOut(auth); } } else await signOut(auth);
      throw Object.assign(new Error("wrong domain"), { code: "app/wrong-domain" });
    }
    const ref = doc(db, "users", c.user.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      if (!email) { await signOut(auth); throw Object.assign(new Error("no email"), { code: "app/no-email" }); }
      await setDoc(ref, { name: c.user.displayName || email.split("@")[0], email, role: "member", createdAt: serverTimestamp() });
    }
    return profile(c.user);
  } finally { busy = false; }
}
export const googleSignIn = () => social(new GoogleAuthProvider(), {}, "");
export const microsoftSignIn = () => social(new OAuthProvider("microsoft.com"), { domain_hint: UNI }, UNI);

export const logOut = () => signOut(auth).then(() => { location.href = "index.html"; });

export function friendly(e) {
  const map = {
    "auth/invalid-credential": "Wrong email or password.",
    "auth/email-already-in-use": "That email already has an account. Try logging in.",
    "auth/weak-password": "Password must be at least 6 characters.",
    "auth/invalid-email": "That email doesn't look right.",
    "auth/operation-not-allowed": "This login method isn't turned on in Firebase yet.",
    "auth/admin-restricted-operation": "Quick entry isn't turned on in Firebase yet.",
    "auth/unauthorized-domain": "This website address isn't added to Firebase's authorized domains yet.",
    "auth/too-many-requests": "Too many tries. Please wait a few minutes and try again.",
    "auth/network-request-failed": "No internet connection. Please check and try again.",
    "auth/popup-blocked": "Your browser blocked the login window. Please allow pop-ups for this site and try again.",
    "auth/account-exists-with-different-credential": "That email already has an account with a password. Please log in with your email and password.",
    "auth/operation-not-supported-in-this-environment": "This login doesn't work in this browser. Please open the site in Chrome or Safari.",
    "app/no-email": "Your account didn't share an email address. Please use another way to log in.",
    "app/wrong-domain": "Please use your university account (your email must end with @" + UNI + ").",
    "permission-denied": "You don't have permission to do that."
  };
  return map[e.code] || e.message;
}
