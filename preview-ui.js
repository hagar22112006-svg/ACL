// Preview mode for leaders: see the member site as a full member or as a visitor. Nothing you do here is saved.
const make = (tag, text) => { const e = document.createElement(tag); if (text) e.textContent = text; return e; };
const mode = new URLSearchParams(location.search).get("preview") === "visitor" ? "visitor" : "member";
const MSG = "👀 Preview: you are seeing the site as " + (mode === "visitor" ? "a visitor (quick entry)" : "a full member") + ". Nothing you do here is saved.";

const bar = make("div"); bar.className = "preview-bar"; bar.setAttribute("role", "note");
const text = make("span", MSG);
const other = make("a", mode === "visitor" ? "See as a member" : "See as a visitor"); other.href = "member.html?preview=" + (mode === "visitor" ? "member" : "visitor");
const back = make("a", "Back to the leader area"); back.href = "leader.html";
bar.append(text, other, back); document.body.prepend(bar);

// Block everything that would save something under your leader account
let timer;
function blocked() { text.textContent = "Preview only: nothing was saved."; clearTimeout(timer); timer = setTimeout(() => { text.textContent = MSG; }, 2500); }
const SAVES = /^(Register|Cancel registration|Cancel my application|Send|Book my slot)$/;
document.addEventListener("click", e => {
  const b = e.target.closest("button");
  if (b && SAVES.test(b.textContent.trim())) { e.preventDefault(); e.stopPropagation(); blocked(); }
}, true);
document.addEventListener("submit", e => {
  if (e.target.closest(".member-form")) { e.preventDefault(); e.stopPropagation(); blocked(); }
}, true);
