// Google Analytics for the public signup page only (never inside the shop app or on booking pages).
// Turned on by setting GA_MEASUREMENT_ID (G-...) in Vercel; the same ID as xsiteauto.com, so a visit
// from the website to a finished signup shows as one journey.
export const dynamic = "force-dynamic";

export function GET() {
  const id = String(process.env.GA_MEASUREMENT_ID || "").trim();
  const body = /^G-[A-Z0-9]{4,}$/.test(id)
    ? `(function(){var ID=${JSON.stringify(id)};var s=document.createElement("script");s.async=true;s.src="https://www.googletagmanager.com/gtag/js?id="+ID;document.head.appendChild(s);
window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}window.gtag=gtag;gtag("js",new Date());gtag("config",ID);
window.xsTrack=function(name,params){try{gtag("event",name,Object.assign({transport_type:"beacon"},params||{}))}catch(e){}};})();`
    : "window.xsTrack=function(){};";
  return new Response(body, { headers: { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "public, max-age=300" } });
}
