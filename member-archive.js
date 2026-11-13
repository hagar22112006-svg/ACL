// The "Past events" section: what happened, the posters and cards, and the photo album. No registering.
import { db } from "./auth.js";
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { fmtRange, endDate, isPast } from "./common.js";
import { safeImg } from "./media-util.js";

const el = (tag, text, cls) => { const e = document.createElement(tag); if (text) e.textContent = text; if (cls) e.className = cls; return e; };
const dlg = document.createElement("dialog"); dlg.className = "wide"; document.body.appendChild(dlg);

export function renderPast(events) {
  const box = document.getElementById("pastList"); if (!box) return;
  box.textContent = "";
  const past = events.filter(isPast).sort((a, b) => new Date(b.start) - new Date(a.start));
  if (!past.length) { box.textContent = "Past events will appear here after our first event."; return; }
  past.forEach(e => {
    const c = el("article", null, "form-card");
    c.append(el("h3", e.title), el("span", "Finished", "badge off"), el("p", fmtRange(e.start, endDate(e)) + " · " + e.place, "when"));
    if (e.recap) c.appendChild(el("p", e.recap.length > 160 ? e.recap.slice(0, 160) + "…" : e.recap, "recap"));
    const b = el("button", "See what happened"); b.type = "button"; b.onclick = () => openArchive(e);
    c.appendChild(b); box.appendChild(c);
  });
}

export async function openArchive(e) {
  dlg.textContent = "";
  dlg.append(el("h2", e.title), el("p", fmtRange(e.start, endDate(e)) + " · " + e.place, "when"),
    el("span", "This event is over, registration is closed.", "badge off"));
  if (e.about) dlg.append(el("h3", "About the event"), el("p", e.about, "recap"));
  dlg.append(el("h3", "What happened"), el("p", e.recap || "The leaders haven't written the recap yet.", "recap"));
  const posters = el("div"), albums = el("div");
  const close = el("button", "Close", "cta"); close.type = "button"; close.onclick = () => dlg.close();
  dlg.append(posters, albums, close); dlg.showModal();

  // posters and cards that the leaders linked to this event
  try {
    const s = await getDocs(query(collection(db, "posters"), where("eventTitle", "==", e.title)));
    const list = s.docs.map(d => d.data()).filter(p => safeImg(p.data));
    if (list.length) {
      posters.appendChild(el("h3", "Posters and cards"));
      const row = el("div", null, "poster-row");
      list.forEach(p => { const f = el("figure"); const i = el("img"); i.src = p.data; i.alt = "Poster: " + p.title; i.loading = "lazy"; f.append(i, el("figcaption", p.title)); row.appendChild(f); });
      posters.appendChild(row);
    }
  } catch (err) { console.error(err); }

  // photo albums from the same day (or with the same name). Photos are for verified members only.
  try {
    const all = (await getDocs(collection(db, "albums"))).docs.map(d => ({ id: d.id, ...d.data() }));
    const day = String(e.start).slice(0, 10), name = String(e.title).trim().toLowerCase();
    const mine = all.filter(a => a.date === day || String(a.title || "").trim().toLowerCase() === name);
    for (const a of mine) {
      albums.append(el("h3", "Photos: " + a.title), a.recap ? el("p", a.recap, "recap") : el("span"));
      const s = await getDocs(query(collection(db, "photos"), where("albumId", "==", a.id)));
      const grid = el("div", null, "media-grid");
      s.docs.map(d => d.data()).filter(p => safeImg(p.data)).forEach(p => { const i = el("img"); i.src = p.data; i.alt = "Photo from " + e.title; i.loading = "lazy"; grid.appendChild(i); });
      albums.appendChild(grid);
    }
  } catch (err) {
    albums.appendChild(el("p", "Photos are for verified university members. Log in with your university account to see them.", "locked"));
  }
}
