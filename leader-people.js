import { db, onUser } from "./auth.js";
import { settings } from "./security-config.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const el = (tag, text, cls) => { const e = document.createElement(tag); if (text) e.textContent = text; if (cls) e.className = cls; return e; };
const opt = (v, t) => { const o = el("option", t); o.value = v; return o; };
// makes Arabic spellings comparable: removes diacritics, unifies alef / yeh / teh marbuta
const clean = s => String(s ?? "").replace(/[\u064B-\u065F\u0670]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/\s+/g, " ").trim().toLowerCase();
const digits = s => String(s ?? "").replace(/\D/g, "");
const idFromEmail = e => (String(e || "").split("@")[0].match(/\d{6,}/) || [""])[0];
const PHONE = /phone|mobile|جوال|هاتف/i;
const uniEmail = e => String(e).toLowerCase().endsWith("@" + settings.uniDomain);
const all = async c => (await getDocs(collection(db, c))).docs.map(d => ({ id: d.id, ...d.data() }));
function csvOut(rows, filename) {
  const q = v => { let s = String(v ?? ""); if (/^[=+\-@]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
  const url = URL.createObjectURL(new Blob(["\uFEFF" + rows.map(r => r.map(q).join(",")).join("\n")], { type: "text/csv" }));
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}

// Joins the three lists into one list of people: by student ID, then email, then (flagged) name
function link(users, talents, regs) {
  const people = [], byId = new Map(), byEmail = new Map(), byName = new Map();
  const make = (name, email, sid) => {
    const p = { name: name || "", email: String(email || "").toLowerCase(), studentId: sid || "", talent: null, regs: [], users: [], viaName: false };
    people.push(p);
    if (digits(p.studentId).length >= 5) byId.set(digits(p.studentId), p);
    if (p.email) byEmail.set(p.email, p);
    if (clean(p.name)) byName.set(clean(p.name), p);
    return p;
  };
  talents.forEach(t => { make(t.name, t.email, idFromEmail(t.email)).talent = t; });
  regs.forEach(r => {
    const rid = digits(r.studentId), em = String(r.email || "").toLowerCase();
    let p = (rid.length >= 5 && byId.get(rid)) || (em && byEmail.get(em)) || null, viaName = false;
    if (!p && clean(r.name)) {
      const c = byName.get(clean(r.name));
      if (c && !(rid && digits(c.studentId) && digits(c.studentId) !== rid)) { p = c; viaName = true; }
    }
    if (!p) p = make(r.name, em, r.studentId);
    else {
      if (!p.studentId && r.studentId) { p.studentId = r.studentId; if (rid.length >= 5) byId.set(rid, p); }
      if (!p.email && em) { p.email = em; byEmail.set(em, p); }
    }
    if (viaName) p.viaName = true;
    p.regs.push(r);
  });
  users.forEach(u => {
    const em = String(u.email || "").toLowerCase();
    let p = (em && byEmail.get(em)) || null;
    if (!p && clean(u.name) && byName.get(clean(u.name))) { p = byName.get(clean(u.name)); p.viaName = true; }
    if (!p) p = make(u.name, em, "");
    p.users.push(u);
  });
  people.forEach(p => {
    const f = (p.talent && p.talent.fields) || [], ph = f.find(x => PHONE.test(x.label));
    p.phone = ph ? ph.value : "";
    p.attended = p.regs.filter(r => r.checkedIn).length;
    p.hay = clean([p.name, p.studentId, digits(p.studentId), p.email, p.phone, ...f.map(x => x.value),
      ...p.regs.flatMap(r => (r.details || []).map(d => d.value))].join(" "));
  });
  return people.sort((a, b) => a.name.localeCompare(b.name));
}

function card(p) {
  const a = el("article", null, "person");
  a.appendChild(el("h3", p.name || "(no name)"));
  a.appendChild(el("span", [p.studentId && "ID " + p.studentId, p.email, p.phone].filter(Boolean).join(" · "), "sub"));
  const tags = el("div");
  if (p.talent) tags.appendChild(el("span", "Talent profile", "tag ok"));
  if (p.email && !uniEmail(p.email)) tags.appendChild(el("span", "Non-university email", "tag"));
  if (p.regs.length) tags.appendChild(el("span", p.regs.length + " registration" + (p.regs.length > 1 ? "s" : "") + ", " + p.attended + " attended", "tag ok"));
  if (p.users.length) tags.appendChild(el("span", p.users.some(u => u.role === "leader") ? "Leader account" : (p.users.every(u => u.guest) ? "Quick-entry guest" : "Has an account"), "tag"));
  if (p.viaName) tags.appendChild(el("span", "Matched by name, please check", "tag warn2"));
  a.appendChild(tags);

  const cols = el("div", null, "cols2");
  if (p.regs.length) {
    const box = el("div"), tbl = document.createElement("table"), head = document.createElement("tr");
    ["Event", "Status", "Rating"].forEach(x => head.appendChild(el("th", x))); tbl.appendChild(head);
    p.regs.forEach(r => {
      const tr = document.createElement("tr");
      const status = r.checkedIn ? (r.walkIn ? "Walk-in ✓" : "Arrived ✓") : "Registered";
      [r.eventTitle || "", status + (r.arrivedAt ? " (" + r.arrivedAt + ")" : ""), r.rating ?? ""].forEach(v => tr.appendChild(el("td", String(v))));
      tbl.appendChild(tr);
    });
    box.append(el("h4", "Events"), tbl);
    p.regs.filter(r => r.feedback).forEach(r => box.appendChild(el("p", "Feedback: " + r.feedback)));
    cols.appendChild(box);
  }
  const extra = [], seen = new Set();
  p.regs.forEach(r => (r.details || []).forEach(d => { const k = d.label + "|" + d.value; if (!seen.has(k)) { seen.add(k); extra.push(d); } }));
  if (extra.length) { const b = el("div"), dl = el("dl", null, "kv"); extra.forEach(d => dl.append(el("dt", d.label), el("dd", d.value))); b.append(el("h4", "From the registration form"), dl); cols.appendChild(b); }
  if (p.talent && (p.talent.fields || []).length) { const b = el("div"), dl = el("dl", null, "kv"); p.talent.fields.forEach(f => dl.append(el("dt", f.label), el("dd", f.value))); b.append(el("h4", "Talent profile"), dl); cols.appendChild(b); }
  if (cols.children.length) a.appendChild(cols);
  return a;
}

onUser(async p => {
  const sec = document.getElementById("finder");
  if (!p || p.role !== "leader" || !sec || sec.dataset.done) return;
  sec.dataset.done = "1";
  const q = el("input", null, "bigsearch"); q.type = "search"; q.autocomplete = "off"; q.placeholder = "Type a name, student ID, email or phone…"; q.setAttribute("aria-label", "Search people");
  const filter = document.createElement("select");
  [["all", "Everyone"], ["talent", "Has a talent profile"], ["notalent", "No talent profile"], ["attended", "Attended an event"], ["never", "Never attended"]].forEach(([v, t]) => filter.appendChild(opt(v, t)));
  const fl = el("label", "Show "); fl.appendChild(filter);
  const exp = el("button", "Export this list to CSV", "export"); exp.type = "button";
  const reload = el("button", "Reload data", "export"); reload.type = "button";
  const row = el("div", null, "finder-row"); row.append(fl, exp, reload);
  const status = el("p"); status.setAttribute("role", "status");
  const out = el("div");
  sec.append(el("h2", "Find a person"),
    el("p", "Search across the talent profiles, event registrations and website accounts at once. Student IDs are matched even when they are inside a university email."),
    el("p", "This shows personal data. Never share screenshots or exports outside the club leaders.", "warn"), q, row, status, out);

  let people = [], shown = [];
  async function load() {
    status.textContent = "Loading…";
    try { const [u, t, r] = await Promise.all([all("users"), all("talents"), all("registrations")]); people = link(u, t, r); }
    catch (e) { status.textContent = "Could not load: " + e.message; return; }
    render();
  }
  function render() {
    const tokens = clean(q.value).split(" ").filter(Boolean), f = filter.value;
    shown = people.filter(x => tokens.every(t => x.hay.includes(t)) &&
      (f === "all" || (f === "talent" && x.talent) || (f === "notalent" && !x.talent) || (f === "attended" && x.attended) || (f === "never" && !x.attended)));
    status.textContent = shown.length + " of " + people.length + " people" + (shown.length > 40 ? " (showing the first 40, type more to narrow it down)" : "");
    out.textContent = ""; shown.slice(0, 40).forEach(x => out.appendChild(card(x)));
  }
  q.addEventListener("input", render); filter.addEventListener("change", render); reload.onclick = load;
  exp.onclick = () => {
    const labels = [...new Set(shown.flatMap(x => ((x.talent && x.talent.fields) || []).map(f => f.label)))];
    csvOut([["Name", "Student ID", "Email", "Phone", "Registrations", "Attended", "Has account", ...labels],
      ...shown.map(x => [x.name, x.studentId, x.email, x.phone, x.regs.length, x.attended, x.users.length ? "yes" : "no",
        ...labels.map(l => ((x.talent && x.talent.fields) || []).find(f => f.label === l)?.value || "")])], "ACL people.csv");
  };
  document.addEventListener("acl-talents", load);
  load();
});
