# Cosa c'è di nuovo da vestire — nota per chi lavora sullo stile

Scritta il 10/09/2026 da chi ha lavorato su `app.js`.

## Come ci dividiamo i file

- **`styles.css` è tuo.** Da adesso non lo tocco più. Quello che ci trovi dentro di mio (elencato sotto) puoi riscriverlo, spostarlo o buttarlo: non lo rimetto.
- **`app.js` è mio.** Se ti serve una classe diversa o un pezzo di struttura HTML per far funzionare lo stile, dimmelo tramite Simone e lo cambio io.
- Se mi servirà una regola nuova la metto in un file a parte, `stili-nuovi.css`, non nel tuo.

## Le classi che ho aggiunto io, e a cosa servono

Sono tutte in fondo a `styles.css`, dalla riga ~190 in poi. Nessuna tocca le regole che c'erano prima.

### Audio

- `.x-riga` — la ✕ in fondo alla riga di un audio, per cancellarlo.
- `.audio-lista` e `.audio-lista.corta` — la scatola alta tre righe che scorre dentro di sé.
- `.lista-tutta` — il tasto "▼ Vedi tutte e N" sotto quella scatola.

### Foto e documenti

- `.foto-fila` — la striscia orizzontale delle miniature (il rullino).
- `.foto-mini`, `.foto-mini .q`, `.foto-mini .e` — la miniatura, il riquadro dell'immagine, l'etichetta sotto.
- `.foto-mini .x-mini` — la ✕ nell'angolo alto della miniatura.
- `.foto-mini .tacca` e `.tacca.on` — il bollino "☐ PDF" / "✓ PDF" nell'angolo basso. **È un tasto**, non una scritta: si tocca per marcare la foto.
- `.foto-grande`, `.foto-dati`, `.foto-vuota` — la schermata di una foto sola.

### PDF archiviati

- `.riga-pdf` e i suoi `.n`, `.n .t`, `.n .s` — la riga di un PDF nell'elenco: nome sopra, data e peso sotto, tasto "Manda" e ✕.

### Aziende

- `.az-riga`, `.az-logo`, `.az-logo.vuoto` — la riga di un'azienda con il logo davanti. Senza logo mostra due lettere.
- `.riga.az-capo` — la riga dell'azienda in cima alla sua card, con i cantieri sotto.
- `.riga.piu` — la riga "＋ cantiere" in fondo alla card di un'azienda.
- `.az-imm`, `.az-slot` — i due riquadri logo e firma nella scheda dell'azienda. Lo sfondo delle immagini è bianco apposta: un logo o una firma su fondo scuro non si leggono.

### Riuso di classi che c'erano già

Non ho inventato niente dove esisteva: uso `.card`, `.card-capo`, `.card-corpo`, `.card-piede`, `.griglia`, `.btn`, `.pill`, `.riga`, `.eti`, `.avviso`, `.tend`, `.barra`, `.az` come li trovavo.

## Schermate nuove, per sapere dove guardare

| Dove | Cosa c'è di nuovo |
|---|---|
| Prima schermata | **AZIENDE**: ogni impresa è una card con logo, e i suoi cantieri come righe dentro |
| Scheda azienda | dati per la carta intestata, più logo e firma |
| Giornata | tendina "Rilievi e documenti"; card del verbale quando è già fatto |
| Giornata | card **Documenti**: bolle e moduli firme scansionati |
| Cantiere | card "Rilievi e documenti" coi quattro tasti |
| Cantiere → tendina | riga **PDF archiviati** |
| Schermata PDF | elenco dei PDF per mese |
| Prima schermata | card gialla **Settimana da chiudere**, da mercoledì |

## Due cose da non rompere

1. **`.foto-mini .tacca` deve restare toccabile** e grande almeno 30 pixel: è il modo per dire quali foto vanno nel PDF.
2. **`.az-slot img` ha lo sfondo bianco**: serve per vedere loghi e firme, che sono quasi sempre scuri su trasparente.
