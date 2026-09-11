# LAVORO-GROSSO-PRODOTTO.md — da app personale ad app vendibile

**Aperto:** 11/09/2026
**Chi lo tiene aggiornato:** chi esegue

> Documento unico dell'operazione che porta CANTIERI da programma sul telefono di una persona a servizio venduto in abbonamento ad aziende.
> Non sostituisce `PIANO-PRODOTTO.md`, che resta il ragionamento di partenza: questo è il piano di esecuzione.
> Non sostituisce `LAVORO-GROSSO.md`, che riguarda lo stile e va avanti per conto suo.

---

# PARTE 1 — OBIETTIVO E CONTESTO

## Obiettivo

Un'impresa che non conosci compra l'abbonamento, installa l'app e lavora — e **nessuna riga dell'Allegato C del kit privacy è falsa** il giorno che la firma.

Il secondo pezzo è il metro di misura di tutto il lavoro. Le misure di sicurezza non sono un capitolo a parte: sono quelle che hai già scritto, e che oggi in gran parte non esistono.

## Punto di partenza

**Verificato** (controllato, non supposto — 11/09/2026):

- Il deposito del codice `hsagency587/cantieri` è **pubblico** e leggibile da chiunque. Deve restarlo: con l'account GitHub gratuito le pagine si pubblicano solo da un deposito pubblico.
- Il PIN del modo sviluppatore sta in chiaro in `app.js` riga 12. Chiunque apra il file lo legge.
- I dati stanno nel deposito privato `hsagency587/cantieri-dati`. L'indirizzo pubblico del vecchio file risponde 404.
- Le tre chiavi (Groq, Anthropic, token GitHub) stanno in `localStorage`, cioè nella memoria del browser del telefono.
- Le chiavi nelle impostazioni sono già mascherate, e la schermata è già protetta dal PIN. Quel lavoro è fatto e non va rifatto.
- Non esiste nessun database. I dati sono un file `dati.json`.
- Non esiste nessun accesso: chi apre l'indirizzo dell'app entra.
- Le anteprime per ramo funzionano: `https://hsagency587.github.io/cantieri/anteprime/<ramo>/`. Il giro di lavoro è in `PROCEDURA-anteprima-e-rilascio.md`.

**Dedotto** (ragionevole, da verificare in esecuzione):

- Il costo per cliente resta sotto i 2 euro al mese ai volumi del piano. Si verifica sul consumo vero del primo mese con l'app di tuo padre sul nuovo giro.
- L'app sul telefono non va riscritta: cambia solo con chi parla. Si verifica al passo 1.4, quando la prima chiamata passa dal server.

**Non lo sappiamo:**

- Quanto costa davvero la copia esterna a 30 giorni. Si scopre scegliendo dove mettere le copie (passo 2.3).
- Se un cliente chiederà per contratto che i dati non escano dall'Europa. Lo dirà il primo cliente che lo chiede; oggi l'Allegato B dichiara i fornitori americani ed è sufficiente.

## Roadblock

- **R1 — La partita IVA.** Senza, non si incassa. Non blocca le fasi tecniche, blocca la vendita. In programma, fuori da questo documento.
- **R2 — L'altra chat lavora sugli stessi file.** `app.js` e `stile.css` sono toccati in parallelo. Ogni modifica di questo lavoro passa dal ramo `prova`, mai da `main` a mano.
- **R3 — Il credito sui fornitori.** Sull'account Anthropic ci sono 5 dollari e il ricaricamento automatico è spento. Il giorno che il server prende le chiavi, un consumo anomalo di un cliente ferma tutti. Il tetto per cliente (passo 2.4) va prima dei clienti veri, non dopo.
- **R4 — L'isolamento arriva tardi.** Se non è nel primo giorno del database, ogni lettura e ogni scrittura già scritte vanno riviste una per una.

## Decisioni chiuse

| # | Decisione | Presa il |
|---|---|---|
| D1 | Il server sta su **Supabase, regione Francoforte**. Motivo: l'obiettivo dichiarato è vendere senza rischi sui dati, e la manutenzione della sicurezza deve stare su un fornitore con contratto, non su Simone. Cloudflare è uscito perché D1 non impone l'isolamento a livello di database, e l'Allegato C promette che lo imponga il sistema di archiviazione e non il codice. | 11/09/2026 |
| D2 | Si resta su **Groq e Anthropic**, fornitori americani, con le clausole contrattuali tipo. Motivo: l'Allegato B del kit li dichiara già. Un trasferimento dichiarato è lecito. | 11/09/2026 |
| D3 | La **copia di sicurezza esterna a 30 giorni** si costruisce comunque, con qualunque fornitore. Motivo: Supabase Pro tiene 7 giorni, e le sue copie stanno dentro Supabase, quindi non sono "infrastruttura distinta" come promesso nell'Allegato C. | 11/09/2026 |
| D4 | Le modifiche si provano sul ramo `prova` e si vedono su `anteprime/prova/`. Su `main` non si scrive mai a mano. | 11/09/2026 |

---

# PARTE 2 — ROADMAP

*Legenda: ⛔ = passo irreversibile · **[bloccante]** = le fasi dopo non partono finché questa non è chiusa.*

## Il metro di misura

Questa tabella è il capitolato del lavoro. Ogni riga viene dall'Allegato C del kit privacy o dal Documento 2. La colonna "dove" dice in che passo si costruisce.

| Promessa firmata al cliente | Oggi | Dove si costruisce |
|---|---|---|
| accesso con collegamento via email, senza password | no | 1.3 |
| accesso amministrativo con secondo fattore | no | 1.3 |
| credenziali dei fornitori mai sui dispositivi degli utenti | no | 1.4 |
| dati isolati a livello di base di dati, imposto dal sistema | no | 1.2 ⛔ |
| file e immagini non raggiungibili da indirizzi pubblici | no | 1.5 |
| comunicazioni cifrate (HTTPS) | sì | — |
| dati cifrati anche da fermi | no | 1.1 |
| copie giornaliere tenute 30 giorni, infrastruttura distinta | no | 2.3 |
| prova di ripristino ogni tre mesi | no | 2.3 |
| fornitore alternativo per trascrizione e per il testo | no | 2.1 |
| registro accessi conservato 12 mesi | no | 2.5 |
| limite di richieste per utente | no | 2.4 |
| aggiornamento librerie di terzi | sì | — |
| nessun dipendente, riservatezza | sì | — |
| Documento 2 art. 7 — estrarre, correggere, cancellare | no | 3.3 |
| Documento 2 art. 9 — 60 giorni per scaricare, poi cancellare | no | 3.3 |

## Stato di esecuzione

| Fase | Stato |
|---|---|
| Fase 0 — mettere in sicurezza quello che c'è | **fatto** — dati nel deposito privato, token con scadenza e permessi ristretti |
| Fase 1 — il server | da fare |
| Fase 2 — affidabilità e continuità | da fare |
| Fase 3 — il pannello e i diritti del cliente | da fare |
| Fase 4 — vendita e pagamenti | da fare |
| Fase 5 — carte in regola | in corso — kit scritto, partita IVA e firme in programma |

---

## FASE 1 — Il server **[bloccante]**

**Esito atteso:** nessuna chiave nel telefono, i dati in un database che impone da solo l'isolamento, l'app di tuo padre che lavora sul nuovo giro come primo cliente vero.

### 1.1 — Il progetto e la cifratura a riposo

Si apre il progetto su Supabase, regione Francoforte. Si scarica e si archivia il loro contratto GDPR: serve per l'Allegato B, non è un formalismo.

Si compila l'Allegato B del kit: fornitore, paese, garanzie.

### 1.2 — Il disegno dei dati e l'isolamento ⛔

Si disegnano le tabelle: cliente, persone, cantieri, sopralluoghi, verbali, foto, audio, listino, consumi.

Ogni tabella porta la colonna del cliente. Si accendono le regole del database che filtrano per cliente — la sicurezza a livello di riga di Postgres. Il database rifiuta da solo le richieste che chiedono righe di un altro.

Si prova con due clienti finti prima di andare avanti: il secondo cliente non deve vedere niente del primo.

**Perché è irreversibile:** dopo questo passo ogni lettura e ogni scrittura del programma dipendono da questa forma.

### 1.3 — Chi entra

Accesso con collegamento via email, senza password. È già pronto in Supabase, si configura.

Il pannello di amministrazione di Simone protetto da password lunga più secondo fattore, obbligatorio.

### 1.4 — Le chiavi passano al server

Si scrive il pezzo di server che sta in mezzo: riceve la registrazione dall'app, chiama Groq e Anthropic con le chiavi che stanno solo lì, e restituisce il risultato.

Nell'app si tolgono i tre campi delle chiavi e le chiamate dirette ai fornitori.

Il PIN del modo sviluppatore alla riga 12 sparisce con loro: quando non ci sono più chiavi da proteggere, quella porta non serve.

Dopo questo passo si revocano e si rifanno tutte e tre le chiavi, perché le vecchie sono passate per dei telefoni.

### 1.5 — Le foto e gli audio

Vanno nel magazzino file, non nel database. Nessun indirizzo pubblico: l'app chiede al server un collegamento che vale pochi minuti.

Resta fermo quello che l'Allegato B promette: **le fotografie non si mandano ai fornitori americani.**

### 1.6 — L'app di tuo padre passa al nuovo giro

Si crea il suo account come primo cliente. Si portano dentro i dati che ha oggi. Si verifica che non manchi niente prima di spegnere il vecchio giro.

**Punto di revisione di fase 1.**

---

## FASE 2 — Affidabilità e continuità

**Esito atteso:** si può spegnere Groq e l'app continua a funzionare. Una copia dei dati esiste fuori da Supabase ed è stata riprovata.

- **2.1** — Secondo fornitore per la trascrizione e per il testo, con passaggio automatico.
- **2.2** — Interruttore automatico: se un fornitore sbaglia molte volte di fila, il server smette di provarci per qualche minuto.
- **2.3** — Copia giornaliera esterna, tenuta 30 giorni, fuori da Supabase. Prova di ripristino ogni tre mesi, segnata sul calendario.
- **2.4** — Tetto di consumo per cliente e tetto totale sull'account dei fornitori.
- **2.5** — Registro degli accessi e delle operazioni, conservato 12 mesi.
- **2.6** — Controllo automatico ogni minuto che prova un giro completo, e avviso quando fallisce due volte.

---

## FASE 3 — Il pannello e i diritti del cliente

**Esito atteso:** crei un cliente nuovo senza toccare il codice, e un cliente può prendersi i suoi dati da solo.

- **3.1** — Elenco clienti, chi paga, chi consuma cosa.
- **3.2** — Interruttori per funzione e impostazioni per cliente: logo sul PDF, intestazione, listino, sezioni attive.
- **3.3** — I tasti promessi nel Documento 2: estrai, correggi, cancella; scarico completo nei 60 giorni dopo la disdetta; attestazione scritta della cancellazione.
- **3.4** — L'accesso di Simone all'account di un cliente per assistenza, registrato. Va scritto nel contratto di vendita, altrimenti è un accesso non autorizzato.

---

## FASE 4 — Vendita e pagamenti

**Esito atteso:** uno sconosciuto compra e usa l'app senza che tu faccia niente.

Pagina di vendita, Stripe, prova gratuita, invito via email, blocco automatico di chi non paga secondo la scaletta del piano, fattura elettronica collegata.

---

## FASE 5 — Carte in regola *(in parallelo, non alla fine)*

- Kit privacy: scritto. Mancano i dati anagrafici nei segnaposto e l'Allegato B.
- **Manca il contratto di vendita**, che il kit dichiara di non coprire: prezzo, durata, disdetta, limite di responsabilità, cosa succede se chiudi. È il documento che ti protegge i soldi.
- Le righe sull'intelligenza artificiale: una nell'app, una sul PDF, una nel contratto.
- Partita IVA e inquadramento: in programma, fuori da questo documento.

---

# PARTE 3 — ISTRUZIONI OPERATIVE

## Chi fa cosa

**Chi esegue il codice:** Claude Code, sul ramo `prova`.

**Simone — azioni irriducibili:**

1. Aprire il progetto Supabase e scegliere la regione.
2. Creare, revocare e incollare le chiavi dei fornitori.
3. Confermare ogni passo marcato ⛔ prima che parta.
4. Unire `prova` dentro `main` quando l'anteprima convince.
5. Firmare e archiviare i contratti dei fornitori.

## Regole di esecuzione

- Ogni modifica passa dal ramo `prova` e si guarda su `anteprime/prova/`. Su `main` non si scrive a mano.
- L'altra chat lavora su `app.js` e `stile.css`: modifiche chirurgiche, niente riscritture, niente riordino di funzioni esistenti.
- Il vecchio giro non si spegne finché il nuovo non ha funzionato con dati veri.
- Prima di ogni passo irreversibile: si scrive cosa si sta per fare, si aspetta il via.
- Se manca un dato, ci si ferma e si chiede. Non si riempie il buco.

## Cosa non si tocca, in nessuna fase

- `styles.css` — non si apre mai.
- Il modo in cui l'app lavora senza rete: la coda e i tentativi restano.
- Il PDF e la relazione di fine cantiere.
- La logica dei sopralluoghi, delle giornate e dello scan.
- La storia del deposito GitHub.

## Fuori dallo scope di questo lavoro

- Lo stile e il passaggio a due colori: stanno in `LAVORO-GROSSO.md`.
- Il prezzo, il nome commerciale e i pacchetti di vendita.
- La partita IVA e l'inquadramento.
- La pulizia della storia del deposito pubblico.
