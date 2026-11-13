// The "Bloopers" section: behind-the-scenes clips and the semester movie. Verified members only.
import { db, onUser } from "./auth.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { safeVideo, safeDriveId, autoplayWhenVisible } from "./media-util.js";

const el = (tag, text, cls) => { const e = document.createElement(tag); if (text) e.textContent = text; if (cls) e.className = cls; return e; };
const box = document.getElementById("bloopersList");

function player(b) {
  if (b.source === "drive" && safeDriveId(b.driveId)) {
    const f = document.createElement("iframe");
    f.src = "https://drive.google.com/file/d/" + b.driveId + "/preview";
    f.title = "Video: " + b.title; f.loading = "lazy"; f.allowFullscreen = true;
    f.setAttribute("allow", "fullscreen"); f.setAttribute("referrerpolicy", "no-referrer");
    f.setAttribute("sandbox", "allow-scripts allow-same-origin allow-presentation");
    f.className = "embed"; return f;
  }
  if (safeVideo(b.file)) {
    const v = document.createElement("video");
    v.controls = true; v.preload = "metadata"; v.playsInline = true; v.src = b.file; v.setAttribute("aria-label", "Video: " + b.title);
    autoplayWhenVisible(v);
    v.onerror = () => v.replaceWith(el("p", "This video could not be loaded.", "msg"));
    return v;
  }
  return el("p", "This video is not available.", "msg");
}

onUser(async p => {
  if (!box || !p || p.role === "leader") return;
  if (!p.approved) { box.textContent = ""; return; }   // guest-ui.js shows the "locked" note
  box.textContent = "Loading…";
  let list = [];
  try { list = (await getDocs(collection(db, "bloopers"))).docs.map(d => ({ id: d.id, ...d.data() })); }
  catch (e) { box.textContent = "Could not load the bloopers."; return; }
  box.textContent = "";
  if (!list.length) { box.textContent = "The first bloopers are coming soon. Stay tuned!"; return; }
  list.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || String(b.season || "").localeCompare(String(a.season || "")) || String(a.title).localeCompare(String(b.title)));
  list.forEach(b => {
    const c = el("article", null, "form-card" + (b.featured ? " featured" : ""));
    c.appendChild(el("h3", b.title));
    if (b.featured) c.appendChild(el("span", "Semester movie", "badge on"));
    else if (b.season) c.appendChild(el("span", b.season, "badge off"));
    c.appendChild(player(b));
    if (b.description) c.appendChild(el("p", b.description));
    box.appendChild(c);
  });
});
