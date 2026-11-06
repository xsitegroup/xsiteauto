import { inflateRawSync } from "node:zlib";

// Reads the first sheet of an .xlsx file, or a .csv file, into rows of strings.
// Small on purpose (no spreadsheet library): QuickBooks customer exports are plain tables.

export function readSheet(buf, filename = "") {
  const isZip = buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b;
  if (isZip) return readXlsx(buf);
  if (/\.xls$/i.test(filename) || (buf[0] === 0xd0 && buf[1] === 0xcf)) throw new Error("old_xls");
  return readCsv(buf.toString("utf8").replace(/^﻿/, ""));
}

// ---------- CSV (commas or tabs, quoted fields, newlines inside quotes) ----------
export function readCsv(text) {
  const first = text.split(/\r?\n/, 1)[0] || "";
  const sep = (first.match(/\t/g) || []).length > (first.match(/,/g) || []).length ? "\t" : ",";
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((x) => x.trim())).filter((r) => r.some((x) => x !== ""));
}

// ---------- XLSX (zip of XML parts) ----------
function unzip(buf) {
  // Find the end-of-central-directory record, then read each entry from the central directory.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("bad_zip");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = {};
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("bad_zip");
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    const lNameLen = buf.readUInt16LE(local + 26), lExtraLen = buf.readUInt16LE(local + 28);
    const start = local + 30 + lNameLen + lExtraLen;
    if (/^xl\/(sharedStrings|workbook)\.xml$|^xl\/worksheets\/sheet\d+\.xml$|^xl\/_rels\/workbook\.xml\.rels$/.test(name)) {
      const raw = buf.subarray(start, start + csize);
      const data = method === 8 ? inflateRawSync(raw, { maxOutputLength: 60 * 1024 * 1024 }) : raw;
      files[name] = data.toString("utf8");
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

const unxml = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&amp;/g, "&");
const texts = (xml) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unxml(m[1])).join("");
const colIndex = (ref) => { const l = /^[A-Z]+/.exec(ref)?.[0] || "A"; let n = 0; for (const ch of l) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };

function readXlsx(buf) {
  const files = unzip(buf);
  const shared = files["xl/sharedStrings.xml"] ? [...files["xl/sharedStrings.xml"].matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1])) : [];
  // The first sheet in workbook order.
  let sheetPath = "xl/worksheets/sheet1.xml";
  const wb = files["xl/workbook.xml"], rels = files["xl/_rels/workbook.xml.rels"];
  const firstId = wb && /<sheet\b[^>]*r:id="([^"]+)"/.exec(wb)?.[1];
  const target = firstId && rels && new RegExp(`<Relationship\\b[^>]*Id="${firstId}"[^>]*Target="([^"]+)"`).exec(rels)?.[1];
  if (target) sheetPath = "xl/" + target.replace(/^\/?xl\//, "").replace(/^\//, "");
  const xml = files[sheetPath] || Object.entries(files).find(([k]) => k.startsWith("xl/worksheets/"))?.[1];
  if (!xml) throw new Error("no_sheet");
  const rows = [];
  for (const rm of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];
    for (const cm of rm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1], inner = cm[2] || "";
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
      const t = /\bt="([^"]+)"/.exec(attrs)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      let val = "";
      if (t === "s") val = shared[+v] ?? "";
      else if (t === "inlineStr") val = texts(inner);
      else if (v !== undefined) val = unxml(v);
      const i = ref ? colIndex(ref) : row.length;
      while (row.length < i) row.push("");
      row[i] = String(val).trim();
    }
    if (row.some((x) => x !== "")) rows.push(row);
  }
  return rows;
}
