// A pop-up when someone opens the member site and an event is coming soon:
// the poster, the trailer (muted, it starts by itself), the date and a Register button.
import { db } from "./auth.js";
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { fmtRange, endDate } from "./common.js";
import { safeImg, safeVideo } from "./media-util.js";

const SOON_DAYS = 14;   // an event starting within this many days triggers the pop-up
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const el = (tag, text, cls) => { const e = document.createElement(tag); if (text) e.textContent = text; if (cls) e.className = cls; return e; };
let shown = false;

function when(e) {
  const now = new Date(), s = new Date(e.start);
  if (s <= now) return "Happening now!";
  const mins = (s - now) / 6e4;
  if (mins < 60) return "Starts in " + Math.max(1, Math.round(mins)) + " minutes";
  const days = Math.round((new Date(s.getFullYear(), s.getMonth(), s.getDate()) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 864e5);
  const at = s.toLocaleTimeString([], { timeStyle: "short" });
  return days === 0 ? "Today at " + at : days === 1 ? "Tomorrow at " + at : "In " + days + " days";
}

function openPopup(e, poster, trailer, key) {
  const dlg = document.createElement("dialog"); dlg.className = "wide welcome"; dlg.setAttribute("aria-labelledby", "welcomeTitle");
  const x = el("button", "×", "x"); x.type = "button"; x.setAttribute("aria-label", "Close");
  const h = el("h2", e.title); h.id = "welcomeTitle";
  dlg.append(x, el("p", "COMING UP · " + when(e), "kicker"), h);
  if (poster || trailer) {
    const media = el("div", null, "media-pair");
    if (poster) { const i = el("img"); i.src = poster.data; i.alt = "Poster for " + e.title; media.appendChild(i); }
    if (trailer) {
      const v = document.createElement("video");
      v.src = trailer.file; v.controls = true; v.muted = true; v.loop = true; v.playsInline = true; v.autoplay = !reduce;
      v.setAttribute("aria-label", "Trailer for " + e.title); media.appendChild(v);
    }
    dlg.appendChild(media);
  }
  dlg.appendChild(el("p", fmtRange(e.start, endDate(e)) + " · " + e.place, "when"));
  if (e.about) dlg.appendChild(el("p", e.about.length > 220 ? e.about.slice(0, 220) + "…" : e.about));
  const actions = el("div", null, "actions"), go = el("button", "Register / see details", "cta"), later = el("button", "Maybe later", "cta ghost");
  go.type = "button"; later.type = "button";
  const never = document.createElement("input"); never.type = "checkbox";
  const nl = el("label", " Don't show this again for this event", "check"); nl.prepend(never);
  actions.append(go, later); dlg.append(actions, nl);
  document.body.appendChild(dlg);

  const remember = () => { try { sessionStorage.setItem(key, "1"); if (never.checked) localStorage.setItem(key + "-never", "1"); } catch (err) { /* ignore */ } };
  x.onclick = later.onclick = () => dlg.close();
  go.onclick = () => { dlg.close(); location.hash = "#view-events"; document.dispatchEvent(new CustomEvent("acl-show-event", { detail: e.id })); };
  dlg.addEventListener("close", () => { remember(); dlg.remove(); });
  dlg.showModal();
  const v = dlg.querySelector("video"); if (v && !reduce) v.play().catch(() => {});
}

// member.js announces the events once they are loaded
document.addEventListener("acl-events", async ev => {
  if (shown) return;
  const now = new Date();
  const soon = ev.detail.filter(e => endDate(e) > now && new Date(e.start) - now < SOON_DAYS * 864e5).sort((a, b) => new Date(a.start) - new Date(b.start))[0];
  if (!soon) return;
  const key = "acl-popup-" + soon.id;
  try { if (localStorage.getItem(key + "-never") || sessionStorage.getItem(key)) return; } catch (err) { /* ignore */ }   // once per visit
  shown = true;
  let poster = null, trailer = null;
  try { poster = (await getDocs(query(collection(db, "posters"), where("eventTitle", "==", soon.title)))).docs.map(d => d.data()).find(p => safeImg(p.data)) || null; } catch (err) { console.error(err); }
  try { trailer = (await getDocs(query(collection(db, "trailers"), where("eventTitle", "==", soon.title)))).docs.map(d => d.data()).find(t => safeVideo(t.file)) || null; } catch (err) { console.error(err); }
  openPopup(soon, poster, trailer, key);
});
