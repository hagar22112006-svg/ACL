import { onUser, logOut } from "./auth.js";
import { settings } from "./security-config.js";

// The member "desktop": one section (window) at a time, a taskbar at the bottom, a clock, and the visitor pass for people who are not full members yet.
onUser(p => {
  if (!p || p.role === "leader" || document.body.dataset.views) return;
  document.body.dataset.views = "1";
  const $ = id => document.getElementById(id);
  const views = [...document.querySelectorAll(".view")];
  const links = [...document.querySelectorAll('.taskbar a[href^="#view-"]')];
  if (!views.length) return;

  function show(view, target) {
    views.forEach(v => { v.hidden = v !== view; });
    links.forEach(a => {
      const on = a.getAttribute("href") === "#" + view.id;
      a.classList.toggle("active", on);
      if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    const cur = links.find(a => a.getAttribute("href") === "#" + view.id);
    document.title = (cur ? cur.querySelector(".lbl").textContent : "Home") + " · ACL Club";
    document.dispatchEvent(new CustomEvent("acl-view", { detail: view.id }));   // the calendar needs to know when it becomes visible
    if (target && target !== view) requestAnimationFrame(() => target.scrollIntoView({ behavior: "smooth", block: "start" }));
    else scrollTo({ top: 0 });
  }
  function route() {
    const el = location.hash.length > 1 ? $(decodeURIComponent(location.hash.slice(1))) : null;
    const view = el ? (el.classList.contains("view") ? el : el.closest(".view")) : null;
    show(view || $("view-home"), el);
  }
  addEventListener("hashchange", route);
  route();

  const clock = $("clock");
  if (clock) { const tick = () => { clock.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }; tick(); setInterval(tick, 30000); }

  // Visitors (quick entry, or email not verified yet): locked icons + a visitor pass on the home screen
  if (!p.approved) {
    document.querySelectorAll("[data-locked]").forEach(a => a.classList.add("locked-icon"));
    const card = $("visitorCard"); if (!card) return;
    card.hidden = false; $("visitorName").textContent = p.name;
    const btn = $("visitorBtn");
    if (p.guest) {
      $("visitorTitle").textContent = "Welcome, " + p.name + "!";
      $("visitorText").textContent = "You are visiting with quick entry. You can look around, register for events and see posters. Auditions, forms, bloopers and photos unlock when you log in with your university account.";
      btn.textContent = "Log in with my university account";
    } else {
      $("visitorTitle").textContent = "Almost there, " + p.name + "!";
      $("visitorText").textContent = "Your account is not confirmed as a university member yet. Verify your @" + settings.uniDomain + " email (check the yellow banner) to unlock everything.";
      btn.textContent = "Log out";
    }
    btn.onclick = p.preview ? () => alert("This is only a preview.") : logOut;
  }
});
