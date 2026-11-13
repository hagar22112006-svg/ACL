import { db, onUser } from "./auth.js";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

let people = [], draft = [], editingId = null;
const $ = id => document.getElementById(id);
function el(tag, text, cls) { const e = document.createElement(tag); if (text) e.textContent = text; if (cls) e.className = cls; return e; }
const ord = p => Number.isFinite(p.order) ? p.order : 99;

onUser(p => { if (!p || p.role !== "leader") return; load(); });

async function load() {
  try {
    const s = await getDocs(collection(db, "leaders"));
    people = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => ord(a) - ord(b) || String(a.name).localeCompare(String(b.name)));
  } catch (e) { $("teamList").textContent = "Could not load: " + e.message; return; }
  renderList();
}

function renderList() {
  const box = $("teamList"); box.textContent = "";
  if (!people.length) { box.textContent = "No leaders added yet."; return; }
  people.forEach(p => {
    const row = el("div", null, "ev-row");
    row.appendChild(el("span", p.name + " · " + (p.role || "")));
    const edit = el("button", "Edit"); edit.onclick = () => startEdit(p);
    const del = el("button", "Delete", "danger");
    del.onclick = async () => {
      if (!confirm("Remove " + p.name + " from the page?")) return;
      try { await deleteDoc(doc(db, "leaders", p.id)); if (editingId === p.id) stopEditing(); load(); } catch (e) { alert(e.message); }
    };
    row.append(edit, del); box.appendChild(row);
  });
}

const form = $("teamForm"), msg = $("teamMsg"), cancel = $("teamCancel");

function renderDelegates() {
  const box = $("delegateList"); box.textContent = "";
  draft.forEach((d, i) => {
    const row = el("div", null, "field-row");
    const n = document.createElement("input"); n.placeholder = "Delegate's name"; n.maxLength = 80; n.value = d.name;
    n.setAttribute("aria-label", "Delegate name"); n.oninput = () => { d.name = n.value; };
    const w = document.createElement("input"); w.placeholder = "What they do"; w.maxLength = 200; w.value = d.does;
    w.setAttribute("aria-label", "What the delegate does"); w.oninput = () => { d.does = w.value; };
    const rm = el("button", "Remove", "danger"); rm.type = "button"; rm.onclick = () => { draft.splice(i, 1); renderDelegates(); };
    row.append(n, w, rm); box.appendChild(row);
  });
}
$("addDelegate").onclick = () => { draft.push({ name: "", does: "" }); renderDelegates(); };

function stopEditing() {
  editingId = null; form.reset(); draft = []; renderDelegates();
  $("teamHeading").textContent = "Add a leader"; cancel.hidden = true;
}
function startEdit(p) {
  editingId = p.id; const x = form.elements;
  x.name.value = p.name || ""; x.role.value = p.role || ""; x.does.value = p.does || ""; x.order.value = Number.isFinite(p.order) ? p.order : 1;
  draft = (p.delegates || []).map(d => ({ ...d }));
  renderDelegates(); $("teamHeading").textContent = "Edit: " + p.name; cancel.hidden = false; msg.textContent = "";
  form.scrollIntoView({ behavior: "smooth" });
}
cancel.onclick = stopEditing;

form.addEventListener("submit", async ev => {
  ev.preventDefault(); msg.textContent = ""; const x = form.elements;
  const data = { name: x.name.value.trim(), role: x.role.value.trim(), does: x.does.value.trim(),
    order: Number(x.order.value) || 1,
    delegates: draft.filter(d => d.name.trim()).map(d => ({ name: d.name.trim(), does: d.does.trim() })) };
  try {
    if (editingId) await updateDoc(doc(db, "leaders", editingId), data);
    else await addDoc(collection(db, "leaders"), { ...data, createdAt: serverTimestamp() });
    stopEditing(); msg.textContent = "Saved."; load();
  } catch (e) { msg.textContent = "Could not save: " + e.message; }
});
renderDelegates();