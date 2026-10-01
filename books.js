import crypto from "node:crypto";
import { put, list, del } from "@vercel/blob";

const sha = s => crypto.createHash("sha256").update(String(s)).digest();
const samePassword = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));
const clean = (s, max) => String(s ?? "").trim().slice(0, max);
// Qualsiasi indirizzo https ragionevole va bene: Google Books, Open Library, Amazon, l'editore, ecc.
// La scelta della copertina è già fatta a mano dalla persona che salva (protetta da password),
// quindi qui basta scartare input evidentemente non validi, non limitare la provenienza.
const okCover = u => /^https:\/\//.test(u) && u.length < 600 && !/[\s"'<>]/.test(u);
const same = (x, y) =>
  x.title.toLowerCase() === y.title.toLowerCase() && x.author.toLowerCase() === y.author.toLowerCase();

// Ogni salvataggio crea un nuovo file books/<timestamp>.json: niente cache vecchie, e restano gli ultimi backup.
async function versions() {
  const { blobs } = await list({ prefix: "books/" });
  return blobs.filter(b => b.pathname.endsWith(".json")).sort((a, b) => b.pathname.localeCompare(a.pathname));
}

async function seed(req) {
  try {
    const host = req.headers["x-forwarded-host"] || req.headers.host;
    const r = await fetch(`https://${host}/books.json`);
    if (r.ok) { const d = await r.json(); if (Array.isArray(d)) return d; }
  } catch {}
  return [];
}

async function readBooks(req) {
  const [latest] = await versions();
  if (latest) {
    const r = await fetch(latest.url);
    if (r.ok) return await r.json();
  }
  return seed(req);
}

async function saveBooks(books) {
  await put(`books/${Date.now()}.json`, JSON.stringify(books, null, 2), {
    access: "public",
    addRandomSuffix: false,
    contentType: "application/json",
  });
  const old = (await versions()).slice(5);
  if (old.length) await del(old.map(b => b.url));
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") {
    try { return res.status(200).json(await readBooks(req)); }
    catch { return res.status(500).json({ error: "Impossibile leggere i libri." }); }
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Metodo non consentito." });

  const { ADMIN_PASSWORD } = process.env;
  if (!ADMIN_PASSWORD) return res.status(500).json({ error: "Manca la variabile ADMIN_PASSWORD su Vercel (vedi README)." });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  if (!samePassword(body.password ?? "", ADMIN_PASSWORD)) return res.status(401).json({ error: "Password errata." });

  const b = body.book || {};
  const book = {
    title: clean(b.title, 200),
    author: clean(b.author, 200),
    tags: (Array.isArray(b.tags) ? b.tags : []).map(t => clean(t, 40)).filter(Boolean).slice(0, 10),
    plot: clean(b.plot, 2500),
  };
  if (b.note) book.note = clean(b.note, 1000);
  if (b.isbn) book.isbn = clean(b.isbn, 20).replace(/[^0-9Xx]/g, "");
  if (b.cover && okCover(String(b.cover))) book.cover = String(b.cover);
  if (b.titleEn) book.titleEn = clean(b.titleEn, 200);
  if (b.plotEn) book.plotEn = clean(b.plotEn, 2500);
  if (Array.isArray(b.tagsEn)) {
    const en = b.tagsEn.map(t => clean(t, 40)).filter(Boolean);
    if (en.length === book.tags.length) book.tagsEn = en;
  }

  try {
    if (body.action === "import") {
      const initial = await seed(req);
      if (!initial.length) return res.status(400).json({ error: "books.json non trovato o vuoto nel sito." });
      await saveBooks(initial);
      return res.status(200).json({ ok: true, count: initial.length });
    }

    const books = await readBooks(req);

    if (body.action === "covers") {
      let n = 0;
      for (const c of Array.isArray(body.covers) ? body.covers : []) {
        const u = String((c && c.cover) || "");
        if (!okCover(u)) continue;
        const target = { title: clean(c.title, 200), author: clean(c.author, 200) };
        for (const x of books) if (same(x, target) && x.cover !== u) { x.cover = u; n++; }
      }
      if (n) await saveBooks(books);
      return res.status(200).json({ ok: true, count: n });
    }

    if (body.action === "delete") {
      if (!book.title || !book.author) return res.status(400).json({ error: "Libro non valido." });
      const next = books.filter(x => !same(x, book));
      if (next.length === books.length) return res.status(404).json({ error: "Libro non trovato." });
      await saveBooks(next);
      return res.status(200).json({ ok: true });
    }

    if (!book.title || !book.author || !book.tags.length || !book.plot) {
      return res.status(400).json({ error: "Titolo, autore, tag e trama sono obbligatori." });
    }
    if (books.some(x => same(x, book))) return res.status(409).json({ error: "Questo libro è già in libreria." });
    books.push(book);
    await saveBooks(books);
    return res.status(200).json({ ok: true });
  } catch (e) {
    const hint = /token|store|access/i.test(String(e && e.message))
      ? " Controlla che il Blob store sia collegato al progetto e sia Public."
      : "";
    return res.status(500).json({ error: "Errore nel salvataggio." + hint });
  }
}
