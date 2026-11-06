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

  // Printable sign
  const small = sp.get("size") === "5x7";
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
@page{size:${small ? "5in 7in" : "letter"};margin:${small ? "0.3in" : "0.6in"}}
*{box-sizing:border-box}body{margin:0;font-family:Calibri,Carlito,Arial,sans-serif;color:#0E417A;text-align:center;background:#fff}
.sheet{max-width:${small ? "4.4in" : "7.3in"};margin:0 auto;padding:${small ? "0.1in" : "0.4in"} 0;display:flex;flex-direction:column;align-items:center;gap:${small ? "0.14in" : "0.25in"}}
.shop{font-size:${small ? "15pt" : "30pt"};font-weight:700;letter-spacing:.02em;color:#1A5FA8;text-transform:uppercase}
h1{font-size:${small ? "27pt" : "46pt"};margin:0;line-height:1.05}
.qr{width:${small ? "3.1in" : "4.6in"};height:${small ? "3.1in" : "4.6in"};border:${small ? 2 : 3}px solid #1A5FA8;border-radius:${small ? 10 : 18}px;padding:${small ? "0.08in" : "0.15in"}}
.qr svg{width:100%;height:100%;display:block}
.sub{font-size:${small ? "12pt" : "18pt"};max-width:${small ? "4.2in" : "6.2in"};margin:0;color:#333}
.url{font-size:${small ? "9.5pt" : "15pt"};color:#1A5FA8;font-weight:700;word-break:break-all}
.phone{font-size:${small ? "10pt" : "16pt"};color:#333}
.bar{position:fixed;top:0;left:0;right:0;padding:10px;background:#f3f6fa;border-bottom:1px solid #d6dee8;font-family:Arial,sans-serif;display:flex;gap:10px;justify-content:center;align-items:center}
.bar button,.bar a{font:600 15px Arial,sans-serif;padding:10px 20px;border-radius:8px;border:0;background:#1A5FA8;color:#fff;cursor:pointer;text-decoration:none}
.bar a{background:#fff;color:#1A5FA8;border:1px solid #1A5FA8}
.bar span{font:13px Arial,sans-serif;color:#44587a}
@media print{.bar{display:none}.sheet{padding-top:0}${small ? ".sheet{min-height:6.3in;justify-content:center}" : ""}}
@media screen{.sheet{padding-top:80px}${small ? "body{background:#e9eef4}.sheet{background:#fff;width:5in;max-width:5in;min-height:7in;justify-content:center;margin:84px auto 24px;padding:0.3in;box-shadow:0 2px 12px rgba(0,0,0,.12)}" : ""}}
</style></head><body>
<div class="bar"><button onclick="window.print()">Print this sign</button><a href="?for=${checkin ? "checkin" : "book"}&format=sign&size=${small ? "letter" : "5x7"}">Switch to ${small ? "full page" : "5 × 7"}</a><span>${small ? "Set the paper size to 5 × 7 in the print window, or print on letter and trim." : "Letter size, 8.5 × 11"}</span></div>
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
