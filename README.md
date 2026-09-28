# La mia libreria

Sito su Vercel. Si aggiungono ed eliminano libri direttamente dal sito; i libri sono salvati in un Blob store di Vercel.

## File nel repository

```
index.html
books.json        (i 3 libri di esempio iniziali)
package.json
api/books.js
README.md
```

I nomi devono essere esatti. Per creare `api/books.js` su GitHub: **Add file → Create new file**, scrivi `api/books.js` nel campo del nome (la `/` crea la cartella) e incolla il contenuto.

## Attivare "Aggiungi libro" (una sola volta)

1. Su Vercel, apri il progetto → **Storage** → **Create Database** (o **Connect Store**) → **Blob** → **Continue**. Scegli accesso **Public**, dai un nome qualsiasi e **Create**. Vercel aggiunge da solo la variabile `BLOB_READ_WRITE_TOKEN`.
2. Progetto → **Settings** → **Environment Variables**: aggiungi `ADMIN_PASSWORD` con una password lunga scelta da te.
3. **Deployments** → menu **⋯** sull'ultimo deploy → **Redeploy**.

## Usarlo

- Apri il sito con `#admin` in fondo al link (`https://my-library-eight-beryl.vercel.app/#admin`): compare il pulsante **Aggiungi libro**. Chi apre il link normale non lo vede.
- Compila titolo, autore e tag (separati da virgola). **Cerca la trama** propone una trama da Google Books: riscrivila con parole tue o accorciala. Inserisci la password e **Salva libro**. Il libro è subito online per tutti.
- Sempre con `#admin`, aprendo un libro compare **Elimina libro**.
- Per correggere un libro: eliminalo e aggiungilo di nuovo.

## Se una copertina è sbagliata o manca

Il sito la cerca da solo con titolo e autore. Se sbaglia, elimina il libro e riaggiungilo compilando anche il campo **ISBN** (lo trovi sul retro del libro o in una libreria online).

## Note

- `books.json` serve solo come punto di partenza: appena salvi un libro dal sito, i dati vivono nel Blob store.
- Aprendo `index.html` dal computer i libri non si vedono: si guarda sul link Vercel.
- La password protegge il salvataggio: usane una lunga.
