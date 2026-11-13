// Shrinks a picture in the browser so it is small enough to save in Firestore.
export function shrinkImage(file, maxSide = 1000, quality = 0.72) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith("image/")) return reject(new Error("Please choose an image file (JPG, PNG, WebP)."));
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      let q = quality, out = c.toDataURL("image/jpeg", q);
      while (out.length > 700000 && q > 0.4) { q -= 0.1; out = c.toDataURL("image/jpeg", q); }
      if (out.length > 700000) return reject(new Error("That picture is still too big. Try a smaller one."));
      resolve(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read that picture.")); };
    img.src = url;
  });
}
// Only accept the kinds of data we expect, so nothing odd ever gets into the page
export const safeImg = d => typeof d === "string" && d.startsWith("data:image/");
export const safeVideo = p => typeof p === "string" && /^videos\/[A-Za-z0-9_\-. ]+\.(mp4|webm)$/i.test(p);// Google Drive videos (for big files): only the file id is stored, and the site builds the link itself
export const safeDriveId = s => typeof s === "string" && /^[A-Za-z0-9_-]{10,80}$/.test(s);
export const driveIdFrom = url => {
  const m = String(url).match(/\/d\/([A-Za-z0-9_-]{10,80})/) || String(url).match(/[?&]id=([A-Za-z0-9_-]{10,80})/);
  return m ? m[1] : "";
};

// Videos that start by themselves (muted, because browsers only allow sound after a tap) when they scroll into view, and pause when they leave.
// Not used for people who prefer less motion.
export function autoplayWhenVisible(v) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
  v.muted = true; v.loop = true; v.playsInline = true; v.preload = "auto";
  new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) v.play().catch(() => {}); else v.pause(); }), { threshold: 0.5 }).observe(v);
}
