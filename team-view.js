import { db } from "./auth.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const box = document.getElementById("leadersList");
function el(tag, text, cls) { const e = document.createElement(tag); if (text) e.textContent = text; if (cls) e.className = cls; return e; }
const ord = p => Number.isFinite(p.order) ? p.order : 99;

async function render() {
  box.textContent = "Loading…";
  let list = [];
  try {
    const s = await getDocs(collection(db, "leaders"));
    list = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => ord(a) - ord(b) || String(a.name).localeCompare(String(b.name)));
  } catch (e) { box.textContent = "Could not load the leaders."; return; }
  box.textContent = "";
  if (!list.length) { box.textContent = "The leaders will appear here soon."; return; }

  const dlg = document.createElement("dialog"); document.body.appendChild(dlg);
  function open(p) {
    dlg.textContent = "";
    dlg.appendChild(el("h2", p.name));
    if (p.role) dlg.appendChild(el("p", p.role, "leader-role"));
    if (p.does) dlg.appendChild(el("p", p.does, "leader-does"));
    if ((p.delegates || []).length) {
      dlg.appendChild(el("h3", "Delegates"));
      const ul = el("ul");
      p.delegates.forEach(d => { const li = el("li"); li.appendChild(el("strong", d.name)); if (d.does) li.append(" — " + d.does); ul.appendChild(li); });
      dlg.appendChild(ul);
    }
    const close = el("button", "Close", "cta"); close.type = "button"; close.onclick = () => dlg.close();
    dlg.appendChild(close); dlg.showModal();
  }
  list.forEach((p, i) => {
    const b = el("button", null, "leader-card" + (i % 2 ? " alt" : "")); b.type = "button";
    b.append(el("strong", p.name), el("span", p.role || ""));
    b.onclick = () => open(p); box.appendChild(b);
  });
}
if (box) render();