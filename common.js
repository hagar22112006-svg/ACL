import { db } from "./auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// ----- dates: every event has a start and an end (events saved without an end count as 2 hours long) -----
export const fmt = d => new Date(d).toLocaleString([], { dateStyle: "full", timeStyle: "short" });
const day = d => new Date(d).toLocaleDateString([], { dateStyle: "full" });
const time = d => new Date(d).toLocaleTimeString([], { timeStyle: "short" });
export const endDate = e => (e.end ? new Date(e.end) : new Date(new Date(e.start).getTime() + 2 * 36e5));
export const isPast = e => endDate(e) < new Date();
// "Thursday, 29 October 2026 · 12:00 PM – 3:00 PM"
export function fmtRange(start, end) {
  const s = new Date(start), e = new Date(end);
  if (s.toDateString() === e.toDateString()) return day(s) + " · " + time(s) + " – " + time(e);
  return fmt(s) + " → " + fmt(e);
}

// Fills any element that has data-site="something" with text the leaders saved.
// If nothing was saved, the text already written in the HTML stays.
export async function applySiteContent() {
  try {
    const s = await getDoc(doc(db, "site", "content"));
    if (!s.exists()) return;
    const d = s.data();
    document.querySelectorAll("[data-site]").forEach(el => {
      const v = d[el.dataset.site];
      if (typeof v === "string" && v.trim()) el.textContent = v;
    });
  } catch (e) { console.error(e); }
}

// Mixed-up "ransom note" tiles, like the club posters.
// Latin text: one tile per letter, grouped by word so a word never breaks across lines.
// Arabic text: letters must stay joined, so each WORD is one tile.
export function ransom(el, text) {
  const styles = ["a", "b", "c", "d", "e"];
  const arabic = /[\u0600-\u06FF]/.test(text);
  el.setAttribute("aria-label", text); el.textContent = "";
  let i = 0;
  text.split(" ").filter(Boolean).forEach(word => {
    const w = document.createElement("span"); w.className = "word";
    (arabic ? [word] : [...word]).forEach(piece => {
      const s = document.createElement("span");
      s.className = "l " + styles[(i * 3 + 1) % styles.length] + (arabic ? " ar" : "");
      s.style.transform = "rotate(" + (((i * 7) % 9) - 4) + "deg)";
      s.textContent = piece; s.setAttribute("aria-hidden", "true");
      w.appendChild(s); i++;
    });
    el.appendChild(w);
  });
}

let timer;
// Needs elements with ids next-title, next-date, countdown. Shows the next event (or the one happening now).
export function renderHero(events) {
  clearInterval(timer);
  const titleEl = document.getElementById("next-title"), dateEl = document.getElementById("next-date"), cdEl = document.getElementById("countdown");
  const next = events.filter(e => endDate(e) > new Date()).sort((a, b) => new Date(a.start) - new Date(b.start))[0];
  cdEl.textContent = "";
  if (!next) { ransom(titleEl, "Welcome to ACL"); dateEl.textContent = "No upcoming events yet. Check back soon!"; return; }
  ransom(titleEl, next.title);
  dateEl.textContent = fmtRange(next.start, endDate(next)) + " · " + next.place;
  const tick = () => {
    const now = new Date(), diff = new Date(next.start) - now;
    if (diff <= 0) { cdEl.textContent = now < endDate(next) ? "Happening now" : "Finished"; return; }
    const v = [Math.floor(diff / 864e5), Math.floor(diff / 36e5) % 24, Math.floor(diff / 6e4) % 60, Math.floor(diff / 1e3) % 60];
    cdEl.textContent = "";
    v.forEach((n, i) => {
      const box = document.createElement("div"), num = document.createElement("strong"), label = document.createElement("span");
      num.textContent = n; label.textContent = ["days", "hours", "min", "sec"][i];
      box.append(num, label); cdEl.appendChild(box);
    });
  };
  tick(); timer = setInterval(tick, 1000);
}
