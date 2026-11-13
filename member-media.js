import { db, onUser } from "./auth.js";
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { safeVideo, safeImg, autoplayWhenVisible } from "./media-util.js";

function el(tag, text, cls) { const e = document.createElement(tag); if (text) e.textContent = text; if (cls) e.className = cls; return e; }
const $ = id => document.getElementById(id);
async function all(col) { const s = await getDocs(collection(db, col)); return s.docs.map(d => ({ id: d.id, ...d.data() })); }

const dlg = document.createElement("dialog"); dlg.className = "wide"; document.body.appendChild(dlg);
function showDialog(build) {
  dlg.textContent = ""; build(dlg);
  const close = el("button", "Close", "cta"); close.type = "button"; close.onclick = () => dlg.close();
  dlg.appendChild(close); dlg.showModal();
}

onUser(p => { if (!p || p.role === "leader") return; loadPosters(); loadTrailers(); loadAlbums(); });

async function loadPosters() {
  const box = $("posterList"); box.textContent = "Loading…";
  let list = [];
  try { list = (await all("posters")).sort((a, b) => String(a.title).localeCompare(String(b.title))); }
  catch (e) { box.textContent = "Could not load posters."; return; }
  box.textContent = ""; if (!list.length) { box.textContent = "No posters yet."; return; }
  list.forEach((p, i) => {
    if (!safeImg(p.data)) return;
    const b = el("button", null, "poster-card" + (i % 2 ? " alt" : "")); b.type = "button";
    const img = el("img"); img.src = p.data; img.alt = "Poster: " + p.title; img.loading = "lazy";
    b.append(img, el("span", p.title));
    b.onclick = () => showDialog(d => {
      d.appendChild(el("h2", p.title));
      if (p.eventTitle) d.appendChild(el("p", p.eventTitle));
      const big = el("img", null, "big"); big.src = p.data; big.alt = "Poster: " + p.title; d.appendChild(big);
    });
    box.appendChild(b);
  });
}

async function loadTrailers() {
  const box = $("trailerList"); box.textContent = "Loading…";
  let list = [];
  try { list = (await all("trailers")).sort((a, b) => String(a.title).localeCompare(String(b.title))); }
  catch (e) { box.textContent = "Could not load trailers."; return; }
  box.textContent = ""; if (!list.length) { box.textContent = "No trailers yet."; return; }
  list.forEach(t => {
    if (!safeVideo(t.file)) return;
    const card = el("article", null, "form-card");
    card.appendChild(el("h3", t.title));
    const v = document.createElement("video");
    v.controls = true; v.preload = "metadata"; v.playsInline = true; v.src = t.file;
    v.setAttribute("aria-label", "Trailer: " + t.title);
    autoplayWhenVisible(v);
    v.onerror = () => { v.replaceWith(el("p", "This video could not be loaded.", "msg")); };
    card.appendChild(v);
    if (t.description) card.appendChild(el("p", t.description));
    box.appendChild(card);
  });
}

async function loadAlbums() {
  const box = $("albumList"); box.textContent = "Loading…";
  let list = [];
  try { list = (await all("albums")).sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))); }
  catch (e) { box.textContent = "Could not load the albums."; return; }
  box.textContent = ""; if (!list.length) { box.textContent = "No albums yet."; return; }
  list.forEach((a, i) => {
    const card = el("article", null, "form-card");
    card.appendChild(el("h3", a.title));
    if (a.date) card.appendChild(el("p", new Date(a.date + "T00:00").toLocaleDateString([], { dateStyle: "long" }), "when"));
    if (a.recap) card.appendChild(el("p", a.recap, "recap"));
    const b = el("button", "Open album"); b.type = "button"; b.onclick = () => openAlbum(a);
    card.appendChild(b); box.appendChild(card);
  });
}

async function openAlbum(a) {
  let photos = [];
  try {
    const s = await getDocs(query(collection(db, "photos"), where("albumId", "==", a.id)));
    photos = s.docs.map(d => d.data());
  } catch (e) { alert("Could not load the photos."); return; }
  showDialog(d => {
    d.appendChild(el("h2", a.title));
    if (a.recap) d.appendChild(el("p", a.recap, "recap"));
    if (!photos.length) { d.appendChild(el("p", "No photos in this album yet.")); return; }
    const grid = el("div", null, "media-grid");
    photos.forEach(p => {
      if (!safeImg(p.data)) return;
      const img = el("img"); img.src = p.data; img.alt = "Photo from " + a.title; img.loading = "lazy"; grid.appendChild(img);
    });
    d.appendChild(grid);
  });
}