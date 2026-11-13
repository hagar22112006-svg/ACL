import { db, onUser } from "./auth.js";
import { collection, getDocs, getCountFromServer, query, where, orderBy, limit }
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { fmtRange, endDate } from "./common.js";

const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const el = (tag, text, cls) => { const e = document.createElement(tag); if (text) e.textContent = text; if (cls) e.className = cls; return e; };
const count = q => getCountFromServer(q).then(s => s.data().count);
function countTo(node, n) {
  if (reduce || n < 2) { node.textContent = n; return; }
  const t0 = performance.now();
  const step = t => { const k = Math.min(1, (t - t0) / 900); node.textContent = Math.round(n * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
function ago(ts) {
  const d = ts && ts.toDate ? ts.toDate() : null; if (!d) return "";
  const m = Math.round((Date.now() - d) / 60000);
  if (m < 1) return "just now"; if (m < 60) return m + " min ago"; if (m < 1440) return Math.round(m / 60) + " h ago";
  return Math.round(m / 1440) + " days ago";
}
function panel(id, title) { const s = el("section", null, "panel"); s.id = id; s.appendChild(el("h2", title)); return s; }

onUser(async p => {
  const root = document.getElementById("dashRoot");
  if (!p || p.role !== "leader" || !root || root.dataset.done) return;
  root.dataset.done = "1";
  root.appendChild(el("p", "Welcome back, " + p.name + ".", "welcome"));

  /* numbers */
  const strip = el("div", null, "stats"); strip.setAttribute("role", "group"); strip.setAttribute("aria-label", "Club numbers");
  const jobs = [
    ["Members signed up", "#members", () => count(query(collection(db, "users"), where("role", "==", "member")))],
    ["Talent profiles", "#talents", () => count(collection(db, "talents"))],
    ["Upcoming events", "#manage", () => getDocs(collection(db, "events")).then(s => s.docs.filter(d => endDate(d.data()) > new Date()).length)],
    ["Event registrations", "#manage", () => count(collection(db, "registrations"))],
    ["Open auditions and forms", "#forms", () => count(query(collection(db, "forms"), where("open", "==", true)))],
    ["Waiting for a decision", "#forms", () => getDocs(collection(db, "submissions")).then(s => s.docs.filter(d => !d.data().status).length)]
  ];
  jobs.forEach(([label, href, get]) => {
    const a = el("a", null, "stat"), num = el("strong", "–"); a.href = href; a.append(num, el("span", label)); strip.appendChild(a);
    get().then(n => countTo(num, n)).catch(() => { num.textContent = "?"; });
  });
  root.appendChild(strip);

  const grid = el("div", null, "dash-grid"); root.appendChild(grid);

  /* shortcuts */
  const quick = panel("dashQuick", "Shortcuts"), q = el("div", null, "quick");
  [["📅", "Post an event", "#post"], ["🎤", "Decide on applications", "#forms"], ["🔎", "Find a person", "#finder"],
   ["📹", "Add a blooper", "#bloopers"], ["📷", "Add a poster or photos", "#media"], ["📥", "Import old data", "#view-import"], ["👀", "See the member site", "member.html?preview=member"]].forEach(([ic, t, h]) => {
    const a = el("a"); a.href = h; if (!h.startsWith("#")) { a.target = "_blank"; a.rel = "noopener"; } a.append(el("span", ic, "ico"), document.createTextNode(t)); q.appendChild(a);
  });
  quick.appendChild(q); grid.appendChild(quick);

  /* next event */
  const next = panel("dashNext", "Next event"); grid.appendChild(next);
  try {
    const evs = (await getDocs(collection(db, "events"))).docs.map(d => ({ id: d.id, ...d.data() }));
    const e = evs.filter(x => endDate(x) > new Date()).sort((a, b) => new Date(a.start) - new Date(b.start))[0];
    if (!e) next.appendChild(el("p", "No upcoming event. Post one from the shortcuts."));
    else {
      const days = Math.max(0, Math.ceil((new Date(e.start) - new Date()) / 864e5));
      next.append(el("p", e.title, "big"), el("p", fmtRange(e.start, endDate(e)) + " · " + e.place), el("p", days === 0 ? "Today!" : "In " + days + " day" + (days > 1 ? "s" : "")));
      const line = el("p", "Counting registrations…"); next.appendChild(line);
      const [reg, arr] = await Promise.all([
        count(query(collection(db, "registrations"), where("eventId", "==", e.id))),
        count(query(collection(db, "registrations"), where("eventId", "==", e.id), where("checkedIn", "==", true)))]);
      line.textContent = reg + " registered, " + arr + " arrived";
      const a = el("a", "Open registrations →"); a.href = "#manage"; next.appendChild(a);
    }
  } catch (err) { next.appendChild(el("p", "Could not load: " + err.message, "warn")); }

  /* latest sign-ups made on the website (not imported rows) */
  const recent = panel("dashRecent", "Latest sign-ups"); grid.appendChild(recent);
  try {
    const s = await getDocs(query(collection(db, "registrations"), orderBy("createdAt", "desc"), limit(25)));
    const rows = s.docs.map(d => d.data()).filter(r => !r.imported).slice(0, 8);
    if (!rows.length) recent.appendChild(el("p", "No sign-ups on the website yet."));
    else {
      const ul = el("ul", null, "recent");
      rows.forEach(r => { const li = el("li"); li.append(el("span", (r.name || "?") + " → " + (r.eventTitle || "")), el("small", ago(r.createdAt))); ul.appendChild(li); });
      recent.appendChild(ul);
    }
  } catch (err) { recent.appendChild(el("p", "Could not load: " + err.message, "warn")); }
});
