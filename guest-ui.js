// Shown to people who are not full members yet: quick-entry guests and unverified accounts.
import { settings } from "./security-config.js";
const make = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };

const guest = document.body.classList.contains("guest");
const BANNER = guest
  ? "You're using quick entry (name only). Log out and choose Continue with Outlook (university) to apply for auditions, fill in forms, watch bloopers and see photos."
  : "Your account is not confirmed as a university member yet. Verify your @" + settings.uniDomain + " email (or continue with Outlook) to open auditions, forms, bloopers and photos.";
const LOCK = guest
  ? "Locked for quick entry. Log out and continue with Outlook (university) to open this section."
  : "Locked until your university email is verified.";

const main = document.querySelector("main");
if (main && !document.querySelector(".guest-banner")) {
  const b = make("p", "guest-banner", BANNER); b.setAttribute("role", "note");
  main.before(b);
  ["auditionList", "formList", "albumList", "bloopersList"].forEach(id => {
    const box = document.getElementById(id);
    if (box) box.before(make("p", "locked", LOCK));
  });
}
