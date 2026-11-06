import qrcode from "qrcode-generator";
import { signedIn } from "@/lib/guard";
import { bookingUrl } from "@/lib/shop";
import { inShop } from "@/lib/db";
import { getSite } from "@/lib/site";

// QR codes for a shop's booking page, for the counter, a window sign or business cards.
//   ?for=book|checkin   the booking page, or the walk-in check-in form
//   ?format=svg|gif|sign   an image to download, or a printable sign
//   ?size=letter|5x7      sign size: a full page, or a 5 x 7 card for a counter frame
export const dynamic = "force-dynamic";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function qr(text) {
  const q = qrcode(0, "M");
  q.addData(text);
  q.make();
  return q;
}

export async function GET(req) {
  const g = await signedIn();
  if (g.error) return g.error;
  const sp = new URL(req.url).searchParams;
  const checkin = sp.get("for") === "checkin";
  const format = ["svg", "gif", "sign"].includes(sp.get("format")) ? sp.get("format") : "svg";
  const url = bookingUrl(g.shop.slug) + (checkin ? "?checkin" : "");
  const code = qr(url);
  const file = `${g.shop.slug}-${checkin ? "check-in" : "booking"}-qr`;

  if (format === "gif") {
    const b64 = code.createDataURL(12, 4).split(",")[1];
    return new Response(Buffer.from(b64, "base64"), {
      headers: { "Content-Type": "image/gif", "Content-Disposition": `attachment; filename="${file}.gif"`, "Cache-Control": "private, no-store" },
    });
  }
  const svg = code.createSvgTag({ cellSize: 10, margin: 4, scalable: true });
  if (format === "svg") {
    return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n${svg}`, {
      headers: { "Content-Type": "image/svg+xml", "Content-Disposition": `attachment; filename="${file}.svg"`, "Cache-Control": "private, no-store" },
    });
  }

  // Printable sign: navy band with the shop name, a "Scan me" code and three simple steps.
  const small = sp.get("size") === "5x7";
  const site = await inShop(g.shop.id, (q) => getSite(q, g.shop));
  const name = site.shopName || g.shop.name;
  const phone = site.phone || "";
  const title = checkin ? "Check in here" : "Book your next service";
  const step3 = checkin ? "Tell us about<br>your vehicle" : "Pick a<br>drop-off time";
  const navySvg = svg.replace(/fill="black"/g, 'fill="#0E417A"').replace(/fill="#000000"/g, 'fill="#0E417A"');
  const W = small ? 5 : 8.5, H = small ? 7 : 11, k = small ? 1 : 1.6;   // page size in inches, scale for letter
  const u = (n) => `${+(n * k).toFixed(3)}in`, pt = (n) => `${+(n * k).toFixed(1)}pt`;
  const ICON = {
    cam: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
    scan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10"/></svg>',
    form: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
  };
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)} · ${esc(name)}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
@page{size:${W}in ${H}in;margin:0}
*{box-sizing:border-box}html,body{margin:0}
body{font-family:Calibri,Carlito,Arial,sans-serif;color:#0E417A;text-align:center;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.card{width:${W}in;height:${H}in;display:flex;flex-direction:column;background:#fff;overflow:hidden}
.band{background:#0E417A;color:#fff;padding:${u(.3)} ${u(.3)} ${u(.22)}}
.shop{font-size:${pt(13)};letter-spacing:.14em;text-transform:uppercase;color:#9fc3ec;font-weight:700}
h1{margin:${u(.05)} 0 0;font-size:${pt(small ? 30 : checkin ? 31 : 27)};line-height:1.02}
.stripe{height:${u(.12)};background:repeating-linear-gradient(135deg,#F2A93B 0 ${u(.12)},#0E417A ${u(.12)} ${u(.24)})}
.body{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${u(.2)};padding:${u(.25)} ${u(.3)}}
.qr{width:${u(2.75)};height:${u(2.75)};padding:${u(.1)};border-radius:${u(.15)};border:${u(.035)} solid #F2A93B;position:relative;background:#fff}
.qr svg{width:100%;height:100%;display:block}
.tag{position:absolute;top:${u(-.17)};left:50%;transform:translateX(-50%);background:#F2A93B;color:#0E417A;font-weight:800;font-size:${pt(11)};padding:${u(.03)} ${u(.14)};border-radius:999px;white-space:nowrap;letter-spacing:.04em}
.steps{display:flex;gap:${u(.12)};width:100%;justify-content:center}
.st{flex:1;font-size:${pt(10.5)};color:#33476a;line-height:1.2}
.st i{display:flex;width:${u(.44)};height:${u(.44)};margin:0 auto ${u(.05)};border-radius:50%;background:#E3EEFA;color:#1A5FA8;align-items:center;justify-content:center}
.st i svg{width:${u(.24)};height:${u(.24)}}
.url{font-size:${pt(9)};color:#5d6f8c;word-break:break-all}
.foot{background:#F2F7FD;padding:${u(.13)} ${u(.2)};font-size:${pt(10.5)};color:#44587a;border-top:1px solid #e3e9f1}
.foot b{color:#0E417A}
.bar{position:fixed;top:0;left:0;right:0;padding:10px;background:#f3f6fa;border-bottom:1px solid #d6dee8;font-family:Arial,sans-serif;display:flex;flex-wrap:wrap;gap:10px;justify-content:center;align-items:center;z-index:2}
.bar button,.bar a{font:600 15px Arial,sans-serif;padding:10px 20px;border-radius:8px;border:0;background:#1A5FA8;color:#fff;cursor:pointer;text-decoration:none}
.bar a{background:#fff;color:#1A5FA8;border:1px solid #1A5FA8}
.bar span{font:13px Arial,sans-serif;color:#44587a}
@media screen{body{background:#e9eef4;padding:84px 16px 24px}.card{margin:0 auto;box-shadow:0 2px 14px rgba(0,0,0,.14)}}
@media print{.bar{display:none}}
</style></head><body>
<div class="bar"><button onclick="window.print()">Print this sign</button><a href="?for=${checkin ? "checkin" : "book"}&format=sign&size=${small ? "letter" : "5x7"}">Switch to ${small ? "full page" : "5 × 7"}</a><span>${small ? "Choose 5 × 7 paper in the print window, or print on letter and trim." : "Letter size, 8.5 × 11"}</span></div>
<div class="card">
 <div class="band"><div class="shop">${esc(name)}</div><h1>${esc(title)}</h1></div><div class="stripe"></div>
 <div class="body">
  <div class="qr"><div class="tag">SCAN ME</div>${navySvg}</div>
  <div class="steps"><div class="st"><i>${ICON.cam}</i>Open your<br>camera</div><div class="st"><i>${ICON.scan}</i>Point it<br>at the code</div><div class="st"><i>${ICON.form}</i>${step3}</div></div>
  <div class="url">${esc(url.replace(/^https:\/\//, ""))}</div>
 </div>
 <div class="foot">Takes about a minute · No app needed${phone ? ` · <b>${esc(phone)}</b>` : ""}</div>
</div></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" } });
}
