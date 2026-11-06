import qrcode from "qrcode-generator";
import { signedIn } from "@/lib/guard";
import { bookingUrl } from "@/lib/shop";
import { inShop } from "@/lib/db";
import { getSite } from "@/lib/site";

// QR codes for a shop's booking page, for the counter, a window sign or business cards.
//   ?for=book|checkin   the booking page, or the walk-in check-in form
//   ?format=svg|gif|sign   an image to download, or a printable letter-size sign
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

  // Printable sign
  const site = await inShop(g.shop.id, (q) => getSite(q, g.shop));
  const name = site.shopName || g.shop.name;
  const phone = site.phone || "";
  const title = checkin ? "Check in here" : "Book your next service";
  const sub = checkin
    ? "Scan with your phone camera. Tell us about your vehicle and we'll come find you."
    : "Scan with your phone camera to pick a drop-off time. It takes about a minute.";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)} · ${esc(name)}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
@page{size:letter;margin:0.6in}
*{box-sizing:border-box}body{margin:0;font-family:Calibri,Carlito,Arial,sans-serif;color:#0E417A;text-align:center;background:#fff}
.sheet{max-width:7.3in;margin:0 auto;padding:0.4in 0;display:flex;flex-direction:column;align-items:center;gap:0.25in}
.shop{font-size:30pt;font-weight:700;letter-spacing:.02em;color:#1A5FA8;text-transform:uppercase}
h1{font-size:46pt;margin:0;line-height:1.05}
.qr{width:4.6in;height:4.6in;border:3px solid #1A5FA8;border-radius:18px;padding:0.15in}
.qr svg{width:100%;height:100%;display:block}
.sub{font-size:18pt;max-width:6.2in;margin:0;color:#333}
.url{font-size:15pt;color:#1A5FA8;font-weight:700;word-break:break-all}
.phone{font-size:16pt;color:#333}
.bar{position:fixed;top:0;left:0;right:0;padding:10px;background:#f3f6fa;border-bottom:1px solid #d6dee8;font-family:Arial,sans-serif}
.bar button{font:600 15px Arial,sans-serif;padding:10px 20px;border-radius:8px;border:0;background:#1A5FA8;color:#fff;cursor:pointer}
@media print{.bar{display:none}.sheet{padding-top:0}}
@media screen{.sheet{padding-top:80px}}
</style></head><body>
<div class="bar"><button onclick="window.print()">Print this sign</button></div>
<div class="sheet">
<div class="shop">${esc(name)}</div>
<h1>${esc(title)}</h1>
<div class="qr">${svg}</div>
<p class="sub">${esc(sub)}</p>
<div class="url">${esc(url.replace(/^https:\/\//, ""))}</div>
${phone ? `<div class="phone">Or call ${esc(phone)}</div>` : ""}
</div></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" } });
}
