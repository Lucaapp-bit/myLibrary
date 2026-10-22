// fetch-covers.mjs — scarica UNA VOLTA le copertine e le salva nel progetto.
// Uso (Node 18+), dalla cartella del progetto che contiene books.json:
//   node fetch-covers.mjs            -> solo i libri senza copertina
//   node fetch-covers.mjs --force    -> rifà tutte le copertine
// Facoltativo, se Google risponde 429: GOOGLE_BOOKS_KEY=la_tua_chiave node fetch-covers.mjs
import fs from "node:fs/promises";

const FORCE = process.argv.includes("--force");
const KEY = process.env.GOOGLE_BOOKS_KEY ? `&key=${process.env.GOOGLE_BOOKS_KEY}` : "";
const sleep = ms => new Promise(r => setTimeout(r, ms));
const enc = encodeURIComponent;
const norm = s => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const surname = b => norm(b.author.split(/ e |,| & /)[0]).split(" ").pop();
const shortTitle = b => b.title.split(/[.:]/)[0].trim();
const slug = s => norm(s).replace(/ /g, "-").slice(0, 60);
// ISBN registrati in Italia: 978-88 (o il vecchio 88-...)
const itIsbn = list => (list || []).some(x => /^(97888|88)/.test(String(x).replace(/[^0-9Xx]/g, "")));

async function getJSON(url) {
  for (let i = 0; i < 5; i++) {
    try {
      const r = await fetch(url);
      if (r.status === 429 || r.status >= 500) { await sleep(2000 * (i + 1)); continue; }
      return r.ok ? await r.json() : null;
    } catch { await sleep(1000); }
  }
  return null;
}

// Dimensioni dell'immagine, per scartare i segnaposto "immagine non disponibile"
function dims(b) {
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b.length > 10 && b.toString("ascii", 0, 3) === "GIF") return { w: b.readUInt16LE(6), h: b.readUInt16LE(8) };
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m === 0xff) { i++; continue; }
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  return null;
}

async function download(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const type = r.headers.get("content-type") || "";
    if (!type.startsWith("image/")) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    const d = dims(buf);
    if (buf.length < 3000 || !d || d.w < 100 || d.h < 140) return null;
    return { buf, ext: type.includes("png") ? "png" : "jpg" };
  } catch { return null; }
}

const titleForms = b => [...new Set([shortTitle(b), b.titleEn && b.titleEn.split(/[.:]/)[0].trim()].filter(Boolean))];
function score(c, b) {
  const na = surname(b), t = norm(c.title);
  if (!t) return 0;
  let ts = 0;
  for (const f of titleForms(b)) {
    const nt = norm(f);
    ts = Math.max(ts, t === nt ? 4 : (t.startsWith(nt) || nt.startsWith(t)) ? 3 : t.includes(nt) ? 2 : 0);
  }
  const au = (c.authors || []).some(a => norm(a).includes(na));
  return ts && au ? ts + 2 : 0; // serve sia il titolo sia l'autore
}

async function candidates(b) {
  const out = [];
  const forms = titleForms(b);
  // 1) Apple Books (store italiano): rapido, senza chiave, edizioni italiane
  for (const t of forms.slice(0, 2)) {
    const a = await getJSON(`https://itunes.apple.com/search?media=ebook&entity=ebook&country=it&limit=15&term=${enc(t + " " + surname(b))}`);
    for (const x of (a && a.results) || []) {
      if (!x.artworkUrl100) continue;
      out.push({ title: x.trackName, authors: [x.artistName], it: true,
        urls: [x.artworkUrl100.replace(/\/\d+x\d+bb/, "/600x600bb"), x.artworkUrl100.replace(/\/\d+x\d+bb/, "/300x300bb")] });
    }
    await sleep(500);
  }
  // 2) Google Books
  for (const q of [...forms.map(t => `intitle:${t} inauthor:${surname(b)}`), `${shortTitle(b)} ${surname(b)}`]) {
    const g = await getJSON("https://www.googleapis.com/books/v1/volumes?maxResults=20&printType=books&country=IT"
      + "&fields=items(volumeInfo(title,authors,imageLinks,industryIdentifiers))"
      + `&q=${enc(q)}${KEY}`);
    for (const i of (g && g.items) || []) {
      const v = i.volumeInfo || {};
      if (!v.imageLinks || !v.imageLinks.thumbnail) continue;
      const base = v.imageLinks.thumbnail.replace("http:", "https:").replace("&edge=curl", "");
      out.push({ title: v.title, authors: v.authors, it: itIsbn((v.industryIdentifiers || []).map(x => x.identifier)),
        urls: [base.replace("zoom=1", "zoom=2"), base] });
    }
    await sleep(900);
  }
  // 3) Open Library
  for (const t of forms) {
    const o = await getJSON(`https://openlibrary.org/search.json?limit=20&fields=title,author_name,cover_i,isbn&title=${enc(t)}&author=${enc(surname(b))}`);
    for (const x of (o && o.docs) || []) {
      if (!x.cover_i) continue;
      out.push({ title: x.title, authors: x.author_name, it: itIsbn(x.isbn),
        urls: [`https://covers.openlibrary.org/b/id/${x.cover_i}-L.jpg`] });
    }
    await sleep(500);
  }
  return out.map(c => ({ ...c, s: score(c, b) })).filter(c => c.s)
    .sort((a, z) => (z.it - a.it) || (z.s - a.s)).slice(0, 8);
}

const books = JSON.parse(await fs.readFile("books.json", "utf8"));
await fs.mkdir("covers", { recursive: true });
await fs.copyFile("books.json", "books.json.bak");
const used = new Set(), review = [], lines = [];
let done = 0;

async function tryBook(b) {
  const name = slug(b.title) || "libro";
  let hit = null;
  for (const c of await candidates(b)) {
    for (const u of c.urls) { const img = await download(u); if (img) { hit = { ...img, it: c.it }; break; } }
    if (hit) break;
  }
  if (!hit) return false;
  let file = `${name}.${hit.ext}`, n = 2;
  while (used.has(file)) file = `${name}-${n++}.${hit.ext}`;
  used.add(file);
  await fs.writeFile(`covers/${file}`, hit.buf);
  b.cover = `covers/${file}`;
  done++;
  if (hit.it) lines.push(`OK   ${b.title}`);
  else { lines.push(`OK?  ${b.title} (edizione non italiana)`); review.push(b.title); }
  return true;
}

const pending = [];
for (const b of books) {
  if (b.cover && !FORCE) { lines.push(`==   ${b.title} (già presente)`); continue; }
  console.log(`> ${b.title}`);
  if (!(await tryBook(b))) pending.push(b);
  await sleep(1000);
}
// secondo passaggio, con più calma, per chi è rimasto senza copertina
if (pending.length) { console.log(`\nSecondo passaggio: ${pending.length} libri`); await sleep(20000); }
const notFound = [];
for (const b of pending) {
  console.log(`> (2) ${b.title}`);
  if (!(await tryBook(b))) { notFound.push(b.title); lines.push(`NO   ${b.title}`); }
  await sleep(3000);
}

await fs.writeFile("books.json", JSON.stringify(books, null, 2) + "\n");
const report = `Copertine salvate: ${done}\n` + lines.join("\n") + "\n";
await fs.writeFile("covers-report.txt", report);
console.log("\n" + report);
if (notFound.length) console.log(`Non trovate (usa "Cambia copertina" sul sito):\n  - ${notFound.join("\n  - ")}`);
