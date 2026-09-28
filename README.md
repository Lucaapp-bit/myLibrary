# La mia libreria

Sito statico: nessuna build, nessuna dipendenza. Il sito è tutto in `index.html`.

## Pubblicare (GitHub + Vercel)

1. Su github.com crea un nuovo repository, ad esempio `libreria` (pubblico o privato).
2. Nel repository scegli **Add file → Upload files**, trascina `index.html`, `README.md` e `.gitignore`, poi **Commit changes**.
3. Su vercel.com/new scegli **Import** sul repository `libreria`.
4. Lascia **Framework Preset: Other**, nessun Build Command, nessun Output Directory. Premi **Deploy**.
5. Vercel ti dà un link tipo `libreria-xxxx.vercel.app`: è quello da mandare.

Da ora ogni modifica salvata su GitHub viene pubblicata da sola in circa un minuto.

## Aggiungere o modificare libri

1. Su GitHub apri `index.html` e premi l'icona della matita.
2. Cerca `const BOOKS` e copia un blocco `{ ... }` per ogni libro nuovo:

```js
{title:"Titolo", author:"Autore", tags:["Argomento","Ambientazione"], fav:true,
 plot:"Trama in poche righe.", note:"Il mio commento (facoltativo)"},
```

3. **Commit changes**. Il sito si aggiorna da solo.

Campi: `fav:true` mette la stella (consigliato), `note` è facoltativo. Le copertine si cercano da sole con titolo e autore.

## Se una copertina è sbagliata o manca

- Aggiungi `isbn:"978..."` al libro, oppure
- carica l'immagine nella cartella `img/` del repository (**Add file → Upload files**, cartella `img`) e scrivi `cover:"img/nome.jpg"`. È la soluzione più sicura.

## Dominio personalizzato (facoltativo)

Su Vercel: Project → Settings → Domains.
