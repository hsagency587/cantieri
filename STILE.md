# STILE.md — come si vede CANTIERI

**Aggiornato:** 10/09/2026

> Le regole dello strato visivo dell'app. Servono a due cose: sono il riferimento di chi ritocca l'aspetto, e sono quello che si incolla a chi costruisce schermate nuove, perché nascano già giuste e non si debbano rifare.
>
> Le misure qui scritte vivono in `stile.css`. Se cambia una, cambiano tutte e due.

---

## La regola che viene prima delle altre

**Due colori, uno principale e uno secondario.** Il colore non porta mai da solo un'informazione: quello che oggi dice il colore lo devono dire anche il riempimento (pieno contro vuoto), il peso del carattere, la posizione e lo spazio.

Nessun colore nuovo nasce in `stile.css`. Si usano solo le variabili che ci sono già.

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
| `--s2` | 8px | due cose dello stesso pezzo |
| `--s3` | 12px | due pezzi dentro lo stesso blocco |
| `--s4` | 16px | il margine interno di un blocco |
| `--s5` | 24px | due blocchi |
| `--s6` | 32px | due gruppi diversi |
| `--s7` | 48px | due parti diverse della schermata |

La regola che conta: **fra due gruppi diversi si usa `--s6`, mai `--s5`.** Se tutte le distanze si somigliano, niente si separa da niente e la schermata sembra un elenco piatto.

---

## 3. Gli angoli: due

- `--radius-p` = 8px — cose piccole: bottoni, campi, riquadri numerici, pastiglie grandi
- `--radius` = 16px — contenitori: card, fogli dal basso, foto grandi

Le pastiglie piccole hanno 6px. **Niente pastiglie completamente tonde**: sono il segno delle app di consegne, non degli strumenti da lavoro.

---

## 4. Il margine laterale lo dà il contenitore

`#vista` ha `padding-left` e `padding-right` uguali a `--margine` (16px, 20px sopra i 400px di larghezza).

**Nessun blocco si porta il margine laterale addosso.** Chi costruisce una schermata nuova non scrive `margin:0 16px` da nessuna parte: scrive il blocco e basta.

Se un blocco nuovo esce dal contenitore, si aggiunge alla lista in `stile.css` §3 — non si rimette un margine a mano.

L'unica cosa che ignora il contenitore è la barra fissa in fondo, che è attaccata allo schermo.

---

## 5. La testata

Struttura fissa:

- **riga 1** — il tasto indietro a sinistra, le azioni e lo stato a destra
- **riga 2** — il titolo, a tutta larghezza, allineato al margine come tutto il resto
- **riga 3** — il sottotitolo, `--t2`, colore spento

Il titolo è `--t5`, peso 700, interlinea 1.15.

**Il titolo non divide mai la riga con un bottone.** I titoli veri sono lunghi ("Aq 15 Via mosso", "Gio 10 settembre"): se il bottone gli sta a fianco, si spezzano in due righe.

Nella schermata di partenza, che non ha il tasto indietro, il titolo resta in linea con il bottone di destra.

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

Misure che non si toccano, vengono dal cantiere e non dall'estetica: 64px il bottone principale, 52px qualsiasi cosa da toccare.

---

## 9. Le icone

**Mai emoji.** Le emoji cambiano disegno su ogni telefono, sono colorate di loro e sono il segnale più forte che un programma è fatto in casa.

Icone disegnate a linea, tutte con lo stesso spessore, tutte della stessa misura, tutte dello stesso colore del testo che accompagnano.

*(Il corredo di icone non è ancora dentro l'app: le emoji stanno in `app.js`. È il primo lavoro della prossima fase.)*

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
