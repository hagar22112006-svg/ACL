import { db, onUser } from "./auth.js";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { shrinkImage, safeVideo, safeImg } from "./media-util.js";

const $ = id => document.getElementById(id);
function el(tag, text, cls) { const e = document.createElement(tag); if (text) e.textContent = text; if (cls) e.className = cls; return e; }
const byTitle = (a, b) => String(a.title).localeCompare(String(b.title));
async function all(col) { const s = await getDocs(collection(db, col)); return s.docs.map(d => ({ id: d.id, ...d.data() })); }

onUser(p => { if (!p || p.role !== "leader") return; loadEventOptions(); loadPosters(); loadTrailers(); loadAlbums(); });

/* ---------- Posters ---------- */
async function loadEventOptions() {
  const sel = $("posterEvent");
  try {
    (await all("events")).sort((a, b) => new Date(a.start) - new Date(b.start))
      .forEach(e => { const o = el("option", e.title); o.value = e.title; sel.appendChild(o); const t2 = $("trailerEvent"); if (t2) t2.appendChild(o.cloneNode(true)); });
  } catch (e) { console.error(e); }
}
async function loadPosters() {
  const box = $("posterAdmin"); box.textContent = "Loading…";
  let list = [];
  try { list = (await all("posters")).sort(byTitle); } catch (e) { box.textContent = "Could not load: " + e.message; return; }
  box.textContent = ""; if (!list.length) { box.textContent = "No posters yet."; return; }
  list.forEach(p => {
    const row = el("div", null, "ev-row");
    if (safeImg(p.data)) { const i = el("img", null, "mini"); i.src = p.data; i.alt = ""; row.appendChild(i); }
    row.appendChild(el("span", p.title + (p.eventTitle ? " · " + p.eventTitle : "")));
    const del = el("button", "Delete", "danger");
    del.onclick = async () => {
      if (!confirm("Delete the poster \"" + p.title + "\"?")) return;
      try { await deleteDoc(doc(db, "posters", p.id)); loadPosters(); } catch (e) { alert(e.message); }
    };
    row.appendChild(del); box.appendChild(row);
  });
}
$("posterForm").addEventListener("submit", async ev => {
  ev.preventDefault(); const f = ev.target, x = f.elements, m = $("posterMsg"), btn = f.querySelector("button[type=submit]");
  m.textContent = "Adding…"; btn.disabled = true;
  try {
    const data = await shrinkImage(x.file.files[0], 1200, 0.78);
    await addDoc(collection(db, "posters"), { title: x.title.value.trim(), eventTitle: x.eventTitle.value, data, createdAt: serverTimestamp() });
    f.reset(); m.textContent = "Poster added."; loadPosters();
  } catch (e) { m.textContent = "Could not add: " + e.message; }
  btn.disabled = false;
});

/* ---------- Trailers (video files kept in the site's "videos" folder) ---------- */
async function loadTrailers() {
  const box = $("trailerAdmin"); box.textContent = "Loading…";
  let list = [];
  try { list = (await all("trailers")).sort(byTitle); } catch (e) { box.textContent = "Could not load: " + e.message; return; }
  box.textContent = ""; if (!list.length) { box.textContent = "No trailers yet."; return; }
  list.forEach(t => {
    const row = el("div", null, "ev-row");
    row.appendChild(el("span", t.title + " · " + t.file));
    const del = el("button", "Delete", "danger");
    del.onclick = async () => {
      if (!confirm("Remove the trailer \"" + t.title + "\" from the site?")) return;
      try { await deleteDoc(doc(db, "trailers", t.id)); loadTrailers(); } catch (e) { alert(e.message); }
    };
    row.appendChild(del); box.appendChild(row);
  });
}
$("trailerForm").addEventListener("submit", async ev => {
  ev.preventDefault(); const f = ev.target, x = f.elements, m = $("trailerMsg");
  const file = x.file.value.trim();
  if (!safeVideo(file)) { m.textContent = "The file must look like videos/my-trailer.mp4 (letters, numbers, - and _ only; .mp4 or .webm)."; return; }
  try {
    await addDoc(collection(db, "trailers"), { title: x.title.value.trim(), file, description: x.description.value.trim(), eventTitle: x.eventTitle ? x.eventTitle.value : "", createdAt: serverTimestamp() });
    f.reset(); m.textContent = "Trailer added."; loadTrailers();
  } catch (e) { m.textContent = "Could not add: " + e.message; }
});

/* ---------- Memories: albums + photos ---------- */
let albums = [], editingAlbum = null;
const albumForm = $("albumForm"), albumMsg = $("albumMsg"), albumCancel = $("albumCancel");

async function loadAlbums() {
  const box = $("albumAdmin"); box.textContent = "Loading…";
  try { albums = (await all("albums")).sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))); }
  catch (e) { box.textContent = "Could not load: " + e.message; return; }
  box.textContent = ""; if (!albums.length) { box.textContent = "No albums yet."; return; }
  albums.forEach(a => {
    const row = el("div", null, "ev-row");
    row.appendChild(el("span", a.title + (a.date ? " · " + a.date : "")));
    const ph = el("button", "Photos"); ph.onclick = () => openAlbum(a);
    const ed = el("button", "Edit"); ed.onclick = () => startAlbumEdit(a);
    const del = el("button", "Delete", "danger");
    del.onclick = async () => {
      if (!confirm("Delete the album \"" + a.title + "\" and all its photos?")) return;
      try {
        const s = await getDocs(query(collection(db, "photos"), where("albumId", "==", a.id)));
        await Promise.all(s.docs.map(d => deleteDoc(d.ref)));
        await deleteDoc(doc(db, "albums", a.id));
        $("photoPanel").textContent = ""; if (editingAlbum === a.id) stopAlbumEdit(); loadAlbums();
      } catch (e) { alert("Could not delete: " + e.message); }
    };
    row.append(ph, ed, del); box.appendChild(row);
  });
}
function stopAlbumEdit() { editingAlbum = null; albumForm.reset(); $("albumHeading").textContent = "New album"; albumCancel.hidden = true; }
function startAlbumEdit(a) {
  editingAlbum = a.id; const x = albumForm.elements;
  x.title.value = a.title || ""; x.date.value = a.date || ""; x.recap.value = a.recap || "";
  $("albumHeading").textContent = "Edit: " + a.title; albumCancel.hidden = false; albumMsg.textContent = "";
  albumForm.scrollIntoView({ behavior: "smooth" });
}
albumCancel.onclick = stopAlbumEdit;
albumForm.addEventListener("submit", async ev => {
  ev.preventDefault(); albumMsg.textContent = ""; const x = albumForm.elements;
  const data = { title: x.title.value.trim(), date: x.date.value, recap: x.recap.value.trim() };
  try {
    if (editingAlbum) await updateDoc(doc(db, "albums", editingAlbum), data);
    else await addDoc(collection(db, "albums"), { ...data, createdAt: serverTimestamp() });
    stopAlbumEdit(); albumMsg.textContent = "Saved."; loadAlbums();
  } catch (e) { albumMsg.textContent = "Could not save: " + e.message; }
});

async function openAlbum(a) {
  const panel = $("photoPanel"); panel.textContent = "Loading…";
  let photos = [];
  try {
    const s = await getDocs(query(collection(db, "photos"), where("albumId", "==", a.id)));
    photos = s.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) { panel.textContent = "Could not load: " + e.message; return; }
  panel.textContent = ""; panel.appendChild(el("h3", "Photos: " + a.title + " (" + photos.length + ")"));
  const grid = el("div", null, "media-grid");
  photos.forEach(p => {
    const fig = el("figure", null, "thumb");
    if (safeImg(p.data)) { const i = el("img"); i.src = p.data; i.alt = "Photo from " + a.title; fig.appendChild(i); }
    const rm = el("button", "Remove", "danger"); rm.type = "button";
    rm.onclick = async () => { try { await deleteDoc(doc(db, "photos", p.id)); openAlbum(a); } catch (e) { alert(e.message); } };
    fig.appendChild(rm); grid.appendChild(fig);
  });
  panel.appendChild(grid);
  const f = el("form", null, "dash-form"), file = document.createElement("input");
  file.type = "file"; file.accept = "image/*"; file.multiple = true; file.required = true;
  const lab = el("label", "Add photos (up to 10 at a time) "); lab.appendChild(file);
  const btn = el("button", "Upload photos"); btn.type = "submit";
  const m = el("p"); m.setAttribute("role", "status");
  f.append(lab, btn, m);
  f.onsubmit = async ev => {
    ev.preventDefault(); btn.disabled = true;
    const files = [...file.files].slice(0, 10);
    try {
      for (let i = 0; i < files.length; i++) {
        m.textContent = "Uploading " + (i + 1) + " of " + files.length + "…";
        const data = await shrinkImage(files[i], 1000, 0.72);
        await addDoc(collection(db, "photos"), { albumId: a.id, data, createdAt: serverTimestamp() });
      }
      openAlbum(a);
    } catch (e) { m.textContent = "Stopped: " + e.message; btn.disabled = false; }
  };
  panel.appendChild(f); panel.scrollIntoView({ behavior: "smooth" });
}