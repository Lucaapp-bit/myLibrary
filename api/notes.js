import crypto from "node:crypto";
import { put, list, del } from "@vercel/blob";

// Le note di Luca stanno in Vercel Blob, separate da books.json:
// ogni salvataggio crea notes/<timestamp>.json (niente cache vecchie) e restano gli ultimi 5 backup.
const sha = s => crypto.createHash("sha256").update(String(s)).digest();
const samePassword = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));
const clean = (s, max) => String(s ?? "").trim().slice(0, max);
const keyOf = (title, author) => `${title}|${author}`.toLowerCase();
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function versions() {
  const { blobs } = await list({ prefix: "notes/" });
  return blobs.filter(b => b.pathname.endsWith(".json")).sort((a, b) => b.pathname.localeCompare(a.pathname));
}

async function readNotes() {
  const [latest] = await versions();
  if (!latest) return {};
  const r = await fetch(latest.url);
  if (!r.ok) throw new Error("lettura note non riuscita");
  const d = await r.json();
  return d && typeof d === "object" && !Array.isArray(d) ? d : {};
}

async function saveNotes(notes) {
  await put(`notes/${Date.now()}.json`, JSON.stringify(notes, null, 2), {
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
    try { return res.status(200).json({ notes: await readNotes() }); }
    catch { return res.status(500).json({ error: "Impossibile leggere le note." }); }
  }
  if (req.method !== "POST") return res.status(405).json({ error: "Metodo non consentito." });

  const { ADMIN_PASSWORD } = process.env;
  if (!ADMIN_PASSWORD) return res.status(500).json({ error: "Manca la variabile ADMIN_PASSWORD su Vercel." });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};
  if (!samePassword(body.password ?? "", ADMIN_PASSWORD)) {
    await sleep(500);
    return res.status(401).json({ error: "Password errata." });
  }
  if (body.action === "check") return res.status(200).json({ ok: true });

  const title = clean(body.title, 200), author = clean(body.author, 200), note = clean(body.note, 2000);
  if (!title || !author) return res.status(400).json({ error: "Libro non valido." });

  try {
    const notes = await readNotes();
    const k = keyOf(title, author);
    if (note) notes[k] = note; else delete notes[k];
    await saveNotes(notes);
    return res.status(200).json({ ok: true, removed: !note });
  } catch (e) {
    const hint = /token|store|access/i.test(String(e && e.message))
      ? " Controlla che l'archivio Blob sia collegato al progetto." : "";
    return res.status(500).json({ error: "Errore nel salvataggio." + hint });
  }
}
