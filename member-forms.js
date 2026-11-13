import { db, onUser } from "./auth.js";
import { collection, getDocs, getDoc, doc, query, where, writeBatch, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { fmt } from "./common.js";

let me;
const auditionBox = document.getElementById("auditionList"), formBox = document.getElementById("formList");
function el(tag, text, cls) { const e = document.createElement(tag); if (text) e.textContent = text; if (cls) e.className = cls; return e; }

onUser(p => { if (!p || p.role === "leader") return; me = p; load(); });

async function load() {
  auditionBox.textContent = "Loading…"; formBox.textContent = "Loading…";
  let forms = [];
  try {
    const snap = await getDocs(collection(db, "forms"));
    forms = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.title).localeCompare(String(b.title)));
  } catch (err) { auditionBox.textContent = "Could not load: " + err.message; formBox.textContent = ""; return; }
  auditionBox.textContent = ""; formBox.textContent = "";
  let a = 0, f = 0;
  for (const form of forms) {
    let sub = null;
    try { const s = await getDoc(doc(db, "submissions", form.id + "_" + me.user.uid)); if (s.exists()) sub = s.data(); } catch (e) { console.error(e); }
    if (!form.open && !sub) continue;   // closed and you never applied: hide it
    const card = el("article", null, "form-card");
    card.appendChild(el("h3", form.title));
    card.appendChild(el("span", form.open ? "Open" : "Closed", "badge " + (form.open ? "on" : "off")));
    if (form.description) card.appendChild(el("p", form.description));
    if (sub) await doneView(card, form, sub); else await formView(card, form);
    if (form.kind === "audition") { auditionBox.appendChild(card); a++; } else { formBox.appendChild(card); f++; }
  }
  if (!a) auditionBox.textContent = "No auditions are open right now.";
  if (!f) formBox.textContent = "No forms to fill in right now.";
}

async function doneView(card, form, sub) {
  card.appendChild(el("p", "You have applied.", "ok"));
  const st = sub.status || "";
  if (!st) card.appendChild(el("p", "Your application is being reviewed. Your result will appear here.", "hint"));
  else {
    const box = el("div", null, "result " + st);
    if (st === "accepted") {
      box.appendChild(el("h4", "Congratulations, you were accepted! 🎉"));
      box.appendChild(el("p", sub.interviewAt ? "Your interview: " + fmt(sub.interviewAt) + (sub.interviewPlace ? " · " + sub.interviewPlace : "") : "We will send you your interview time soon."));
    } else if (st === "waitlist") {
      box.appendChild(el("h4", "You are on the waiting list"));
      box.appendChild(el("p", "We will contact you as soon as a place opens."));
    } else {
      box.appendChild(el("h4", "Not this time"));
      box.appendChild(el("p", "Thank you for applying. We would love to see you at our events, and we hope you apply again."));
    }
    card.appendChild(box);
  }
  let slot = null;
  if (sub.slotId) {
    try { const s = await getDoc(doc(db, "slots", sub.slotId)); if (s.exists()) slot = s.data(); } catch (e) { console.error(e); }
    const info = el("div", null, "slot-info");
    if (slot) {
      info.appendChild(el("p", "Your booked slot: " + fmt(slot.start)));
      info.appendChild(el("p", "Interviewing leader: " + slot.leaderName));
      if (slot.leaderContact) info.appendChild(el("p", "Contact: " + slot.leaderContact));
    } else info.appendChild(el("p", "Your time slot was removed by the leaders. Please cancel and pick a new one."));
    card.appendChild(info);
  }
  const cancel = el("button", "Cancel my application"); cancel.type = "button";
  cancel.onclick = async () => {
    if (!confirm("Cancel your application for " + form.title + "?")) return;
    cancel.disabled = true;
    try {
      const b = writeBatch(db);
      b.delete(doc(db, "submissions", form.id + "_" + me.user.uid));
      if (sub.slotId && slot) b.update(doc(db, "slots", sub.slotId), { bookedBy: null });
      await b.commit(); load();
    } catch (err) { alert("Could not cancel: " + err.message); cancel.disabled = false; }
  };
  card.appendChild(cancel);
}

async function formView(card, form) {
  let slots = [];
  try {
    const s = await getDocs(query(collection(db, "slots"), where("formId", "==", form.id)));
    slots = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => new Date(a.start) - new Date(b.start));
  } catch (e) { console.error(e); }
  const f = el("form", null, "member-form"), inputs = [];
  (form.fields || []).forEach(q => {
    const label = el("label", q.label + (q.required ? " *" : "") + " ");
    let c;
    if (q.type === "textarea") { c = document.createElement("textarea"); c.rows = 3; c.maxLength = 2000; }
    else if (q.type === "choice") {
      c = document.createElement("select");
      const ph = el("option", "Choose…"); ph.value = ""; c.appendChild(ph);
      (q.options || []).forEach(o => { const op = el("option", o); op.value = o; c.appendChild(op); });
    } else if (q.type === "checkbox") { c = document.createElement("input"); c.type = "checkbox"; label.classList.add("check"); }
    else { c = document.createElement("input"); c.type = "text"; c.maxLength = 300; }
    if (q.type === "checkbox") label.prepend(c); else label.appendChild(c);
    f.appendChild(label); inputs.push({ q, c });
  });

  let slotSel = null;
  if (slots.length) {
    const free = slots.filter(s => !s.bookedBy);
    if (!free.length) f.appendChild(el("p", "All time slots are taken. Check again later.", "warn"));
    else {
      slotSel = document.createElement("select");
      const ph = el("option", "Choose a time…"); ph.value = ""; slotSel.appendChild(ph);
      free.forEach(s => { const o = el("option", fmt(s.start)); o.value = s.id; slotSel.appendChild(o); });
      const l = el("label", "Pick a time slot * "); l.appendChild(slotSel); f.appendChild(l);
      const who = el("p", null, "slot-info"); f.appendChild(who);
      slotSel.onchange = () => { const s = free.find(x => x.id === slotSel.value); who.textContent = s ? "You will be interviewed by " + s.leaderName + "." : ""; };
    }
  }
  const msg = el("p", null, "msg"); msg.setAttribute("role", "alert");
  const btn = el("button", slots.length ? "Book my slot" : "Send"); btn.type = "submit";
  if (slots.length && !slotSel) btn.disabled = true;
  f.append(msg, btn);

  f.onsubmit = async ev => {
    ev.preventDefault(); msg.textContent = "";
    const answers = [];
    for (const { q, c } of inputs) {
      const v = q.type === "checkbox" ? (c.checked ? "Yes" : "No") : c.value.trim();
      if (q.required && (q.type === "checkbox" ? !c.checked : !v)) { msg.textContent = "Please answer: " + q.label; return; }
      answers.push({ id: q.id, label: q.label, value: v });
    }
    if (slotSel && !slotSel.value) { msg.textContent = "Please pick a time slot."; return; }
    btn.disabled = true;
    const uid = me.user.uid;
    const data = { formId: form.id, formTitle: form.title, uid, name: me.name, email: me.user.email,
      answers, slotId: slotSel ? slotSel.value : null, createdAt: serverTimestamp() };
    try {
      const b = writeBatch(db);
      b.set(doc(db, "submissions", form.id + "_" + uid), data);
      if (slotSel) b.update(doc(db, "slots", slotSel.value), { bookedBy: uid });
      await b.commit(); load();
    } catch (err) {
      alert(slotSel ? "Sorry, that slot was just taken (or this audition closed). Please pick another." : "Could not send: " + err.message);
      load();
    }
  };
  card.appendChild(f);
}