import { handleReply } from "@/lib/reminders";
import { twilioSignatureOk, twiml, smsTest } from "@/lib/sms";

export const dynamic = "force-dynamic";

// Twilio calls this when a customer texts back (set it as the number's "A message comes in" webhook):
//   https://app.xsiteauto.com/api/sms/inbound
// The request must carry Twilio's signature. SMS_WEBHOOK_URL can override the address used to check it.
export async function POST(req) {
  const form = await req.formData().catch(() => null);
  if (!form) return new Response("Bad request", { status: 400 });
  const params = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
  const u = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || u.host;
  const url = process.env.SMS_WEBHOOK_URL || `https://${host}${u.pathname}${u.search}`;
  const ok = twilioSignatureOk(url, params, req.headers.get("x-twilio-signature"));
  if (!ok && !(smsTest() && process.env.NODE_ENV !== "production")) return new Response("Forbidden", { status: 403 });
  try {
    return twiml(await handleReply({ from: params.From, body: params.Body }));
  } catch (e) {
    console.error("sms inbound:", e.message);
    return twiml("");
  }
}
