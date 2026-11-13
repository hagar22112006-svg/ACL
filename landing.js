import { db, onUser, logIn, signUp, googleSignIn, microsoftSignIn, guestSignIn, friendly, home } from "./auth.js";
import { settings } from "./security-config.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { renderHero, applySiteContent } from "./common.js";

// Already logged in? Go straight to your own site.
onUser(p => { if (p) location.replace(home(p.role)); });

applySiteContent();
getDocs(collection(db, "events")).then(s => renderHero(s.docs.map(d => ({ id: d.id, ...d.data() })))).catch(() => renderHero([]));

const $ = id => document.getElementById(id);
const dialog = $("authDialog"), msg = $("authMsg"), title = $("authTitle");
const panes = { member: $("paneMember"), email: $("paneEmail"), leader: $("paneLeader") };
const tabMember = $("tabMember"), tabLeader = $("tabLeader");
const emailForm = $("emailForm"), nameField = $("nameField");
let emailMode = "login";

// Settings from security-config.js
if (!settings.allowQuickEntry) document.querySelectorAll(".quick-only").forEach(n => { n.hidden = true; });
if (!settings.outlookLogin) $("msBtn").hidden = true;
if (!settings.googleLogin) $("googleBtn").hidden = true;

function setEmailMode(m) {
  emailMode = m; const su = m === "signup";
  $("authSubmit").textContent = su ? "Sign up" : "Log in";
  $("authSwitch").textContent = su ? "I already have an account" : "Create an account";
  nameField.style.display = su ? "block" : "none"; nameField.querySelector("input").required = su;
  emailForm.password.autocomplete = su ? "new-password" : "current-password";
}
function show(pane) {
  Object.keys(panes).forEach(k => { panes[k].hidden = k !== pane; });
  tabMember.setAttribute("aria-pressed", String(pane !== "leader"));
  tabLeader.setAttribute("aria-pressed", String(pane === "leader"));
  title.textContent = pane === "leader" ? "Leader log in" : (pane === "email" && emailMode === "signup" ? "Join the club" : "Log in");
  msg.textContent = "";
}
function open(kind) {
  if (kind === "signup") { setEmailMode("signup"); show("email"); } else { setEmailMode("login"); show("member"); }
  dialog.showModal();
}
document.querySelectorAll("[data-open]").forEach(b => b.addEventListener("click", e => { e.preventDefault(); open(b.dataset.open); }));
tabMember.addEventListener("click", () => show("member"));
tabLeader.addEventListener("click", () => show("leader"));
$("useEmail").addEventListener("click", () => { setEmailMode("login"); show("email"); });
$("backQuick").addEventListener("click", () => show("member"));
$("authSwitch").addEventListener("click", () => { setEmailMode(emailMode === "login" ? "signup" : "login"); show("email"); });
$("authClose").addEventListener("click", () => dialog.close());

// Quick entry: just a name
$("guestForm").addEventListener("submit", async e => {
  e.preventDefault(); msg.textContent = "";
  if (!settings.allowQuickEntry) return;
  const name = e.target.guestName.value.replace(/\s+/g, " ").trim();
  if (name.length < 2) { msg.textContent = "Please type your name (at least 2 letters)."; return; }
  const btn = $("guestSubmit"); btn.disabled = true;
  try { const p = await guestSignIn(name); location.href = home(p.role); }
  catch (err) { msg.textContent = friendly(err); }
  btn.disabled = false;
});

// Outlook (university) and Google: no password
(function () {
  // Instagram, Facebook, TikTok and similar apps use a browser that Google and Microsoft block
  if (/FBAN|FBAV|Instagram|Snapchat|TikTok|MicroMessenger|Line\/|; wv\)/i.test(navigator.userAgent)) {
    const note = document.createElement("p"); note.className = "inapp-note";
    note.textContent = "You seem to be inside another app's browser. If the login window doesn't open, open this page in Chrome or Safari.";
    panes.member.prepend(note);
  }
  function wire(btn, login) {
    btn.addEventListener("click", async () => {
      msg.textContent = ""; btn.disabled = true;
      try { const p = await login(); location.href = home(p.role); }
      catch (err) {
        // closing the sign-in window is not an error
        if (err.code !== "auth/popup-closed-by-user" && err.code !== "auth/cancelled-popup-request") msg.textContent = friendly(err);
      }
      btn.disabled = false;
    });
  }
  wire($("msBtn"), microsoftSignIn); wire($("googleBtn"), googleSignIn);
})();

// Email and password (a verification email is sent when you sign up)
emailForm.addEventListener("submit", async e => {
  e.preventDefault(); msg.textContent = "";
  const email = emailForm.email.value.trim(), password = emailForm.password.value;
  try {
    const p = emailMode === "signup" ? await signUp(emailForm.username.value.trim(), email, password) : await logIn(email, password);
    location.href = home(p.role);
  } catch (err) { msg.textContent = friendly(err); }
});

// Leaders: email and password only (the database rules enforce this too)
$("leaderForm").addEventListener("submit", async e => {
  e.preventDefault(); msg.textContent = "";
  try {
    const p = await logIn(e.target.email.value.trim(), e.target.password.value);
    location.href = home(p.role);
  } catch (err) { msg.textContent = friendly(err); }
});
