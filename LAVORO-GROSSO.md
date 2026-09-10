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

---

# PARTE 2 — ROADMAP

*Legenda: ⛔ = tocca `app.js`, il file conteso · **[bloccante]** = le fasi dopo non partono prima.*

## Stato di esecuzione

| Fase | Stato |
|---|---|
| 0 — Le regole scritte | **fatto** — `STILE.md` nella cartella dell'app |
| 1 — Le fondamenta | **fatto** — dentro `stile.css`, provato su quattro schermate |
| 2 — La pelle | **fatto in parte** — manca il carattere (R4) e le icone (fase 3) |
| 3 — Le icone | da fare — ⛔ |
| 4 — Le schermate storte | da fare in parte — ⛔ |
| 5 — Il giro completo | da fare |

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

Un corredo di venti icone a linea, in un file a parte, e la sostituzione punto per punto dentro `app.js`.

Primo passo dentro il file conteso: va fatto in una finestra in cui l'altra chat è ferma.

## FASE 4 — Le schermate storte ⛔

**Esito atteso:** niente si rompe con i dati veri.

Rimane da fare in `app.js`, perché in `stile.css` non si può:

- il testo dettato spezzato in capoversi veri, invece di un blocco continuo
- le etichette dei bottoni troppo lunghe per lo spazio che hanno ("Correggi il verbale", "Rilievo da contabilità")
- le miniature: quattro segni su un quadrato di 104px sono ancora troppi

## FASE 5 — Il giro completo

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
