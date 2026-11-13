// Leaders: add, pin and delete bloopers (behind-the-scenes clips) and the semester movie.
import { db, onUser } from "./auth.js";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { safeVideo, driveIdFrom } from "./media-util.js";

const el = (tag, text, cls) => { const e = document.createElement(tag); if (text) e.textContent = text; if (cls) e.className = cls; return e; };
const opt = (v, t) => { const o = el("option", t); o.value = v; return o; };

onUser(p => {
  const sec = document.getElementById("bloopers");
  if (!p || p.role !== "leader" || !sec || sec.dataset.done) return;
  sec.dataset.done = "1";
  const list = el("div"), msg = el("p"); msg.setAttribute("role", "status");
  const form = el("form", null, "dash-form");
  const title = document.createElement("input"); title.required = true; title.maxLength = 100;
  const season = document.createElement("input"); season.maxLength = 40; season.placeholder = "Fall 2026";
  const where = document.createElement("select"); where.append(opt("drive", "A Google Drive link (best for big videos)"), opt("file", "A file in the videos folder (small clips)"));
  const src = document.createElement("input"); src.required = true; src.maxLength = 300; src.placeholder = "Paste the Google Drive share link";
  const desc = document.createElement("textarea"); desc.rows = 2; desc.maxLength = 300;
  const pin = document.createElement("input"); pin.type = "checkbox";
  const lab = (t, c, cls) => { const l = el("label", t + " ", cls); l.appendChild(c); return l; };
  where.onchange = () => { src.placeholder = where.value === "drive" ? "Paste the Google Drive share link" : "videos/my-clip.mp4"; };
  const add = el("button", "Add blooper"); add.type = "submit";
  form.append(el("h4", "Add a blooper or the semester movie"), lab("Title", title), lab("Semester or season (optional)", season), lab("Where is the video?", where),
    lab("Link or path", src), lab("Short description", desc), lab("Pin as the semester movie (shown first)", pin, "check"), add, msg);
  sec.append(el("h2", "Bloopers"),
    el("p", "Funny behind-the-scenes clips for members, and the semester movie. Big videos: upload them to your Google Drive, set sharing to \"Anyone with the link\", and paste the link. Members watch inside the website. Small clips (under about 10 MB) can go in the videos folder."),
    el("p", "Only post clips of people who agreed to be shown.", "warn"), list, form);

  async function load() {
    list.textContent = "Loading…";
    let items = [];
    try { items = (await getDocs(collection(db, "bloopers"))).docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.title).localeCompare(String(b.title))); }
    catch (e) { list.textContent = "Could not load: " + e.message; return; }
    list.textContent = ""; if (!items.length) { list.textContent = "No bloopers yet."; return; }
    items.forEach(b => {
      const row = el("div", null, "ev-row");
      row.appendChild(el("span", (b.featured ? "★ " : "") + b.title + (b.season ? " · " + b.season : "") + " · " + (b.source === "drive" ? "Google Drive" : b.file)));
      const pinB = el("button", b.featured ? "Unpin" : "Pin as movie"); pinB.type = "button";
      pinB.onclick = async () => { try { await updateDoc(doc(db, "bloopers", b.id), { featured: !b.featured }); load(); } catch (e) { alert(e.message); } };
      const del = el("button", "Delete", "danger"); del.type = "button";
      del.onclick = async () => { if (!confirm("Delete \"" + b.title + "\"?")) return; try { await deleteDoc(doc(db, "bloopers", b.id)); load(); } catch (e) { alert(e.message); } };
      row.append(pinB, del); list.appendChild(row);
    });
  }
  form.onsubmit = async ev => {
    ev.preventDefault(); msg.textContent = "";
    const data = { title: title.value.trim(), season: season.value.trim(), description: desc.value.trim(), featured: pin.checked, createdAt: serverTimestamp() };
    if (where.value === "drive") {
      const id = driveIdFrom(src.value);
      if (!id) { msg.textContent = "That doesn't look like a Google Drive file link (it should contain /d/ and a long code)."; return; }
      data.source = "drive"; data.driveId = id;
    } else {
      const f = src.value.trim();
      if (!safeVideo(f)) { msg.textContent = "The file must look like videos/my-clip.mp4 (letters, numbers, - and _ only; .mp4 or .webm)."; return; }
      data.source = "file"; data.file = f;
    }
    try { await addDoc(collection(db, "bloopers"), data); form.reset(); msg.textContent = "Added."; load(); }
    catch (e) { msg.textContent = "Could not add: " + e.message; }
  };
  load();
});
