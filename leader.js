import { db, onUser, logOut } from "./auth.js";
import "./leader-views.js";       // sidebar views
import "./leader-dashboard.js";   // dashboard
import "./leader-people.js";      // find a person
import "./leader-import.js";      // talent directory + imports
import { showRegs as showRegsReport } from "./leader-regs.js";
import { endDate } from "./common.js";
import { collection, getDocs, getDoc, setDoc, addDoc, deleteDoc, updateDoc, doc, query, where, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

let me, eventList = [], editingId = null, users = [];
document.getElementById("logout").addEventListener("click", logOut);
onUser(p => {
  if (!p) return location.replace("index.html");
  if (p.role !== "leader") return location.replace("member.html");
  me = p;
  document.getElementById("who").textContent = p.name + " (leader)";
  document.body.classList.add("ready");
  loadEvents();
  loadContent();
  loadMembers();
});

async function loadEvents() {
  try {
    const snap = await getDocs(collection(db, "events"));
    eventList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) { console.error(err); }
  renderEvents();
}

/* ---------- Post / edit an event ---------- */
const msg = document.getElementById("eventMsg");
const eventForm = document.getElementById("eventForm");
const heading = document.getElementById("eventHeading");
const submitBtn = document.getElementById("eventSubmit");
const cancelBtn = document.getElementById("eventCancel");

function stopEditing() {
  editingId = null; eventForm.reset();
  heading.textContent = "Post an event"; submitBtn.textContent = "Post event"; cancelBtn.hidden = true;
}
function startEdit(e) {
  editingId = e.id;
  eventForm.title.value = e.title || ""; eventForm.start.value = e.start || "";
  eventForm.place.value = e.place || ""; eventForm.about.value = e.about || ""; eventForm.recap.value = e.recap || "";
  { const d = endDate(e), p = n => String(n).padStart(2, "0"); eventForm.end.value = e.end || (d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "T" + p(d.getHours()) + ":" + p(d.getMinutes())); }
  heading.textContent = "Edit event"; submitBtn.textContent = "Save changes"; cancelBtn.hidden = false;
  msg.textContent = "";
  document.getElementById("post").scrollIntoView({ behavior: "smooth" });
}
cancelBtn.addEventListener("click", stopEditing);

eventForm.addEventListener("submit", async ev => {
  ev.preventDefault();
  const f = ev.target; msg.textContent = "";
  const data = { title: f.title.value.trim(), start: f.start.value, end: f.end.value, place: f.place.value.trim(), about: f.about.value.trim(), recap: f.recap.value.trim() };
  if (data.end <= data.start) { msg.textContent = "The end time must be after the start time."; return; }
  try {
    if (editingId) {
      await updateDoc(doc(db, "events", editingId), data);
      stopEditing(); msg.textContent = "Event updated.";
    } else {
      await addDoc(collection(db, "events"), { ...data, createdBy: me.user.uid, createdAt: serverTimestamp() });
      f.reset(); msg.textContent = "Event posted.";
    }
    loadEvents();
  } catch (err) { msg.textContent = "Could not save: " + err.message; }
});

function renderEvents() {
  const box = document.getElementById("leaderEvents"); box.textContent = "";
  if (!eventList.length) { box.textContent = "No events yet."; return; }
  [...eventList].sort((a, b) => new Date(a.start) - new Date(b.start)).forEach(e => {
    const row = document.createElement("div"); row.className = "ev-row";
    const t = document.createElement("span"); t.textContent = e.title + " · " + new Date(e.start).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) + " – " + endDate(e).toLocaleTimeString([], { timeStyle: "short" }) + (endDate(e) < new Date() ? " · past" : "");
    const b1 = document.createElement("button"); b1.textContent = "Registrations"; b1.onclick = () => showRegsReport(e);
    const b0 = document.createElement("button"); b0.textContent = "Edit"; b0.onclick = () => startEdit(e);
    const b2 = document.createElement("button"); b2.textContent = "Delete"; b2.className = "danger";
    b2.onclick = async () => {
      if (!confirm("Delete \"" + e.title + "\" and all its registrations?")) return;
      try {
        const regs = await getDocs(query(collection(db, "registrations"), where("eventId", "==", e.id)));
        await Promise.all(regs.docs.map(d => deleteDoc(d.ref)));
        await deleteDoc(doc(db, "events", e.id));
        if (editingId === e.id) stopEditing();
        document.getElementById("regPanel").textContent = ""; loadEvents();
      } catch (err) { alert("Could not delete: " + err.message); }
    };
    row.append(t, b1, b0, b2); box.appendChild(row);
  });
}

async function showRegs(e) {
  const panel = document.getElementById("regPanel"); panel.textContent = "Loading…";
  const snap = await getDocs(query(collection(db, "registrations"), where("eventId", "==", e.id)));
  const regs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  panel.textContent = "";
  const h = document.createElement("h3"); panel.appendChild(h);
  const count = () => { h.textContent = e.title + ": " + regs.length + " registered, " + regs.filter(r => r.checkedIn).length + " arrived"; };
  count();
  if (!regs.length) return;
  const wrap = document.createElement("div"); wrap.className = "table-wrap";
  const tbl = document.createElement("table");
  const head = document.createElement("tr");
  ["Arrived", "Name", "Email"].forEach(x => { const th = document.createElement("th"); th.textContent = x; head.appendChild(th); });
  tbl.appendChild(head);
  regs.forEach(r => {
    const tr = document.createElement("tr"), c1 = document.createElement("td"), cb = document.createElement("input");
    cb.type = "checkbox"; cb.checked = !!r.checkedIn; cb.setAttribute("aria-label", "Arrived: " + r.name);
    cb.onchange = async () => { await updateDoc(doc(db, "registrations", r.id), { checkedIn: cb.checked }); r.checkedIn = cb.checked; count(); };
    c1.appendChild(cb);
    const c2 = document.createElement("td"); c2.textContent = r.name;
    const c3 = document.createElement("td"); c3.textContent = r.email;
    tr.append(c1, c2, c3); tbl.appendChild(tr);
  });
  wrap.appendChild(tbl); panel.appendChild(wrap);
  const ex = document.createElement("button"); ex.textContent = "Export to CSV"; ex.className = "export";
  ex.onclick = () => csv([["Name", "Email", "Arrived"], ...regs.map(r => [r.name, r.email, r.checkedIn ? "yes" : "no"])], e.title + " registrations.csv");
  panel.appendChild(ex);
}

/* ---------- Edit the website text ---------- */
const siteForm = document.getElementById("siteForm"), siteMsg = document.getElementById("siteMsg");
const siteKeys = ["aboutText", "memberCardText", "leaderCardText", "footerText"];

async function loadContent() {
  try {
    const s = await getDoc(doc(db, "site", "content"));
    if (s.exists()) siteKeys.forEach(k => { siteForm[k].value = s.data()[k] || ""; });
  } catch (err) { console.error(err); }
}
siteForm.addEventListener("submit", async ev => {
  ev.preventDefault(); siteMsg.textContent = "";
  const data = { updatedBy: me.user.uid, updatedAt: serverTimestamp() };
  siteKeys.forEach(k => { data[k] = siteForm[k].value.trim(); });
  try {
    await setDoc(doc(db, "site", "content"), data, { merge: true });
    siteMsg.textContent = "Saved. Refresh the front page to see it.";
  } catch (err) { siteMsg.textContent = "Could not save: " + err.message; }
});

/* ---------- Members roster ---------- */
const countEl = document.getElementById("memberCount"), tableEl = document.getElementById("memberTable"), searchEl = document.getElementById("memberSearch");

function joined(u) { return u.createdAt && u.createdAt.toDate ? u.createdAt.toDate().toLocaleDateString() : ""; }

async function loadMembers() {
  try {
    const snap = await getDocs(collection(db, "users"));
    users = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  } catch (err) { countEl.textContent = "Could not load members: " + err.message; return; }
  renderMembers();
}

function renderMembers() {
  const q = searchEl.value.trim().toLowerCase();
  const members = users.filter(u => u.role !== "leader").length;
  const leaders = users.length - members;
  countEl.textContent = members + " members signed up (plus " + leaders + " leaders)";
  tableEl.textContent = "";
  const head = document.createElement("tr");
  ["Name", "Email", "Role", "Joined"].forEach(x => { const th = document.createElement("th"); th.textContent = x; head.appendChild(th); });
  tableEl.appendChild(head);
  users.filter(u => !q || String(u.name || "").toLowerCase().includes(q) || String(u.email || "").toLowerCase().includes(q))
    .forEach(u => {
      const tr = document.createElement("tr");
      [u.name || "", u.email || "", u.role || "member", joined(u)].forEach(v => {
        const td = document.createElement("td"); td.textContent = v; tr.appendChild(td);
      });
      tableEl.appendChild(tr);
    });
}
searchEl.addEventListener("input", renderMembers);
document.getElementById("memberExport").addEventListener("click", () =>
  csv([["Name", "Email", "Role", "Joined"], ...users.map(u => [u.name || "", u.email || "", u.role || "member", joined(u)])], "ACL members.csv"));

/* ---------- Shared CSV helper ---------- */
function csv(rows, filename) {
  // A leading = + - @ can make Excel run a formula, so we defuse it
  const q = v => { let s = String(v); if (/^[=+\-@]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
  const url = URL.createObjectURL(new Blob([rows.map(r => r.map(q).join(",")).join("\n")], { type: "text/csv" }));
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}