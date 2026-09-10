# STILE.md — come si vede CANTIERI

**Aggiornato:** 10/09/2026

> Le regole dello strato visivo dell'app. Servono a due cose: sono il riferimento di chi ritocca l'aspetto, e sono quello che si incolla a chi costruisce schermate nuove, perché nascano già giuste e non si debbano rifare.
>
> Le misure qui scritte vivono in `stile.css`. Se cambia una, cambiano tutte e due.

---

## La regola che viene prima delle altre

**Due colori, uno principale e uno secondario.** Il colore non porta mai da solo un'informazione: quello che oggi dice il colore lo devono dire anche il riempimento (pieno contro vuoto), il peso del carattere, la posizione e lo spazio.

I due colori si scelgono dalle impostazioni e finiscono in `--accent` (il principale: il lavoro fatto, i tasti, i totali) e `--azione` (il secondario: quello che si apre e si consulta).

**Nessun colore si scrive mai a mano.** Nemmeno uno sfondo trasparente: gli sfondi si ricavano dal colore scelto con `color-mix`. Un `rgba` scritto a mano resta del colore vecchio quando l'utente cambia tinta, e si vede subito.

---

## Dove si scrive

| Cosa | Dove va |
|---|---|
| misure, spazi, angoli, carattere | `stile.css` |
| regole scritte a parole | questo file |
| il foglio di partenza | `styles.css` — **non si apre** |
| le schermate | `app.js` |

`stile.css` si carica **dopo** `styles.css` e lo corregge per sovrapposizione. Questo permette a due persone di lavorare sull'app nello stesso periodo senza cancellarsi il lavoro.

---

## 1. Il testo: sei misure, non quindici

| Nome | Misura | Si usa per |
|---|---|---|
| `--t1` | 13px | etichette, targhe dei codici, didascalie |
| `--t2` | 15px | testo di servizio, sottotitoli, note |
| `--t3` | 17px | il testo che si legge davvero |
| `--t4` | 20px | titoli di blocco |
| `--t5` | 24px | titolo di schermata |
| `--t6` | 30px | numeri grossi |

**Nessuna misura fuori da queste sei.** Se una cosa non sta in nessuna, si sceglie la più vicina.

Sotto `--t2` non va nessuna informazione che si deve leggere. Il minimo assoluto resta 13px, e solo per etichette.

Pesi: 400 per il testo, 600 per i titoli piccoli e le etichette, 700 per i titoli e i numeri. Niente 800.

I numeri stanno in colonna: dove c'è una quantità, un'ora o un importo, si usa `font-variant-numeric:tabular-nums`.

---

## 2. Lo spazio: sette gradini

| Nome | Misura | Si usa fra |
|---|---|---|
| `--s1` | 4px | due cose attaccate |
| `--s2` | 7px | due cose dello stesso pezzo, e fra due riquadri |
| `--s3` | 10px | due pezzi dentro lo stesso blocco |
| `--s4` | 12px | il margine interno di un blocco |
| `--s5` | 14px | due blocchi |
| `--s6` | 18px | due gruppi diversi |
| `--s7` | 26px | due parti diverse della schermata |

La regola che conta: **fra due gruppi diversi si usa `--s6`, mai `--s5`.** Se tutte le distanze si somigliano, niente si separa da niente e la schermata sembra un elenco piatto.

**L'app sta stretta.** In cantiere si guarda il telefono con una mano sola: più roba entra nella schermata, meno si scorre con i guanti addosso. Quando c'è il dubbio fra due misure, si sceglie la più piccola.

**Ma i bersagli non si comprimono.** Qualsiasi cosa si tocchi resta alta almeno 52px, e il bottone principale 64. Si toglie l'aria, non lo spazio per il dito.

---

## 3. Gli angoli: due

- `--radius-p` = 8px — cose piccole: bottoni, campi, riquadri numerici, pastiglie grandi
- `--radius` = 14px — contenitori: card, fogli dal basso, foto grandi

Le pastiglie piccole hanno 6px. **Niente pastiglie completamente tonde**: sono il segno delle app di consegne, non degli strumenti da lavoro.

---

## 4. Il margine laterale lo dà il contenitore

`#vista` ha `padding-left` e `padding-right` uguali a `--margine` (12px, 14px sopra i 400px di larghezza).

**Nessun blocco si porta il margine laterale addosso.** Chi costruisce una schermata nuova non scrive `margin:0 16px` da nessuna parte: scrive il blocco e basta.

Se un blocco nuovo esce dal contenitore, si aggiunge alla lista in `stile.css` §3 — non si rimette un margine a mano.

L'unica cosa che ignora il contenitore è la barra fissa in fondo, che è attaccata allo schermo.

---

## 5. La testata

Due forme, e la scelta la fa il tasto indietro.

**Con il tasto indietro — la barra.** `‹` a sinistra, l'azione a destra, e in mezzo **una frase sola**: il nome in grassetto, poi committente, codice e indirizzo staccati da un punto.

Finché quella frase ci sta su una riga, la testata è alta una riga. Se non ci sta va a capo, e si ferma alla seconda: la terza si taglia.

Il nome è `--t3` peso 700, il resto `--t2` spento. Stessa misura, pesi diversi: la gerarchia la fa il peso, non la dimensione.

**Senza tasto indietro — il titolo grande.** `--t5`, a sinistra, con l'azione in linea a destra. È la schermata di partenza.

In tutte e due vale la stessa regola: il contesto è una frase sola separata da `·`, mai tre righe incolonnate a sinistra.

---

## 5bis. Gli elenchi lunghi si chiudono

Un elenco che si guarda ogni tanto sta dentro una tendina, chiusa di partenza.

I cantieri di un'azienda stanno dentro la riga dell'azienda: si apre quella che serve. Con una sola azienda in elenco resta aperta, se no sarebbe un tocco in più a ogni apertura dell'app.

Quando la riga di testa diventa un interruttore, quello che quella riga apriva prima si ritrova come ultima voce di dentro — nel caso dell'azienda, "Scheda azienda".

---

## 6. I riquadri: se ne usano pochi

Un riquadro (`.card`) serve quando un gruppo di cose deve leggersi come una cosa sola. Se il gruppo si capisce dallo spazio che ha intorno, **il riquadro non serve**.

- niente bordo: separa il fondo, non la riga
- l'etichetta in testa non è una banda con il fondo diverso: è un'etichetta appoggiata sopra il contenuto, `--t1`, peso 700, maiuscoletto
- mai un riquadro dentro un riquadro

---

## 7. Il maiuscoletto, solo in due posti

1. le etichette di gruppo (`.eti`, `.card-capo`)
2. le targhe dei codici (`.pill.cod`, `.targa`)

**Da nessun'altra parte.** Il maiuscoletto usato ovunque smette di dire "questa è un'etichetta" e abbassa il livello di tutto.

---

## 8. I bottoni: uno solo comanda

In ogni schermata, e in ogni barra, **c'è un solo bottone pieno**. È l'azione che si fa adesso.

Tutti gli altri sono dello stesso colore ma vuoti — bordo e testo, fondo trasparente.

Niente ombre colorate sotto i bottoni.

Le altezze:

- **54px** il bottone principale in fondo
- **52px** qualsiasi altra cosa che si tocca in cantiere — righe, campi, tendine
- **34px** le azioni della testata (modifica, scheda, ＋ azienda)

Le prime due vengono dal cantiere: si toccano con i guanti. La terza no: le azioni della testata si usano da fermi, e un bottone alto 52 lassù ruba mezza riga di titolo.

---

## 8bis. Due informazioni sulla stessa riga

Quando due cose brevi stanno bene affiancate, si affiancano.

I tre numeri in cima al cantiere erano tre riquadri alti 62px per dire "1 giorni". Adesso valore ed etichetta stanno sulla stessa riga e il riquadro è alto 36.

Prima di mettere una cosa a capo: ci sta di fianco? Se ci sta, ci va.

Vale anche per il vuoto a destra di un titolo. "＋ Sopralluogo di oggi" aveva 120 pixel vuoti alla sua destra: adesso ci sta la data.

**Quando gli elementi sono più di due e non ci stanno, si mette una fila che scorre di lato** invece di andare a capo. I quattro bottoni dei rilievi erano due righe da due: adesso sono una riga sola che si tira col dito, come la striscia delle foto.

---

## 8ter. Il carattere

IBM Plex Sans, un file solo per tutti i pesi da 400 a 700, in `font/plex.ttf`. È ridotto al solo alfabeto latino e ai segni che l'app usa: 77 KB, 40 in rete.

È disegnato per la documentazione tecnica: i numeri sono chiari e non è il carattere di sistema di nessuno, quindi l'app ha una faccia sua.

Interlinea 1.4 in tutta l'app. Sul testo lungo che si legge davvero — il verbale a tutto schermo — 1.55.

---

## 9. Le icone

**Mai emoji.** Le emoji cambiano disegno su ogni telefono, sono colorate di loro e sono il segnale più forte che un programma è fatto in casa.

Icone disegnate a linea, tutte con lo stesso spessore, tutte della stessa misura, tutte dello stesso colore del testo che accompagnano.

Le dieci icone dell'app: `microfono`, `lente`, `documento`, `righello`, `calcolatrice`, `firma`, `fotocamera`, `invio`, `edificio`, `cestino`.

Il disegno sta in `stile.css` §15, non in `app.js`. Nel codice dell'app si scrive solo:

```html
<span class="ico ico-microfono"></span>
```

L'icona prende da sola il colore del testo che le sta accanto. Per aggiungerne una nuova si aggiunge una riga in `stile.css` §15, non si mette un SVG dentro `app.js`.

---

## 10. Il testo lungo

Un verbale dettato arriva come un blocco continuo. Interlinea 1.6.

Quando si costruisce una schermata nuova che mostra testo dettato, **i capoversi si separano davvero**, uno per paragrafo, non affidandosi ai ritorni a capo dentro un blocco unico.

---

## 11. Quando si tocca, si vede

Ogni cosa toccabile ha uno stato visibile quando riceve il fuoco: contorno di 2px, staccato di 2px.

Serve a chi usa l'app con i guanti e a chi la usa con la tastiera.

---

## Come si controlla una schermata nuova

Sette domande, in ordine:

1. Le misure del testo sono fra le sei? 
2. Fra due gruppi diversi c'è `--s6`?
3. Il blocco si porta un margine laterale addosso? (deve essere no)
4. Il titolo sta in una riga sola con i dati veri, non con quelli di prova?
5. C'è un solo bottone pieno?
6. Ci sono emoji? (deve essere no)
7. Il maiuscoletto è solo su etichette e targhe?
8. C'è qualcosa che va a capo e starebbe di fianco?
9. C'è del vuoto a destra di una riga corta?
10. Un elenco lungo si può chiudere in una tendina?
11. Una riga alta 52 serve davvero a toccare, o è solo una frase?
