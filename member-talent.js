import { db, onUser } from "./auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const el = (tag, text, cls) => { const e = document.createElement(tag); if (text) e.textContent = text; if (cls) e.className = cls; return e; };

// Only verified members can read their own saved answers (the database rules check this too)
onUser(async p => {
  if (!p || p.role === "leader" || p.guest || p.preview || !p.user.email || !p.user.emailVerified) return;
  if (document.getElementById("profile")) return;
  let d;
  try {
    const s = await getDoc(doc(db, "talents", p.user.email.toLowerCase().replace(/[\/\\]/g, "_")));
    if (!s.exists()) return;
    d = s.data();
  } catch (e) { console.error(e); return; }

  const sec = el("section", null, "win-page"); sec.id = "profile"; sec.dataset.file = "my_profile.txt";
  const card = el("article", null, "form-card"), dl = el("dl", null, "prof");
  card.append(el("h3", d.name || p.name),
    el("p", "We found your answers from the club's talent form, so you don't need to fill it in again."));
  (d.fields || []).forEach(f => { dl.append(el("dt", f.label), el("dd", f.value)); });
  card.append(dl, el("p", "If something is wrong, tell a leader."));
  const list = el("div", null, "card-list"); list.appendChild(card);
  sec.append(el("h2", "My profile"), list);
  const host = document.getElementById("view-profile");
  if (host) { host.appendChild(sec); ["iconProfile", "tbProfile"].forEach(id => { const n = document.getElementById(id); if (n) n.hidden = false; }); }
});
