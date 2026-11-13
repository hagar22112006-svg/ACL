import { onUser } from "./auth.js";

// Shows one section ("view") at a time. Works for menu links (#view-people) and for jumps to a panel (#members, #post ...)
onUser(p => {
  if (!p || p.role !== "leader" || document.body.dataset.views) return;
  document.body.dataset.views = "1";
  const $ = id => document.getElementById(id);
  const views = [...document.querySelectorAll(".view")];
  const links = [...document.querySelectorAll('nav a[href^="#view-"]')];
  if (!views.length) return;

  function show(view, target) {
    views.forEach(v => { v.hidden = v !== view; });
    links.forEach(a => {
      const on = a.getAttribute("href") === "#" + view.id;
      a.classList.toggle("active", on);
      if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    $("viewTitle").textContent = view.dataset.title || "";
    $("viewHint").textContent = view.dataset.hint || "";
    document.title = (view.dataset.title || "Leader area") + " · ACL Leader";
    if (target && target !== view) requestAnimationFrame(() => target.scrollIntoView({ behavior: "smooth", block: "start" }));
    else scrollTo({ top: 0 });
  }
  function route() {
    const el = location.hash.length > 1 ? $(decodeURIComponent(location.hash.slice(1))) : null;
    const view = el ? (el.classList.contains("view") ? el : el.closest(".view")) : null;
    show(view || $("view-dashboard"), el);
  }
  addEventListener("hashchange", route);
  route();
});
