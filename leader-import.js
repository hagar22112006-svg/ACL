import { db, onUser } from "./auth.js";
import { settings } from "./security-config.js";
import { collection, getDocs, doc, query, where, writeBatch, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const el = (tag, text, cls) => { const e = document.createElement(tag); if (text) e.textContent = text; if (cls) e.className = cls; return e; };
const opt = (value, text) => { const o = el("option", text); o.value = value; return o; };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// which column headings look like what (used to pre-select the right column)
const H = { name: /name|الاسم|اسم/i, email: /e-?mail|بريد/i, id: /student.?id|university.?id|الرقم الجام/i, att: /attend|present|حضور|حضر/i,
  rate: /rating|تقييم/i, fb: /feedback|ملاحظات/i, note: /^note/i, skip: /timestamp|submitted|الطابع/i, keep: /gender|nationality|native|show|الجنس|الجنسية|لغة/i };
const safeId = s => String(s).replace(/[\/\\\s#?\[\]]+/g, "_");

// Reads a CSV file the way Google Sheets writes it (quotes, commas and line breaks inside cells)
function parseCSV(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cur); cur = ""; rows.push(row); row = []; }
    else cur += c;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim() !== ""));
}
function csvOut(rows, filename) {
  const q = v => { let s = String(v ?? ""); if (/^[=+\-@]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
  const url = URL.createObjectURL(new Blob(["\uFEFF" + rows.map(r => r.map(q).join(",")).join("\n")], { type: "text/csv" }));
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}
async function commit(col, items, msg) {
  for (let i = 0; i < items.length; i += 400) {
    const b = writeBatch(db);
    items.slice(i, i + 400).forEach(it => b.set(doc(db, col, it.id), it.data));
    await b.commit();
    msg.textContent = "Saved " + Math.min(i + 400, items.length) + " of " + items.length + "…";
  }
}
// Excel files (.xlsx): read with SheetJS, loaded only when needed. Every sheet (tab) becomes a list of rows.
let XLSXlib;
async function readSheets(file) {
  XLSXlib = XLSXlib || await import("https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs");
  const wb = XLSXlib.read(await file.arrayBuffer(), { type: "array" });
  const sheets = {};
  wb.SheetNames.forEach(n => {
    sheets[n] = XLSXlib.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false, blankrows: false, defval: "" })
      .map(r => r.map(x => String(x ?? ""))).filter(r => r.some(x => x.trim() !== ""));
  });
  return sheets;
}
function colSelect(headers, label, guess, optional) {
  const l = el("label", label + " "), s = document.createElement("select");
  if (optional) s.appendChild(opt("-1", "— none —"));
  headers.forEach((h, i) => s.appendChild(opt(String(i), h)));
  const g = headers.findIndex(h => guess.test(h));
  s.value = g >= 0 ? String(g) : (optional ? "-1" : "0");
  l.appendChild(s); return { l, s };
}

onUser(p => {
  if (!p || p.role !== "leader" || document.getElementById("import")) return;
  const people = document.getElementById("view-people"), host = document.getElementById("importHost");
  buildDirectory(people || document.querySelector(".leader-main"));
  buildImport(host || document.querySelector(".leader-main"));
});

/* ---------- Talent directory ---------- */
function buildDirectory(main) {
  const sec = el("section", null, "panel"); sec.id = "talents";
  const count = el("p"); count.setAttribute("role", "status");
  const l1 = el("label", "Search ", "search"), q = document.createElement("input"); q.type = "search"; q.autocomplete = "off"; l1.appendChild(q);
  const l2 = el("label", "Look only in column ", "search"), col = document.createElement("select"); l2.appendChild(col);
  const wrap = el("div", null, "table-wrap"), tbl = document.createElement("table"); wrap.appendChild(tbl);
  const exp = el("button", "Export talents to CSV", "export"); exp.type = "button";
  const wipeAll = el("button", "Remove ALL talent profiles", "danger"); wipeAll.type = "button";
  sec.append(el("h2", "Talent directory"),
    el("p", "People who filled in the talent form. Members can see only their own entry, and only after logging in with a verified email."),
    el("p", "This list shows personal data. Never share screenshots or exports outside the club leaders.", "warn"),
    count, l1, l2, wrap, exp, wipeAll);
  main.appendChild(sec);

  let people = [], labels = [];
  async function load() {
    count.textContent = "Loading…";
    try {
      const s = await getDocs(collection(db, "talents"));
      people = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
    } catch (e) { count.textContent = "Could not load: " + e.message; return; }
    labels = [...new Set(people.flatMap(p => (p.fields || []).map(f => f.label)))];
    col.textContent = ""; col.appendChild(opt("", "All columns")); labels.forEach(l => col.appendChild(opt(l, l)));
    render();
  }
  function render() {
    const needle = q.value.trim().toLowerCase(), only = col.value;
    const rows = people.filter(p => {
      if (!needle) return true;
      if (!only) return [p.name, p.email, ...(p.fields || []).map(f => f.value)].some(v => String(v || "").toLowerCase().includes(needle));
      return (p.fields || []).some(f => f.label === only && String(f.value).toLowerCase().includes(needle));
    });
    count.textContent = rows.length + " of " + people.length + " people";
    tbl.textContent = "";
    const head = document.createElement("tr");
    ["Name", "Email", "Details"].forEach(x => head.appendChild(el("th", x)));
    tbl.appendChild(head);
    rows.forEach(p => {
      const tr = document.createElement("tr"), details = el("td");
      (p.fields || []).forEach(f => { const pair = el("span", null, "pair"); pair.append(el("b", f.label + ": "), document.createTextNode(f.value)); details.appendChild(pair); });
      tr.append(el("td", p.name || ""), el("td", p.email || ""), details); tbl.appendChild(tr);
    });
  }
  q.addEventListener("input", render); col.addEventListener("change", render);
  exp.onclick = () => csvOut([["Name", "Email", ...labels], ...people.map(p => [p.name, p.email, ...labels.map(l => ((p.fields || []).find(f => f.label === l) || {}).value || "")])], "ACL talents.csv");
  wipeAll.onclick = async () => {
    if (!people.length || !confirm("Remove all " + people.length + " talent profiles? You can import the CSV again afterwards.")) return;
    try {
      for (let i = 0; i < people.length; i += 400) { const b = writeBatch(db); people.slice(i, i + 400).forEach(p => b.delete(doc(db, "talents", p.id))); await b.commit(); }
      load(); document.dispatchEvent(new Event("acl-talents"));
    } catch (e) { alert(e.message); }
  };
  document.addEventListener("acl-talents", load);
  load();
}

/* ---------- Import from Google Sheets ---------- */
function buildImport(host) {
  const sec = el("section", null, "panel"); sec.id = "import";
  const form = el("form", null, "dash-form"), box = el("div", null, "impmap");
  const kind = document.createElement("select"); kind.name = "kind";
  kind.append(opt("regs", "Event registrations and attendance"), opt("talents", "Talent profiles (the talent form)"));
  const file = document.createElement("input"); file.type = "file"; file.accept = ".xlsx,.xls,.csv,text/csv";
  const lk = el("label", "What is in the file? "); lk.appendChild(kind);
  const lf = el("label", "Excel or CSV file "); lf.appendChild(file);
  const msg = el("p"); msg.setAttribute("role", "status");
  form.append(lk, lf, box, msg); form.onsubmit = e => e.preventDefault();
  sec.append(el("h2", "Import from Google Sheets"),
    el("p", "Choose an Excel file (.xlsx) or a CSV file. In Google Sheets use File → Download → Microsoft Excel (.xlsx). If the file has several sheets (tabs), you can pick which one. Nothing is saved until you press an Import button."),
    el("p", "Imported files contain people's personal data. Keep the downloaded file private and delete it when you are done.", "warn"), form);
  host.appendChild(sec);

  async function build() {
    box.textContent = ""; msg.textContent = "";
    const f = file.files[0]; if (!f) return;
    const isExcel = /\.xlsx?$/i.test(f.name);
    if (f.size > (isExcel ? 8e6 : 5e6)) { msg.textContent = "That file is too big (over " + (isExcel ? 8 : 5) + " MB)."; return; }
    let sheets;
    if (isExcel) msg.textContent = "Reading the Excel file…";
    try { sheets = isExcel ? await readSheets(f) : { "CSV file": parseCSV(await f.text()) }; }
    catch (e) { msg.textContent = isExcel ? "Could not read the Excel file (" + e.message + "). In Google Sheets try File → Download → CSV instead." : "Could not read that file."; return; }
    msg.textContent = "";
    const names = Object.keys(sheets), picker = el("div"), mapBox = el("div");
    box.append(picker, mapBox);
    const render = rows => {
      mapBox.textContent = "";
      if (rows.length < 2) { mapBox.appendChild(el("p", "This sheet has no data rows. Pick another sheet.", "warn")); return; }
      const headers = rows[0].map((h, i) => h.trim() || "Column " + (i + 1)), data = rows.slice(1);
      mapBox.appendChild(el("p", data.length + " rows found. Check that the columns below are right."));
      if (kind.value === "regs") mapRegs(mapBox, headers, data, msg); else mapTalents(mapBox, headers, data, msg);
    };
    const best = names.reduce((x, n) => (sheets[n].length > sheets[x].length ? n : x), names[0]);   // the sheet with the most rows
    if (names.length > 1) {
      const sel = document.createElement("select"), l = el("label", "Which sheet (tab) of the Excel file? ");
      names.forEach(n => sel.appendChild(opt(n, n + " (" + Math.max(0, sheets[n].length - 1) + " rows)")));
      sel.value = best; sel.onchange = () => render(sheets[sel.value]); l.appendChild(sel); picker.appendChild(l);
    }
    render(sheets[best]);
  }
  file.addEventListener("change", build); kind.addEventListener("change", build);
}

async function mapRegs(box, headers, data, msg) {
  let events = [];
  try {
    const s = await getDocs(collection(db, "events"));
    events = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => new Date(b.start) - new Date(a.start));
  } catch (e) { msg.textContent = "Could not load events: " + e.message; return; }
  if (!events.length) { box.appendChild(el("p", "Create the event first (Events → Post an event, with its real date and times), then come back here.", "warn")); return; }

  const evSel = document.createElement("select");
  events.forEach(e => evSel.appendChild(opt(e.id, e.title + " · " + String(e.start || "").slice(0, 10))));
  const le = el("label", "Which event are these registrations for? "); le.appendChild(evSel);
  const nameC = colSelect(headers, "Name column", H.name, false);
  const idC = colSelect(headers, "Student ID column (optional)", H.id, true);
  const emailC = colSelect(headers, "Email column (optional)", H.email, true);
  const attC = colSelect(headers, "Attended column (optional)", H.att, true);
  const rateC = colSelect(headers, "Rating column (optional)", H.rate, true);
  const fbC = colSelect(headers, "Feedback column (optional)", H.fb, true);
  const noteC = colSelect(headers, "Note column (optional)", H.note, true);
  const words = document.createElement("input"); words.value = "attended, walk in, yes, حضر, نعم";
  const lw = el("label", "A cell counts as \"attended\" if it STARTS with one of these (separate with commas) "); lw.appendChild(words);
  box.append(le, nameC.l, idC.l, emailC.l, attC.l, rateC.l, fbC.l, noteC.l, lw,
    el("h4", "Other columns to keep"), el("p", "Untick anything the club doesn't need. Columns you picked above are saved automatically.", "hint"));
  const used = () => new Set([nameC, idC, emailC, attC, rateC, fbC, noteC].map(c => +c.s.value));
  const checks = headers.map(h => {
    const l = el("label", " " + h, "check"), c = document.createElement("input");
    c.type = "checkbox"; c.checked = H.keep.test(h) && !H.skip.test(h); l.prepend(c); box.appendChild(l); return c;
  });
  const prev = el("p", null, "hint"), go = el("button", "Import registrations"), wipe = el("button", "Delete the imported rows of this event", "danger");
  go.type = "button"; wipe.type = "button"; box.append(prev, go, wipe);

  const parse = () => {
    const ev = events.find(e => e.id === evSel.value), W = words.value.split(",").map(s => s.trim().toLowerCase()).filter(Boolean), u = used();
    const ni = +nameC.s.value, si = +idC.s.value, ei = +emailC.s.value, ai = +attC.s.value, ri = +rateC.s.value, fi = +fbC.s.value, oi = +noteC.s.value;
    const get = (r, i) => (i >= 0 ? String(r[i] ?? "").trim() : "");
    const idCount = {}; data.forEach(r => { const s = get(r, si); if (s) idCount[s] = (idCount[s] || 0) + 1; });
    const items = [];
    data.forEach((r, n) => {
      const name = get(r, ni); let email = get(r, ei).toLowerCase(); if (!EMAIL_RE.test(email)) email = "";
      const sid = get(r, si); if (!name && !email && !sid) return;
      const att = get(r, ai).toLowerCase(), rating = parseFloat(get(r, ri));
      const key = sid ? (idCount[sid] === 1 ? sid : sid + "_r" + (n + 2)) : "r" + (n + 2);   // repeated IDs are kept as separate rows
      const details = []; headers.forEach((h, i) => { const v = get(r, i); if (checks[i].checked && !u.has(i) && v) details.push({ label: h, value: v.slice(0, 500) }); });
      items.push({ id: ev.id + "_imp_" + safeId(key), data: { eventId: ev.id, eventTitle: ev.title, uid: null, name: (name || email || sid).slice(0, 120), studentId: sid.slice(0, 40), email,
        checkedIn: !!att && W.some(w => att.startsWith(w)), walkIn: att.startsWith("walk"), arrivedAt: (att.match(/\(([^)]+)\)/) || [])[1] || "",
        rating: Number.isFinite(rating) ? rating : null, feedback: get(r, fi).slice(0, 1500), note: get(r, oi).slice(0, 500),
        details, imported: true, createdAt: serverTimestamp() } });
    });
    return { items, ev, repeated: Object.values(idCount).filter(c => c > 1).length };
  };
  const preview = () => {
    const { items, repeated } = parse(), d = items.map(i => i.data);
    prev.textContent = items.length + " people · " + d.filter(x => x.checkedIn).length + " attended (" + d.filter(x => x.walkIn).length + " walk-ins) · "
      + d.filter(x => x.rating !== null).length + " ratings · " + d.filter(x => x.feedback).length + " feedback · " + repeated + " repeated Student IDs · first: "
      + (items[0] ? items[0].data.name : "-");
  };
  [evSel, nameC.s, idC.s, emailC.s, attC.s, rateC.s, fbC.s, noteC.s, words].forEach(c => c.addEventListener("input", preview)); preview();

  go.onclick = async () => {
    const { items, ev } = parse();
    if (!items.length) { msg.textContent = "Nothing to import. Check the Name column."; return; }
    if (!confirm("Import " + items.length + " registrations into \"" + ev.title + "\"? (" + items.filter(i => i.data.checkedIn).length + " marked as attended)")) return;
    go.disabled = true;
    try { await commit("registrations", items, msg); msg.textContent = "Done: " + items.length + " registrations imported. See them in Events → Registrations, or search in People."; }
    catch (e) { msg.textContent = "Stopped: " + e.message; }
    go.disabled = false;
  };
  wipe.onclick = async () => {
    const ev = events.find(e => e.id === evSel.value);
    if (!confirm("Delete ALL imported registrations of \"" + ev.title + "\"? Registrations made by members on the website are not touched.")) return;
    wipe.disabled = true;
    try {
      const s = await getDocs(query(collection(db, "registrations"), where("eventId", "==", ev.id), where("imported", "==", true)));
      for (let i = 0; i < s.docs.length; i += 400) { const b = writeBatch(db); s.docs.slice(i, i + 400).forEach(d => b.delete(d.ref)); await b.commit(); }
      msg.textContent = "Deleted " + s.docs.length + " imported registrations.";
    } catch (e) { msg.textContent = "Stopped: " + e.message; }
    wipe.disabled = false;
  };
}

function mapTalents(box, headers, data, msg) {
  const nameC = colSelect(headers, "Name column", H.name, false);
  const emailC = colSelect(headers, "Email column (needed, it links people to their login)", H.email, false);
  box.append(nameC.l, emailC.l, el("h4", "Columns to import"),
    el("p", "Untick anything the club doesn't need, such as phone numbers. Members will see their own answers.", "hint"));
  const checks = headers.map(h => {
    const l = el("label", " " + h, "check"), c = document.createElement("input");
    c.type = "checkbox"; c.checked = !H.skip.test(h); l.prepend(c); box.appendChild(l); return c;
  });
  const go = el("button", "Import talent profiles"); go.type = "button"; box.appendChild(go);

  go.onclick = async () => {
    const ni = +nameC.s.value, ei = +emailC.s.value, items = []; let skipped = 0;
    data.forEach(r => {
      const email = (r[ei] || "").trim().toLowerCase();
      if (!EMAIL_RE.test(email)) { skipped++; return; }
      const fields = [];
      headers.forEach((h, i) => { const v = (r[i] || "").trim(); if (checks[i].checked && i !== ni && i !== ei && v) fields.push({ label: h, value: v.slice(0, 1000) }); });
      items.push({ id: email.replace(/[\/\\]/g, "_"), data: { name: ((r[ni] || "").trim() || email.split("@")[0]).slice(0, 120), email, fields, source: "import", importedAt: serverTimestamp() } });
    });
    if (!items.length) { msg.textContent = "Nothing to import. Check the Email column."; return; }
    const odd = items.filter(i => !i.data.email.endsWith("@" + settings.uniDomain)).map(i => i.data.email);
    if (!confirm("Import " + items.length + " talent profiles? (" + skipped + " rows skipped because they have no valid email.)" +
      (odd.length ? "\n\n" + odd.length + " email(s) are not @" + settings.uniDomain + ", please check them: " + odd.join(", ") : "") +
      "\n\nImporting again later updates the same people.")) return;
    go.disabled = true;
    try {
      await commit("talents", items, msg);
      msg.textContent = "Done: " + items.length + " profiles imported, " + skipped + " skipped (no valid email).";
      document.dispatchEvent(new Event("acl-talents"));
    } catch (e) { msg.textContent = "Stopped: " + e.message; }
    go.disabled = false;
  };
}
