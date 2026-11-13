import { db, onUser } from "./auth.js";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where, writeBatch, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { fmt } from "./common.js";

let me, forms = [], draft = [], editingId = null;
const $ = id => document.getElementById(id);
function el(tag, text, cls) { const e = document.createElement(tag); if (text) e.textContent = text; if (cls) e.className = cls; return e; }
function inp(type, name) { const i = document.createElement("input"); i.type = type; i.name = name; return i; }
function labeled(text, control) { const l = el("label", text + " "); l.appendChild(control); return l; }
function csv(rows, filename) {
  const q = v => { let s = String(v); if (/^[=+\-@]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
  const url = URL.createObjectURL(new Blob([rows.map(r => r.map(q).join(",")).join("\n")], { type: "text/csv" }));
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}
const byStart = (a, b) => new Date(a.start) - new Date(b.start);
const formQ = (col, id) => getDocs(query(collection(db, col), where("formId", "==", id)));

onUser(p => { if (!p || p.role !== "leader") return; me = p; loadForms(); });

/* ---------- list of forms ---------- */
async function loadForms() {
  try {
    const s = await getDocs(collection(db, "forms"));
    forms = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.title).localeCompare(String(b.title)));
  } catch (e) { $("formList").textContent = "Could not load: " + e.message; return; }
  renderList();
}

function renderList() {
  const box = $("formList"); box.textContent = "";
  if (!forms.length) { box.textContent = "Nothing yet. Create one below."; return; }
  forms.forEach(f => {
    const row = el("div", null, "ev-row");
    const t = el("span", (f.kind === "audition" ? "Audition: " : "Form: ") + f.title + " · " + (f.open ? "OPEN" : "closed"));
    const toggle = el("button", f.open ? "Close" : "Open");
    toggle.onclick = async () => {
      try { await updateDoc(doc(db, "forms", f.id), { open: !f.open }); loadForms(); } catch (e) { alert(e.message); }
    };
    const edit = el("button", "Edit"); edit.onclick = () => startEdit(f);
    const apps = el("button", "Applications"); apps.onclick = () => showSubs(f);
    row.append(t, toggle, edit);
    if (f.kind === "audition") { const sl = el("button", "Time slots"); sl.onclick = () => showSlots(f); row.appendChild(sl); }
    row.appendChild(apps);
    const del = el("button", "Delete", "danger");
    del.onclick = async () => {
      if (!confirm("Delete \"" + f.title + "\" with all its slots and applications?")) return;
      try {
        const [a, b] = await Promise.all([formQ("slots", f.id), formQ("submissions", f.id)]);
        await Promise.all([...a.docs, ...b.docs].map(d => deleteDoc(d.ref)));
        await deleteDoc(doc(db, "forms", f.id));
        $("slotPanel").textContent = ""; $("subPanel").textContent = "";
        if (editingId === f.id) stopEditing();
        loadForms();
      } catch (e) { alert("Could not delete: " + e.message); }
    };
    row.appendChild(del); box.appendChild(row);
  });
}

/* ---------- editor: create / edit a form and its questions ---------- */
const editor = $("formEditor"), formMsg = $("formMsg"), cancelBtn = $("formCancel");
const newField = () => ({ id: "q" + Math.random().toString(36).slice(2, 8), label: "", type: "text", options: [], required: false });

function renderFields() {
  const box = $("fieldList"); box.textContent = "";
  draft.forEach((f, i) => {
    const row = el("div", null, "field-row");
    const label = inp("text", "label"); label.value = f.label; label.placeholder = "Question or label"; label.maxLength = 120;
    label.setAttribute("aria-label", "Question " + (i + 1)); label.oninput = () => { f.label = label.value; };
    const type = document.createElement("select"); type.setAttribute("aria-label", "Answer type");
    [["text", "Short answer"], ["textarea", "Long answer"], ["choice", "Multiple choice"], ["checkbox", "Yes / no tick box"]]
      .forEach(([v, t]) => { const o = el("option", t); o.value = v; type.appendChild(o); });
    type.value = f.type;
    const opts = inp("text", "options"); opts.value = f.options.join(", "); opts.placeholder = "Choices, separated by commas";
    opts.setAttribute("aria-label", "Choices"); opts.hidden = f.type !== "choice";
    opts.oninput = () => { f.options = opts.value.split(",").map(s => s.trim()).filter(Boolean); };
    type.onchange = () => { f.type = type.value; opts.hidden = f.type !== "choice"; };
    const req = inp("checkbox", "required"); req.checked = !!f.required; req.onchange = () => { f.required = req.checked; };
    const reqL = el("label", " Required", "check"); reqL.prepend(req);
    const rm = el("button", "Remove"); rm.type = "button"; rm.className = "danger";
    rm.onclick = () => { draft.splice(i, 1); renderFields(); };
    row.append(label, type, opts, reqL, rm); box.appendChild(row);
  });
}
$("addField").onclick = () => { draft.push(newField()); renderFields(); };

function stopEditing() {
  editingId = null; editor.reset(); draft = []; renderFields();
  $("formHeading").textContent = "New audition or form"; cancelBtn.hidden = true;
}
function startEdit(f) {
  editingId = f.id; const x = editor.elements;
  x.kind.value = f.kind || "form"; x.title.value = f.title || ""; x.description.value = f.description || ""; x.open.checked = !!f.open;
  draft = (f.fields || []).map(q => ({ ...q, options: [...(q.options || [])] }));
  renderFields(); $("formHeading").textContent = "Edit: " + f.title; cancelBtn.hidden = false; formMsg.textContent = "";
  editor.scrollIntoView({ behavior: "smooth" });
}
cancelBtn.onclick = stopEditing;

editor.addEventListener("submit", async ev => {
  ev.preventDefault(); formMsg.textContent = ""; const x = editor.elements;
  const fields = draft.filter(q => q.label.trim()).map(q => ({
    id: q.id, label: q.label.trim(), type: q.type, options: q.type === "choice" ? q.options : [], required: !!q.required }));
  if (fields.some(q => q.type === "choice" && q.options.length < 2)) { formMsg.textContent = "A multiple choice question needs at least two choices."; return; }
  const data = { kind: x.kind.value, title: x.title.value.trim(), description: x.description.value.trim(), open: x.open.checked, fields };
  try {
    if (editingId) await updateDoc(doc(db, "forms", editingId), data);
    else await addDoc(collection(db, "forms"), { ...data, createdBy: me.user.uid, createdAt: serverTimestamp() });
    stopEditing(); formMsg.textContent = "Saved."; loadForms();
  } catch (e) { formMsg.textContent = "Could not save: " + e.message; }
});
renderFields();

/* ---------- time slots ---------- */
async function showSlots(f) {
  const panel = $("slotPanel"); $("subPanel").textContent = ""; panel.textContent = "Loading…";
  let slots = [], subs = [];
  try {
    const [a, b] = await Promise.all([formQ("slots", f.id), formQ("submissions", f.id)]);
    slots = a.docs.map(d => ({ id: d.id, ...d.data() })).sort(byStart);
    subs = b.docs.map(d => d.data());
  } catch (e) { panel.textContent = "Could not load: " + e.message; return; }
  panel.textContent = "";
  panel.appendChild(el("h3", "Time slots for " + f.title));
  panel.appendChild(el("p", "Members must pick a free slot and each slot can be booked by only one person. With no slots, this is an open application."));
  const list = el("div"); if (!slots.length) list.textContent = "No slots yet.";
  slots.forEach(s => {
    const row = el("div", null, "ev-row");
    const who = subs.find(x => x.uid === s.bookedBy);
    row.appendChild(el("span", fmt(s.start) + " · " + s.leaderName + (s.leaderContact ? " (" + s.leaderContact + ")" : "") +
      " · " + (s.bookedBy ? "BOOKED by " + (who ? who.name : "a member") : "free")));
    const del = el("button", "Delete", "danger");
    del.onclick = async () => {
      if (!confirm(s.bookedBy ? "This slot is booked. Delete it anyway? The member will be told to pick again." : "Delete this slot?")) return;
      try { await deleteDoc(doc(db, "slots", s.id)); showSlots(f); } catch (e) { alert(e.message); }
    };
    row.appendChild(del); list.appendChild(row);
  });
  panel.appendChild(list);
  const sf = el("form", null, "dash-form");
  const start = inp("datetime-local", "start"); start.required = true;
  const ln = inp("text", "leaderName"); ln.required = true; ln.maxLength = 80;
  const lc = inp("text", "leaderContact"); lc.maxLength = 120;
  const add = el("button", "Add slot"); add.type = "submit";
  const m = el("p"); m.setAttribute("role", "status");
  sf.append(el("h4", "Add a slot"), labeled("Date and time", start), labeled("Interviewing leader's name", ln),
    labeled("Leader's contact (phone or email, shown to the member who books)", lc), add, m);
  sf.onsubmit = async ev => {
    ev.preventDefault();
    try {
      await addDoc(collection(db, "slots"), { formId: f.id, start: start.value, leaderName: ln.value.trim(),
        leaderContact: lc.value.trim(), bookedBy: null, createdAt: serverTimestamp() });
      showSlots(f);
    } catch (e) { m.textContent = "Could not add: " + e.message; }
  };
  panel.appendChild(sf); panel.scrollIntoView({ behavior: "smooth" });
}

/* ---------- applications + results ---------- */
const STATUS = [["", "Waiting"], ["accepted", "Accepted"], ["waitlist", "Waitlist"], ["declined", "Not this time"]];

// Opens the leader's own email program with a ready message (the website cannot send email by itself on the free plan)
function mailTo(f, r, status, at, place) {
  const when = at ? new Date(at).toLocaleString([], { dateStyle: "full", timeStyle: "short" }) : "";
  const lines = ["Hello " + r.name + ",", ""];
  if (status === "accepted") {
    lines.push("Congratulations! You have been accepted for the " + f.title + " audition stage of the Arts & Culture & Languages Club.");
    lines.push(when ? "Your interview: " + when + (place ? " at " + place : "") : "We will send you your interview time soon.");
  } else if (status === "waitlist") {
    lines.push("Thank you for auditioning for " + f.title + ". You are on our waiting list, and we will contact you as soon as a place opens.");
  } else if (status === "declined") {
    lines.push("Thank you for auditioning for " + f.title + ". We are sorry, but we cannot offer you a place this time. We would love to see you at our events, and we hope you apply again.");
  } else lines.push("Here is an update about your " + f.title + " application.");
  lines.push("", "You can also see your result on the club website, under Auditions.", "", "ACL Club leaders");
  return "mailto:" + encodeURIComponent(r.email) + "?subject=" + encodeURIComponent("ACL Club: your " + f.title + " audition") + "&body=" + encodeURIComponent(lines.join("\r\n"));
}

async function showSubs(f) {
  const panel = $("subPanel"); $("slotPanel").textContent = ""; panel.textContent = "Loading…";
  let slots = [], subs = [];
  try {
    const [a, b] = await Promise.all([formQ("slots", f.id), formQ("submissions", f.id)]);
    slots = a.docs.map(d => ({ id: d.id, ...d.data() }));
    subs = b.docs.map(d => ({ id: d.id, ...d.data() })).sort((x, y) => String(x.name).localeCompare(String(y.name)));
  } catch (e) { panel.textContent = "Could not load: " + e.message; return; }
  panel.textContent = "";
  panel.appendChild(el("h3", f.title + ": " + subs.length + " applied"));
  const summary = el("p", null, "hint"); panel.appendChild(summary);
  const count = s => subs.filter(r => (r.status || "") === s).length;
  const sum = () => { summary.textContent = STATUS.map(([k, t]) => t + ": " + count(k)).join("  ·  "); };
  sum();
  if (!subs.length) { panel.scrollIntoView({ behavior: "smooth" }); return; }

  const cols = f.fields || [];
  const slotText = r => { const s = slots.find(x => x.id === r.slotId); return s ? fmt(s.start) + " · " + s.leaderName : (r.slotId ? "(slot removed)" : "-"); };
  const answer = (r, q) => { const a = (r.answers || []).find(x => x.id === q.id); return a ? a.value : ""; };
  const wrap = el("div", null, "table-wrap"), tbl = document.createElement("table"), head = document.createElement("tr");
  ["Name", "Email", "Time slot", ...cols.map(q => q.label), "Result", "Interview time", "Interview place", ""].forEach(x => head.appendChild(el("th", x)));
  tbl.appendChild(head);
  subs.forEach(r => {
    const tr = document.createElement("tr");
    [r.name, r.email, slotText(r), ...cols.map(q => answer(r, q))].forEach(v => tr.appendChild(el("td", String(v || ""))));
    const sel = document.createElement("select"); sel.setAttribute("aria-label", "Result for " + r.name);
    STATUS.forEach(([k, t]) => { const o = el("option", t); o.value = k; sel.appendChild(o); }); sel.value = r.status || "";
    const when = document.createElement("input"); when.type = "datetime-local"; when.value = r.interviewAt || ""; when.setAttribute("aria-label", "Interview time for " + r.name);
    const place = document.createElement("input"); place.type = "text"; place.maxLength = 120; place.value = r.interviewPlace || ""; place.setAttribute("aria-label", "Interview place for " + r.name);
    const save = el("button", "Save"); save.type = "button";
    save.onclick = async () => {
      save.disabled = true;
      try {
        await updateDoc(doc(db, "submissions", r.id), { status: sel.value, interviewAt: when.value || "", interviewPlace: place.value.trim(), decidedAt: serverTimestamp() });
        r.status = sel.value; sum(); save.textContent = "Saved ✓"; setTimeout(() => { save.textContent = "Save"; }, 1500);
      } catch (e) { alert(e.message); }
      save.disabled = false;
    };
    const mail = el("button", "Email"); mail.type = "button"; mail.title = "Opens your email program with a ready message";
    mail.onclick = () => { location.href = mailTo(f, r, sel.value, when.value, place.value.trim()); };
    const rm = el("button", "Remove", "danger"); rm.type = "button";
    rm.onclick = async () => {
      if (!confirm("Remove " + r.name + "'s application?")) return;
      try {
        const b = writeBatch(db);
        b.delete(doc(db, "submissions", r.id));
        if (r.slotId && slots.some(s => s.id === r.slotId)) b.update(doc(db, "slots", r.slotId), { bookedBy: null });
        await b.commit(); showSubs(f);
      } catch (e) { alert(e.message); }
    };
    [sel, when, place].forEach(c => { const td = document.createElement("td"); td.appendChild(c); tr.appendChild(td); });
    const last = document.createElement("td"); last.append(save, mail, rm); tr.appendChild(last);
    tbl.appendChild(tr);
  });
  wrap.appendChild(tbl); panel.appendChild(wrap);

  // email everyone in one group: copy the addresses, then paste them in the BCC box of your email
  const group = el("div", null, "finder-row");
  [["accepted", "Copy emails of accepted"], ["waitlist", "Copy emails of waitlist"], ["declined", "Copy emails of not accepted"]].forEach(([k, t]) => {
    const b = el("button", t, "export"); b.type = "button";
    b.onclick = async () => {
      const emails = subs.filter(r => (r.status || "") === k && r.email).map(r => r.email);
      if (!emails.length) { alert("Nobody is in this group yet. Save their results first."); return; }
      try { await navigator.clipboard.writeText(emails.join("; ")); alert("Copied " + emails.length + " email address(es). Paste them in the BCC box of your email."); }
      catch (e) { prompt("Copy these addresses:", emails.join("; ")); }
    };
    group.appendChild(b);
  });
  panel.appendChild(group);

  const ex = el("button", "Export to CSV", "export");
  ex.onclick = () => csv([["Name", "Email", "Time slot", ...cols.map(q => q.label), "Result", "Interview time", "Interview place"],
    ...subs.map(r => [r.name, r.email, slotText(r), ...cols.map(q => answer(r, q)), (STATUS.find(s => s[0] === (r.status || "")) || [])[1] || "", r.interviewAt || "", r.interviewPlace || ""])], f.title + " applications.csv");
  panel.appendChild(ex); panel.scrollIntoView({ behavior: "smooth" });
}
