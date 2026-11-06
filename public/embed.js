/* XSite Auto booking form for a shop's own website.
   <div id="xsite-booking"></div>
   <script src="https://book.xsiteauto.com/embed.js" data-shop="your-shop" async></script>
   Optional: data-color="#7a1f1f" to match the site's main colour, data-target="some-id" to place it elsewhere. */
(function () {
  var s = document.currentScript;
  if (!s) { var all = document.querySelectorAll('script[src*="embed.js"][data-shop]'); s = all[all.length - 1]; }
  var shop = s && s.getAttribute("data-shop");
  if (!shop || !/^[a-z0-9-]{1,50}$/.test(shop)) return;
  var origin = new URL(s.src, location.href).origin;
  var target = document.getElementById(s.getAttribute("data-target") || "xsite-booking");
  if (!target) { target = document.createElement("div"); s.parentNode.insertBefore(target, s); }
  if (target.getAttribute("data-xsite-ready")) return;
  target.setAttribute("data-xsite-ready", "1");
  var color = s.getAttribute("data-color") || "";
  var f = document.createElement("iframe");
  f.src = origin + "/" + shop + "?embed=1" + (/^#[0-9a-fA-F]{6}$/.test(color) ? "&color=" + encodeURIComponent(color) : "");
  f.title = "Book a repair";
  f.setAttribute("loading", "lazy");
  f.style.cssText = "width:100%;max-width:680px;border:0;display:block;margin:0 auto;min-height:620px;background:transparent;color-scheme:normal";
  target.appendChild(f);
  window.addEventListener("message", function (e) {
    if (e.origin !== origin || e.source !== f.contentWindow) return;
    var d = e.data || {};
    if (d.type === "xsite-booking-height" && d.height > 0) { f.style.height = d.height + "px"; f.style.minHeight = "0"; }
    if (d.type === "xsite-booking-step") { var r = f.getBoundingClientRect(); if (r.top < 0) window.scrollBy({ top: r.top - 16, behavior: "smooth" }); }
  });
  // Lets the shop's setup checklist know the form is on their site.
  try {
    var body = JSON.stringify({ url: location.href });
    if (navigator.sendBeacon) navigator.sendBeacon(origin + "/" + shop + "/api/embed/seen", new Blob([body], { type: "text/plain" }));
  } catch (e) {}
})();
