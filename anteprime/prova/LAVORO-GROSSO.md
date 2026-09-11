# LAVORO-GROSSO.md — Rifare l'aspetto di CANTIERI mentre l'app continua a essere modificata

**Aperto:** 10/09/2026
**Chi lo tiene aggiornato:** chi esegue

> Documento unico di questa operazione. Tre sezioni: obiettivo e contesto si aggiorna e non si archivia, la roadmap si chiude fase per fase, le istruzioni operative valgono per tutta la durata.

---

# PARTE 1 — OBIETTIVO E CONTESTO

## Obiettivo

L'app CANTIERI si vede come un prodotto che si vende a professionisti, e ogni schermata costruita da qui in avanti nasce già con lo stile giusto senza doverla rifare.

## Punto di partenza

**Verificato** (letto nel codice e guardato nell'app dal vivo il 10/09/2026):

- Tutti i colori e tutte le misure stanno in `styles.css`, 25 KB, nelle variabili in cima.
- `app.js`, 280 KB, non contiene nessun colore scritto a mano: solo nomi di variabile in venti punti, più i grigi del PDF in `rgb(0-1)`.
- Le quattordici schermate si disegnano dentro `app.js` come testo HTML con i nomi delle classi.
- Ogni blocco è figlio diretto di `#vista`. Le uniche due eccezioni ai margini sono `div.sub` e `button.tend`.
- Quindici misure di testo, nove valori di angolo, otto punti in maiuscoletto, quarantuno riquadri.
- Le emoji stanno dentro `app.js`, nel testo dei bottoni: 🎙️ 🔍 📐 🧮 📄 ✍️ 📱 📷.
- Il carattere è quello di sistema.
- Il service worker è "prima la rete, poi la copia" e mette in cache da solo tutto quello che arriva dall'origine. Un file nuovo non ha bisogno di essere aggiunto a mano alla lista.
- L'unico host esterno permesso dal service worker è `cdnjs.cloudflare.com`, che ospita `pdf-lib` ma non i caratteri.
- Un salvataggio su GitHub pubblica l'app: ramo `main`, cartella radice.

**Dedotto** (da confermare):

- L'altro agente lavora sugli stessi file locali, nella stessa cartella, e tocca soprattutto `app.js`.

**Non lo sappiamo:**

- Quali schermate l'altro agente sta cambiando adesso.
- Quanto durano le sue modifiche.

## Roadblock

- **R1 — Due agenti sullo stesso file.** Chi salva per ultimo cancella l'altro. Vale soprattutto per `app.js`. È il motivo per cui esiste `stile.css`.
- **R2 — Le emoji stanno in `app.js`.** Toglierle vuol dire entrare nel file conteso: non si scappa.
- **R3 — La cache sul telefono.** Dopo un cambio di stile si può continuare a vedere il vecchio finché la cache non gira.
- **R4 — Il carattere non si può scaricare da qui.** La rete di questo ambiente blocca Google Fonts, e cdnjs non ospita IBM Plex. I file del carattere li deve mettere in cartella Simone.
- **R5 — Delle quattordici schermate ne sono state guardate quattro** (elenco, cantiere, giornata, correggi verbale). Le altre usano gli stessi componenti, ma non sono state provate a occhio.

## Decisioni chiuse

| # | Decisione | Presa il |
|---|---|---|
| D1 | I colori non si toccano in questa operazione. Restano i quattro che ci sono. | 10/09/2026 |
| D2 | Lo stile nuovo va in un foglio a parte, `stile.css`, caricato dopo `styles.css`, che non si apre mai. Costo accettato: due fogli che parlano degli stessi elementi, e una fusione a fine lavoro. | 10/09/2026 |
| D3 | Il service worker non si tocca: mette già in cache da solo i file nuovi dell'origine. Un file conteso in meno. | 10/09/2026 |
| D4 | Le icone si disegnano in `stile.css` con la maschera, non come SVG dentro `app.js`. Così `app.js` cambia di poche lettere e il disegno resta in un posto solo. | 10/09/2026 |
| D5 | I sette componenti arrivati dopo (scheda azienda, elenco PDF) si allineano da `stile.css` §16, senza aprire `styles.css`. | 10/09/2026 |
| D6 | L'app sta stretta: spazi ridotti di circa un terzo, margine laterale a 12px, due informazioni sulla stessa riga dove ci stanno. Restano fermi i 52px di qualsiasi bersaglio da toccare e i 64 del bottone principale. | 10/09/2026 |
| D7 | Le azioni della testata scendono a 34px: non sono bersagli da cantiere. Il bottone principale in fondo scende da 64 a 54. | 10/09/2026 |
| D8 | Nell'elenco aziende i cantieri stanno dentro una tendina sulla riga dell'azienda. La scheda dell'azienda si raggiunge dall'ultima voce di dentro, non più dalla riga di testa. | 10/09/2026 |

---

# PARTE 2 — ROADMAP

*Legenda: ⛔ = tocca `app.js`, il file conteso · **[bloccante]** = le fasi dopo non partono prima.*

## Stato di esecuzione

| Fase | Stato |
|---|---|
| 0 — Le regole scritte | **fatto** — `STILE.md` nella cartella dell'app |
| 1 — Le fondamenta | **fatto** — dentro `stile.css`, provato su quattro schermate |
| 2 — La pelle | **fatto in parte** — manca solo il carattere (R4) |
| 3 — Le icone | **fatto** — 27 emoji sostituite in `app.js`, dieci icone in `stile.css` §15 |
| 4 — Le schermate storte | **fatto in parte** — resta il testo del verbale spezzato in capoversi |
| 5 — Compressione | **fatto** — spazi ristretti, `stile.css` §17 |
| 6 — Il giro completo | da fare |

## FASE 0 — Le regole scritte **[bloccante]**

**Esito atteso:** esiste un documento che dice come si vede l'app, e chi costruisce schermate nuove lo può seguire senza chiedere niente a nessuno.

Fatto: `STILE.md`. Va incollato nell'altra chat prima della prossima schermata nuova.

## FASE 1 — Le fondamenta

**Esito atteso:** allineamenti a posto e gerarchia visibile, senza aprire `styles.css`.

Fatto dentro `stile.css`: sei misure di testo al posto di quindici, sette spazi con i due grandi che mancavano, due angoli al posto di nove, il contenitore unico che dà il margine laterale, il ritmo verticale fra i gruppi, i numeri in colonna.

**Punto di revisione di fase 1.** Provata a schermo su elenco, cantiere, giornata e correggi verbale. Emerso e sistemato: la testata rimetteva il bottone di destra prima del titolo nella schermata di partenza; `div.sub` e `button.tend` avevano un margine loro.

## FASE 2 — La pelle

**Esito atteso:** l'app smette di sembrare uno schema a scatole.

Fatto: via il bordo dai riquadri, la banda in testa diventa un'etichetta, il maiuscoletto ridotto da otto posti a due, pastiglie meno tonde e meno grasse, via l'ombra colorata sotto il bottone principale, un solo bottone pieno per barra, miniature ripulite, interlinea 1.6 sul testo lungo, stato visibile quando si tocca.

**Non fatto: il carattere.** Vedi R4. Quando i tre file `woff2` sono in una cartella `font/`, si toglie il commento a sei righe in cima a `stile.css` e funziona da solo — `IBM Plex Sans` è già primo nell'elenco dei caratteri.

## FASE 3 — Le icone ⛔

**Esito atteso:** nessuna emoji nell'app.

Fatto il 10/09/2026, dopo che l'altra chat aveva chiuso il suo giro.

Dieci icone a linea, disegnate in `stile.css` §15 e richiamate da `app.js` con `<span class="ico ico-nome"></span>`. Ventisette sostituzioni: microfono 7, lente 6, documento 3, righello 2, calcolatrice 2, firma 2, fotocamera 2, invio 1, edificio 1, cestino 1.

Tolti anche i selettori di variante emoji, che forzavano il disegno a colori.

Non sono emoji e restano: → ← ✓ ✕ ● ▶ ❚ ☐ ▲ ▼ ↻. Sono segni tipografici monocromatici, uguali su ogni telefono.

**Punto di revisione di fase 3.** Provata dal vivo su Live Server. Al primo giro le icone uscivano come quadrati pieni: nel foglio le virgolette doppie dentro `url("...")` chiudevano la stringa. Rifatte con l'apice singolo.

## FASE 4 — Le schermate storte ⛔

**Esito atteso:** niente si rompe con i dati veri.

Fatto in `stile.css`: la testata che regge i titoli lunghi, le etichette dei bottoni rimpicciolite perché ci stiano, le miniature alleggerite, un solo bottone pieno per barra.

Resta una cosa sola, e sta in `app.js`: **il testo del verbale spezzato in capoversi veri**. Oggi arriva come blocco unico con i ritorni a capo dentro, e l'unica cosa che si può fare da fuori è allargare l'interlinea. Non l'ho toccato: è la funzione che genera il corpo delle sezioni, cioè logica, non stile.

## FASE 5 — Compressione

**Esito atteso:** più roba in una schermata, senza rimpicciolire niente di quello che si tocca.

Fatto in `stile.css` §17 e nella scala degli spazi: margine laterale da 20 a 12, spazio fra due riquadri da 12 a 7, margine interno da 16 a 12, distanza fra i gruppi da 32 a 22. I tre numeri del cantiere passano da 62px di altezza a 36, con valore ed etichetta sulla stessa riga. Righe da 60 a 52, miniature da 104 a 92, pallino del play da 52 a 44.

Il riferimento è l'app di routine di Simone, che è più stretta di così: qui ci si è fermati a metà strada, perché questa si usa con i guanti.

**Punto di revisione di fase 5.** Provata su Live Server: nella scheda azienda entra un cantiere in più nella stessa schermata.

**Secondo giro, sui sei rilievi di Simone:**

1. La testata sprecava spazio: "modifica" era un bottone alto 52 in cima a destra e sotto il titolo restava mezza riga vuota. Le azioni della testata scendono a 34.
2. A destra di "＋ Sopralluogo di oggi" c'erano 120 pixel vuoti: adesso ci sta la data.
3. I quattro bottoni dei rilievi erano due righe da due: adesso una riga sola che scorre di lato.
4. "＋ Foto dal rullino" occupava 52px più i margini per una riga di testo: sceso a 38 senza margini.
5. I bottoni in fondo da 64 a 54.
6. I cantieri dell'azienda chiusi in una tendina. ⛔ questo è in `app.js`.

Tolto anche uno stile scritto a mano dentro `app.js` (l'indirizzo del cantiere aveva un margine suo di 16px, ed era l'ultima riga disallineata rimasta).

## FASE 6 — Il giro completo

**Esito atteso:** tutte e quattordici le schermate provate con i dati veri sul telefono, e i due fogli di stile fusi in uno.

---

# PARTE 3 — ISTRUZIONI OPERATIVE

## Chi fa cosa

**Chi esegue:** Claude per il codice, Simone per tutto quello che riguarda GitHub, il telefono e il coordinamento con l'altra chat.

**Simone — azioni irriducibili:**

1. Dire all'altra chat di fermarsi prima di ogni fase su `app.js`, e dire quando ha finito.
2. Incollare `STILE.md` nell'altra chat.
3. Salvare su GitHub e controllare che l'app pubblicata sia quella giusta.
4. Mettere i tre file del carattere nella cartella `font/`.
5. Provare le schermate sul telefono vero, non solo sullo schermo grande.

## Regole di esecuzione

- **Mai le due chat attive insieme.** Prima che una entri, l'altra ha finito e salvato.
- **`styles.css` non si apre.** Tutto quello che serve si scrive in `stile.css`.
- **Ogni fase finisce con un salvataggio su GitHub.** Piccolo e subito.
- **Prima di ogni fase si scarica, alla fine si carica.**
- **Prima di ogni fase su `app.js` si chiede a Simone cosa sta toccando l'altra chat.** Quelle funzioni non si aprono.
- **Prima di scrivere su un file che esiste, lo si rilegge.** Mai a memoria.
- **Si prova prima di scrivere.** Il foglio si prova iniettandolo nell'app pubblicata e guardando le schermate, poi si scrive nella cartella.

## Cosa non si tocca, in nessuna fase

- I colori. Nessun colore nuovo, nessun colore spostato.
- `styles.css`.
- La logica dell'app: quello che fa, come salva, come parla con i servizi.
- `sw.js`, il service worker.
- Il PDF e il suo impaginato.

## Fuori dallo scope di questo lavoro

- Il passaggio a due colori. È un lavoro a sé, e Simone lo ha rimandato.
- Le funzioni nuove che sta facendo l'altra chat.
- Il piano prodotto e l'abbonamento (`PIANO-PRODOTTO.md`).
