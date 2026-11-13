import { db, onUser, logOut } from "./auth.js";
import { collection, getDocs, setDoc, getDoc, deleteDoc, doc, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { fmtRange, endDate, isPast, renderHero, applySiteContent } from "./common.js";
import { renderPast, openArchive } from "./member-archive.js";

let me, events = [];
document.getElementById("logout").addEventListener("click", logOut);

onUser(p => {
  if (!p) return location.replace("index.html");
  if (p.role === "leader") return location.replace("leader.html");
  me = p;
  document.getElementById("who").textContent = "Hi, " + p.name;
  document.body.classList.add("ready");
  start();
});

const regRef = e => doc(db, "registrations", e.id + "_" + me.user.uid);
const detailsBox = document.getElementById("details");
const calendar = new FullCalendar.Calendar(document.getElementById("calendar"), {
  initialView: "dayGridMonth", events: [],
  firstDay: 0,               // weeks start on Sunday
  displayEventEnd: true,
  eventInteractive: true,    // lets keyboard users Tab to an event and press Enter
  eventClick: info => showDetails(events.find(ev => ev.id === info.event.id))
});

document.addEventListener("acl-view", e => { if (e.detail === "view-events") setTimeout(() => calendar.updateSize(), 0); });   // the calendar was hidden when it was drawn

document.addEventListener("acl-show-event", e => { const ev = events.find(x => x.id === e.detail); if (ev) showDetails(ev); });   // from the "coming up" pop-up

async function start() {
  calendar.render();
  applySiteContent();
  try {
    const snap = await getDocs(collection(db, "events"));
    events = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) { console.error(err); }
  events.forEach(e => calendar.addEvent({ id: e.id, title: e.title, start: e.start, end: endDate(e), classNames: isPast(e) ? ["past-event"] : [] }));
  renderHero(events);
  renderPast(events);
  document.dispatchEvent(new CustomEvent("acl-events", { detail: events }));
}

function showDetails(e) {
  if (!e) return;
  if (isPast(e)) { openArchive(e); return; }   // past events: no registering, just what happened
  detailsBox.innerHTML = "<h3></h3><p class='when'></p><p class='where'></p><p class='about'></p><button id='register'>Checking…</button>";
  detailsBox.querySelector("h3").textContent = e.title;
  detailsBox.querySelector(".when").textContent = fmtRange(e.start, endDate(e));
  detailsBox.querySelector(".where").textContent = e.place;
  detailsBox.querySelector(".about").textContent = e.about || "";
  detailsBox.classList.remove("pop"); void detailsBox.offsetWidth; detailsBox.classList.add("pop");
  const btn = document.getElementById("register");
  async function refresh() {
    let reg = false;
    try { reg = (await getDoc(regRef(e))).exists(); } catch (err) { console.error(err); }
    btn.textContent = reg ? "Cancel registration" : "Register";
    btn.onclick = async () => {
      btn.disabled = true;
      try {
        if (reg) await deleteDoc(regRef(e));
        else await setDoc(regRef(e), { eventId: e.id, eventTitle: e.title, uid: me.user.uid,
          name: me.guest ? me.name + " (guest)" : me.name,      // leaders can see which registrations are unverified
          email: me.user.email || "", checkedIn: false, createdAt: serverTimestamp() });
      } catch (err) { alert("Something went wrong: " + err.message); }
      btn.disabled = false; refresh();
    };
  }
  refresh();
}
