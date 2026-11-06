"use client";
import { useEffect } from "react";

// Inside a shop's own website, tells embed.js how tall the booking card is so the frame fits without scrolling.
export default function EmbedSize() {
  useEffect(() => {
    if (window.parent === window) return;
    let last = 0;
    const send = () => {
      const h = Math.ceil(document.documentElement.scrollHeight);
      if (h !== last) { last = h; window.parent.postMessage({ type: "xsite-booking-height", height: h }, "*"); }
    };
    const ro = new ResizeObserver(send);
    ro.observe(document.body);
    send();
    // Scroll the host page to the top of the frame when the card changes step.
    const onStep = () => window.parent.postMessage({ type: "xsite-booking-step" }, "*");
    document.addEventListener("click", (e) => { if (e.target.closest(".bk-go, .bk-link")) setTimeout(onStep, 80); });
    return () => ro.disconnect();
  }, []);
  return null;
}
