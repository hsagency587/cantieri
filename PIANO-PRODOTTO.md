# CANTIERI — piano per farla diventare un prodotto da vendere

**Scritto il:** 10/09/2026
**Stato dell'app:** modifiche funzionali in corso in un'altra chat. Questo piano riguarda solo il dopo.
**A cosa serve:** capire cosa manca fra l'app di oggi e un prodotto che si vende a più clienti.

---

## In una riga

L'app di oggi funziona per tuo papà, ma non si può vendere così com'è: le chiavi dei servizi stanno nel telefono di chi la usa, e i dati finiscono in un archivio pubblico su GitHub.

Per venderla serve un pezzo nuovo che oggi non c'è: un tuo server. Tutto il resto — pagamenti, account, memoria, aggiornamenti — si appoggia a quello.

---

## PARTE 0 — Tre cose da fare subito, prima ancora di pensare a vendere

Queste non riguardano il prodotto. Riguardano l'app che gira adesso sul telefono di tuo papà.

**1. Il deposito su GitHub è pubblico.**
I verbali, i nomi degli operai, i committenti e la contabilità stanno in `dati.json` sul ramo `dati` di un deposito pubblico. Chiunque conosca l'indirizzo li legge. Va reso privato oggi, non alla fine delle modifiche.

**2. Le chiavi stanno in chiaro nel telefono.**
Chiave Groq, chiave Anthropic e token GitHub stanno dentro `localStorage` (la memoria del browser). Chi ha il telefono in mano le legge. Finché l'app è solo di tuo papà è un rischio piccolo. Il giorno che la installi su un telefono non tuo, quelle chiavi spendono i tuoi soldi.

**3. Il token GitHub è senza scadenza e con permesso di scrittura.**
Se esce, chi lo ha può riscrivere il deposito. Va sostituito con uno a scadenza, o eliminato del tutto quando arriva il server.

Costo di queste tre: mezz'ora. Il punto 1 è l'unico urgente davvero.

---

## PARTE 1 — Il salto: cosa cambia da app personale a prodotto

Oggi l'app è **tutta dentro il telefono**. Parla direttamente con Groq, con Anthropic e con GitHub, usando le chiavi che le hai messo dentro.

Un prodotto non può funzionare così. Serve un **server tuo** in mezzo: un computer sempre acceso, da qualche parte, che sta fra il telefono del cliente e i fornitori.

Cosa fa il server:

- tiene le chiavi (il cliente non le vede e non le tocca mai);
- riconosce chi sta chiedendo (l'account);
- conta quanto consuma ogni cliente e blocca chi sfora;
- tiene i dati di ogni cliente separati da quelli degli altri;
- riceve i pagamenti e spegne l'accesso a chi non paga.

Questo è il pezzo che non esiste. Da qui in avanti tutto il piano è: come si fa questo pezzo, e cosa ci si attacca.

**Quello che non cambia.** L'app sul telefono resta quella: stessa faccia, stesso funzionamento senza rete, stessa installazione dalla schermata home. Cambia solo con chi parla. Il lavoro fatto finora non si butta.

---

## PARTE 2 — Sicurezza

L'obiettivo non è "essere sicuri". È: se qualcuno entra, cosa può prendere, e cosa gli impedisce di prenderlo.

### Le chiavi

Con il server, le chiavi Groq e Anthropic stanno solo lì, in un posto cifrato che non finisce mai nel codice. Il telefono del cliente non le ha mai viste.

Al posto della chiave, ogni cliente ha un **gettone** (una stringa che dice "sono io", che scade e si rinnova da sola). Se lo rubano, vale poco e per poco tempo. E tu lo puoi annullare da solo, per un cliente solo, senza toccare gli altri.

### I dati di ogni cliente

Ogni riga di dati porta scritto a quale cliente appartiene. Il database rifiuta le richieste che chiedono righe di un altro cliente. Non è il codice a decidere: è il database. Se sbagli una riga di codice, il dato resta comunque chiuso.

Questa cosa si chiama **isolamento** e va messa il primo giorno. Aggiungerla dopo significa riscrivere tutto quello che legge e scrive.

### Le foto e gli audio

Non stanno nel database ma in un magazzino di file. Nessun file è raggiungibile con un indirizzo pubblico. Quando il telefono deve mostrare una foto, chiede al server un indirizzo che vale pochi minuti e poi muore.

### Chi entra

Accesso senza password: il cliente scrive la sua email, riceve un link, tocca il link ed è dentro. Niente password da dimenticare, niente password da rubare.

Per te che amministri: password lunga più secondo fattore (un codice dal telefono), obbligatorio.

### Le cose noiose che evitano i guai

- Tutto passa da HTTPS (la connessione cifrata), sempre.
- Dati cifrati anche quando sono fermi sul disco.
- Un tetto di richieste al minuto per cliente: chi sfonda viene rallentato.
- Registro di chi ha fatto cosa e quando, tenuto 12 mesi.
- Copie di sicurezza ogni giorno, tenute 30 giorni, in un posto diverso dal server. E una prova di ripristino ogni tre mesi: una copia mai riprovata non è una copia.
- Le librerie esterne aggiornate. Oggi ne usi una sola (pdf-lib) e va bene così: meno roba di altri, meno buchi.

### Se succede lo stesso

Un piano scritto di mezza pagina: chi te lo segnala, cosa spegni per primo, come avvisi i clienti, entro quando devi avvisare il Garante (72 ore, vedi Parte 6).

---

## PARTE 3 — Che non si rompa, anche se si rompe un fornitore

Tu dipendi da tre servizi di altri: Groq per trascrivere la voce, Anthropic per scrivere il referto, e chi ti tiene il server. Se uno si ferma, si ferma il tuo prodotto.

La regola: **niente si perde mai, anche quando qualcosa non funziona.**

### Il lavoro non si butta mai

L'audio registrato resta sul telefono finché non è stato trascritto **e** confermato dal server. Questa cosa c'è già nell'app, con la coda e i tentativi: va tenuta e allargata anche alle foto.

Il geometra in cantiere deve poter registrare tutto anche senza campo. È il caso normale, non l'eccezione.

### Un secondo fornitore per ogni pezzo

- Trascrizione: se Groq non risponde in tot secondi o dà errore, il server prova un secondo fornitore. La coda non si accorge di niente.
- Testo: stessa cosa con un secondo modello.

Non serve che il secondo sia bello uguale. Serve che ci sia.

### L'interruttore automatico

Se un fornitore sbaglia molte volte di fila, il server smette di provarci per qualche minuto e passa all'altro. Senza questo, un fornitore lento blocca tutta la coda di tutti i clienti.

### Sapere che è rotto prima che te lo dicano

Un controllo automatico ogni minuto che prova a fare un giro completo. Se fallisce due volte, ti arriva un messaggio. Costa pochi euro al mese.

E una pagina pubblica dove il cliente vede se il problema è tuo o suo. Evita metà delle telefonate.

### Il tetto di spesa

Un limite di consumo per cliente, e un limite totale sul tuo account dei fornitori. Un cliente che registra otto ore di fila non ti deve svuotare il credito.

### Gli aggiornamenti che non rompono

Oggi pubblichi e va a tutti insieme. Con dei clienti veri serve:

- una copia di prova dove provi prima (stessa cosa, indirizzo diverso, dati finti);
- il numero di versione della cache che si alza da solo (ce l'hai già, con il workflow di GitHub Actions);
- la possibilità di tornare indietro alla versione di prima in un minuto;
- la regola che il server vecchio deve funzionare con l'app nuova e viceversa, perché un telefono chiuso in tasca per due settimane ha ancora la versione vecchia.

---

## PARTE 4 — Più memoria, su un cloud esterno

Il telefono ha poco spazio. Oggi l'app tiene 30 giorni di audio e poi ti dice di scaricare. Le foto ridotte a 1600px pesano circa 300 KB l'una.

Il magazzino esterno risolve: le foto e gli audio salgono, sul telefono resta solo quello che serve adesso.

### Quanto spazio serve davvero

Conto su un cliente che lavora tanto: 40 sopralluoghi al mese, 20 foto ciascuno.

- Foto: 800 al mese × 300 KB = **240 MB al mese**, cioè circa **3 GB all'anno**.
- Audio: 40 registrazioni da 6 minuti ≈ 60 MB al mese.

Sono numeri piccoli. Lo spazio non è un problema di soldi, è un problema di dove lo metti.

### Quanto costa

Cloudflare R2: 0,015 dollari per GB al mese, con 10 GB al mese gratis, e **zero costo per far uscire i dati** (verificato 10/09/2026).

Tradotto: un cliente con 3 GB di foto ti costa **meno di 5 centesimi al mese**.

Il costo di uscita è la trappola dei magazzini classici: su Amazon S3 far scaricare i file si paga a parte, e con le foto quel costo cresce da solo. Su R2 non esiste.

### Come si vende

Tre modi, e la scelta è tua (vedi i bivi in fondo):

- **tutto incluso senza limiti**, semplice da spiegare, rischioso solo se qualcuno esagera;
- **una quota inclusa** (es. 50 GB) e poi tanto al GB;
- **incluso finché il cliente paga**: se disdice, ha 60 giorni per scaricare tutto e poi si cancella. Va scritto nel contratto.

La regola tecnica in ogni caso: le foto vecchie di un anno si spostano da sole in un magazzino più lento e più economico. Restano, ma costano meno.

---

## PARTE 5 — Tanti clienti, installazione senza codici

Questo è il capitolo che decide se il prodotto si vende o no. Oggi installare l'app significa creare tre chiavi e incollarle. Nessun cliente lo farà.

### Come deve andare

1. Il cliente compra dal tuo sito.
2. Riceve una email con un link.
3. Tocca il link dal telefono: si apre l'app, già collegata al suo account.
4. "Aggiungi a schermata Home". Finito.

Zero codici. Zero chiavi. Zero configurazione. Il primo giro dura meno di un minuto.

### Cosa serve sotto

**Un solo programma per tutti.** Non una copia dell'app per cliente. Una sola app, un solo server, e i dati separati dentro. Se fai una copia per cliente, al decimo cliente non aggiorni più niente.

**Ogni account ha dentro:** il cliente (l'impresa o lo studio), le persone che ci lavorano, i loro permessi, l'abbonamento, i consumi.

**Le persone.** Un'impresa con tre geometri deve poter avere tre accessi che vedono gli stessi cantieri. Questo va pensato adesso anche se lo attivi dopo: attaccarlo in seguito è caro.

**Le impostazioni per cliente.** Logo sul PDF, intestazione, listino prezzi, sezioni del verbale attive o spente. Ogni cliente ha le sue, e tu le cambi dal tuo pannello senza toccare il codice.

**Gli interruttori per funzione.** Ogni pezzo grosso (foto, relazione di fine cantiere, contabilità) ha un interruttore per account. Serve a due cose: vendere pacchetti diversi, e spegnere una funzione che sta dando problemi a un cliente solo senza fermare tutti.

Questo è quello che chiedi quando dici "totalmente gestibile e modulabile da me".

**Il tuo pannello.** Una pagina dove vedi l'elenco clienti, chi paga, chi consuma cosa, e dove entri nell'account di un cliente per capire un problema che ti ha segnalato. Quest'ultima cosa va scritta nel contratto, altrimenti è un accesso non autorizzato ai suoi dati.

### Dove sta il server — è il bivio più costoso da disfare

| | Cosa è | Costo al mese | Cosa ti costa |
|---|---|---|---|
| **A. Supabase** | Pacchetto pronto: database, account, magazzino file, tutto insieme. Regione europea (Francoforte). | 25 dollari fissi, poi 0,125 $/GB di database oltre gli 8 GB inclusi e 0,09 $/GB di banda oltre i 250 GB | Il più veloce da mettere in piedi. Dipendi da un fornitore solo. Il costo fisso c'è anche con due clienti. |
| **B. Cloudflare** | Pezzi separati (Workers, D1, R2). Si può obbligare i dati a stare in Europa. | pochi euro fino a decine di clienti | Il più economico e il più veloce a rispondere. Devi scrivere a mano cose che Supabase ti regala (account, permessi). Più lavoro all'inizio. |
| **C. Server tuo in Europa** | Una macchina affittata (Hetzner in Germania, Aruba in Italia) con tutto sopra. | 5-20 euro | Controllo totale, nessun vincolo. Aggiornamenti di sicurezza, copie e riavvii li fai tu. È un lavoro che non finisce mai. |

Cambiare più avanti si può, ma significa riscrivere la parte che parla col server e spostare i dati dei clienti attivi. Lì costa.

---

## PARTE 6 — Pagamenti mensili

### Chi incassa

**Con Stripe sei tu che vendi.** Il cliente paga con carta, Stripe trattiene la commissione e ti accredita il resto.

Commissioni per un'azienda italiana: **1,5% + 0,25 euro** su carte europee, 2,9% + 0,25 su carte di fuori (verificato 10/09/2026). Su un abbonamento da 39 euro sono circa 84 centesimi.

La parte per gli abbonamenti (Stripe Billing) si paga in più sul ricorrente: il listino va guardato prima di fare i conti finali.

**L'alternativa** è un rivenditore che vende al posto tuo (Paddle, Lemon Squeezy): incassa lui, si prende circa il 5%, e ti toglie ogni problema di IVA. Ma non emette la fattura elettronica italiana. I tuoi clienti sono imprese italiane e quella fattura la vogliono. Per loro non va bene.

### La fattura

I tuoi clienti sono aziende con partita IVA. Ogni abbonamento vuole una **fattura elettronica** mandata al Sistema di Interscambio. Vale anche in forfettario.

Stripe non la fa. Serve un servizio di fatturazione che si colleghi a Stripe (Fatture in Cloud, Aruba e simili) e la generi da solo quando il pagamento va a buon fine. Farla a mano funziona con cinque clienti, non con cinquanta.

### Chi non paga

Regole scritte una volta e poi automatiche:

- carta rifiutata → si riprova a 1, 3 e 5 giorni, con una email ogni volta;
- dopo 7 giorni → l'account passa in **sola lettura**: il cliente vede e scarica tutto, ma non crea più niente;
- dopo 30 giorni → account sospeso, dati conservati;
- dopo 60 giorni → si cancella, dopo un ultimo avviso.

Non cancellare mai i dati di un cliente che non paga senza avvisarlo: è il modo più veloce per prendere una causa.

### La prova gratis

14 giorni senza carta, oppure con carta e primo addebito al quindicesimo giorno. Il secondo modo vende di più e fa arrivare meno gente che tanto non avrebbe comprato.

### Cosa ti costa un cliente al mese

Conto sui prezzi veri di oggi, su un cliente che fa 40 sopralluoghi al mese:

| Voce | Costo |
|---|---|
| Trascrizione (4 ore di audio, Groq turbo a 0,04 $/ora) | 0,16 $ |
| Referti (40 chiamate a Claude Haiku, circa 0,009 $ l'una) | 0,36 $ |
| Foto e audio (3 GB su R2) | 0,05 $ |
| Commissione Stripe su 39 euro | 0,84 € |
| **Totale variabile** | **circa 1,40 € al mese** |

Più il costo fisso del server: 25 dollari al mese con Supabase, pochi euro con Cloudflare.

Con Supabase il **primo cliente** copre già il costo fisso del server. Dal secondo in poi è quasi tutto margine.

Questo conto dice una cosa importante: il prezzo non lo decidono i costi. Lo decide quanto vale a un geometra non passare la sera a scrivere i verbali.

---

## PARTE 7 — A norma di legge

### GDPR — è il capitolo grosso

Nei verbali ci sono nomi di operai, di committenti, di referenti, e foto dove si vedono persone. Sono dati personali. Il GDPR si applica, senza scampo.

**Chi è chi.** Il cliente (l'impresa) è il **titolare** (decide lui perché e come si usano i dati). Tu sei il **responsabile** (tratti i dati per conto suo). È la posizione normale di chi vende un programma in abbonamento.

**Cosa devi avere, in pratica:**

1. **Un contratto di nomina a responsabile** allegato al contratto di vendita. È obbligatorio (art. 28 GDPR). Dice cosa fai con i dati, per quanto, e cosa succede alla fine. Senza questo il cliente non è a norma, e la colpa ricade anche su di te.
2. **L'elenco dei sub-responsabili**: chi ti aiuta a trattare quei dati. Sono Groq, Anthropic, e chi ti tiene il server. Va scritto nel contratto, e il cliente va avvisato se cambi fornitore.
3. **Il registro dei trattamenti**: un foglio che dice quali dati tratti, perché, dove stanno, quanto li tieni.
4. **L'informativa** sul tuo sito, per i dati che raccogli tu (email, pagamenti).
5. **La procedura per le violazioni**: se ti bucano, avvisi il cliente subito, e chi è titolare ha 72 ore per avvisare il Garante (art. 33 GDPR).
6. **Cancellazione e portabilità**: il cliente deve poter scaricare tutto e chiedere la cancellazione. Va costruito, non promesso.

**Il punto che ti riguarda più di tutti: i dati vanno negli Stati Uniti.**

- Groq: per impostazione predefinita non conserva i dati delle richieste; li tiene fino a 30 giorni per controlli di affidabilità e abusi, in magazzini Google Cloud **negli Stati Uniti**. Si appoggia alle clausole contrattuali standard per il trasferimento (verificato 10/09/2026).
- Anthropic: cancella richieste e risposte entro 30 giorni, ha un contratto GDPR pronto, e per i clienti commerciali esiste l'accordo di **conservazione zero** (verificato 10/09/2026).

Questo non è vietato. Ma va dichiarato al cliente, con le clausole contrattuali standard in mano. Se vuoi poter dire "i tuoi dati non escono dall'Europa", devi cambiare fornitori: esistono servizi europei per trascrizione e testo, costano di più e vanno provati.

È una scelta di prodotto, non tecnica: cambia cosa puoi promettere a un cliente che te lo chiede. E qualcuno te lo chiederà, soprattutto se lavora per enti pubblici.

### AI Act

Dal **2 agosto 2026** sono in vigore gli obblighi di trasparenza dell'articolo 50: chi mette a disposizione un sistema di intelligenza artificiale deve dire all'utente che sta parlando con una macchina, e i contenuti generati vanno riconoscibili (verificato 10/09/2026).

Per te si traduce in poco, ma va fatto:

- una riga nell'app che dice che il referto è scritto da un'intelligenza artificiale partendo dal tuo dettato;
- una riga sul PDF, per lo stesso motivo;
- una riga nel contratto che dice che il testo va sempre riletto e approvato da chi firma.

Quest'ultima ti protegge davvero: se un verbale sbagliato causa un danno, la responsabilità è di chi lo firma, non del programma che l'ha scritto.

Le regole sui sistemi ad alto rischio sono state rimandate al 2027-2028 e la tua app non ci rientra comunque.

### Il contratto di vendita

Cose che devono esserci, e che quasi nessuno mette:

- **cosa vendi**: l'accesso al servizio, non il programma. Il codice resta tuo.
- **quanto deve funzionare**: se prometti una percentuale, prometti poco (99% è già tanto per uno che lavora da solo) e scrivi cosa succede se non la rispetti.
- **limite di responsabilità**: mai oltre quello che il cliente ti ha pagato in un anno. Senza questa riga, un errore da 39 euro al mese può costarti quanto un cantiere.
- **i dati sono suoi**: lo dici chiaro, e dici come li riprende.
- **cosa succede se chiudi**: 60 giorni per scaricare tutto. Questa riga fa vendere, perché è la prima paura di chi compra da un fornitore piccolo.
- **disdetta**: quando, con quanto preavviso, e niente rinnovo automatico silenzioso.
- **la tua manutenzione**: che puoi entrare nel suo account per assistenza, e quando.

Sono clienti aziende, non consumatori: niente diritto di recesso di 14 giorni, e nessun obbligo del Codice del consumo. Se un giorno vendi anche a privati, quel capitolo si riapre.

### Sicurezza informatica per legge (NIS2)

Le regole europee sulla sicurezza (recepite col D.Lgs. 138/2024) valgono per aziende medie e grandi in settori elencati. Tu no.

Ma i tuoi clienti grossi possono chiedertelo come fornitore, con un questionario. Avere già le cose della Parte 2 ti fa passare quel questionario senza fatica.

---

## PARTE 8 — Fisco

### La cosa che viene prima di tutte

Non puoi vendere abbonamenti senza partita IVA. Non è una zona grigia: un abbonamento mensile è un'attività continuativa, e va aperta prima del primo incasso.

Questo si incrocia con la decisione che hai già in sospeso su quando aprirla. Qui il piano dice solo una cosa: **la data di apertura non può essere dopo la prima vendita.**

### Professionista o impresa: il bivio che pesa di più

Vendere un programma in abbonamento non è la stessa cosa che fare un sito su commessa. Molti la trattano come attività commerciale, con iscrizione alla Camera di Commercio.

Cosa cambia davvero, con i numeri del 2026:

| | Professionista (gestione separata) | Impresa (gestione commercianti) |
|---|---|---|
| Contributi | **26,07%** sul reddito, e basta (circolare INPS n. 8 del 03/02/2026, verificato 10/09/2026) | **4.611,64 euro all'anno fissi**, anche con zero incassi, più il 24,48% sulla parte eccedente (circolare INPS n. 14/2026, verificato 10/09/2026) |
| Camera di Commercio | no | sì, con diritto annuale |
| Se non fatturi niente | non paghi contributi | paghi lo stesso i 4.611 euro |

La differenza al primo anno, se vendi poco, sono più di 4.000 euro.

Esiste una riduzione del 50% dei contributi per 36 mesi per chi si iscrive la prima volta come artigiano o commerciante in forfettario, introdotta dalla legge di bilancio 2025. **Se vale ancora per le iscrizioni del 2026 va verificato all'INPS prima di scegliere**: non sono riuscito a confermarlo con una fonte ufficiale aggiornata.

Questa è una scelta che vincola per anni ed è cara da disfare. È uno dei pochi casi in cui vale la spesa di un commercialista, una volta sola, per l'inquadramento e il codice attività.

### Il conto, se resti in forfettario

Il codice attività del software (62.01, produzione di software) sta nel gruppo "altre attività economiche": coefficiente di redditività **67%** (allegato 4 della L. 190/2014, verificato 10/09/2026).

Attenzione: diversi siti scrivono 78%. È sbagliato: il 78% vale per le attività professionali dei codici 69-75, non per l'informatica.

Esempio con 30 clienti a 39 euro al mese, incassati tutto l'anno:

```
Incassato nell'anno                    14.040 €
× coefficiente 67%                      9.407 €   ← è questo il reddito, non i 14.040
× 5% (primi 5 anni di nuova attività)     470 €
× 15% (aliquota normale)                1.411 €
```

Dai 9.407 euro si tolgono anche i contributi versati **dentro l'anno**, e l'imposta scende. Il primo anno spesso non hai ancora versato niente, quindi il conto qui sopra è quello prudente: peggio di così non va.

Il 5% dei primi cinque anni vale solo se l'attività è davvero nuova: va controllato caso per caso.

Le soglie: sopra **85.000 euro** incassati esci dal forfettario dall'anno dopo; sopra **100.000** esci subito, in corso d'anno, e tutto l'anno si tassa in modo ordinario (L. 190/2014 art. 1 commi 54-89, verificato 10/09/2026).

### Le cose che vanno impostate bene dal primo giorno

**Conta l'incassato, non il fatturato.** L'abbonamento pagato il 28 dicembre e accreditato da Stripe il 3 gennaio finisce nell'anno dopo. Con 50 clienti questa differenza si vede.

**Si fattura l'importo pieno, non il netto.** Se il cliente paga 39 euro e Stripe te ne accredita 38,16, la fattura è da 39. La commissione è un tuo costo, non uno sconto.

**Descrizione chiara in fattura.** "Canone mensile di accesso al servizio CANTIERI — settembre 2026". Non "consulenza". È la prima cosa su cui si ferma un controllo.

**Il conto Stripe intestato alla partita IVA**, non a te persona.

**Metti da parte a ogni incasso.** In forfettario con gestione separata il conto è: 67% × (contributi 26,07% + imposta). Al 5% fa **circa il 21%** di ogni euro incassato, al 15% fa **circa il 28%**. Mettine da parte 25 e 30: stai largo e non sbagli. Su un conto a parte, non "ci sto attento".

**Se un giorno vendi fuori Italia a privati:** superati 10.000 euro all'anno di vendite verso l'Unione Europea scatta l'obbligo di iscriversi all'OSS e applicare l'IVA del paese del cliente. Da tenere a mente, non da fare oggi.

---

## PARTE 9 — In che ordine si fa

Ogni fase ha un esito che si vede. ⛔ = passo che non si torna indietro.

**Fase 0 — Mettere in sicurezza quello che c'è (mezza giornata)**
Deposito privato. Token nuovo con scadenza. Fatto.

**Fase 1 — Il server (2-3 settimane)**
Scelta di dove sta (bivio 1). Account, isolamento dei dati, chiavi spostate dal telefono al server. L'app di tuo papà passa al nuovo giro e diventa il primo cliente vero.
Esito: nessuna chiave nel telefono, i dati non sono più pubblici.

**Fase 2 — Memoria e affidabilità (1-2 settimane)**
Magazzino file per foto e audio. Secondo fornitore per trascrizione e testo. Interruttore automatico. Controllo automatico e avvisi. Copie di sicurezza con prova di ripristino.
Esito: si può spegnere Groq e l'app continua a funzionare.

**Fase 3 — Il tuo pannello (1-2 settimane)**
Elenco clienti, interruttori per funzione, impostazioni per cliente, consumi.
Esito: crei un cliente nuovo senza toccare il codice.

**Fase 4 — Vendita (1-2 settimane)**
Pagina di vendita, Stripe, prova gratis, invito via email, blocco automatico di chi non paga, fattura elettronica collegata.
Esito: uno sconosciuto compra e usa l'app senza che tu faccia niente.

**Fase 5 — Carte in regola (in parallelo, non alla fine)**
⛔ Partita IVA e inquadramento (bivio 3). Contratto, nomina a responsabile, informativa, registro. Le righe sull'intelligenza artificiale nell'app e sul PDF.
Esito: puoi emettere la prima fattura il giorno della prima vendita.

**Fase 6 — I primi clienti veri**
Tre o quattro imprese conosciute, a prezzo ridotto, in cambio del fatto che ti dicono cosa non va. Prima di aprire a tutti.

La Fase 5 non è l'ultima. Se arriva dopo la Fase 4, il giorno che vendi non puoi incassare.

---

## PARTE 10 — Le decisioni che devi prendere tu

Sono i bivi cari da disfare. Non li decido io.

**Bivio 1 — Dove sta il server.**
Supabase (pronto, 25 $/mese fissi) · Cloudflare (economico, più lavoro) · macchina tua in Europa (controllo totale, manutenzione tua).
Costo di cambiare dopo: riscrittura della parte che parla col server e spostamento dei dati dei clienti attivi.

**Bivio 2 — Fornitori americani o europei.**
Restare su Groq e Anthropic, con le clausole standard e la dichiarazione al cliente · passare a fornitori europei, che costano di più e vanno provati.
Costo di cambiare dopo: rifare le prove sulla qualità dei referti, e riscrivere i contratti già firmati.

**Bivio 3 — Professionista o impresa.**
Gestione separata (26,07%, niente minimi fissi) · commercianti (4.611,64 euro fissi l'anno, ma è l'inquadramento che molti danno per corretto quando si vende un prodotto).
Costo di cambiare dopo: alto, e vincola per anni.

**Bivio 4 — Come vendi la memoria.**
Tutto incluso · quota inclusa più consumo · incluso finché paghi.
Costo di cambiare dopo: medio. Cambiare prezzo ai clienti già dentro è la parte scomoda.

**Bivio 5 — A chi vendi.**
Solo imprese edili e studi tecnici · anche direzione lavori e committenti.
Cambia le funzioni da fare per prime, non l'infrastruttura.

---

## Proposta mia — decidiamo insieme

Cose che non mi hai chiesto e che tengo fuori dal piano finché non dici tu:

- **Il prezzo.** Con questi costi, 39 euro al mese per utente è un numero che regge, ma dipende da chi compra e non l'ho verificato sul mercato.
- **Il nome.** "CANTIERI" va bene per l'app di tuo papà. Come prodotto in vendita va cercato se è libero, anche come marchio.
- **Una versione a due livelli** (base senza foto, completa con foto e relazione). Gli interruttori per funzione della Parte 5 la rendono possibile senza lavoro in più, ma è una scelta di vendita.
- **Trasformare questo piano in `LAVORO-GROSSO.md`** con il template del sistema, quando decidi di partire.

---

## Fonti verificate il 10/09/2026

- Costi archivio file: [Cloudflare R2 pricing](https://egresscost.com/cloudflare/)
- Costi Supabase: [Supabase pricing breakdown](https://flexprice.io/blog/supabase-pricing-breakdown)
- Costo trascrizione Groq: [Groq pricing 2026](https://www.cloudzero.com/blog/groq-pricing/)
- Conservazione dati Groq: [Your Data in GroqCloud](https://console.groq.com/docs/your-data)
- Conservazione dati Anthropic: [How long do you store my organization's data](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data)
- AI Act art. 50: [PrivacyStudio — obblighi dal 2 agosto 2026](https://www.privacystudio.it/ai-act-nuovi-obblighi-dal-2-agosto-2026-checklist-operativa-per-le-organizzazioni/)
- Commissioni Stripe Italia: [Calcolatore commissioni Stripe](https://fatturaexpress.com/strumenti/calcolatore-commissioni-stripe)
- Fattura elettronica B2B: [Stripe — obbligo di fatturazione elettronica B2B in Italia](https://stripe.com/resources/more/b2b-einvoicing-italy)
- Contributi gestione separata 2026: [Aliquote INPS gestione separata 2026](https://www.studiobenedetti.eu/aliquote-contributive-inps-2026-per-gli-iscritti-alla-gestione-separata/)
- Contributi commercianti 2026: [Confesercenti — contribuzione minima 4.611 euro](https://www.confesercenti.it/blog/inps-nel-2026-per-commercianti-contribuzione-minima-di-4-611-euro/)
- Coefficiente di redditività 62.01: [Tabella coefficienti forfettario](https://calcolatoreforfettario.com/blog/coefficienti-redditivita-regime-forfettario)
- Soglie forfettario 2026: [Regime forfettario 2026](https://fiscoly.it/blog/regime-forfettario-2026/)
