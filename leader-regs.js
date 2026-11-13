import { db } from "./auth.js";
import { collection, getDocs, query, where, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const el = (tag, text, cls) => { const e = document.createElement(tag); if (text) e.textContent = text; if (cls) e.className = cls; return e; };
function csvOut(rows, filename) {
  const q = v => { let s = String(v ?? ""); if (/^[=+\-@]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
  const url = URL.createObjectURL(new Blob(["\uFEFF" + rows.map(r => r.map(q).join(",")).join("\n")], { type: "text/csv" }));
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}

// The registrations report for one event (called from the Events list)
export async function showRegs(e) {
  const panel = document.getElementById("regPanel"); panel.textContent = "Loading…";
  let regs;
  try { regs = (await getDocs(query(collection(db, "registrations"), where("eventId", "==", e.id)))).docs.map(d => ({ id: d.id, ...d.data() })); }
  catch (err) { panel.textContent = "Could not load: " + err.message; return; }
  regs.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  panel.textContent = "";
  panel.appendChild(el("h3", e.title + " · registrations"));
  const sum = el("div", null, "sumrow"); panel.appendChild(sum);
  const fill = () => {
    const rated = regs.filter(r => Number.isFinite(r.rating));
    const avg = rated.length ? (rated.reduce((s, r) => s + r.rating, 0) / rated.length).toFixed(1) : "–";
    sum.textContent = "";
    [[regs.length, "registered"], [regs.filter(r => r.checkedIn).length, "arrived"], [regs.filter(r => r.walkIn).length, "walk-ins"],
     [avg, "avg rating (" + rated.length + ")"], [regs.filter(r => r.feedback).length, "feedback"]].forEach(([n, t]) => {
      const c = el("div", null, "sumcard"); c.append(el("strong", String(n)), el("span", t)); sum.appendChild(c);
    });
  };
  fill();
  if (!regs.length) return;

  const lab = el("label", "Search this list ", "search"), find = document.createElement("input"); find.type = "search"; find.autocomplete = "off"; lab.appendChild(find);
  const wrap = el("div", null, "table-wrap"), tbl = document.createElement("table"), head = document.createElement("tr");
  ["Arrived", "Name", "Student ID", "Email", "Notes", "Rating"].forEach(x => head.appendChild(el("th", x))); tbl.appendChild(head);
  const rows = regs.map(r => {
    const tr = document.createElement("tr"), c1 = document.createElement("td"), cb = document.createElement("input");
    cb.type = "checkbox"; cb.checked = !!r.checkedIn; cb.setAttribute("aria-label", "Arrived: " + r.name);
    cb.onchange = async () => {
      try { await updateDoc(doc(db, "registrations", r.id), { checkedIn: cb.checked }); r.checkedIn = cb.checked; fill(); }
      catch (err) { alert(err.message); cb.checked = !cb.checked; }
    };
    c1.appendChild(cb);
    const notes = [r.walkIn && "walk-in", r.arrivedAt && "arrived " + r.arrivedAt, r.note].filter(Boolean).join(" · ");
    tr.append(c1, el("td", r.name || ""), el("td", r.studentId || ""), el("td", r.email || ""), el("td", notes), el("td", String(r.rating ?? "")));
    tbl.appendChild(tr);
    return { tr, hay: (r.name + " " + (r.studentId || "") + " " + (r.email || "")).toLowerCase() };
  });
  find.addEventListener("input", () => { const t = find.value.trim().toLowerCase(); rows.forEach(x => { x.tr.hidden = !!t && !x.hay.includes(t); }); });
  wrap.appendChild(tbl); panel.append(lab, wrap);

  const fb = regs.filter(r => r.feedback);
  if (fb.length) {
    const d = el("details"), ul = el("ul");
    d.appendChild(el("summary", "Feedback (" + fb.length + ")"));
    fb.forEach(r => ul.appendChild(el("li", (r.name || "?") + ": " + r.feedback)));
    d.appendChild(ul); panel.appendChild(d);
  }
  const ex = el("button", "Export to CSV", "export"); ex.type = "button";
  ex.onclick = () => {
    const labels = [...new Set(regs.flatMap(r => (r.details || []).map(d => d.label)))];
    csvOut([["Name", "Student ID", "Email", "Arrived", "Walk-in", "Arrival time", "Rating", "Feedback", "Note", ...labels],
      ...regs.map(r => [r.name, r.studentId || "", r.email || "", r.checkedIn ? "yes" : "no", r.walkIn ? "yes" : "", r.arrivedAt || "", r.rating ?? "", r.feedback || "", r.note || "",
        ...labels.map(l => (r.details || []).find(d => d.label === l)?.value || "")])], e.title + " registrations.csv");
  };
  panel.appendChild(ex);
}
