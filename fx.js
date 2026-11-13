// fx.js: the extras for every page. auth.js loads it, so no HTML page needs to.
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const body = document.body;
const isLeader = body.classList.contains("leader");
const inside = isLeader || body.classList.contains("member");
const $ = s => document.querySelector(s);
const make = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
const colours = isLeader ? ["#FED4E7", "#E8DCC8", "#BFCC94"] : ["#054A91", "#3D0814", "#BFCC94", "#FED4E7"];

/* 1. Menu button: the menu collapses on phones (and on iPads inside the member/leader sites) */
(function () {
  const header = $(".site-header"), nav = header && header.querySelector("nav");
  if (!nav) return;
  nav.id = "mainNav";
  const btn = make("button", "menu-btn"), bars = make("span", "bars"), label = make("span", null, "Menu");
  btn.type = "button"; btn.setAttribute("aria-expanded", "false"); btn.setAttribute("aria-controls", "mainNav");
  bars.setAttribute("aria-hidden", "true"); btn.append(bars, label); header.insertBefore(btn, nav);
  const set = open => { nav.classList.toggle("open", open); btn.setAttribute("aria-expanded", String(open)); label.textContent = open ? "Close" : "Menu"; };
  btn.addEventListener("click", () => set(!nav.classList.contains("open")));
  nav.addEventListener("click", e => { if (e.target.closest("a")) set(false); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") set(false); });
  const mq = matchMedia(inside ? "(max-width: 900px)" : "(max-width: 600px)");
  const apply = () => { header.classList.toggle("collapsed", mq.matches); if (!mq.matches) set(false); };
  mq.addEventListener("change", apply); apply();
})();

/* 2. Scroll progress bar + back-to-top button */
(function () {
  const bar = make("div", "progress"); bar.setAttribute("aria-hidden", "true");
  const up = make("button", "to-top", "↑"); up.type = "button"; up.setAttribute("aria-label", "Back to top");
  up.addEventListener("click", () => scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" }));
  body.append(bar, up);
  const onScroll = () => {
    const h = document.documentElement, max = h.scrollHeight - innerHeight;
    bar.style.transform = "scaleX(" + (max > 0 ? h.scrollTop / max : 0) + ")";
    up.classList.toggle("show", h.scrollTop > 600);
  };
  addEventListener("scroll", onScroll, { passive: true }); onScroll();
})();

/* 3. Highlight the menu link of the section you are looking at */
(function () {
  if (!("IntersectionObserver" in window)) return;
  const links = [...document.querySelectorAll('nav a[href^="#"]')], map = new Map();
  links.forEach(a => { const s = document.getElementById(a.getAttribute("href").slice(1)); if (s) map.set(s, a); });
  if (!map.size) return;
  const io = new IntersectionObserver(entries => entries.forEach(en => {
    if (!en.isIntersecting) return;
    links.forEach(l => l.removeAttribute("aria-current")); map.get(en.target).setAttribute("aria-current", "true");
  }), { rootMargin: "-40% 0px -55% 0px" });
  map.forEach((_, s) => io.observe(s));
})();

/* 4. Sections fade in as you scroll */
if (!reduce && "IntersectionObserver" in window) {
  const rv = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); rv.unobserve(e.target); } }), { threshold: 0.06 });
  document.querySelectorAll(".block, .panel").forEach(el => { el.classList.add("rv"); rv.observe(el); });
}

/* 5. Sparkle trail behind the mouse (mouse users only, never over forms or tables) */
if (!reduce && matchMedia("(pointer: fine)").matches) {
  let last = 0;
  addEventListener("pointermove", e => {
    if (e.pointerType !== "mouse" || e.target.closest("input, textarea, select, table, dialog, button")) return;
    const now = performance.now(); if (now - last < 70) return; last = now;
    const s = make("div", "trail"); s.innerHTML = '<svg viewBox="0 0 100 100"><use href="#sparkle"/></svg>';
    s.style.left = e.clientX + "px"; s.style.top = e.clientY + "px"; s.style.color = colours[Math.floor(Math.random() * colours.length)];
    body.appendChild(s);
    s.animate([{ opacity: 0.9, transform: "translate(-50%,-50%) scale(1) rotate(0deg)" },
               { opacity: 0, transform: "translate(-50%,14px) scale(.2) rotate(140deg)" }], { duration: 700, easing: "ease-out" })
      .onfinish = () => s.remove();
  }, { passive: true });
}

/* 6. Confetti when a member registers or books an audition */
function burst(x, y) {
  if (reduce) return;
  for (let i = 0; i < 36; i++) {
    const p = make("i", "confetti"); p.style.background = colours[i % colours.length]; p.style.left = x + "px"; p.style.top = y + "px";
    body.appendChild(p);
    const a = Math.random() * Math.PI * 2, d = 80 + Math.random() * 160;
    p.animate([{ transform: "translate(0,0) rotate(0deg)", opacity: 1 },
               { transform: "translate(" + Math.cos(a) * d + "px," + (Math.sin(a) * d + 120) + "px) rotate(" + Math.random() * 720 + "deg)", opacity: 0 }],
      { duration: 900 + Math.random() * 600, easing: "cubic-bezier(.2,.7,.4,1)" }).onfinish = () => p.remove();
  }
}
(function () {
  let lastReg = 0, lastSend = 0;
  document.addEventListener("click", e => { if (e.target.closest("#register")) lastReg = Date.now(); });
  document.addEventListener("submit", e => { if (e.target.closest(".member-form")) lastSend = Date.now(); });
  const mo = new MutationObserver(muts => {
    for (const m of muts) {
      if (m.target.id === "register" && m.target.textContent === "Cancel registration" && Date.now() - lastReg < 4000) {
        lastReg = 0; const r = m.target.getBoundingClientRect(); burst(r.left + r.width / 2, r.top);
      }
      m.addedNodes.forEach(n => {
        if (n.nodeType !== 1 || Date.now() - lastSend > 5000) return;
        const ok = n.matches(".ok") ? n : n.querySelector(".ok");
        if (ok) { lastSend = 0; const r = ok.getBoundingClientRect(); burst(r.left + 40, r.top); }
      });
    }
  });
  ["details", "auditionList", "formList"].map(id => document.getElementById(id)).filter(Boolean)
    .forEach(el => mo.observe(el, { childList: true, subtree: true }));
})();

/* 7. Members: draggable scrapbook stickers on the hero */
(function () {
  const hero = $(".hero");
  if (!body.classList.contains("member") || !hero) return;
  function drag(el) {
    let sx, sy, ox, oy, on = false;
    el.addEventListener("pointerdown", e => { on = true; el.setPointerCapture(e.pointerId); sx = e.clientX; sy = e.clientY; ox = el.offsetLeft; oy = el.offsetTop; el.classList.add("held"); });
    el.addEventListener("pointermove", e => {
      if (!on) return;
      const x = Math.max(0, Math.min(hero.clientWidth - el.offsetWidth, ox + e.clientX - sx));
      const y = Math.max(0, Math.min(hero.clientHeight - el.offsetHeight, oy + e.clientY - sy));
      el.style.left = x + "px"; el.style.top = y + "px"; el.style.right = "auto"; el.style.bottom = "auto";
    });
    const end = () => { on = false; el.classList.remove("held"); };
    el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end);
  }
  [["st1", '<svg viewBox="0 0 100 100"><use href="#sparkle"/></svg>'], ["st2", "ACL"], ["st3", "new!"]].forEach(([cls, content]) => {
    const s = make("div", "sticker-drag " + cls); s.setAttribute("aria-hidden", "true");
    if (content.startsWith("<")) s.innerHTML = content; else s.textContent = content;
    hero.appendChild(s); drag(s);
  });
})();

/* 8. Leaders: load the live stats strip */
if (isLeader) {
  const run = () => import("./leader-stats.js");
  if (document.readyState === "complete") run(); else addEventListener("load", run);
}