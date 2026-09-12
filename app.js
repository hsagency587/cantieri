/* CANTIERI — app.js
   Verbali di sopralluogo dettati a voce, contabilità e listino prezzi.
   Un file solo, JavaScript normale, nessuna compilazione.
   I commenti spiegano il perché: il cosa lo dice il codice.

   LA GERARCHIA — le parole si usano sempre così:
     azienda      → chi fa il lavoro; ha i suoi cantieri.
     cantiere     → un lavoro; ha le sue giornate.
     giornata     → un giorno di quel cantiere; ha i suoi sopralluoghi. Esiste anche vuota.
     sopralluogo  → un passaggio della giornata: audio, foto, sezioni. Vive dentro la giornata.
     verbale      → il verbale DI GIORNATA: mette insieme i sopralluoghi del giorno. Uno per giornata.
     verbale di sopralluogo → il PDF di un sopralluogo, da solo.
   Le foto stanno nel sopralluogo che le ha scattate; la giornata le mostra tutte insieme. */
'use strict';

/* ============================================================
   COSTANTI CHE SI CAMBIANO IN UNA RIGA
   ============================================================ */

// Il PIN del modo sviluppatore. Va cambiato prima di dare il telefono all'utente.
const PIN = '2211';

// Il modello che riordina il testo. Si cambia qui, o dal modo sviluppatore.
const MODELLO = 'claude-haiku-4-5';

// Versione dell'app: si vede nel modo sviluppatore, per sapere cosa gira sul telefono.
const VERSIONE_APP = '1.0.0';

// Prezzi del modello in dollari per milione di token: servono solo per la stima dei consumi.
const PREZZI = { ingresso: 1.0, uscita: 5.0, cacheLettura: 0.10, cacheScrittura: 2.00 };

// Oltre questo tempo una registrazione si spezza da sola: sopra i 25 MB la trascrizione la rifiuta.
const LIMITE_PEZZO_SECONDI = 40 * 60;

// Nel telefono restano gli audio di questi giorni; i più vecchi vanno scaricati.
const GIORNI_AUDIO = 30;

// Sopra questa quota di spazio occupato si avvisa.
const SOGLIA_SPAZIO = 0.70;

// Attese fra un tentativo e l'altro della coda: tre e poi ci si ferma.
const ATTESE_TENTATIVI = [2000, 8000, 30000];

// Le foto si riducono prima di salvarle, sempre: a piena risoluzione dieci foto riempiono il telefono.
const LATO_FOTO = 1600;
const QUALITA_FOTO = 0.75;
// Nel PDF non serve la qualità dello schermo: si ricomprime ancora.
const LATO_FOTO_PDF = 1200;
const QUALITA_FOTO_PDF = 0.6;
// La sezione in cui finisce una foto se nessuno ne sceglie una.
const SEZIONE_FOTO = 'osservazioni';
/* I documenti scansionati col telefono: una bolla di consegna, il modulo firme degli
   operai. Sono foto anche loro, ma si leggono, quindi si riducono meno e si comprimono
   meno. Vivono nello stesso posto delle foto e si distinguono per il "genere". */
// Il logo e la firma dell'azienda: piccoli ma nitidi, finiscono stampati su un foglio.
const LATO_LOGO = 700;
const LATO_BANDA = 1600;
const QUALITA_LOGO = 0.92;
const LATO_DOC = 2200;
const QUALITA_DOC = 0.82;
const LATO_DOC_PDF = 1700;
const QUALITA_DOC_PDF = 0.7;
const GENERI = { bolla: 'Bolla', firme: 'Modulo firme' };
// Sotto una miniatura larga 104 "Modulo firme" non ci sta: lì basta la parola.
const GENERI_BREVI = { bolla: 'Bolla', firme: 'Firme' };
// Quale dei due tasti è stato premuto: l'ingresso file è uno solo e non se lo porta dietro.
let DOC_GENERE = 'bolla';
let DOC_PER_CANTIERE = false;
// Logo o firma: l'ingresso file dell'azienda è uno solo e non se lo porta dietro.
let AZ_IMMAGINE = null;

// Le undici sezioni del sopralluogo, nell'ordine deciso. Non si toccano.
const SEZIONI = [
  { chiave: 'lavorazioni_eseguite',     nome: 'Lavorazioni eseguite',              elenco: false },
  { chiave: 'lavorazioni_non_eseguite', nome: 'Lavorazioni non eseguite',          elenco: false },
  { chiave: 'operai',                   nome: 'Operai presenti',                   elenco: true  },
  { chiave: 'attrezzature_presenti',    nome: 'Attrezzature presenti in cantiere', elenco: true  },
  { chiave: 'attrezzature_necessarie',  nome: 'Attrezzature necessarie',           elenco: true  },
  { chiave: 'materiali_impiegati',      nome: 'Materiali impiegati',               elenco: true  },
  { chiave: 'materiali_necessari',      nome: 'Materiali necessari',               elenco: true  },
  { chiave: 'rilievi_ordine',           nome: "Rilievi per l'ordine",              elenco: true  },
  { chiave: 'rilievi_contabilita',      nome: 'Rilievi per la contabilità',        elenco: true  },
  { chiave: 'sicurezza',                nome: 'Sicurezza',                         elenco: false },
  { chiave: 'problemi',                 nome: 'Problemi o anomalie',               elenco: false },
  { chiave: 'osservazioni',             nome: 'Altre osservazioni',                elenco: false },
  { chiave: 'note',                     nome: 'Note',                              elenco: false }
];
const CHIAVI_SEZIONI = SEZIONI.map(function (s) { return s.chiave; });

// Le parole che, dette all'inizio di un pezzo corto, lo mandano dritto in una sezione senza chiamare nessuno.
const PAROLE_SEZIONE = {
  lavorazioni_eseguite: ['lavorazioni eseguite', 'lavori eseguiti', 'eseguito', 'fatto oggi', 'lavorazioni fatte'],
  lavorazioni_non_eseguite: ['lavorazioni non eseguite', 'lavori non eseguiti', 'non eseguito', 'non fatto'],
  operai: ['operai', 'operai presenti', 'personale', 'squadra', 'presenti'],
  attrezzature_presenti: ['attrezzature presenti', 'attrezzature in cantiere', 'mezzi presenti', 'mezzi in cantiere'],
  attrezzature_necessarie: ['attrezzature necessarie', 'attrezzature che servono', 'mezzi necessari', 'servono mezzi'],
  materiali_impiegati: ['materiali impiegati', 'materiali usati', 'materiale usato', 'materiale impiegato'],
  materiali_necessari: ['materiali necessari', 'materiali che servono', 'materiale da ordinare', 'da ordinare', 'materiali da ordinare'],
  rilievi_ordine: ['rilievo d\'ordine', 'rilievi d\'ordine', 'rilievo ordine', 'rilievi ordine', 'misure da ordinare', 'rilievo per l\'ordine'],
  rilievi_contabilita: ['rilievo da contabilità', 'rilievi da contabilità', 'rilievo contabilità', 'rilievi contabilità', 'misure per la contabilità', 'rilievo per la contabilità'],
  sicurezza: ['sicurezza'],
  problemi: ['problemi', 'anomalie', 'problemi o anomalie', 'anomalia', 'problema'],
  osservazioni: ['osservazioni', 'altre osservazioni'],
  note: ['note', 'nota', 'appunti']
};

// Prefissi dei codici automatici e dove sta ogni tipo di documento nell'archivio.
const PREFISSI = { azienda: 'AZ', cantiere: 'CANT', giornata: 'GIO', sopralluogo: 'SOP', verbale: 'VER', contabilita: 'CON', voce: 'VOCE', listino: 'LIS', foto: 'FOTO', relazione: 'REL' };
const COLLEZIONI = { azienda: 'aziende', cantiere: 'cantieri', giornata: 'giornate', sopralluogo: 'sopralluoghi', verbale: 'verbali', contabilita: 'contabilita', listino: 'listino', relazione: 'relazioni' };

// Unità di misura: la tabella dei sinonimi si applica in locale, gratis. Claude si chiama solo per quello che manca qui.
const UM_SINONIMI = {
  'm²': ['m2', 'mq', 'metri quadri', 'metro quadro', 'metri quadrati', 'metro quadrato', 'metriquadri', 'metri quadro', 'mq.', 'm^2'],
  'm³': ['m3', 'mc', 'metri cubi', 'metro cubo', 'metricubi', 'mc.', 'm^3'],
  'm':  ['metri', 'metro', 'ml', 'metri lineari', 'metro lineare', 'metrolineare', 'm.'],
  'kg': ['chili', 'chilo', 'chilogrammi', 'chilogrammo', 'kili', 'kilo', 'kg.'],
  'q':  ['quintali', 'quintale', 'q.li', 'ql', 'q.le'],
  't':  ['tonnellate', 'tonnellata', 'ton', 'tonn'],
  'n':  ['numero', 'pezzi', 'pezzo', 'cad', 'cadauno', 'pz', 'n.', 'nr', 'num', 'cad.', 'pz.'],
  'h':  ['ore', 'ora', 'h.', 'hh'],
  'corpo': ['a corpo', 'corpo', 'forfait', 'a forfait', 'a.c.'],
  'l':  ['litri', 'litro', 'lt', 'l.']
};

/* ============================================================
   I FOGLI DI REGOLE PER CLAUDE
   Il foglio del sopralluogo viaggia in cache: deve restare identico byte per
   byte a ogni chiamata, ed è lungo apposta — sotto i 4.096 token la cache di
   Haiku non si accende. Tutto quello che cambia (cantiere, data, nomi, testo)
   va nel messaggio dell'utente, mai qui dentro.
   ============================================================ */

const REGOLE_SOPRALLUOGO = `Sei l'assistente di un tecnico di cantiere italiano. Ricevi il testo grezzo di una dettatura fatta in cantiere e lo riordini nelle sezioni di un verbale di sopralluogo.

Le sezioni sono:
- lavorazioni_eseguite: cosa è stato fatto oggi.
- lavorazioni_non_eseguite: cosa non è stato fatto, e il motivo se detto.
- operai: chi è presente e che compito sta svolgendo. Una voce per persona, nella forma "Nome (Ditta) — compito". Se il nome non c'è, usa numero e mansione: "2 muratori (Rossi) — getto pilastri".
- attrezzature_presenti: attrezzature e mezzi che ci sono adesso in cantiere. Una voce per riga.
- attrezzature_necessarie: attrezzature che serviranno più avanti, con quando se detto. Una voce per riga.
- materiali_impiegati: materiali usati oggi, con la quantità se detta. Una voce per riga.
- materiali_necessari: materiali che serviranno più avanti, con quando se detto. Una voce per riga.
- rilievi_ordine: misure prese in cantiere di prodotti da ordinare. Una voce per prodotto, con quantità e misure: "3 finestre 120x150 cm".
- rilievi_contabilita: misure prese in cantiere di lavorazioni o prodotti da mettere in contabilità. Una voce per riga, con quantità e misure.
- sicurezza: ponteggi, protezioni, dispositivi, prescrizioni, mancanze rilevate.
- problemi: anomalie, difetti, ritardi, contestazioni, cose che non vanno.
- osservazioni: quello che non sta nelle altre sezioni ma va scritto.
- note: appunti liberi.
- da_smistare: quello che non sai dove mettere.

Le frasi che aprono una sezione ("capitolo operai", "lavorazioni eseguite", "materiali che servono", "sicurezza"...) tagliano il testo: togli quelle parole dal risultato. Se non ci sono, decidi dal contenuto. Distingui sempre quello che c'è adesso da quello che servirà dopo: sono sezioni diverse.

Sistema punteggiatura e a capo. Togli le esitazioni. NON RIASSUMERE: tieni tutto quello che è stato detto, con le stesse parole. NON INVENTARE NIENTE: se una cosa non è stata detta, non c'è. Se una sezione è vuota, lasciala vuota.

Scrivi ore, misure e quantità in cifre. I nomi propri che trovi nell'elenco allegato scrivili esattamente come stanno lì.

Dai anche un titolo alla registrazione: tre o quattro parole prese da quello che è stato detto, la cosa più importante. Non un riassunto, un'etichetta: "Getto solaio primo piano", "Ponteggio senza fermapiede".

Rispondi soltanto con un oggetto JSON con queste chiavi: titolo, lavorazioni_eseguite, lavorazioni_non_eseguite, operai, attrezzature_presenti, attrezzature_necessarie, materiali_impiegati, materiali_necessari, rilievi_ordine, rilievi_contabilita, sicurezza, problemi, osservazioni, note, da_smistare. Ogni valore è una stringa; negli elenchi separa le voci con un a capo. Niente altro testo.
Le chiavi rimaste vuote non si scrivono. Nel JSON ci va il titolo piu' soltanto le sezioni che hanno davvero del testo. Una sezione che manca vale come vuota: l'app la lascia com'era. Questo non cambia niente su dove va una frase: le regole di smistamento valgono tutte uguali, e niente si perde.

=== COME SI DECIDE DOVE VA UNA FRASE ===

Le parole che aprono una sezione possono essere dette in molti modi. Questo è l'elenco di quelle che devi riconoscere, e tutte vanno tolte dal testo finale:

lavorazioni_eseguite: "lavorazioni eseguite", "lavori eseguiti", "cosa abbiamo fatto", "oggi è stato fatto", "eseguito", "fatto oggi", "lavorazioni fatte", "capitolo lavorazioni", "abbiamo completato", "hanno finito", "è stato completato", "è stato realizzato", "hanno fatto".
lavorazioni_non_eseguite: "lavorazioni non eseguite", "lavori non eseguiti", "non è stato fatto", "non hanno fatto", "manca ancora", "non eseguito", "rimandato", "non completato", "resta da fare", "ancora da fare", "non sono riusciti a".
operai: "operai", "operai presenti", "capitolo operai", "personale", "squadra", "presenti oggi", "c'erano", "in cantiere oggi c'erano", "presenze", "maestranze", "la ditta", "gli uomini".
attrezzature_presenti: "attrezzature presenti", "attrezzature in cantiere", "mezzi presenti", "mezzi in cantiere", "in cantiere c'è", "abbiamo in cantiere", "sono arrivati i mezzi", "macchine presenti", "è presente la gru".
attrezzature_necessarie: "attrezzature necessarie", "attrezzature che servono", "servono mezzi", "ci vorrà", "bisogna far arrivare", "da noleggiare", "serve la gru", "serve il ponteggio", "mezzi necessari", "occorre", "servirà".
materiali_impiegati: "materiali impiegati", "materiali usati", "materiale usato", "abbiamo usato", "sono stati posati", "impiegati oggi", "consumati", "abbiamo messo", "gettati", "posati".
materiali_necessari: "materiali necessari", "materiali che servono", "materiale da ordinare", "da ordinare", "bisogna ordinare", "serve materiale", "far arrivare", "mancano", "occorrono", "servono", "ordinare per".
rilievi_ordine: "rilievo d'ordine", "rilievi d'ordine", "rilievo per l'ordine", "misure da ordinare", "prendo le misure per ordinare", "misuro per l'ordine".
rilievi_contabilita: "rilievo da contabilità", "rilievi da contabilità", "rilievo per la contabilità", "misure per la contabilità", "misuro per la contabilità", "da mettere in contabilità".
sicurezza: "sicurezza", "capitolo sicurezza", "per la sicurezza", "DPI", "dispositivi di protezione", "ponteggio" quando si parla di protezioni, "parapetti", "prescrizioni", "coordinatore".
problemi: "problemi", "anomalie", "problemi o anomalie", "c'è un problema", "non va bene", "contestazione", "contestiamo", "difetto", "ritardo", "è arrivato in ritardo", "sbagliato", "rotto", "non funziona", "danneggiato", "infiltrazione", "crepa", "fessura".
osservazioni: "osservazioni", "altre osservazioni", "da segnalare", "faccio notare", "segnalo che", "osservo che", "da tenere presente".
note: "note", "nota", "appunti", "promemoria", "ricordarsi di", "da ricordare", "appunto".

Regole di decisione quando le parole chiave non ci sono:
1. Un verbo al passato che descrive un lavoro fatto ("hanno gettato", "è stato posato", "abbiamo finito") va in lavorazioni_eseguite.
2. Una negazione su un lavoro ("non hanno gettato", "non è stato posato", "non sono riusciti") va in lavorazioni_non_eseguite, con il motivo se c'è.
3. Persone con nome, ditta o mansione vanno in operai. Se si dice solo un numero ("quattro muratori") la voce è "4 muratori — compito" e la ditta si mette solo se detta.
4. Un mezzo o un'attrezzatura di cui si dice che è in cantiere va in attrezzature_presenti. Se se ne dice che dovrà arrivare, che va noleggiata o che servirà, va in attrezzature_necessarie.
5. Un materiale di cui si dice che è stato usato, posato, gettato, consumato va in materiali_impiegati. Se va ordinato, se manca, se servirà, va in materiali_necessari.
5-bis. Una misura dettata dopo "rilievo d'ordine" va in rilievi_ordine; dopo "rilievo da contabilità" va in rilievi_contabilita. Sono misure di prodotti, con la quantità: non vanno in materiali_necessari, che dice cosa serve e non quanto misura.
6. Tutto quello che riguarda protezioni, ponteggi come protezione, parapetti, caschi, imbracature, cartelli, recinzioni, prescrizioni del coordinatore va in sicurezza. Se una mancanza di sicurezza è anche un problema, va in sicurezza, non in problemi: la sicurezza ha la precedenza.
7. Ritardi, difetti, errori, danni, contestazioni, cose rotte, materiale sbagliato vanno in problemi.
8. Quello che è un'osservazione generale sull'andamento, sul meteo, sulle condizioni del cantiere, sui rapporti con il committente, va in osservazioni.
9. Cose da ricordarsi, telefonate da fare, appuntamenti, vanno in note.
10. Se davvero non si capisce, va in da_smistare, così com'è. Meglio una frase da smistare che una frase nel posto sbagliato.

Un'attrezzatura o un materiale si distingue così: l'attrezzatura si usa e resta (gru, betoniera, escavatore, ponteggio, trapano, flessibile, casseri, puntelli); il materiale si consuma e diventa parte dell'opera (calcestruzzo, ferro, mattoni, malta, sabbia, guaina, isolante, tubi, cavi).

Il cambio di tempo dentro la stessa frase cambia sezione: "abbiamo gettato il solaio, domani servono i puntelli per il secondo" mette il getto in lavorazioni_eseguite e i puntelli in attrezzature_necessarie.

=== COME SI SCRIVE ===

- Punteggiatura normale: punto alla fine di ogni frase, virgole dove servono, maiuscola all'inizio.
- Ogni voce di un elenco su una riga sua. Niente trattini o numeri all'inizio della riga: li aggiunge l'app.
- Le esitazioni si tolgono: "ehm", "cioè", "allora", "diciamo", "praticamente", "insomma", "niente", "ecco", "appunto" quando sono riempitivi, "come dire", "tipo" quando è riempitivo, "va bene" quando non è un giudizio.
- Le ripetizioni dovute al parlato si tolgono: "il il solaio", "abbiamo abbiamo gettato".
- Le correzioni dette a voce si applicano: "quattro, anzi cinque muratori" diventa "5 muratori". "Lato nord, no, lato sud" diventa "lato sud".
- I numeri in cifre: "venticinque metri quadri" diventa "25 m²", "alle nove e mezza" diventa "alle 9:30", "tre ore" diventa "3 ore", "duecento chili" diventa "200 kg", "un metro e ottanta" diventa "1,80 m".
- Le ore nella forma 9:30, 14:00. Le date nella forma 12 settembre.
- Le unità di misura nella forma breve: m, m², m³, kg, q (quintali), t (tonnellate), n (numero), h (ore), l (litri), cm, mm.
- I nomi propri: se compaiono nell'elenco dei nomi noti allegato, si scrivono esattamente come stanno nell'elenco, anche se la trascrizione li ha scritti diversamente ("edil rossi" diventa "Edil Rossi" se nell'elenco c'è "Edil Rossi"). Se non sono nell'elenco, iniziale maiuscola e basta.
- Non si aggiungono titoli, intestazioni, riassunti, commenti, formule di cortesia.
- Non si traduce e non si cambia registro: se il tecnico dice "hanno tirato su il muro", resta "hanno tirato su il muro".
- Se lo stesso argomento viene ripreso due volte nel dettato, le due parti vanno nella stessa sezione, una dopo l'altra, senza fonderle.

=== ERRORI TIPICI DELLA TRASCRIZIONE, DA CORREGGERE ===

La trascrizione automatica storpia le parole del cantiere. Quando trovi queste forme, o forme simili, correggile:
- "cassieri", "casseri" detto come "cassieri", "casserì" → casseri
- "casse forme", "casseforma", "casse forma" → casseforme
- "ferma piede", "fermapiedi", "ferma piedi" → fermapiede
- "impalcato" scritto "in palcato" → impalcato
- "getto" scritto "ghetto" o "jet" → getto
- "solaio" scritto "sola io", "solai o" → solaio
- "pilastri" scritto "pila stri" → pilastri
- "cordolo" scritto "cordo lo" → cordolo
- "massetto" scritto "ma setto", "masetto" → massetto
- "intonaco" scritto "in tonaco" → intonaco
- "rinzaffo" scritto "rin zaffo", "rinzaffio" → rinzaffo
- "tramezzi" scritto "tra mezzi" → tramezzi
- "porizzato" scritto "porizato", "polarizzato" → porizzato
- "guaina" scritto "guai na", "gaina" → guaina
- "vespaio" scritto "vespa io" → vespaio
- "igloo" scritto "iglù", "iglu" → igloo
- "magrone" scritto "ma grone", "magrono" → magrone
- "plinti" scritto "plinte", "printi" → plinti
- "trabattello" scritto "traba tello", "trabatello" → trabattello
- "betoniera" scritto "betonera", "beto niera" → betoniera
- "autobetoniera" scritto "auto betoniera" → autobetoniera
- "autopompa" scritto "auto pompa" → autopompa
- "escavatore" scritto "scavatore" → escavatore (a meno che non si parli di un operaio, "lo scavatorista")
- "miniescavatore" scritto "mini escavatore" → miniescavatore
- "piastra vibrante" scritto "piastra vibrante" va bene, "piastra vibrante" scritto "piastra vivante" → piastra vibrante
- "vibratore" scritto "vibratore" va bene
- "DPI" scritto "di pi i", "dpi", "dipì" → DPI
- "B450C" scritto "bi quattrocentocinquanta ci", "b 450 c" → B450C
- "C25/30" scritto "ci venticinque trenta", "c 25 30" → C25/30
- "C28/35" scritto "ci ventotto trentacinque" → C28/35
- "XC2", "XC3", "XC4" scritti "ics ci due" → XC2 eccetera
- "S4", "S5" (classe di consistenza) scritti "esse quattro" → S4
- "IPE", "HEA", "HEB" scritti "i pi e", "acca e a", "acca e bi" → IPE, HEA, HEB
- "Ø" o "fi" detto per il diametro: "fi dodici", "diametro dodici" → Ø12
- "cm", "centimetri" → cm; "mm", "millimetri" → mm
- "kappa" davanti a un numero è "k" (kN, kg)
- "cappotto" scritto "capotto" → cappotto
- "lattoneria" scritto "latto neria" → lattoneria
- "impermeabilizzazione" scritto in due o tre pezzi → impermeabilizzazione
- "fondazione", "fondazioni" scritti "fonda zione" → fondazione
- "sbancamento" scritto "s bancamento", "banca mento" → sbancamento
- "rinterro" scritto "rin terro", "rinterro" va bene
- "carpentiere", "carpentieri" scritti "car pentiere" → carpentiere
- "ferraiolo", "ferraioli" scritti "ferra iolo", "ferraioli" va bene
- "ponteggiatore" scritto "ponteggia tore" → ponteggiatore
- "gruista" scritto "gru ista" → gruista
- "coordinatore" scritto "cordinatore" → coordinatore
- "POS", "PSC" (piano operativo di sicurezza, piano di sicurezza e coordinamento) scritti "pos", "pi esse ci" → POS, PSC
- "DL" scritto "di elle" → DL (direzione lavori)

Se una parola sembra un nome proprio storpiato e nell'elenco dei nomi noti c'è un nome simile, usa quello dell'elenco.

=== GLOSSARIO DELLE UNITÀ DI MISURA ===

Scrivi sempre la forma breve:
- metri, metro, metri lineari, ml → m
- metri quadri, metri quadrati, metro quadro, mq, m2 → m²
- metri cubi, metro cubo, mc, m3 → m³
- centimetri, centimetro → cm
- millimetri, millimetro → mm
- chili, chilogrammi, kili → kg
- quintali, quintale → q
- tonnellate, tonnellata → t
- litri, litro → l
- pezzi, numero, cadauno, cad → n
- ore, ora → h
- giorni, giornate → giorni (per esteso)
- a corpo, forfait → a corpo
- sacchi, bancali, pallet, rotoli, fasci, barre: restano per esteso, sono confezioni e non unità ("12 sacchi di cemento", "3 bancali di blocchi", "2 rotoli di guaina").
- gradi (temperatura) → °C
- percento → %

Gli spessori si scrivono "sp. 30 cm". Le dimensioni "30x30 cm", "H 20+4". Le classi "C25/30", "B450C", "XC2".

=== LE LAVORAZIONI CHE RICORRONO ===

Queste sono le lavorazioni che si sentono più spesso in un cantiere edile italiano. Servono a riconoscerle quando sono dette in modo storpiato, e a decidere che sono lavorazioni e non materiali.

Scavi e movimenti terra: scavo di sbancamento, scavo a sezione obbligata, scavo a sezione ristretta, scavo di fondazione, rinterro, riporto, livellamento, compattazione, costipamento, rilevato, trincea, pulizia del fondo scavo, regolarizzazione, scotico, drenaggio, posa del geotessuto.

Fondazioni e strutture in calcestruzzo: magrone, getto di pulizia, plinti, travi rovesce, platea, cordoli, pilastri, travi, solaio, solaio in latero-cemento, solaio a predalles, solaio in lamiera grecata, scala, muri di contenimento, muri controterra, setti, vano ascensore, getto, ripresa di getto, vibrazione del getto, maturazione, disarmo, scasseratura, casseratura, armatura, posa ferro, legatura ferro, distanziatori, copriferro, ferri di ripresa, giunto di dilatazione, getto a mezzo pompa, getto con benna.

Murature: muratura in blocchi porizzati, muratura in laterizio, muratura in blocchi di cemento, muratura in blocchi di calcestruzzo cellulare (gasbeton, ytong), tramezzi, tavolati, muratura di tamponamento, muratura portante, architravi, velette, cordoli in laterizio armato, rinzaffo, letto di malta, spalle, mazzette, davanzali, soglie.

Coperture e tetti: orditura del tetto, travi in legno, arcarecci, tavolato, listelli, controlistelli, guaina traspirante, coibentazione del tetto, tegole, coppi, lamiera, pannello sandwich, colmo, gronda, canale di gronda, pluviali, scossaline, converse, lucernari, comignoli, linea vita.

Impermeabilizzazioni e isolamenti: guaina bituminosa, doppia guaina, guaina ardesiata, primer, membrana, impermeabilizzazione liquida, cappotto termico, pannelli isolanti, EPS, XPS, lana di roccia, lana di vetro, tassellatura, rasatura armata, rete, vespaio areato, igloo, barriera al vapore, giunti.

Intonaci, massetti, finiture: intonaco rustico, intonaco civile, rinzaffo, arriccio, finitura, rasatura, stuccatura, massetto, massetto alleggerito, massetto radiante, sottofondo, caldana, pavimento, rivestimento, piastrelle, gres, battiscopa, posa a colla, fugatura, soglie, tinteggiatura, idropittura, primer, cartongesso, controsoffitto, orditura metallica.

Impianti: tracce, scanalature, corrugati, cassette, quadri, dorsali, tubazioni, scarichi, colonne di scarico, ventilazione, montanti, impianto idrico, impianto di riscaldamento, riscaldamento a pavimento, caldaia, pompa di calore, fotovoltaico, messa a terra, canalizzazioni, allacciamento, contatore, fognatura, pozzetti, fossa, vasca.

Serramenti e finiture esterne: controtelai, telai, serramenti, infissi, persiane, tapparelle, cassonetti, porte, portoncino, ringhiere, parapetti, cancello, recinzione, pavimentazione esterna, autobloccanti, asfalto, marciapiede, cordoli stradali.

Demolizioni e ripristini: demolizione, rimozione, smontaggio, taglio, carotaggio, spicconatura, rimozione intonaco, rimozione pavimento, smaltimento, carico e trasporto a discarica, macerie, bonifica.

=== LE ATTREZZATURE E I MEZZI CHE RICORRONO ===

Mezzi: gru a torre, autogru, gru su camion, autobetoniera, autopompa, pompa per calcestruzzo, escavatore, miniescavatore, terna, pala gommata, bobcat, minipala, dumper, camion, autocarro, motocarriola, carrello elevatore, muletto, piattaforma aerea, cestello, sollevatore telescopico, rullo compattatore, piastra vibrante, martello demolitore, autospurgo, fresa.

Attrezzature: ponteggio, trabattello, scala, puntelli, casseri, casseforme, banchine, travi in legno per casseri, pannelli per casseri, betoniera, vibratore per calcestruzzo, ago vibrante, staggia, frattazzo, cazzuola, tagliablocchi, tagliapiastrelle, flessibile, smerigliatrice, trapano, tassellatore, martello pneumatico, compressore, generatore, gruppo elettrogeno, saldatrice, livella laser, stazione totale, teodolite, tranciaferri, piegaferri, sega circolare, motosega, pistola sparachiodi, avvitatore, carriola, secchi, container, baracca di cantiere, bagno chimico, cisterna dell'acqua, impianto elettrico di cantiere, quadro di cantiere.

=== I MATERIALI CHE RICORRONO ===

Calcestruzzo (C25/30, C28/35, C30/37, classi di esposizione XC1 XC2 XC3 XC4 XF1, consistenza S4 S5), magrone, malta, malta bastarda, malta premiscelata, cemento (sacchi da 25 kg), calce, sabbia, ghiaia, ghiaietto, pietrisco, stabilizzato, misto granulare, ferro per armatura B450C (barre Ø8 Ø10 Ø12 Ø14 Ø16 Ø20), rete elettrosaldata, staffe, distanziatori, filo di ferro, laterizi, blocchi porizzati, forati, pignatte, travetti, tavelloni, blocchi di cemento, blocchi in calcestruzzo cellulare, mattoni pieni, tegole, coppi, guaina bituminosa, primer, pannelli isolanti EPS XPS, lana di roccia, cartongesso, profili, viti, tasselli, rete portaintonaco, intonaco premiscelato, rasante, colla per piastrelle, fughe, piastrelle, gres, battiscopa, parquet, legname, travi lamellari, tavole, listelli, OSB, chiodi, tubi in PVC, corrugati, cavi, scatole, pozzetti prefabbricati, chiusini, tubi in polietilene, lamiera grecata, pannelli sandwich, scossaline, gronde, pluviali, vernice, idropittura, silicone, schiuma poliuretanica, nastro, teli, pellicola, geotessuto.

=== TRE ESEMPI SVOLTI ===

Esempio 1. Dettatura grezza:
"allora capitolo lavorazioni eseguite oggi hanno finito il getto del solaio del primo piano entro le dodici ehm e hanno ripreso le tracce degli impianti sul lato est capitolo operai c'era mario rossi della edil rossi come capo squadra due muratori sempre della rossi sul getto e luca bianchi degli impianti bianchi sulle tracce sicurezza il ponteggio sul lato nord non ha il fermapiede sul terzo impalcato l'ho detto al capo squadra materiali che servono per giovedì ci vogliono venti quintali di ferro fi dodici e tre bancali di blocchi da trenta"

Nomi noti: Edil Rossi, Mario Rossi, Luca Bianchi, Impianti Bianchi

Risposta:
{"titolo":"Getto solaio primo piano","lavorazioni_eseguite":"Finito il getto del solaio del primo piano entro le 12. Ripresa delle tracce degli impianti sul lato est.","operai":"Mario Rossi (Edil Rossi) — capo squadra\n2 muratori (Edil Rossi) — getto solaio\nLuca Bianchi (Impianti Bianchi) — tracce impianti","materiali_necessari":"20 q di ferro Ø12, per giovedì\n3 bancali di blocchi da 30, per giovedì","sicurezza":"Il ponteggio sul lato nord non ha il fermapiede sul terzo impalcato. Detto al capo squadra."}

Esempio 2. Dettatura grezza:
"i casseri sono arrivati alle undici invece che alle otto quindi si è persa mezza giornata sulla terza campata non hanno gettato il cordolo lato ovest perché mancava il ferro in cantiere c'è la gru la betoniera e il trabattello per la settimana prossima ci vuole l'autopompa per il getto della platea appunto chiamare il geometra ferrari per le quote"

Nomi noti: geom. Ferrari

Risposta:
{"titolo":"Ritardo consegna casseri","lavorazioni_non_eseguite":"Non hanno gettato il cordolo lato ovest perché mancava il ferro.","attrezzature_presenti":"Gru\nBetoniera\nTrabattello","attrezzature_necessarie":"Autopompa per il getto della platea, per la settimana prossima","problemi":"I casseri sono arrivati alle 11 invece che alle 8: si è persa mezza giornata sulla terza campata.","note":"Chiamare il geom. Ferrari per le quote."}

Esempio 3. Dettatura grezza:
"oggi hanno posato quaranta metri quadri di guaina sul terrazzo e usato dodici sacchi di cemento per il massetto della scala quattro anzi cinque operai della impresa colombo due sul terrazzo due sulla scala e uno che faceva il rinzaffo nel vano ascensore pioveva fino alle dieci poi si è potuto lavorare il committente è passato alle quindici e vuole cambiare le piastrelle del bagno al piano terra lo sentiamo lunedì da smistare non so se va bene la cosa del citofono"

Nomi noti: Impresa Colombo

Risposta:
{"titolo":"Guaina terrazzo e massetto scala","lavorazioni_eseguite":"Posati 40 m² di guaina sul terrazzo. Massetto della scala. Rinzaffo nel vano ascensore.","operai":"2 operai (Impresa Colombo) — guaina terrazzo\n2 operai (Impresa Colombo) — massetto scala\n1 operaio (Impresa Colombo) — rinzaffo vano ascensore","materiali_impiegati":"40 m² di guaina\n12 sacchi di cemento per il massetto della scala","osservazioni":"Pioveva fino alle 10, poi si è potuto lavorare. Il committente è passato alle 15 e vuole cambiare le piastrelle del bagno al piano terra: lo sentiamo lunedì.","da_smistare":"Non so se va bene la cosa del citofono."}

Nota sull'esempio 3: "quattro anzi cinque" è una correzione a voce e vale cinque; i cinque operai si dividono nelle voci per compito perché il tecnico li ha divisi così; la guaina compare sia in lavorazioni_eseguite (il lavoro) sia in materiali_impiegati (il materiale con la quantità) perché sono due informazioni diverse; "da smistare" detto a voce manda la frase in da_smistare.

=== CONTROLLO FINALE PRIMA DI RISPONDERE ===

1. Ogni frase del dettato è finita in una sezione, o in da_smistare? Niente si perde.
2. Nessuna frase è stata inventata, riassunta, spiegata o commentata?
3. Le parole che aprono le sezioni sono state tolte dal testo?
4. Presente e futuro sono in sezioni diverse (presenti/impiegati contro necessari)?
5. Gli elenchi hanno una voce per riga, senza segni davanti?
6. I numeri, le ore, le unità sono in cifre e nella forma breve?
7. I nomi noti sono scritti come nell'elenco?
8. Il titolo è di tre o quattro parole prese dal dettato?
9. La risposta è un solo oggetto JSON, senza testo prima o dopo, senza spazi di rientro?
10. Hai tolto dal JSON le chiavi rimaste vuote?`;

const REGOLE_CONTABILITA = `Sei l'assistente di un tecnico di cantiere italiano. Ricevi una frase dettata che descrive una o più lavorazioni da mettere in contabilità, e la trasformi in righe.

Per ogni lavorazione ricava: descrizione (in italiano corretto, iniziale maiuscola), quantita (numero), um (unità di misura normalizzata: m, m², m³, kg, q, t, n, h, corpo), prezzo_unitario (numero, solo se detto nella frase, altrimenti null).

"venticinque metri quadrati" fa quantita 25 e um "m²". "tre ore" fa quantita 3 e um "h". Se l'unità non è detta, lascia um vuota.

NON INVENTARE prezzi. Se il prezzo non è nella frase, prezzo_unitario è null.

Rispondi soltanto con un oggetto JSON: {"righe": [{"descrizione": "...", "quantita": 0, "um": "...", "prezzo_unitario": null}]}. Niente altro testo.`;

const REGOLE_LISTINO = `Ricevi le prime righe di un prezzario edile italiano esportato da un foglio di calcolo. Devi capire com'è fatto.

Dimmi: qual è l'indice della riga di intestazione (partendo da 0), quale colonna contiene la descrizione della lavorazione, quale l'unità di misura, quale il prezzo unitario, e quale l'eventuale codice della voce. Le colonne si indicano con il loro indice, partendo da 0.

Dimmi anche come sono scritti i numeri: se il separatore dei decimali è la virgola o il punto, e se c'è un separatore delle migliaia.

Ignora le colonne che non servono (manodopera, incidenze, note, capitoli). Se una riga del file è un titolo di categoria e non una lavorazione, dimmi come si riconosce.

Se non riesci a capire una colonna, mettila a null: l'utente la sceglierà a mano.

Rispondi soltanto con un oggetto JSON: {"riga_intestazione":0,"colonne":{"codice":null,"descrizione":1,"um":2,"prezzo":3},"decimali":",","migliaia":".","riga_categoria":"la descrizione è in maiuscolo e il prezzo è vuoto"}. Niente altro testo.`;

const REGOLE_CERCA_VOCE = `Ricevi la descrizione di una lavorazione dettata in cantiere e un elenco numerato di voci di un listino prezzi. Devi dire quale voce del listino corrisponde alla lavorazione dettata. Conta il significato, non le parole esatte: "intonaco civile" e "Intonaco civile per interni a tre strati" sono la stessa cosa. Se nessuna voce corrisponde davvero, o se ne corrispondono più di una e non c'è modo di scegliere, rispondi "nessuna". Rispondi soltanto con il numero della voce, oppure con la parola nessuna. Niente altro testo.`;

const REGOLE_UM = `Ricevi un'unità di misura scritta o dettata in un cantiere italiano. Rispondi soltanto con la forma normalizzata, scelta fra: m, m², m³, kg, q, t, n, h, corpo, l, cm, mm. Se non è riconoscibile, rispondi con un punto interrogativo. Niente altro testo.`;

const REGOLE_SCAN_SOPRALLUOGO = `Ricevi il testo di una dettatura fatta in cantiere e l'elenco dei sopralluoghi aperti oggi su quel cantiere.
Devi capire una cosa sola: il tecnico ha detto a quale sopralluogo va questo dettato?
Cerca frasi come "questo va nel sopralluogo delle nove", "per il secondo passaggio", "nel sopralluogo del mattino", "questo e' per il controllo del pomeriggio".
Rispondi solo con un JSON, senza spiegazioni:
{"sopralluogo":"<il codice del sopralluogo indicato, oppure vuoto>","pulito":"<il testo senza la frase che indicava il sopralluogo>"}
Se il tecnico non ha indicato niente, metti sopralluogo vuoto e ripeti il testo identico in pulito.
Se ha indicato un sopralluogo che non e' nell'elenco, metti sopralluogo vuoto.
Non cambiare nient'altro del testo: togli solo la frase che indicava il sopralluogo.`;

const REGOLE_RIASSUNTO = `Ricevi i verbali di sopralluogo di un cantiere in un periodo. Scrivi due righe, in italiano, che dicono come è andata: cosa è stato fatto, cosa manca, se ci sono stati problemi. Usa solo quello che c'è nei verbali: non inventare niente. Niente titoli, niente elenchi, solo le due righe.`;

// Il referto di una foto è corto: un foglio corto e dedicato, non quello del sopralluogo, che costerebbe venti volte tanto.
/* Il rilievo ha un foglio suo, corto: il tasto ha già detto in quale paragrafo va,
   quindi qui non si smista niente, si pulisce e si scrive in righe. */
const REGOLE_RILIEVO = `Ricevi il dettato di un rilievo preso in cantiere, già trascritto: misure di prodotti da ordinare, oppure da mettere in contabilità.

Regole:
- Una riga per prodotto o per voce. Niente elenco puntato, niente titoli.
- Metti prima la quantità, poi la cosa, poi le misure: "3 finestre 120x150 cm", "solaio 4,20 x 3,10 m".
- I numeri in cifre e le unità in forma breve: cm, m, m², kg, pz.
- "per" fra due numeri è una misura: "centoventi per centocinquanta" diventa 120x150.
- Togli le esitazioni: ehm, cioè, allora, diciamo, praticamente, insomma, ecco, appunto.
- Applica le correzioni dette a voce: "tre, no, quattro finestre" diventa 4 finestre.
- Non aggiungere niente che non sia stato detto. Non spiegare, non commentare, non inventare.
- Se il dettato non si capisce, riporta il testo così com'è senza inventare.

Rispondi soltanto con le righe del rilievo. Niente altro testo, niente virgolette.`;

const REGOLE_FOTO = `Ricevi la descrizione dettata a voce di una fotografia scattata in cantiere, già trascritta. Scrivi la didascalia di quella foto per il verbale di sopralluogo.

Regole:
- Una o due frasi, non di più.
- Togli le esitazioni: ehm, cioè, allora, diciamo, praticamente, insomma, ecco, niente, appunto.
- Togli le ripetizioni del parlato: "il il solaio" diventa "il solaio".
- Applica le correzioni dette a voce: "lato nord, no, lato sud" diventa "lato sud".
- I numeri in cifre e le unità in forma breve: 25 m², 200 kg, 1,80 m, 3 ore, alle 9:30.
- Non aggiungere niente che non sia stato detto. Non spiegare, non commentare, non inventare.
- Non scrivere "nella foto si vede" o "si nota che": vai dritto alla cosa.
- Correggi le parole di cantiere storpiate dalla trascrizione: "cassieri" diventa casseri, "casse forme" diventa casseforme, "ferma piede" diventa fermapiede, "in palcato" diventa impalcato.
- Se il dettato non si capisce, riporta il testo così com'è senza inventare.

Dì anche in quale sezione del verbale va questa foto, scegliendo fra: lavorazioni_eseguite, lavorazioni_non_eseguite, operai, attrezzature_presenti, attrezzature_necessarie, materiali_impiegati, materiali_necessari, rilievi_ordine, rilievi_contabilita, sicurezza, problemi, osservazioni, note.
Vale la stessa regola del verbale: un lavoro fatto va in lavorazioni_eseguite; una crepa, un difetto, un ritardo vanno in problemi; ponteggi, parapetti e protezioni vanno in sicurezza, che ha la precedenza su problemi; un materiale posato va in materiali_impiegati, uno che manca in materiali_necessari. Se non è chiaro, scrivi osservazioni.

Rispondi soltanto con un oggetto JSON: {"didascalia":"…","sezione":"…"}. Niente altro testo.`;

/* ============================================================
   UTILITÀ
   ============================================================ */

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const GIORNI_SETT = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const GIORNI_BREVI = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];

// Il testo che finisce nell'HTML passa sempre da qui: un nome di cantiere con un "<" non deve rompere la pagina.
function h(testo) {
  return String(testo == null ? '' : testo)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function nuovoId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

function adessoISO() { return new Date().toISOString(); }

// Le date locali si scrivono a mano: toISOString() darebbe il giorno in UTC, e alle 23 sarebbe già domani.
function dataLocaleISO(d) {
  d = d || new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function oggiISO() { return dataLocaleISO(new Date()); }
function oraAdesso(d) {
  d = d || new Date();
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
function daISO(iso) {
  if (!iso) return new Date();
  const p = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(p[0], p[1] - 1, p[2] || 1);
}
function dataEstesa(iso) {
  const d = daISO(iso);
  return GIORNI_SETT[d.getDay()] + ' ' + d.getDate() + ' ' + MESI[d.getMonth()] + ' ' + d.getFullYear();
}
function dataBreve(iso) {
  const d = daISO(iso);
  const g = GIORNI_BREVI[d.getDay()];
  return g.charAt(0).toUpperCase() + g.slice(1) + ' ' + d.getDate() + ' ' + MESI[d.getMonth()];
}
/* 10/09/26: la forma corta che si legge a colpo d'occhio anche in un'etichetta. */
function dataNumerica(iso) {
  const d = daISO(iso);
  const due = function (x) { return (x < 10 ? '0' : '') + x; };
  return due(d.getDate()) + '/' + due(d.getMonth() + 1) + '/' + String(d.getFullYear()).slice(-2);
}
/* 10/09: giorno e mese, senza anno. Sta davanti al titolo di una giornata. */
/* Il primo giorno della settimana è il lunedì. */
function lunedi(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const g = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - g);
  return x;
}
/* Le date pronte dei due momenti in cui si mandano i verbali: fine settimana
   e fine mese. Tornano già scritte come le vuole il campo data. */
function periodoPronto(quale) {
  const oggi = new Date();
  let dal, al;
  if (quale === 'settimana') { dal = lunedi(oggi); al = new Date(dal); al.setDate(al.getDate() + 6); }
  else if (quale === 'settimana-scorsa') { dal = lunedi(oggi); dal.setDate(dal.getDate() - 7); al = new Date(dal); al.setDate(al.getDate() + 6); }
  else if (quale === 'mese') { dal = new Date(oggi.getFullYear(), oggi.getMonth(), 1); al = new Date(oggi.getFullYear(), oggi.getMonth() + 1, 0); }
  else { dal = new Date(oggi.getFullYear(), oggi.getMonth() - 1, 1); al = new Date(oggi.getFullYear(), oggi.getMonth(), 0); }
  return { dal: dataLocaleISO(dal), al: dataLocaleISO(al) };
}

function giornoMese(iso) {
  const d = daISO(iso);
  const due = function (x) { return (x < 10 ? '0' : '') + x; };
  return due(d.getDate()) + '/' + due(d.getMonth() + 1);
}
function dataSenzaAnno(iso) {
  const d = daISO(iso);
  return d.getDate() + ' ' + MESI[d.getMonth()];
}
function titoloMese(iso) {
  const d = daISO(iso);
  const m = MESI[d.getMonth()];
  return m.charAt(0).toUpperCase() + m.slice(1) + ' ' + d.getFullYear();
}
function nomeGiornoRelativo(iso) {
  const oggi = oggiISO();
  if (iso === oggi) return 'Oggi';
  const ieri = dataLocaleISO(new Date(Date.now() - 86400000));
  if (iso === ieri) return 'Ieri';
  const g = GIORNI_SETT[daISO(iso).getDay()];
  return g.charAt(0).toUpperCase() + g.slice(1);
}
function oraDaISO(iso) {
  const d = new Date(iso);
  return isNaN(d) ? '' : oraAdesso(d);
}
function durataBreve(secondi) {
  secondi = Math.max(0, Math.round(secondi || 0));
  const m = Math.floor(secondi / 60), s = secondi % 60;
  return m + ':' + String(s).padStart(2, '0');
}
// Il parlato di un cantiere intero si conta in ore: "2 h 05" si legge, "125:30" no.
function durataLunga(secondi) {
  secondi = Math.max(0, Math.round(secondi || 0));
  if (secondi < 3600) return durataBreve(secondi);
  const o = Math.floor(secondi / 3600), m = Math.floor((secondi % 3600) / 60);
  return o + ' h ' + String(m).padStart(2, '0');
}
function euro(n) {
  n = Number(n) || 0;
  return n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}
function numeroIt(n, dec) {
  n = Number(n) || 0;
  return n.toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: dec == null ? 2 : dec });
}
function compatto(n) {
  n = Number(n) || 0;
  if (n >= 1000000) return (n / 1000000).toLocaleString('it-IT', { maximumFractionDigits: 1 }) + 'M';
  if (n >= 10000) return Math.round(n / 1000) + 'k';
  if (n >= 1000) return (n / 1000).toLocaleString('it-IT', { maximumFractionDigits: 1 }) + 'k';
  return numeroIt(n, 0);
}
function megabyte(b) { return (b / 1048576).toLocaleString('it-IT', { maximumFractionDigits: 1 }) + ' MB'; }
// Un PDF sta sui 200 KB: dirlo in MB darebbe sempre "0,2 MB". Sotto il mega si scrive in KB.
function pesoFile(b) { return b >= 1048576 ? megabyte(b) : Math.round(b / 1024) + ' KB'; }

// Un numero scritto all'italiana ("1.250,50") o all'inglese ("1,250.50"): si prova a capire quale.
function leggiNumero(testo, decimali, migliaia) {
  if (typeof testo === 'number') return testo;
  let s = String(testo == null ? '' : testo).replace(/[€$\s]/g, '').replace(/[^\d.,\-]/g, '');
  if (!s) return NaN;
  if (decimali === ',' ) { s = s.replace(/\./g, '').replace(',', '.'); }
  else if (decimali === '.') { s = s.replace(/,/g, ''); }
  else {
    // Non si sa: se c'è una virgola dopo l'ultimo punto è la virgola dei decimali, e viceversa.
    const uv = s.lastIndexOf(','), up = s.lastIndexOf('.');
    if (uv > up) s = s.replace(/\./g, '').replace(',', '.');
    else if (up > uv) s = s.replace(/,/g, '');
  }
  if (migliaia === "'" ) s = s.replace(/'/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? NaN : n;
}

function senzaAccenti(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
function parole(s) {
  return senzaAccenti(s).replace(/[^a-z0-9àèéìòù²³]+/g, ' ').trim().split(/\s+/).filter(function (p) { return p.length >= 3; });
}
function primaRiga(testo) {
  const r = String(testo || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
  return r[0] || '';
}
function conta(obj) { return Object.keys(obj || {}).length; }
function valori(obj) { return Object.keys(obj || {}).map(function (k) { return obj[k]; }); }
function stimaToken(testo) { return Math.ceil(String(testo || '').split(/\s+/).filter(Boolean).length * 1.6); }

// Il modello ogni tanto avvolge il JSON in una recinzione di codice o in una frase: si prende solo l'oggetto.
function estraiJSON(testo) {
  if (!testo) return null;
  let s = String(testo).trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a === -1 || b === -1) return null;
  s = s.slice(a, b + 1);
  try { return JSON.parse(s); } catch (e) { return null; }
}

function normalizzaUmLocale(testo) {
  const t = senzaAccenti(testo).replace(/\s+/g, ' ').trim();
  if (!t) return '';
  const chiavi = Object.keys(UM_SINONIMI);
  for (const um of chiavi) {
    if (t === senzaAccenti(um)) return um;
    if (UM_SINONIMI[um].some(function (s) { return senzaAccenti(s) === t; })) return um;
  }
  if (t === 'cm' || t === 'centimetri' || t === 'centimetro') return 'cm';
  if (t === 'mm' || t === 'millimetri' || t === 'millimetro') return 'mm';
  return null;
}

// Il testo di un elenco diventa righe pulite: niente segni davanti, niente righe vuote.
function righeElenco(testo) {
  return String(testo || '').split('\n').map(function (r) { return r.replace(/^\s*[-•*·]\s*/, '').trim(); }).filter(Boolean);
}
function aggiungiTesto(vecchio, nuovo) {
  nuovo = String(nuovo || '').trim();
  if (!nuovo) return vecchio || '';
  vecchio = String(vecchio || '').trim();
  return vecchio ? vecchio + '\n' + nuovo : nuovo;
}
function attendi(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function blobInBase64(blob) {
  return new Promise(function (ok, no) {
    const r = new FileReader();
    r.onload = function () { ok(String(r.result).split(',')[1]); };
    r.onerror = no;
    r.readAsDataURL(blob);
  });
}
// btoa non digerisce le lettere accentate: si passa dai byte UTF-8.
function base64Utf8(testo) {
  const byte = new TextEncoder().encode(testo);
  let s = '';
  for (let i = 0; i < byte.length; i += 0x8000) s += String.fromCharCode.apply(null, byte.subarray(i, i + 0x8000));
  return btoa(s);
}
function daBase64Utf8(b64) {
  const s = atob(String(b64).replace(/\n/g, ''));
  const byte = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) byte[i] = s.charCodeAt(i);
  return new TextDecoder().decode(byte);
}
function estensioneAudio(tipo) {
  tipo = String(tipo || '');
  if (tipo.indexOf('mp4') !== -1 || tipo.indexOf('m4a') !== -1 || tipo.indexOf('aac') !== -1) return 'm4a';
  if (tipo.indexOf('webm') !== -1) return 'webm';
  if (tipo.indexOf('ogg') !== -1) return 'ogg';
  if (tipo.indexOf('wav') !== -1) return 'wav';
  if (tipo.indexOf('mpeg') !== -1 || tipo.indexOf('mp3') !== -1) return 'mp3';
  return 'm4a';
}
function nomeFile(s) {
  return senzaAccenti(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'audio';
}

/* ============================================================
   L'ARCHIVIO
   Tutte le letture e le scritture passano da qui. Nient'altro nel codice
   tocca localStorage o IndexedDB: così il giorno che l'archivio cambia
   (un database vero, più utenti) si riscrive questo blocco e basta.

   Due chiavi in localStorage:
   - cantieri.dati   → i documenti e i contatori. È quello che va su GitHub.
   - cantieri.locale → chiavi dei servizi, coda, consumi, preferenze. Resta nel telefono.
   L'audio sta in IndexedDB, che regge i file grossi; localStorage no.
   ============================================================ */

// Sull'anteprima le chiavi cambiano nome, cosi' non si pesca
// nell'archivio dell'app vera: stesso dominio, cassetti diversi.
// Vale sia per /cantieri/anteprime/<ramo>/ sia per /cantieri-anteprime/<ramo>/.
const PREFISSO = location.pathname.includes('anteprime') ? 'anteprima.' : '';
const CHIAVE_DATI = PREFISSO + 'cantieri.dati';
const CHIAVE_LOCALE = PREFISSO + 'cantieri.locale';
const NOME_IDB = PREFISSO + 'cantieri-audio';
const STORE_IDB = 'audio';

let DB = null;       // i documenti, in memoria
let LOCALE = null;   // le cose del telefono, in memoria

function archivioVuoto() {
  return {
    versione: 1,
    contatori: { AZ: 0, CANT: 0, GIO: 0, SOP: 0, VER: 0, CON: 0, VOCE: 0, LIS: 0, REL: 0 },
    aziende: {}, cantieri: {}, giornate: {}, sopralluoghi: {}, verbali: {}, contabilita: {}, listino: {}, relazioni: {},
    cancellati: {},     // id → quando: perché una cancellazione arrivi anche all'altra copia
    soloEsempio: true,  // finché è vero, dentro ci sono solo i dati di esempio
    aggiornato: adessoISO()
  };
}
/* I due colori dell'app. Il primario è quello del lavoro fatto e delle azioni,
   il secondario è quello del materiale da consultare. Si cambiano dalle
   impostazioni: qui c'è la tavolozza, tutte tinte che si leggono sul fondo scuro. */
const TINTE = [
  { id: 'corallo',   nome: 'Corallo',   val: '#ff6b6b' },
  { id: 'mattone',   nome: 'Mattone',   val: '#f4633a' },
  { id: 'arancio',   nome: 'Arancio',   val: '#ff8a3d' },
  { id: 'ambra',     nome: 'Ambra',     val: '#e6b450' },
  { id: 'oro',       nome: 'Oro',       val: '#f5c542' },
  { id: 'giallo',    nome: 'Giallo',    val: '#ffe066' },
  { id: 'lime',      nome: 'Lime',      val: '#a3e635' },
  { id: 'mela',      nome: 'Mela',      val: '#7fe36a' },
  { id: 'verde',     nome: 'Verde',     val: '#3ddc84' },
  { id: 'smeraldo',  nome: 'Smeraldo',  val: '#34d399' },
  { id: 'petrolio',  nome: 'Petrolio',  val: '#2dd4bf' },
  { id: 'acqua',     nome: 'Acqua',     val: '#22d3ee' },
  { id: 'azzurro',   nome: 'Azzurro',   val: '#38bdf8' },
  { id: 'celeste',   nome: 'Celeste',   val: '#60a5fa' },
  { id: 'blu',       nome: 'Blu',       val: '#5b9dff' },
  { id: 'indaco',    nome: 'Indaco',    val: '#818cf8' },
  { id: 'viola',     nome: 'Viola',     val: '#a98bfa' },
  { id: 'lavanda',   nome: 'Lavanda',   val: '#c4b5fd' },
  { id: 'magenta',   nome: 'Magenta',   val: '#e879f9' },
  { id: 'rosa',      nome: 'Rosa',      val: '#f97fb5' },
  { id: 'ciclamino', nome: 'Ciclamino', val: '#fb7185' },
  { id: 'sabbia',    nome: 'Sabbia',    val: '#d9c2a3' },
  { id: 'perla',     nome: 'Perla',     val: '#d6dbe3' },
  { id: 'bianco',    nome: 'Bianco',    val: '#f2f0ec' }
];
/* Un colore può venire dalla tavolozza (un nome) o dalla ruota (un #rrggbb
   scelto a mano). Le due cose passano dalla stessa porta. */
function tinta(id) {
  if (typeof id === 'string' && /^#[0-9a-fA-F]{6}$/.test(id)) return { id: id, nome: 'Tuo', val: id.toLowerCase() };
  return TINTE.find(function (t) { return t.id === id; }) || null;
}

/* Scrive i due colori scelti sulle variabili del foglio di stile. Tutto il
   resto dell'app usa quelle variabili, quindi cambia da solo. */
function applicaColori() {
  const c = (leggiLocale().colori) || {};
  const r = document.documentElement;
  const p = tinta(c.primario), sec = tinta(c.secondario);
  if (p) r.style.setProperty('--accent', p.val); else r.style.removeProperty('--accent');
  if (sec) r.style.setProperty('--azione', sec.val); else r.style.removeProperty('--azione');
}

function localeVuoto() {
  return {
    chiavi: { groq: '', anthropic: '', github: '' },
    repo: '',
    modello: MODELLO,
    coda: [],
    proposte: [],
    consumi: {},
    ultimaCache: null,
    tendine: {},
    ultimoCantiere: null,
    notificheChieste: false,
    promemoriaGiorno: null,
    github: { daMandare: false, ultimoInvio: null, errore: null, sha: null },
    scaricati: {},
    pdf: [],
    mail: '',
    colori: { primario: '', secondario: '' },
    saltaAziende: false,
    settimane: {}
  };
}

function leggiTutto() {
  if (DB) return DB;
  let grezzo = null;
  try { grezzo = localStorage.getItem(CHIAVE_DATI); } catch (e) { grezzo = null; }
  if (grezzo) {
    try { DB = JSON.parse(grezzo); } catch (e) { DB = null; }
  }
  if (!DB || !DB.contatori) DB = archivioVuoto();
  completaArchivio(DB);
  return DB;
}

/* Un archivio scritto da una versione più vecchia non ha le collezioni nate
   dopo — le relazioni, le aziende. Senza questa riparazione il primo salvataggio
   scrive dentro il vuoto e l'app non parte più. Vale per quello che c'è sul
   telefono e per quello che arriva da GitHub. */
function completaArchivio(db) {
  if (!db) return db;
  const modello = archivioVuoto();
  Object.keys(modello).forEach(function (k) {
    if (modello[k] && typeof modello[k] === 'object' && !Array.isArray(modello[k])) {
      if (!db[k] || typeof db[k] !== 'object') db[k] = {};
      if (k === 'contatori') Object.keys(modello.contatori).forEach(function (c) {
        if (typeof db.contatori[c] !== 'number') db.contatori[c] = 0;
      });
    }
  });
  return db;
}
// Dice se nel telefono c'è già un archivio: la prima volta si parte con gli esempi.
function archivioEsiste() {
  try { return !!localStorage.getItem(CHIAVE_DATI); } catch (e) { return true; }
}
function leggiLocale() {
  if (LOCALE) return LOCALE;
  let grezzo = null;
  try { grezzo = localStorage.getItem(CHIAVE_LOCALE); } catch (e) { grezzo = null; }
  const base = localeVuoto();
  if (grezzo) {
    try { LOCALE = Object.assign(base, JSON.parse(grezzo)); } catch (e) { LOCALE = base; }
  } else LOCALE = base;
  if (!LOCALE.chiavi) LOCALE.chiavi = base.chiavi;
  if (!LOCALE.github) LOCALE.github = base.github;
  if (!Array.isArray(LOCALE.coda)) LOCALE.coda = [];
  if (!Array.isArray(LOCALE.proposte)) LOCALE.proposte = [];
  if (!Array.isArray(LOCALE.rilieviNuovi)) LOCALE.rilieviNuovi = [];
  return LOCALE;
}
function salvaLocale() {
  try { localStorage.setItem(CHIAVE_LOCALE, JSON.stringify(leggiLocale())); } catch (e) { /* spazio finito: si va avanti lo stesso */ }
}

/* Una pagina rimasta aperta per ore ha in memoria una copia vecchia. Prima di
   scrivere si guarda se nel telefono c'è qualcosa di più fresco (scritto da
   un'altra scheda, o dalla stessa app riaperta): in quel caso si riprende
   quello, e la modifica si applica sopra. È la regola che viene da un guasto vero. */
function ricaricaSeFresco() {
  let grezzo = null;
  try { grezzo = localStorage.getItem(CHIAVE_DATI); } catch (e) { return; }
  if (!grezzo) return;
  let sulTelefono = null;
  try { sulTelefono = JSON.parse(grezzo); } catch (e) { return; }
  if (sulTelefono && sulTelefono.aggiornato && DB && DB.aggiornato && sulTelefono.aggiornato > DB.aggiornato) {
    DB = completaArchivio(sulTelefono);
    if (!DB.cancellati) DB.cancellati = {};
    if (!DB.relazioni) DB.relazioni = {};
  }
}
function persisti() {
  try { localStorage.setItem(CHIAVE_DATI, JSON.stringify(DB)); }
  catch (e) { avvisa('Spazio pieno', 'err'); }
}

function codiceNuovo(prefisso) {
  const db = leggiTutto();
  /* Un codice già usato non si ridà. Succede quando due telefoni lavorano senza
     essersi ancora scambiati i dati: il contatore è indietro, e senza questo
     controllo nascerebbero due SOP-010, col verbale dell'uno attaccato all'altro. */
  const tipo = Object.keys(PREFISSI).find(function (k) { return PREFISSI[k] === prefisso; });
  const coll = tipo && COLLEZIONI[tipo] ? valori(db[COLLEZIONI[tipo]] || {}) : [];
  let n = db.contatori[prefisso] || 0, codice;
  // Tre cifre, che diventano quattro da sole quando serve.
  do { n++; codice = prefisso + '-' + String(n).padStart(3, '0'); }
  while (coll.some(function (x) { return x.codice === codice; }));
  db.contatori[prefisso] = n;
  return codice;
}

function salva(tipo, oggetto) {
  const db = leggiTutto();
  ricaricaSeFresco();
  const collezione = COLLEZIONI[tipo];
  if (!collezione) throw new Error('Tipo sconosciuto: ' + tipo);
  const adesso = adessoISO();
  if (!oggetto.id) oggetto.id = nuovoId();
  if (!oggetto.codice) oggetto.codice = codiceNuovo(PREFISSI[tipo]);
  if (!oggetto.azienda) oggetto.azienda = 'locale';
  if (!oggetto.utente) oggetto.utente = 'locale';
  if (!oggetto.creato) oggetto.creato = adesso;
  oggetto.aggiornato = adesso;
  DB[collezione][oggetto.id] = oggetto;
  DB.aggiornato = adesso;
  if (!oggetto.esempio) DB.soloEsempio = false;
  persisti();
  programmaInvioGitHub();
  return oggetto;
}

function cancella(tipo, id) {
  leggiTutto();
  ricaricaSeFresco();
  const collezione = COLLEZIONI[tipo];
  if (!collezione || !DB[collezione][id]) return;
  delete DB[collezione][id];
  DB.cancellati[id] = adessoISO();
  DB.aggiornato = adessoISO();
  persisti();
  programmaInvioGitHub();
}

// ---- IndexedDB per l'audio ----
let idbPromessa = null;
function apriIDB() {
  if (idbPromessa) return idbPromessa;
  idbPromessa = new Promise(function (ok, no) {
    if (!window.indexedDB) { no(new Error('IndexedDB non disponibile')); return; }
    const req = indexedDB.open(NOME_IDB, 1);
    req.onupgradeneeded = function () {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_IDB)) db.createObjectStore(STORE_IDB, { keyPath: 'id' });
    };
    req.onsuccess = function () { ok(req.result); };
    req.onerror = function () { no(req.error); };
  });
  return idbPromessa;
}
function salvaMedia(id, blob) {
  return apriIDB().then(function (db) {
    return new Promise(function (ok, no) {
      const tx = db.transaction(STORE_IDB, 'readwrite');
      tx.objectStore(STORE_IDB).put({ id: id, blob: blob, tipo: blob.type, peso: blob.size, quando: adessoISO() });
      tx.oncomplete = function () { ok('idb:' + id); };
      tx.onerror = function () { no(tx.error); };
    });
  });
}
function leggiMedia(rif) {
  const id = String(rif || '').replace(/^idb:/, '');
  if (!id) return Promise.resolve(null);
  return apriIDB().then(function (db) {
    return new Promise(function (ok, no) {
      const req = db.transaction(STORE_IDB, 'readonly').objectStore(STORE_IDB).get(id);
      req.onsuccess = function () { ok(req.result ? req.result.blob : null); };
      req.onerror = function () { no(req.error); };
    });
  }).catch(function () { return null; });
}
function cancellaMedia(rif) {
  const id = String(rif || '').replace(/^idb:/, '');
  return apriIDB().then(function (db) {
    return new Promise(function (ok, no) {
      const tx = db.transaction(STORE_IDB, 'readwrite');
      tx.objectStore(STORE_IDB).delete(id);
      tx.oncomplete = function () { ok(); };
      tx.onerror = function () { no(tx.error); };
    });
  }).catch(function () {});
}
// L'elenco senza i blob: serve alla card Spazio per sapere quanto pesa ogni mese.
function elencaMedia() {
  return apriIDB().then(function (db) {
    return new Promise(function (ok, no) {
      const elenco = [];
      const req = db.transaction(STORE_IDB, 'readonly').objectStore(STORE_IDB).openCursor();
      req.onsuccess = function () {
        const c = req.result;
        if (c) { elenco.push({ id: c.value.id, peso: c.value.peso || (c.value.blob ? c.value.blob.size : 0), quando: c.value.quando }); c.continue(); }
        else ok(elenco);
      };
      req.onerror = function () { no(req.error); };
    });
  }).catch(function () { return []; });
}

// ---- comodità di lettura ----
function cantiere(id) { return leggiTutto().cantieri[id] || null; }
function cantierePerCodice(codice) { return valori(leggiTutto().cantieri).find(function (c) { return c.codice === codice; }) || null; }
function sopralluogo(id) { return leggiTutto().sopralluoghi[id] || null; }
function verbale(id) { return leggiTutto().verbali[id] || null; }
// Un verbale si può chiamare come si vuole; se non ha un nome vale il codice.
function nomeVerbale(v) { return v ? (String(v.nome || '').trim() || v.codice) : ''; }
/* ---- Come si chiamano le cose sullo schermo ----
   I codici (AZ-001, SOP-012, VER-004…) restano nei dati e nel PDF: tengono unico
   ogni elemento. Sullo schermo si mostra un nome che una persona riconosce. */
// "dell'11 settembre", "del 12 settembre": l'apostrofo va davanti a 1, 8 e 11.
function delGiorno(iso) {
  const d = daISO(iso), n = d.getDate();
  return (n === 1 || n === 8 || n === 11 ? "dell'" : 'del ') + n + ' ' + MESI[d.getMonth()];
}
function oraCorta(ora) { return String(ora || '').replace(/^0/, ''); }
// L'ora si aggiunge solo quando in quel giorno di sopralluoghi ce n'è più d'uno.
function quandoSopralluogo(s) {
  const piu = sopralluoghiDelGiorno(s.cantiere, s.giorno).length > 1;
  return dataSenzaAnno(s.giorno) + (piu ? ', ' + oraCorta(s.ora) : '');
}
// Cantiere + data: "Via Mazzini 14 · 11 settembre". Dentro il suo cantiere, la data basta.
function titoloSopralluogo(s, senzaCantiere) {
  const c = senzaCantiere ? null : cantierePerCodice(s.cantiere);
  return (c ? c.nome + ' · ' : '') + quandoSopralluogo(s);
}
// Il nome dato a mano vince; se no "Verbale dell'11 settembre · Via Mazzini 14".
function titoloVerbale(v, senzaCantiere) {
  const nome = String(v.nome || '').trim();
  if (nome) return nome;
  const c = senzaCantiere ? null : cantierePerCodice(v.cantiere);
  const s = v.giornata ? null : sopralluogoPerCodice(v.sopralluogo);
  const ora = s && sopralluoghiDelGiorno(s.cantiere, s.giorno).length > 1 ? ', ' + oraCorta(s.ora) : '';
  return (v.giornata ? 'Giornata ' : 'Verbale ') + delGiorno(v.giorno) + ora + (c ? ' · ' + c.nome : '');
}
function verbalePerCodice(codice) { return valori(leggiTutto().verbali).find(function (v) { return v.codice === codice; }) || null; }
// Una foto si chiama con l'ora, un documento con il suo genere: "Foto delle 9:40", "Bolla delle 14:05".
function nomeFoto(f) { return (GENERI[f.genere] || 'Foto') + ' delle ' + oraCorta(f.ora); }
// "PDF · 3 pagine", o solo "PDF" se le pagine non si sono potute contare.
function paginePdf(f) { return 'PDF' + (f.pagine ? ' · ' + f.pagine + (f.pagine === 1 ? ' pagina' : ' pagine') : ''); }
function sopralluoghiDi(codiceCantiere) {
  return valori(leggiTutto().sopralluoghi).filter(function (s) { return s.cantiere === codiceCantiere; })
    .sort(function (a, b) { return (b.giorno + b.ora).localeCompare(a.giorno + a.ora); });
}
function verbaleDiSopralluogo(codiceSop) {
  return valori(leggiTutto().verbali).find(function (v) { return v.sopralluogo === codiceSop; }) || null;
}
function contabilitaDi(codiceCantiere) {
  return valori(leggiTutto().contabilita).find(function (c) { return c.cantiere === codiceCantiere; }) || null;
}
function relazione(id) { return leggiTutto().relazioni[id] || null; }
// Una relazione per cantiere: si riscrive, non se ne fa una seconda.
function relazioneDi(codiceCantiere) {
  return valori(leggiTutto().relazioni).find(function (r) { return r.cantiere === codiceCantiere; }) || null;
}
function contabilitaOCrea(codiceCantiere) {
  let c = contabilitaDi(codiceCantiere);
  if (!c) c = salva('contabilita', { cantiere: codiceCantiere, note: '', righe: [] });
  return c;
}
function listinoTutto() {
  return valori(leggiTutto().listino).sort(function (a, b) { return a.codice.localeCompare(b.codice); });
}
/* La card della settimana chiusa: compare da mercoledì, in cima alla prima schermata,
   e non se ne va finché non la mandi fuori o non dici che ce l'hai già. */
function cardSettimana() {
  const sett = settimanaDaChiudere();
  if (!sett || SETT_CONTO.inizio !== sett.inizio || !(SETT_CONTO.audio || SETT_CONTO.foto)) return '';
  const mail = leggiLocale().mail;
  return '<div class="card gialla"><div class="card-capo gialla">Settimana da chiudere<span class="dx">' + h(dataSenzaAnno(sett.inizio)) + ' - ' + h(dataSenzaAnno(sett.fine)) + '</span></div>' +
    '<div class="card-corpo">' + SETT_CONTO.foto + ' foto, ' + SETT_CONTO.audio + ' audio · ' + h(pesoFile(SETT_CONTO.byte)) + '.<br>' +
    (mail ? 'Mandala a <b>' + h(mail) + '</b>: si apre il foglio di condivisione, scegli Mail.' : 'Mandala fuori: si apre il foglio di condivisione, scegli Mail.') +
    '</div><div class="griglia">' +
    '<button class="btn btn-ok" data-az="settimana-manda" data-inizio="' + h(sett.inizio) + '" data-fine="' + h(sett.fine) + '"><span class="ico ico-invio"></span> Manda la settimana</button>' +
    '<button class="btn" data-az="settimana-fatta" data-inizio="' + h(sett.inizio) + '" data-fine="' + h(sett.fine) + '">Ce l\'ho già</button>' +
    '</div></div>';
}

/* ---------------- LE AZIENDE ----------------
   Il livello sopra i cantieri: tuo padre lavora per più imprese, e ognuna ha la sua
   carta intestata. Un cantiere appartiene a un'azienda; finché non ce n'è nessuna
   l'app funziona come prima, e i cantieri senza azienda non spariscono mai. */
/* Un cantiere sta sempre dentro un'azienda. Se ce ne sono e di aziende nemmeno una —
   perché l'app viene da prima, o perché arrivano da GitHub — se ne apre una e li prende
   tutti. Il nome è un segnaposto: si cambia dalla sua scheda in due tocchi. */
function sistemaAziende() {
  const db = leggiTutto();
  if (conta(db.aziende) || !conta(db.cantieri)) return null;
  const soloEsempi = valori(db.cantieri).every(function (c) { return c.esempio; });
  const a = salva('azienda', { nome: 'La mia azienda', ragione: '', piva: '', indirizzo: '', telefono: '', mail: '', pec: '', note: '', media: [], esempio: soloEsempi || undefined });
  valori(db.cantieri).forEach(function (c) { c.azienda = a.codice; salva('cantiere', c); });
  return a;
}

function azienda(id) { return leggiTutto().aziende[id] || null; }
function aziendaPerCodice(codice) {
  return valori(leggiTutto().aziende).find(function (a) { return a.codice === codice; }) || null;
}
function aziendeTutte() {
  return valori(leggiTutto().aziende).sort(function (a, b) { return a.nome.localeCompare(b.nome); });
}
function cantieriDiAzienda(codice) {
  return valori(leggiTutto().cantieri).filter(function (c) { return (c.azienda || '') === codice; });
}
function cantieriSenzaAzienda() {
  const codici = aziendeTutte().map(function (a) { return a.codice; });
  return valori(leggiTutto().cantieri).filter(function (c) { return !c.azienda || codici.indexOf(c.azienda) === -1; });
}
function aziendaDiCantiere(c) { return c && c.azienda ? aziendaPerCodice(c.azienda) : null; }

function sopralluogoDiOggi(codiceCantiere) {
  const oggi = oggiISO();
  return sopralluoghiDi(codiceCantiere).find(function (s) { return s.giorno === oggi; }) || null;
}
/* In una giornata si va in cantiere più volte: ogni passaggio è un sopralluogo suo,
   con la sua ora e il suo verbale. Qui stanno tutti quelli di un giorno, dal primo. */
function sopralluoghiDelGiorno(codiceCantiere, giorno) {
  return sopralluoghiDi(codiceCantiere).filter(function (s) { return s.giorno === giorno; })
    .sort(function (a, b) { return String(a.ora).localeCompare(String(b.ora)); });
}
function sopralluoghiDiOggi(codiceCantiere) { return sopralluoghiDelGiorno(codiceCantiere, oggiISO()); }
// Aperto vuol dire senza verbale fatto.
function sopralluoghiApertiOggi(codiceCantiere) {
  return sopralluoghiDiOggi(codiceCantiere).filter(function (s) { return !s.chiuso; });
}
// Un sopralluogo si può chiamare come si vuole; se non ha un nome vale l'ora.
function nomeSopralluogo(s) { return s ? (String(s.nome || '').trim() || ('sopralluogo delle ' + s.ora)) : ''; }
function sopralluogoPerCodice(codice) {
  return valori(leggiTutto().sopralluoghi).find(function (s) { return s.codice === codice; }) || null;
}
/* Il verbale di giornata: uno per cantiere e per giorno, e tiene dentro i verbali
   dei sopralluoghi di quel giorno. Ha lo stesso archivio degli altri verbali. */
function verbaleDiGiornata(codiceCantiere, giorno) {
  return valori(leggiTutto().verbali).find(function (v) { return v.giornata && v.cantiere === codiceCantiere && v.giorno === giorno; }) || null;
}
function verbaliDiGiornata(codiceCantiere) {
  return valori(leggiTutto().verbali).filter(function (v) { return v.giornata && v.cantiere === codiceCantiere; })
    .sort(function (a, b) { return b.giorno.localeCompare(a.giorno); });
}
/* La giornata è un dato suo: così esiste anche senza sopralluoghi, e si può eliminare
   da sola. Nasce col primo sopralluogo del giorno; le giornate vecchie, di prima che
   il dato esistesse, si ricavano dai sopralluoghi e vanno bene lo stesso. */
function giornataDi(codiceCantiere, giorno) {
  return valori(leggiTutto().giornate).find(function (g) { return g.cantiere === codiceCantiere && g.giorno === giorno; }) || null;
}
function assicuraGiornata(codiceCantiere, giorno) {
  return giornataDi(codiceCantiere, giorno) || salva('giornata', { cantiere: codiceCantiere, giorno: giorno });
}
// I giorni di un cantiere, dal più recente: ognuno con i suoi sopralluoghi e il suo verbale.
function giornateDi(codiceCantiere) {
  const per = {};
  valori(leggiTutto().giornate).forEach(function (g) { if (g.cantiere === codiceCantiere) per[g.giorno] = []; });
  sopralluoghiDi(codiceCantiere).forEach(function (s) { (per[s.giorno] = per[s.giorno] || []).push(s); });
  return Object.keys(per).sort(function (a, b) { return b.localeCompare(a); }).map(function (g) {
    return { giorno: g, sops: per[g].sort(function (a, b) { return String(a.ora).localeCompare(String(b.ora)); }), verbale: verbaleDiGiornata(codiceCantiere, g) };
  });
}
function sezioniPiene(sezioni) {
  return CHIAVI_SEZIONI.filter(function (k) { return String(sezioni[k] || '').trim(); });
}
function sezioniVuote() {
  const s = {};
  CHIAVI_SEZIONI.forEach(function (k) { s[k] = ''; });
  s.da_smistare = '';
  return s;
}
function totaleContabilita(c) {
  return (c && c.righe || []).reduce(function (t, r) { return t + (Number(r.importo) || 0); }, 0);
}
function nomeSezione(chiave) {
  const s = SEZIONI.find(function (x) { return x.chiave === chiave; });
  return s ? s.nome : (chiave === 'da_smistare' ? 'Da smistare' : chiave);
}
// Le foto stanno in media, che oggi contiene solo foto ma domani potrebbe contenere altro.
function fotoDi(sop) {
  return (sop && Array.isArray(sop.media) ? sop.media : []).filter(function (m) { return m && m.tipo === 'foto'; });
}
// Le foto vere sono quelle di quello che si vede. Bolle e moduli firme hanno un genere e vanno per conto loro.
function fotoNormali(sop) { return fotoDi(sop).filter(function (f) { return !f.genere; }); }
function documentiDi(sop) { return fotoDi(sop).filter(function (f) { return !!f.genere; }); }
/* I documenti che valgono per tutto il cantiere: nascono in una giornata — quella
   in cui sono stati scansionati, e quel legame non si perde — ma sono marcati, e
   si vedono anche dal cantiere. Tornano dal più recente. */
function documentiDelCantiere(codiceCantiere) {
  const fuori = [];
  sopralluoghiDi(codiceCantiere).forEach(function (s) {
    documentiDi(s).forEach(function (f) { if (f.cantiere) fuori.push({ sop: s, f: f }); });
  });
  return fuori.sort(function (a, b) { return String(b.f.quando).localeCompare(String(a.f.quando)); });
}
function trovaFoto(sop, id) {
  return fotoDi(sop).find(function (f) { return f.id === id; }) || null;
}
// Una foto senza sezione, o con una sezione che non esiste più, va in "Altre osservazioni".
function sezioneFoto(f) {
  return CHIAVI_SEZIONI.indexOf(f.sezione) !== -1 ? f.sezione : SEZIONE_FOTO;
}

/* ============================================================
   I DATI DI ESEMPIO
   Tre cantieri (uno chiuso), due sopralluoghi con le sezioni piene, un
   verbale, una contabilità con quattro righe, un listino di quindici voci.
   Le date sono relative a oggi, così la demo sembra viva anche fra un mese.
   ============================================================ */

function giorniFa(n) { return dataLocaleISO(new Date(Date.now() - n * 86400000)); }

function inserisciDatiEsempio() {
  const oggi = oggiISO();
  const az = salva('azienda', { nome: 'Geom. Scirè', ragione: '', piva: '', indirizzo: '', telefono: '', mail: '', pec: '', note: '', media: [], esempio: true });
  const c1 = salva('cantiere', { nome: 'Via Mazzini 14', committente: 'Immobiliare Castelli', indirizzo: 'via Mazzini 14, Vigevano', azienda: az.codice, note: 'Accesso dal cancello sul retro, chiave dal custode.\nReferente del committente: geom. Ferrari, 333 1234567.', aperto: giorniFa(40), stato: 'attivo', esempio: true });
  const c2 = salva('cantiere', { nome: 'Scuola media Pascoli', committente: 'Comune di Mortara', indirizzo: 'via Roma 8, Mortara', azienda: az.codice, note: '', aperto: giorniFa(20), stato: 'attivo', esempio: true });
  salva('cantiere', { nome: 'Villa Serra, rifacimento tetto', committente: 'Famiglia Serra', indirizzo: 'strada per Gambolò 12', azienda: az.codice, note: 'Lavori consegnati.', aperto: giorniFa(120), stato: 'chiuso', esempio: true });

  // Un sopralluogo di due giorni fa, già chiuso col suo verbale
  const s1 = salva('sopralluogo', {
    cantiere: c1.codice, giorno: giorniFa(2), ora: '09:15',
    sezioni: Object.assign(sezioniVuote(), {
      lavorazioni_eseguite: 'Posa dell\'armatura del solaio sul lato sud. Casseratura completata per due campate su tre.',
      operai: 'Mario Rossi (Edil Rossi) — capo squadra\n3 carpentieri (Edil Rossi) — casseratura solaio\n2 ferraioli (Edil Rossi) — armatura',
      attrezzature_presenti: 'Gru a torre\nBetoniera\nTrabattello',
      materiali_necessari: '20 q di ferro Ø12, per giovedì\n3 bancali di blocchi da 30',
      problemi: 'Casseri arrivati alle 11 invece che alle 8: mezza giornata persa sulla terza campata.',
      note: 'Chiamare il geom. Ferrari per le quote dei pilastri.'
    }),
    pezzi: [
      { id: nuovoId(), ora: '09:16', durata: 72, audio: null, grezzo: 'allora oggi hanno posato l\'armatura del solaio sul lato sud e la casseratura è completata per due campate su tre', titolo: 'Armatura solaio lato sud', sezione: 'lavorazioni_eseguite', sezioni: ['lavorazioni_eseguite'], stato: 'riordinato', esempio: true },
      { id: nuovoId(), ora: '09:41', durata: 48, audio: null, grezzo: 'problemi i casseri sono arrivati alle undici invece che alle otto quindi mezza giornata persa sulla terza campata', titolo: 'Ritardo consegna casseri', sezione: 'problemi', sezioni: ['problemi'], stato: 'riordinato', esempio: true },
      { id: nuovoId(), ora: '10:02', durata: 93, audio: null, grezzo: 'materiali che servono per giovedì venti quintali di ferro fi dodici e tre bancali di blocchi da trenta appunto chiamare il geometra ferrari per le quote dei pilastri', titolo: 'Ferro da ordinare per giovedì', sezione: 'materiali_necessari', sezioni: ['materiali_necessari', 'note'], stato: 'riordinato', esempio: true }
    ],
    chiuso: null, media: [], posizione: null, esempio: true
  });
  const v1 = salva('verbale', { sopralluogo: s1.codice, cantiere: c1.codice, giorno: s1.giorno, ora: s1.ora, sezioni: Object.assign({}, s1.sezioni), esempio: true });
  s1.chiuso = new Date(daISO(s1.giorno).getTime() + 15 * 3600000 + 10 * 60000).toISOString();
  s1.verbale = v1.codice;
  salva('sopralluogo', s1);

  /* La giornata di oggi sul primo cantiere: tre passaggi, come capita davvero.
     Il primo del mattino ha già il suo verbale, quello del pomeriggio è in corso
     con una registrazione ancora da assegnare, l'ultimo è di fine giornata. */
  const m1 = salva('sopralluogo', {
    cantiere: c1.codice, giorno: oggi, ora: '08:10', nome: 'primo giro del mattino',
    sezioni: Object.assign(sezioniVuote(), {
      lavorazioni_eseguite: 'Scarico del ferro per il solaio del secondo piano. Pulizia del piano di lavoro.',
      operai: 'Mario Rossi (Edil Rossi) — capo squadra\n2 carpentieri (Edil Rossi) — scarico e stoccaggio',
      attrezzature_presenti: 'Gru a torre\nAutocarro con gru del fornitore',
      materiali_impiegati: '38 q di ferro Ø12 e Ø16, bolla n. 2214 di Ferriera Lomellina'
    }),
    pezzi: [
      { id: nuovoId(), ora: '08:12', durata: 54, audio: null, grezzo: 'scarico del ferro per il solaio del secondo piano trentotto quintali fi dodici e fi sedici bolla duemiladuecentoquattordici ferriera lomellina', titolo: 'Scarico ferro secondo piano', sezione: 'materiali_impiegati', sezioni: ['lavorazioni_eseguite', 'materiali_impiegati'], stato: 'riordinato', esempio: true }
    ],
    chiuso: null, media: [], posizione: null, esempio: true
  });
  const vm1 = salva('verbale', { sopralluogo: m1.codice, cantiere: c1.codice, giorno: oggi, ora: m1.ora, nome: 'mattino', sezioni: Object.assign({}, m1.sezioni), esempio: true });
  m1.chiuso = new Date(daISO(oggi).getTime() + 9 * 3600000).toISOString();
  m1.verbale = vm1.codice;
  salva('sopralluogo', m1);

  const p3 = salva('sopralluogo', {
    cantiere: c1.codice, giorno: oggi, ora: '17:05', nome: 'chiusura di giornata',
    sezioni: Object.assign(sezioniVuote(), {
      lavorazioni_eseguite: 'Bagnatura del getto. Copertura del solaio con teli per la notte.',
      sicurezza: 'Rimesso il fermapiede sul terzo impalcato del ponteggio lato nord, come segnalato nel pomeriggio.',
      note: 'Domani mattina disarmo delle sponde se il tempo regge.'
    }),
    pezzi: [
      { id: nuovoId(), ora: '17:06', durata: 61, audio: null, grezzo: 'bagnatura del getto e copertura con i teli per la notte sicurezza hanno rimesso il fermapiede sul terzo impalcato lato nord domani mattina disarmo delle sponde se il tempo regge', titolo: 'Chiusura e copertura getto', sezione: 'lavorazioni_eseguite', sezioni: ['lavorazioni_eseguite', 'sicurezza', 'note'], stato: 'riordinato', esempio: true }
    ],
    chiuso: null, media: [], posizione: null, esempio: true
  });
  const vp3 = salva('verbale', { sopralluogo: p3.codice, cantiere: c1.codice, giorno: oggi, ora: p3.ora, nome: 'sera', sezioni: Object.assign({}, p3.sezioni), esempio: true });
  p3.chiuso = new Date(daISO(oggi).getTime() + 17 * 3600000 + 40 * 60000).toISOString();
  p3.verbale = vp3.codice;
  salva('sopralluogo', p3);

  // Il sopralluogo di oggi, in corso
  salva('sopralluogo', {
    cantiere: c1.codice, giorno: oggi, ora: '14:30', nome: 'pomeriggio',
    sezioni: Object.assign(sezioniVuote(), {
      lavorazioni_eseguite: 'Getto del solaio al primo piano, completato entro le 12. Ripresa delle tracce impianti sul lato est.',
      operai: 'Mario Rossi (Edil Rossi) — capo squadra\n2 muratori (Edil Rossi) — getto solaio\nLuca Bianchi (Impianti Bianchi) — tracce impianti',
      sicurezza: 'Ponteggio lato nord senza fermapiede sul terzo impalcato. Segnalato al capo squadra.'
    }),
    pezzi: [
      { id: nuovoId(), ora: '14:31', durata: 42, audio: null, grezzo: 'lavorazioni eseguite getto del solaio al primo piano completato entro le dodici ripresa delle tracce impianti sul lato est', titolo: 'Getto solaio primo piano', sezione: 'lavorazioni_eseguite', sezioni: ['lavorazioni_eseguite'], stato: 'riordinato', esempio: true },
      { id: nuovoId(), ora: '14:36', durata: 65, audio: null, grezzo: 'capitolo operai mario rossi della edil rossi capo squadra due muratori sempre rossi sul getto e luca bianchi impianti bianchi sulle tracce', titolo: 'Squadra Rossi e impianti', sezione: 'operai', sezioni: ['operai'], stato: 'riordinato', esempio: true },
      { id: nuovoId(), ora: '14:49', durata: 145, audio: null, grezzo: 'sicurezza il ponteggio lato nord non ha il fermapiede sul terzo impalcato l\'ho segnalato al capo squadra', titolo: 'Ponteggio senza fermapiede', sezione: 'sicurezza', sezioni: ['sicurezza'], stato: 'riordinato', esempio: true },
      // Questa è arrivata senza che si capisse in che passaggio va: aspetta lì.
      { id: nuovoId(), ora: '15:20', durata: 37, audio: null, grezzo: 'il committente è passato e ha chiesto di spostare la presa della cucina di trenta centimetri verso la finestra', titolo: 'Richiesta del committente sulla presa', sezione: '', sezioni: [], stato: 'da-assegnare', daAssegnare: true, esempio: true }
    ],
    chiuso: null, media: [], posizione: null, esempio: true
  });

  /* Il verbale di giornata di ieri sul primo cantiere: un documento solo che
     tiene dentro i passaggi di quel giorno. Serve a far vedere com'è fatto. */
  const gIeri = giorniFa(1);
  const sIeriA = salva('sopralluogo', {
    cantiere: c1.codice, giorno: gIeri, ora: '08:40', nome: 'consegna materiali',
    sezioni: Object.assign(sezioniVuote(), {
      lavorazioni_eseguite: 'Montaggio delle sponde per il getto del solaio.',
      materiali_impiegati: '6 bancali di blocchi da 30, bolla n. 2198.'
    }),
    pezzi: [], chiuso: null, media: [], posizione: null, esempio: true
  });
  const vIeriA = salva('verbale', { sopralluogo: sIeriA.codice, cantiere: c1.codice, giorno: gIeri, ora: sIeriA.ora, sezioni: Object.assign({}, sIeriA.sezioni), esempio: true });
  sIeriA.chiuso = new Date(daISO(gIeri).getTime() + 10 * 3600000).toISOString();
  sIeriA.verbale = vIeriA.codice;
  salva('sopralluogo', sIeriA);

  const sIeriB = salva('sopralluogo', {
    cantiere: c1.codice, giorno: gIeri, ora: '15:10', nome: 'controllo del pomeriggio',
    sezioni: Object.assign(sezioniVuote(), {
      lavorazioni_eseguite: 'Controllo delle quote delle sponde prima del getto.',
      problemi: 'Una sponda fuori quota di 2 cm sul lato est: rifatta in giornata.'
    }),
    pezzi: [], chiuso: null, media: [], posizione: null, esempio: true
  });
  const vIeriB = salva('verbale', { sopralluogo: sIeriB.codice, cantiere: c1.codice, giorno: gIeri, ora: sIeriB.ora, sezioni: Object.assign({}, sIeriB.sezioni), esempio: true });
  sIeriB.chiuso = new Date(daISO(gIeri).getTime() + 16 * 3600000).toISOString();
  sIeriB.verbale = vIeriB.codice;
  salva('sopralluogo', sIeriB);

  const sezGiornata = {};
  CHIAVI_SEZIONI.forEach(function (k) { sezGiornata[k] = ''; });
  [sIeriA, sIeriB].forEach(function (x) {
    CHIAVI_SEZIONI.forEach(function (k) {
      const t = String(x.sezioni[k] || '').trim();
      if (t) sezGiornata[k] = aggiungiTesto(sezGiornata[k], 'Ore ' + x.ora + ' · ' + x.nome + '\n' + t);
    });
  });
  salva('verbale', { cantiere: c1.codice, giorno: gIeri, ora: sIeriA.ora, giornata: true,
    sopralluoghi: [sIeriA.codice, sIeriB.codice], nome: 'giornata di ieri', sezioni: sezGiornata, esempio: true });

  // Un sopralluogo vecchio sul secondo cantiere, chiuso
  const s3 = salva('sopralluogo', {
    cantiere: c2.codice, giorno: giorniFa(5), ora: '16:00',
    sezioni: Object.assign(sezioniVuote(), {
      lavorazioni_eseguite: 'Consegna del ferro. Controllo delle quote dei pilastri della palestra.',
      lavorazioni_non_eseguite: 'Non è stato gettato il cordolo lato ovest: mancava il ferro.',
      operai: '4 muratori (Impresa Colombo) — pilastri',
      attrezzature_necessarie: 'Autopompa per il getto della platea, settimana prossima'
    }),
    pezzi: [
      { id: nuovoId(), ora: '16:02', durata: 88, audio: null, grezzo: 'consegna del ferro controllo quote pilastri palestra non hanno gettato il cordolo lato ovest mancava il ferro quattro muratori della colombo sui pilastri per la settimana prossima ci vuole l\'autopompa per la platea', titolo: 'Consegna ferro e quote pilastri', sezione: 'lavorazioni_eseguite', sezioni: ['lavorazioni_eseguite', 'lavorazioni_non_eseguite', 'operai', 'attrezzature_necessarie'], stato: 'riordinato', esempio: true }
    ],
    chiuso: null, media: [], posizione: null, esempio: true
  });
  const v3 = salva('verbale', { sopralluogo: s3.codice, cantiere: c2.codice, giorno: s3.giorno, ora: s3.ora, sezioni: Object.assign({}, s3.sezioni), esempio: true });
  s3.chiuso = new Date(daISO(s3.giorno).getTime() + 17 * 3600000 + 20 * 60000).toISOString();
  s3.verbale = v3.codice;
  salva('sopralluogo', s3);

  // Il listino: quindici voci vere da prezzario edile
  const voci = [
    ['Scavo di sbancamento con mezzi meccanici', 'm³', 8.50],
    ['Scavo a sezione obbligata per fondazioni', 'm³', 14.20],
    ['Calcestruzzo C25/30 per fondazioni, fornito e posto in opera', 'm³', 145.00],
    ['Acciaio B450C per armature, lavorato e posto in opera', 'kg', 1.85],
    ['Casseforme per getti in calcestruzzo armato', 'm²', 28.00],
    ['Muratura in blocchi di laterizio porizzato sp. 30 cm', 'm²', 78.00],
    ['Tramezzi in laterizio forato sp. 8 cm', 'm²', 32.00],
    ['Intonaco civile per interni a tre strati', 'm²', 22.50],
    ['Intonaco rustico per esterni', 'm²', 19.00],
    ['Massetto in sabbia e cemento sp. 5 cm', 'm²', 18.00],
    ['Impermeabilizzazione con guaina bituminosa 4 mm', 'm²', 16.50],
    ['Solaio in latero-cemento H 20+4', 'm²', 62.00],
    ['Tinteggiatura interna a due mani con idropittura', 'm²', 7.80],
    ['Ponteggio metallico, nolo per il primo mese', 'm²', 9.50],
    ['Demolizione di pavimento e sottofondo', 'm²', 12.00]
  ];
  const lis = voci.map(function (v) { return salva('listino', { descrizione: v[0], um: v[1], prezzo: v[2], esempio: true }); });

  // La contabilità del primo cantiere: quattro righe, una senza prezzo (gialla)
  const righe = [
    { descrizione: 'Scavo di sbancamento con mezzi meccanici', quantita: 120, um: 'm³', prezzo: 8.50, dallistino: lis[0].codice },
    { descrizione: 'Calcestruzzo C25/30 per fondazioni', quantita: 45, um: 'm³', prezzo: 145, dallistino: lis[2].codice },
    { descrizione: 'Acciaio B450C per armature', quantita: 3800, um: 'kg', prezzo: 1.85, dallistino: lis[3].codice },
    { descrizione: 'Rimozione tettoia in lamiera', quantita: 1, um: 'corpo', prezzo: 0, dallistino: null }
  ].map(function (r) {
    r.codice = codiceNuovo('VOCE');
    r.importo = Math.round(r.quantita * r.prezzo * 100) / 100;
    r.dacompletare = !(r.prezzo > 0);
    return r;
  });
  salva('contabilita', { cantiere: c1.codice, note: 'Prezzi dal listino 2026. La tettoia va quotata a parte.', righe: righe, esempio: true });

  leggiTutto().soloEsempio = true;
  persisti();
}

function buttaDatiEsempio() {
  const db = leggiTutto();
  Object.keys(COLLEZIONI).forEach(function (tipo) {
    valori(db[COLLEZIONI[tipo]]).forEach(function (o) { if (o.esempio) cancella(tipo, o.id); });
  });
  db.soloEsempio = false;
  persisti();
}

/* ============================================================
   LA COPIA SU GITHUB
   Il testo va su GitHub, l'audio no. Un file JSON sul ramo "dati", scritto
   con un commit via API. Si scrive prima nel telefono, sempre; il commit
   parte dopo, quando c'è rete. Se le due copie litigano vince la più
   recente, documento per documento.
   ============================================================ */

let timerGitHub = null;

function repoGitHub() {
  const loc = leggiLocale();
  if (loc.repo) return loc.repo.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, '');
  // Sulle GitHub Pages il nome del repository è nell'indirizzo: tuonome.github.io/cantieri
  const m = location.hostname.match(/^([^.]+)\.github\.io$/);
  const seg = location.pathname.split('/').filter(Boolean)[0];
  if (m && seg) return m[1] + '/' + seg;
  return '';
}
function githubPronto() {
  const loc = leggiLocale();
  return !!(loc.chiavi.github && repoGitHub());
}
function programmaInvioGitHub() {
  const loc = leggiLocale();
  loc.github.daMandare = true;
  salvaLocale();
  if (!githubPronto()) return;
  clearTimeout(timerGitHub);
  // Si aspetta qualche secondo: dettando si salva dieci volte in un minuto, e un commit basta.
  timerGitHub = setTimeout(function () { inviaGitHub().catch(function () {}); }, 4000);
}

// Il documento con la data di aggiornamento più recente vince, da qualunque parte venga.
function fondiArchivi(locale, remoto) {
  if (!remoto || typeof remoto !== 'object' || !remoto.contatori) return false;
  let cambiato = false;
  const cancellatiLoc = locale.cancellati || {};
  const cancellatiRem = remoto.cancellati || {};
  Object.keys(COLLEZIONI).forEach(function (tipo) {
    const coll = COLLEZIONI[tipo];
    const mia = locale[coll] || (locale[coll] = {});
    const sua = remoto[coll] || {};
    Object.keys(sua).forEach(function (id) {
      const quandoCancellato = cancellatiLoc[id];
      if (quandoCancellato && quandoCancellato >= (sua[id].aggiornato || '')) return;
      if (!mia[id] || (sua[id].aggiornato || '') > (mia[id].aggiornato || '')) { mia[id] = sua[id]; cambiato = true; }
    });
    Object.keys(mia).forEach(function (id) {
      const q = cancellatiRem[id];
      if (q && q >= (mia[id].aggiornato || '')) { delete mia[id]; cambiato = true; }
    });
  });
  Object.keys(remoto.contatori || {}).forEach(function (k) {
    if ((remoto.contatori[k] || 0) > (locale.contatori[k] || 0)) { locale.contatori[k] = remoto.contatori[k]; cambiato = true; }
  });
  Object.keys(cancellatiRem).forEach(function (id) { if (!cancellatiLoc[id]) { cancellatiLoc[id] = cancellatiRem[id]; } });
  locale.cancellati = cancellatiLoc;
  return cambiato;
}

async function scaricaGitHub() {
  const repo = repoGitHub();
  if (!repo || !navigator.onLine) return false;
  /* Il repository dei dati è privato: l'indirizzo "raw" risponde 404 senza token.
     Con il token si passa dall'API, che è la stessa strada della scrittura. */
  const token = leggiLocale().chiavi.github;
  let remoto;
  if (token) {
    const r = await fetch('https://api.github.com/repos/' + repo + '/contents/dati.json?ref=dati&t=' + Date.now(),
      { headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json' }, cache: 'no-store' });
    if (!r.ok) throw new Error('GitHub ' + r.status);
    const j = await r.json();
    remoto = JSON.parse(daBase64Utf8(j.content || ''));
  } else {
    const risposta = await fetch('https://raw.githubusercontent.com/' + repo + '/dati/dati.json?t=' + Date.now(), { cache: 'no-store' });
    if (!risposta.ok) throw new Error('GitHub ' + risposta.status);
    remoto = await risposta.json();
  }
  const db = leggiTutto();
  if (!remoto || !remoto.contatori) return false;
  let cambiato;
  if (db.soloEsempio && conta(remoto.cantieri)) {
    // Nel telefono ci sono solo gli esempi e online c'è roba vera: gli esempi si buttano, senza mescolarli.
    DB = completaArchivio(remoto);
    if (!DB.cancellati) DB.cancellati = {};
    if (!DB.relazioni) DB.relazioni = {};
    DB.soloEsempio = false;
    cambiato = true;
  } else {
    cambiato = fondiArchivi(db, remoto);
  }
  if (cambiato) { DB.aggiornato = adessoISO(); persisti(); }
  return cambiato;
}

/* Due archivi sono uguali se lo sono a meno dell'ora dell'ultimo salvataggio,
   che si muove da sola a ogni tocco e non è un dato. Le chiavi si ordinano prima
   di confrontare: due oggetti uguali possono avere le chiavi in ordine diverso. */
function jsonOrdinato(valore) {
  if (valore === null || typeof valore !== 'object') return JSON.stringify(valore);
  if (Array.isArray(valore)) return '[' + valore.map(jsonOrdinato).join(',') + ']';
  const chiavi = Object.keys(valore).sort();
  return '{' + chiavi.map(function (k) { return JSON.stringify(k) + ':' + jsonOrdinato(valore[k]); }).join(',') + '}';
}
function stessiDati(a, b) {
  try {
    const senzaOra = function (o) { const c = Object.assign({}, o); delete c.aggiornato; return jsonOrdinato(c); };
    return senzaOra(a) === senzaOra(b);
  } catch (e) { return false; }
}

/* L'ultima spinta quando la pagina sparisce. Il browser porta a termine una richiesta
   marcata keepalive anche a pagina chiusa, ma solo sotto i 60 KB. Si usa lo sha
   dell'ultima scrittura, perché qui non c'è il tempo di rileggerlo: se è vecchio la
   scrittura fallisce e basta. Il dato resta nel telefono e riparte alla prossima apertura,
   e lì il controllo "è già uguale" evita il commit doppio. */
function salvagenteGitHub() {
  const loc = leggiLocale();
  if (!loc.github.daMandare || !githubPronto() || !navigator.onLine || !loc.github.sha) return;
  let corpo;
  try {
    corpo = JSON.stringify({
      message: 'CANTIERI ' + adessoISO(),
      content: base64Utf8(JSON.stringify(leggiTutto())),
      branch: 'dati',
      sha: loc.github.sha
    });
  } catch (e) { return; }
  if (corpo.length > 60000) return;
  try {
    fetch('https://api.github.com/repos/' + repoGitHub() + '/contents/dati.json', {
      method: 'PUT',
      headers: {
        'Authorization': 'Bearer ' + loc.chiavi.github,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json'
      },
      body: corpo,
      keepalive: true
    }).catch(function () { /* a pagina chiusa non si può fare altro */ });
  } catch (e) { /* niente da fare: riparte alla prossima apertura */ }
}

async function inviaGitHub() {
  const loc = leggiLocale();
  if (!githubPronto() || !navigator.onLine) return false;
  const repo = repoGitHub();
  const intestazioni = { 'Authorization': 'Bearer ' + loc.chiavi.github, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json' };
  const urlFile = 'https://api.github.com/repos/' + repo + '/contents/dati.json';
  try {
    let sha = null, remoto = null;
    const attuale = await fetch(urlFile + '?ref=dati&t=' + Date.now(), { headers: intestazioni, cache: 'no-store' });
    if (attuale.ok) {
      const j = await attuale.json();
      sha = j.sha;
      try { remoto = JSON.parse(daBase64Utf8(j.content || '')); } catch (e) { remoto = null; }
      // Se online c'è qualcosa di più fresco (un altro telefono), si fonde prima di scrivere sopra.
      if (remoto) fondiArchivi(leggiTutto(), remoto);
    } else if (attuale.status !== 404) {
      throw new Error('GitHub ' + attuale.status);
    }
    const db = leggiTutto();
    // Se online c'è già esattamente questa roba, non si scrive. Un commit identico al
    // precedente non serve a niente, e la storia del repository si porta dietro per
    // sempre una copia intera del file a ogni commit.
    if (remoto && stessiDati(db, remoto)) {
      loc.github.daMandare = false;
      loc.github.ultimoInvio = adessoISO();
      loc.github.errore = null;
      loc.github.sha = sha;
      salvaLocale();
      aggiornaSeDev();
      return true;
    }
    const corpo = { message: 'CANTIERI ' + adessoISO(), content: base64Utf8(JSON.stringify(db)), branch: 'dati' };
    if (sha) corpo.sha = sha;
    const r = await fetch(urlFile, { method: 'PUT', headers: intestazioni, body: JSON.stringify(corpo) });
    if (!r.ok) throw new Error('GitHub ' + r.status);
    // Lo sha nuovo serve al salvagente: alla chiusura non c'è tempo di rileggerlo.
    try { const jr = await r.json(); loc.github.sha = (jr && jr.content && jr.content.sha) || null; } catch (e) { loc.github.sha = null; }
    loc.github.daMandare = false;
    loc.github.ultimoInvio = adessoISO();
    loc.github.errore = null;
    salvaLocale();
    aggiornaSeDev();
    return true;
  } catch (e) {
    loc.github.errore = e.message || String(e);
    salvaLocale();
    aggiornaSeDev();
    return false;
  }
}

/* ============================================================
   I SERVIZI: GROQ (la voce) E CLAUDE (il riordino)
   ============================================================ */

function chiaveGroq() { return (leggiLocale().chiavi.groq || '').trim(); }
function chiaveAnthropic() { return (leggiLocale().chiavi.anthropic || '').trim(); }
function modelloAttivo() { return (leggiLocale().modello || MODELLO).trim() || MODELLO; }

// Un errore di rete (niente linea) non è un errore del servizio: non consuma tentativi.
function ErroreRete(msg) { this.name = 'ErroreRete'; this.message = msg || 'Manca la rete'; }
ErroreRete.prototype = Object.create(Error.prototype);
// Una chiave che manca non è un guasto: il lavoro aspetta che qualcuno la metta, senza consumare tentativi.
function ErroreConfig(msg) { this.name = 'ErroreConfig'; this.message = msg; }
ErroreConfig.prototype = Object.create(Error.prototype);

async function trascriviConGroq(blob) {
  const chiave = chiaveGroq();
  if (!chiave) throw new ErroreConfig('Manca la chiave Groq');
  const form = new FormData();
  form.append('file', blob, 'audio.' + estensioneAudio(blob.type));
  form.append('model', 'whisper-large-v3-turbo');
  form.append('language', 'it');
  form.append('response_format', 'json');
  let r;
  try {
    r = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + chiave }, body: form
    });
  } catch (e) { throw new ErroreRete(); }
  if (!r.ok) {
    let dettaglio = '';
    try { dettaglio = (await r.json()).error.message; } catch (e) { /* senza dettaglio */ }
    throw new Error('Groq ' + r.status + (dettaglio ? ': ' + dettaglio : ''));
  }
  const j = await r.json();
  return String(j.text || '').trim();
}

// Ogni chiamata è indipendente: nessuna storia, nessun messaggio precedente.
// Il messaggio di sistema porta cache_control con durata di un'ora: si scrive una volta
// e per i sessanta minuti dopo si rilegge a un decimo. Ogni rilettura fa ripartire l'ora.
// Con i cinque minuti di prima, fra un sopralluogo e l'altro il foglio si riscriveva sempre.
async function chiamaClaude(regole, messaggioUtente, maxTokens) {
  const chiave = chiaveAnthropic();
  if (!chiave) throw new ErroreConfig('Manca la chiave Anthropic');
  const corpo = {
    model: modelloAttivo(),
    max_tokens: Math.max(800, maxTokens || 800),
    temperature: 0,
    system: [{ type: 'text', text: regole, cache_control: { type: 'ephemeral', ttl: '1h' } }],
    messages: [{ role: 'user', content: messaggioUtente }]
  };
  let r;
  try {
    r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': chiave,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json'
      },
      body: JSON.stringify(corpo)
    });
  } catch (e) { throw new ErroreRete(); }
  if (!r.ok) {
    let dettaglio = '';
    try { dettaglio = (await r.json()).error.message; } catch (e) { /* senza dettaglio */ }
    throw new Error('Claude ' + r.status + (dettaglio ? ': ' + dettaglio : ''));
  }
  const j = await r.json();
  registraConsumo(j.usage || {});
  const testo = (j.content || []).filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('');
  return testo;
}

// Tre righe che si aggiornano da sole a ogni chiamata: è l'unico modo di accorgersi se qualcosa manda il doppio.
function registraConsumo(usage) {
  const loc = leggiLocale();
  const mese = oggiISO().slice(0, 7);
  const c = loc.consumi[mese] || (loc.consumi[mese] = { ingresso: 0, uscita: 0, cacheLettura: 0, cacheScrittura: 0, chiamate: 0 });
  c.ingresso += usage.input_tokens || 0;
  c.uscita += usage.output_tokens || 0;
  c.cacheLettura += usage.cache_read_input_tokens || 0;
  c.cacheScrittura += usage.cache_creation_input_tokens || 0;
  c.chiamate += 1;
  loc.ultimaCache = { letti: usage.cache_read_input_tokens || 0, scritti: usage.cache_creation_input_tokens || 0, quando: adessoISO() };
  salvaLocale();
}
function spesaStimata(c) {
  if (!c) return 0;
  return (c.ingresso * PREZZI.ingresso + c.uscita * PREZZI.uscita + c.cacheLettura * PREZZI.cacheLettura + c.cacheScrittura * PREZZI.cacheScrittura) / 1000000;
}

/* I nomi propri già visti in quel cantiere: ditte, persone, mezzi, materiali.
   Solo quelli di quel cantiere, al massimo cinquanta, i più recenti. */
function nomiNoti(codiceCantiere) {
  const trovati = new Map();
  const stop = new Set(['Il', 'La', 'Lo', 'Le', 'Gli', 'Un', 'Una', 'Non', 'Per', 'Con', 'Del', 'Della', 'Dei', 'Delle', 'Al', 'Alla', 'Sul', 'Sulla', 'Nel', 'Nella', 'Oggi', 'Ieri', 'Domani', 'Da', 'Di', 'In', 'Su', 'Se', 'Ma', 'E', 'A', 'O', 'Che', 'Chi', 'Cosa', 'Come', 'Dove', 'Quando', 'Posa', 'Getto', 'Casseri', 'Finito', 'Ripresa', 'Segnalato', 'Detto', 'Chiamare', 'Rimozione', 'Consegna', 'Controllo', 'Ponteggio', 'Gru', 'Betoniera', 'Trabattello', 'Autopompa', 'Scavo', 'Muratura', 'Intonaco', 'Massetto', 'Solaio', 'Pilastri', 'Cordolo', 'Platea', 'Casseratura', 'Armatura']);
  const pulisci = function (w) { return String(w || '').replace(/[^\wÀ-ÿ'.-]/g, ''); };
  const maiuscola = function (w) { return /^[A-ZÀ-Ý][a-zà-ÿ'.-]{2,}$/.test(w); };
  const aggiungi = function (n, peso) {
    n = String(n || '').trim();
    if (n.length < 3 || !/^[A-ZÀ-Ý]/.test(n) || stop.has(n)) return;
    if (!trovati.has(n)) trovati.set(n, peso);
  };
  const c = cantierePerCodice(codiceCantiere);
  if (c && c.committente) aggiungi(c.committente, 1e15);
  sopralluoghiDi(codiceCantiere).forEach(function (s, indice) {
    const peso = 1e12 - indice; // i sopralluoghi più recenti prima
    // Le righe degli operai hanno una forma nota: "Nome (Ditta) — compito"
    righeElenco(s.sezioni.operai).forEach(function (r) {
      const m = r.match(/^([^(—–]+?)\s*(?:\(([^)]+)\))?\s*(?:[—–]|$)/);
      if (m) { if (!/^\d/.test(m[1])) aggiungi(m[1], peso); if (m[2]) aggiungi(m[2], peso); }
    });
    const testo = CHIAVI_SEZIONI.map(function (k) { return s.sezioni[k] || ''; }).join('\n');
    // Le ditte fra parentesi, ovunque siano
    (testo.match(/\(([^)]{2,40})\)/g) || []).forEach(function (m) { aggiungi(m.slice(1, -1), peso); });
    // Le parole con la maiuscola non all'inizio della frase, anche in coppia ("Mario Rossi", "Edil Rossi")
    testo.split(/[.\n:;!?()—–]/).forEach(function (frase) {
      const p = frase.trim().split(/\s+/);
      for (let i = 1; i < p.length; i++) {
        const w = pulisci(p[i]);
        if (maiuscola(w) && !stop.has(w)) {
          const succ = p[i + 1] ? pulisci(p[i + 1]) : '';
          if (maiuscola(succ) && !stop.has(succ)) { aggiungi(w + ' ' + succ, peso); i++; }
          else aggiungi(w, peso);
        }
      }
    });
  });
  return Array.from(trovati.entries()).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 50).map(function (e) { return e[0]; });
}

function messaggioRiordino(sop, grezzo) {
  const c = cantierePerCodice(sop.cantiere) || {};
  return 'Cantiere: ' + (c.nome || '') + '\nCommittente: ' + (c.committente || '') + '\nData: ' + dataEstesa(sop.giorno) +
    '\nNomi noti: ' + (nomiNoti(sop.cantiere).join(', ') || 'nessuno') + '\nTesto: ' + grezzo;
}

// Sopra le 3.000 parole si taglia in due sui punti fermi: una risposta lunga rischia il taglio, e si rifà da capo.
function spezzaTesto(testo) {
  const p = testo.split(/\s+/);
  if (p.length <= 3000) return [testo];
  const meta = Math.floor(testo.length / 2);
  let taglio = testo.lastIndexOf('. ', meta);
  if (taglio < testo.length * 0.3) taglio = testo.indexOf('. ', meta);
  if (taglio === -1) taglio = meta;
  return [testo.slice(0, taglio + 1).trim(), testo.slice(taglio + 1).trim()];
}

/* Un pezzo corto che comincia con una parola chiave chiara va nella sezione senza chiamare nessuno. */
function smistaInLocale(grezzo) {
  const t = senzaAccenti(grezzo).replace(/[^\w\sàèéìòù]/g, ' ').replace(/\s+/g, ' ').trim();
  if (t.split(' ').length >= 15) return null;
  const chiavi = Object.keys(PAROLE_SEZIONE);
  let migliore = null;
  for (const k of chiavi) {
    for (const frase of PAROLE_SEZIONE[k]) {
      const f = senzaAccenti(frase);
      const prefissi = [f, 'capitolo ' + f, 'sezione ' + f];
      for (const pre of prefissi) {
        if (t.indexOf(pre + ' ') === 0 || t === pre) {
          if (!migliore || pre.length > migliore.pre.length) migliore = { sezione: k, pre: pre };
        }
      }
    }
  }
  if (!migliore) return null;
  const resto = grezzo.trim().slice(migliore.pre.length).replace(/^[\s:,.;-]+/, '').trim();
  if (!resto) return null;
  const testo = resto.charAt(0).toUpperCase() + resto.slice(1);
  return { sezione: migliore.sezione, testo: testo.replace(/[.]?$/, '.'), titolo: testo.split(/\s+/).slice(0, 4).join(' ').replace(/[.,;:]$/, '') };
}

/* Prima di riordinare: il tecnico ha detto dove va questo dettato? Si guarda sempre,
   anche quando di sopralluoghi aperti ce n'e' uno solo. Torna il sopralluogo trovato
   (o niente) e il testo ripulito dalla frase che lo nominava: quella frase nel verbale
   non ci deve finire. */
async function scansionaDestinazione(sop, grezzo) {
  const fratelli = sopralluoghiDelGiorno(sop.cantiere, sop.giorno);
  const vuoto = { sop: null, pulito: grezzo };
  if (!chiaveAnthropic() || !String(grezzo).trim()) return vuoto;
  const elenco = fratelli.map(function (x) {
    return '- ' + x.codice + ': ' + nomeSopralluogo(x) + ' (ore ' + x.ora + (x.chiuso ? ', verbale gia fatto' : '') + ')';
  }).join('\n');
  try {
    const risposta = await chiamaClaude(REGOLE_SCAN_SOPRALLUOGO,
      'Sopralluoghi di oggi su questo cantiere:\n' + elenco + '\n\nDettato:\n' + grezzo, 900);
    const j = estraiJSON(risposta);
    if (!j) return vuoto;
    const codice = String(j.sopralluogo || '').trim();
    const pulito = String(j.pulito || '').trim() || grezzo;
    if (!codice) return { sop: null, pulito: pulito };
    const trovato = fratelli.find(function (x) { return x.codice === codice; }) || null;
    return { sop: trovato, pulito: pulito };
  } catch (e) { return vuoto; }
}

async function riordinaConClaude(sop, grezzo) {
  const parti = spezzaTesto(grezzo);
  const risultato = { titolo: '' };
  CHIAVI_SEZIONI.concat(['da_smistare']).forEach(function (k) { risultato[k] = ''; });
  for (const parte of parti) {
    const risposta = await chiamaClaude(REGOLE_SOPRALLUOGO, messaggioRiordino(sop, parte), Math.ceil(stimaToken(parte) * 1.5));
    const j = estraiJSON(risposta);
    if (!j) throw new Error('Risposta non leggibile');
    if (!risultato.titolo && j.titolo) risultato.titolo = String(j.titolo).trim();
    CHIAVI_SEZIONI.concat(['da_smistare']).forEach(function (k) {
      if (j[k] && String(j[k]).trim()) risultato[k] = aggiungiTesto(risultato[k], String(j[k]));
    });
  }
  return risultato;
}

/* Se la giornata ha già il suo verbale, una correzione alla giornata passa da sola
   nel verbale: solo le sezioni toccate, così quello che si è corretto a mano
   nelle altre resta. Non serve più premere Aggiorna. */
function allineaVerbale(sop, chiavi) {
  if (!sop.chiuso) return;
  const v = verbaleDiSopralluogo(sop.codice);
  if (!v) return;
  let cambiato = false;
  chiavi.forEach(function (k) {
    if (k === 'da_smistare' || CHIAVI_SEZIONI.indexOf(k) === -1) return;
    const testo = String(sop.sezioni[k] || '');
    if ((v.sezioni[k] || '') !== testo) { v.sezioni[k] = testo; cambiato = true; }
  });
  if (cambiato) salva('verbale', v);
}

// Il testo nuovo non sostituisce quello che c'è già: si aggiunge in fondo, a capo.
function applicaRiordino(sop, pezzo, risultato) {
  const piene = [];
  CHIAVI_SEZIONI.concat(['da_smistare']).forEach(function (k) {
    const nuovo = String(risultato[k] || '').trim();
    if (!nuovo) return;
    sop.sezioni[k] = aggiungiTesto(sop.sezioni[k], nuovo);
    if (k !== 'da_smistare') piene.push(k);
  });
  if (risultato.titolo) pezzo.titolo = risultato.titolo;
  pezzo.sezioni = piene;
  pezzo.sezione = piene[0] || (risultato.da_smistare ? 'da_smistare' : '');
  pezzo.stato = 'riordinato';
  salva('sopralluogo', sop);
  allineaVerbale(sop, piene);
}

/* ============================================================
   LA CODA
   Ogni cosa che ha bisogno della rete passa da qui: trascrizioni, riordini,
   righe di contabilità dettate. Senza rete resta in attesa e riparte da sola.
   Tre tentativi con attesa crescente, poi si ferma e lo dice.
   ============================================================ */

let codaInCorso = false;

function accoda(lavoro) {
  const loc = leggiLocale();
  lavoro.id = lavoro.id || nuovoId();
  lavoro.stato = 'in_attesa';
  lavoro.tentativi = 0;
  lavoro.prossimo = 0;
  lavoro.creato = adessoISO();
  loc.coda.push(lavoro);
  salvaLocale();
  elaboraCoda();
  return lavoro;
}
function descriviLavoro(l) {
  const tipi = { trascrizione: 'Trascrizione', riordino: 'Riordino', contabilita: 'Contabilità', nota: 'Nota', referto: 'Referto foto', rilievo: 'Rilievo' };
  return (tipi[l.tipo] || l.tipo) + (l.etichetta ? ' · ' + l.etichetta : '');
}

async function elaboraCoda() {
  if (codaInCorso) return;
  if (!navigator.onLine) return;
  codaInCorso = true;
  try {
    let ancora = true;
    while (ancora) {
      const loc = leggiLocale();
      const adesso = Date.now();
      const lavoro = loc.coda.find(function (l) { return l.stato === 'in_attesa' && (l.prossimo || 0) <= adesso; });
      if (!lavoro) break;
      lavoro.stato = 'in_corso';
      salvaLocale();
      aggiornaVista();
      try {
        await eseguiLavoro(lavoro);
        loc.coda = loc.coda.filter(function (l) { return l.id !== lavoro.id; });
        salvaLocale();
      } catch (e) {
        if (e && (e.name === 'ErroreRete' || e.name === 'ErroreConfig')) {
          // Niente linea, o niente chiave: si torna in attesa senza consumare un tentativo.
          lavoro.stato = 'in_attesa';
          lavoro.prossimo = Date.now() + (e.name === 'ErroreConfig' ? 60000 : 15000);
          lavoro.errore = e.message;
          salvaLocale();
          avvisa(e.message, 'att');
          ancora = false;
        } else {
          lavoro.tentativi = (lavoro.tentativi || 0) + 1;
          lavoro.errore = e.message || String(e);
          if (lavoro.tentativi >= ATTESE_TENTATIVI.length) {
            lavoro.stato = 'fallito';
            segnaFallito(lavoro);
            avvisa('Non riuscito', 'err');
          } else {
            lavoro.stato = 'in_attesa';
            lavoro.prossimo = Date.now() + ATTESE_TENTATIVI[lavoro.tentativi - 1];
          }
          salvaLocale();
        }
      }
      aggiornaVista();
    }
  } finally {
    codaInCorso = false;
  }
  // Se resta qualcosa in attesa con un orario, si ripassa più tardi.
  const loc = leggiLocale();
  const prossimi = loc.coda.filter(function (l) { return l.stato === 'in_attesa'; }).map(function (l) { return l.prossimo || 0; });
  if (prossimi.length) {
    const fra = Math.max(500, Math.min.apply(null, prossimi) - Date.now());
    setTimeout(elaboraCoda, fra);
  }
}

function segnaFallito(lavoro) {
  if (lavoro.foto) {
    // Il referto di una foto: la foto resta, e il dettato grezzo pure, se c'era già.
    const sop = sopralluogo(lavoro.sop);
    const f = sop && trovaFoto(sop, lavoro.foto);
    if (f) { f.stato = 'errore'; f.errore = lavoro.errore; salva('sopralluogo', sop); }
    return;
  }
  if (lavoro.tipo === 'trascrizione' || lavoro.tipo === 'riordino' || lavoro.tipo === 'rilievo') {
    const sop = sopralluogo(lavoro.sop);
    const pezzo = sop && sop.pezzi.find(function (p) { return p.id === lavoro.pezzo; });
    if (pezzo) { pezzo.stato = 'errore'; pezzo.errore = lavoro.errore; salva('sopralluogo', sop); }
  }
}

async function eseguiLavoro(l) {
  if (l.tipo === 'trascrizione') return await lavoroTrascrizione(l);
  if (l.tipo === 'riordino') return await lavoroRiordino(l);
  if (l.tipo === 'contabilita') return await lavoroContabilita(l);
  if (l.tipo === 'nota') return await lavoroNota(l);
  if (l.tipo === 'referto') return await lavoroReferto(l);
  if (l.tipo === 'rilievo') return await lavoroRilievo(l);
  throw new Error('Lavoro sconosciuto');
}

async function lavoroTrascrizione(l) {
  // Mai mandare due volte lo stesso audio: se il testo c'è già, si passa oltre.
  if (l.per === 'sopralluogo') {
    const sop = sopralluogo(l.sop);
    if (!sop) return;
    const pezzo = sop.pezzi.find(function (p) { return p.id === l.pezzo; });
    if (!pezzo) return;
    if (!pezzo.grezzo) {
      const blob = await leggiMedia(pezzo.audio);
      if (!blob) throw new Error('Audio non trovato nel telefono');
      pezzo.grezzo = await trascriviConGroq(blob);
      pezzo.stato = 'trascritto';
      salva('sopralluogo', sop);
      avvisa('Trascritto', 'ok');
    }
    if (!pezzo.grezzo.trim()) { pezzo.stato = 'riordinato'; pezzo.titolo = pezzo.titolo || 'Registrazione vuota'; salva('sopralluogo', sop); return; }
    // Pezzo corto con parola chiave: dritto nella sezione, gratis.
    const locale = smistaInLocale(pezzo.grezzo);
    if (locale) {
      const r = { titolo: locale.titolo };
      r[locale.sezione] = locale.testo;
      applicaRiordino(sop, pezzo, r);
      avvisa('Riordinato', 'ok');
      return;
    }
    accoda({ tipo: 'riordino', sop: sop.id, pezzo: pezzo.id, etichetta: pezzo.titolo || 'Registrazione delle ' + pezzo.ora });
    return;
  }
  if (l.per === 'contabilita' || l.per === 'nota') {
    if (!l.grezzo) {
      const blob = await leggiMedia(l.audio);
      if (!blob) throw new Error('Audio non trovato nel telefono');
      l.grezzo = await trascriviConGroq(blob);
      salvaLocale();
      avvisa('Trascritto', 'ok');
    }
    // L'audio di una nota o di una riga di contabilità serve solo a trascrivere: una volta letto si libera.
    await cancellaMedia(l.audio);
    if (l.per === 'nota') accoda({ tipo: 'nota', cantiere: l.cantiere, grezzo: l.grezzo, etichetta: l.etichetta });
    else accoda({ tipo: 'contabilita', cantiere: l.cantiere, grezzo: l.grezzo, ora: l.ora, etichetta: l.etichetta });
  }
  if (l.per === 'rilievo') {
    const sop = sopralluogo(l.sop);
    const pezzo = sop && sop.pezzi.find(function (p) { return p.id === l.pezzo; });
    if (!pezzo) return;
    if (!pezzo.grezzo) {
      const blob = await leggiMedia(pezzo.audio);
      if (!blob) throw new Error('Audio non trovato nel telefono');
      pezzo.grezzo = await trascriviConGroq(blob);
      pezzo.stato = 'trascritto';
      salva('sopralluogo', sop);
      avvisa('Trascritto', 'ok');
    }
    if (!pezzo.grezzo.trim()) { pezzo.stato = 'riordinato'; pezzo.titolo = pezzo.titolo || 'Registrazione vuota'; salva('sopralluogo', sop); return; }
    accoda({ tipo: 'rilievo', sop: sop.id, pezzo: pezzo.id, sezione: l.sezione, etichetta: l.etichetta });
    return;
  }
  if (l.per === 'foto') {
    const sop = sopralluogo(l.sop);
    const f = sop && trovaFoto(sop, l.foto);
    if (!f) { await cancellaMedia(l.audio); return; }
    if (!l.grezzo) {
      const blob = await leggiMedia(l.audio);
      if (!blob) throw new Error('Audio non trovato nel telefono');
      l.grezzo = await trascriviConGroq(blob);
      salvaLocale();
      avvisa('Trascritto', 'ok');
    }
    // Come per le note: l'audio del referto serve solo a trascrivere. La foto invece resta.
    await cancellaMedia(l.audio);
    if (f.audio === l.audio) f.audio = null;
    f.grezzo = aggiungiTesto(f.grezzo, l.grezzo);
    f.stato = 'trascritto';
    salva('sopralluogo', sop);
    accoda({ tipo: 'referto', sop: sop.id, foto: f.id, grezzo: l.grezzo, etichetta: l.etichetta });
  }
}

/* Il dettato di un rilievo va dritto nel suo paragrafo: il tasto ha già detto dove.
   Non passa dallo smistamento — costa meno e non può finire nella sezione sbagliata. */
async function lavoroRilievo(l) {
  const sop = sopralluogo(l.sop);
  const pezzo = sop && sop.pezzi.find(function (p) { return p.id === l.pezzo; });
  if (!pezzo || pezzo.stato === 'riordinato') return;
  const grezzo = String(pezzo.grezzo || '').trim();
  let testo = grezzo;
  if (grezzo && chiaveAnthropic()) {
    testo = String(await chiamaClaude(REGOLE_RILIEVO, 'Dettato: ' + grezzo, 800)).trim().replace(/^["«“]+|["»”]+$/g, '').trim() || grezzo;
  }
  // Come per le sezioni: il testo nuovo non sostituisce quello che c'è già, si aggiunge in fondo.
  sop.sezioni[l.sezione] = aggiungiTesto(sop.sezioni[l.sezione], testo);
  pezzo.stato = 'riordinato';
  pezzo.errore = null;
  salva('sopralluogo', sop);
  allineaVerbale(sop, [l.sezione]);
  /* Il testo è già al sicuro nella sezione. In più si fa vedere subito, in una
     scheda con "Va bene" e "Correggi": resta finché non si preme uno dei due,
     anche cambiando schermata. Vive nel telefono, non nei dati. */
  if (testo) {
    const loc = leggiLocale();
    loc.rilieviNuovi.push({ id: nuovoId(), sop: sop.id, cantiere: sop.cantiere, sezione: l.sezione, testo: testo, ora: pezzo.ora || oraAdesso() });
    salvaLocale();
  }
  avvisa('Rilievo pronto', 'ok');
  aggiornaVista();
}

/* La scheda del rilievo appena arrivato. Si mostra nella giornata (per sopralluogo)
   e nel cantiere (per cantiere): dove uno si trova. "Correggi" apre il testo lì
   dentro; salvando si sostituisce solo il pezzo aggiunto, non tutta la sezione. */
function cardRilieviNuovi(filtro) {
  const lista = leggiLocale().rilieviNuovi.filter(function (r) { return filtro.sop ? r.sop === filtro.sop : r.cantiere === filtro.cantiere; });
  if (!lista.length) return '';
  return lista.map(function (r) {
    return '<div class="card gialla"><div class="card-capo gialla">' + h(nomeSezione(r.sezione)) + ' · rilievo delle ' + h(oraCorta(r.ora)) + '</div>' +
      (r.modifica
        ? '<textarea class="corpo" id="ril-' + h(r.id) + '">' + h(r.testo) + '</textarea>' +
          '<div class="griglia"><button class="btn btn-ok" data-az="rilievo-salva" data-id="' + h(r.id) + '">Salva</button>' +
          '<button class="btn" data-az="rilievo-annulla" data-id="' + h(r.id) + '">Annulla</button></div>'
        : '<div class="card-corpo">' + testoElenco(r.testo, true) + '</div>' +
          '<div class="griglia"><button class="btn btn-ok" data-az="rilievo-ok" data-id="' + h(r.id) + '">Va bene</button>' +
          '<button class="btn" data-az="rilievo-correggi" data-id="' + h(r.id) + '">Correggi</button></div>') +
      '</div>';
  }).join('');
}
function rilievoNuovo(id) { return leggiLocale().rilieviNuovi.find(function (r) { return r.id === id; }) || null; }
function togliRilievoNuovo(id) {
  const loc = leggiLocale();
  loc.rilieviNuovi = loc.rilieviNuovi.filter(function (r) { return r.id !== id; });
  salvaLocale();
}
/* Il pezzo aggiunto si cerca tale e quale nella sezione e si sostituisce. Se nel
   frattempo la sezione è stata cambiata a mano e il pezzo non c'è più uguale, il
   testo corretto si aggiunge in fondo: non si perde niente in nessun caso. */
function correggiRilievo(id, nuovo) {
  const r = rilievoNuovo(id);
  const s = r && sopralluogo(r.sop);
  if (!s) { togliRilievoNuovo(id); return; }
  nuovo = String(nuovo || '').trim();
  const attuale = String(s.sezioni[r.sezione] || '');
  const dove = attuale.lastIndexOf(r.testo);
  if (dove !== -1) {
    s.sezioni[r.sezione] = (attuale.slice(0, dove) + nuovo + attuale.slice(dove + r.testo.length)).replace(/\n{3,}/g, '\n\n').trim();
  } else {
    s.sezioni[r.sezione] = aggiungiTesto(attuale, nuovo);
    avvisa('La sezione era cambiata: il testo corretto è in fondo', 'att');
  }
  salva('sopralluogo', s);
  allineaVerbale(s, [r.sezione]);
  togliRilievoNuovo(id);
}

// Il dettato di una foto diventa una didascalia. Senza chiave resta il testo grezzo: non si perde niente.
async function lavoroReferto(l) {
  const sop = sopralluogo(l.sop);
  const f = sop && trovaFoto(sop, l.foto);
  if (!f) return;
  const grezzo = String(l.grezzo || '').trim();
  let didascalia = grezzo;
  if (grezzo && chiaveAnthropic()) {
    const risposta = String(await chiamaClaude(REGOLE_FOTO, 'Dettato: ' + grezzo, 800)).trim();
    const j = estraiJSON(risposta);
    if (j && j.didascalia) {
      didascalia = String(j.didascalia).trim() || grezzo;
      /* La sezione la sceglie Claude dal referto, come per il testo dettato. Non si applica
         a un documento — una bolla non appartiene a un capitolo — e non si applica se la
         sezione l'ha già messa a mano una persona: quella vince sempre. */
      if (!f.genere && !f.sezioneScelta && CHIAVI_SEZIONI.indexOf(j.sezione) !== -1) f.sezione = j.sezione;
    } else {
      didascalia = risposta.replace(/^["«“]+|["»”]+$/g, '').trim() || grezzo;
    }
  }
  // Come per le sezioni: il testo nuovo non sostituisce quello che c'è già, si aggiunge in fondo.
  f.referto = aggiungiTesto(f.referto, didascalia);
  f.stato = 'riordinato';
  f.errore = null;
  salva('sopralluogo', sop);
  avvisa(grezzo ? 'Referto pronto' : 'Registrazione vuota', grezzo ? 'ok' : 'att');
}

async function lavoroRiordino(l) {
  let sop = sopralluogo(l.sop);
  if (!sop) return;
  let pezzo = sop.pezzi.find(function (p) { return p.id === l.pezzo; });
  if (!pezzo || pezzo.stato === 'riordinato') return;
  if (!chiaveAnthropic()) {
    // Senza chiave il testo non si perde: va in "da smistare", e l'uomo lo mette dove va.
    const r = { titolo: '' }; r.da_smistare = pezzo.grezzo;
    applicaRiordino(sop, pezzo, r);
    pezzo.titolo = pezzo.titolo || 'Registrazione delle ' + pezzo.ora;
    salva('sopralluogo', sop);
    return;
  }
  /* Lo scan gira sempre. Se il tecnico ha nominato un sopralluogo, il pezzo ci va
     dentro da solo — anche se quel sopralluogo ha gia il verbale fatto, e allora lo
     diciamo. Se non ha nominato niente, il pezzo resta li' da assegnare: la scelta
     compare sulla sua card, e nessun testo entra in una sezione prima di quella. */
  const scan = await scansionaDestinazione(sop, pezzo.grezzo);
  if (scan.pulito && scan.pulito !== pezzo.grezzo) { pezzo.grezzo = scan.pulito; salva('sopralluogo', sop); }
  /* Se il tecnico non ha nominato nessun sopralluogo e nella giornata ce n'è uno solo,
     è per forza quello: la registrazione ci entra da sola. Si chiede solo quando c'è
     davvero da scegliere. Che il sopralluogo abbia già il verbale non conta: le
     sezioni nuove ci passano da sole (allineaVerbale). */
  const quantiOggi = sopralluoghiDelGiorno(sop.cantiere, sop.giorno).length;
  const destino = scan.sop || (quantiOggi <= 1 ? sop : null);
  if (destino && destino.id !== sop.id) {
    const spostato = spostaPezzo(sop, pezzo, destino);
    if (spostato) {
      sop = spostato.sop; pezzo = spostato.pezzo;
      avvisa('Va nel ' + nomeSopralluogo(sop), 'ok');
    }
  } else if (!destino) {
    pezzo.daAssegnare = true;
    pezzo.stato = 'da-assegnare';
    pezzo.titolo = pezzo.titolo || primaRiga(pezzo.grezzo) || ('Registrazione delle ' + pezzo.ora);
    salva('sopralluogo', sop);
    avvisa('Dimmi in che sopralluogo va', 'att');
    aggiornaVista();
    return;
  }
  const risultato = await riordinaConClaude(sop, pezzo.grezzo);
  applicaRiordino(sop, pezzo, risultato);
  avvisa('Riordinato', 'ok');
}

/* Sposta una registrazione da un sopralluogo all'altro, con le sue foto e il suo audio.
   Il testo gia' finito nelle sezioni resta dov'era: qui si sposta solo la registrazione. */
function spostaPezzo(da, pezzo, a) {
  const dest = sopralluogo(a.id);
  if (!dest) return null;
  da.pezzi = da.pezzi.filter(function (p) { return p.id !== pezzo.id; });
  const copia = Object.assign({}, pezzo);
  dest.pezzi.push(copia);
  salva('sopralluogo', da);
  salva('sopralluogo', dest);
  return { sop: dest, pezzo: dest.pezzi[dest.pezzi.length - 1] };
}

/* La registrazione in attesa finisce nel sopralluogo scelto e da li' riparte il riordino.
   Se si sceglie "un sopralluogo nuovo", nasce con l'ora della registrazione. */
async function assegnaPezzo(sopId, pezzoId, destId) {
  const sop = sopralluogo(sopId);
  if (!sop) return;
  const pezzo = sop.pezzi.find(function (p) { return p.id === pezzoId; });
  if (!pezzo) return;
  let dest = sop;
  if (destId === 'nuovo') {
    const c = cantierePerCodice(sop.cantiere);
    if (!c) return;
    dest = creaSopralluogo(c, sop.giorno, pezzo.ora || oraAdesso());
  } else if (destId && destId !== sopId) {
    dest = sopralluogo(destId) || sop;
  }
  let corrente = { sop: sop, pezzo: pezzo };
  if (dest.id !== sop.id) {
    const spostato = spostaPezzo(sop, pezzo, dest);
    if (spostato) corrente = spostato;
  }
  corrente.pezzo.daAssegnare = false;
  corrente.pezzo.stato = 'trascritto';
  salva('sopralluogo', corrente.sop);
  chiudiFoglio();
  if (dest.id !== sop.id) vai('#/giorno/' + corrente.sop.id);
  aggiornaVista();
  accoda({ tipo: 'riordino', sop: corrente.sop.id, pezzo: corrente.pezzo.id, etichetta: 'Riordino' });
}

/* All'avvio: le registrazioni rimaste "da assegnare" in una giornata che ha un
   sopralluogo solo non hanno niente da scegliere. Entrano lì e si riordinano. */
function ripescaDaAssegnare() {
  valori(leggiTutto().sopralluoghi).forEach(function (s) {
    const attesa = (s.pezzi || []).filter(function (p) { return p.daAssegnare; });
    if (!attesa.length || sopralluoghiDelGiorno(s.cantiere, s.giorno).length > 1) return;
    attesa.forEach(function (p) { p.daAssegnare = false; p.stato = 'trascritto'; });
    salva('sopralluogo', s);
    attesa.forEach(function (p) { accoda({ tipo: 'riordino', sop: s.id, pezzo: p.id, etichetta: 'Riordino' }); });
  });
}

async function lavoroNota(l) {
  const c = cantiere(l.cantiere);
  if (!c) return;
  c.note = aggiungiTesto(c.note, l.grezzo);
  salva('cantiere', c);
  avvisa('Salvato', 'ok');
}

async function lavoroContabilita(l) {
  const c = cantiere(l.cantiere);
  if (!c) return;
  let righe = null;
  if (chiaveAnthropic()) {
    const risposta = await chiamaClaude(REGOLE_CONTABILITA, 'Frase: ' + l.grezzo, 800);
    const j = estraiJSON(risposta);
    if (!j || !Array.isArray(j.righe)) throw new Error('Risposta non leggibile');
    righe = j.righe;
  } else {
    righe = [rigaContabilitaLocale(l.grezzo)];
  }
  const proposte = [];
  for (const r of righe) {
    const riga = {
      descrizione: String(r.descrizione || '').trim(),
      quantita: Number(r.quantita) || 0,
      um: normalizzaUmLocale(r.um || '') || String(r.um || '').trim(),
      prezzo: r.prezzo_unitario != null ? Number(r.prezzo_unitario) || 0 : 0,
      dallistino: null, dacompletare: false, grezzo: l.grezzo
    };
    if (!(riga.prezzo > 0)) {
      // Prima la ricerca per parole, gratis. Claude solo se non trova niente o trova troppo.
      const voce = await trovaVoceListino(riga.descrizione);
      if (voce) { riga.prezzo = voce.prezzo; riga.dallistino = voce.codice; if (!riga.um) riga.um = voce.um; }
    }
    riga.dacompletare = !(riga.prezzo > 0);
    riga.importo = Math.round(riga.quantita * riga.prezzo * 100) / 100;
    proposte.push(riga);
  }
  const loc = leggiLocale();
  loc.proposte.push({ id: nuovoId(), cantiere: c.id, ora: l.ora || oraAdesso(), grezzo: l.grezzo, righe: proposte, creato: adessoISO() });
  salvaLocale();
  avvisa('Proposta pronta', 'ok');
}

// Senza Claude si fa quel che si può: "inserisci intonaco civile, 25 metri quadrati" → descrizione, numero, unità.
function rigaContabilitaLocale(frase) {
  let t = String(frase || '').trim().replace(/^(inserisci|aggiungi|metti|segna)\s+/i, '');
  const mNum = t.match(/(\d+(?:[.,]\d+)?)\s*([a-zà-ù²³.]+(?:\s+[a-zà-ù]+){0,2})?/i);
  let quantita = 0, um = '';
  if (mNum) {
    quantita = leggiNumero(mNum[1], ',');
    const candidate = (mNum[2] || '').split(/\s+/);
    for (let n = candidate.length; n > 0; n--) {
      const u = normalizzaUmLocale(candidate.slice(0, n).join(' '));
      if (u) { um = u; break; }
    }
    t = t.slice(0, mNum.index).trim();
  }
  t = t.replace(/[,;:]+$/, '').trim();
  return { descrizione: t.charAt(0).toUpperCase() + t.slice(1), quantita: quantita, um: um, prezzo_unitario: null };
}

function cercaListinoLocale(testo) {
  const p = parole(testo);
  if (!p.length) return [];
  return listinoTutto().map(function (v) {
    const pv = parole(v.descrizione);
    let punti = 0;
    p.forEach(function (w) { if (pv.some(function (x) { return x === w || (w.length > 4 && x.indexOf(w) === 0) || (x.length > 4 && w.indexOf(x) === 0); })) punti++; });
    return { voce: v, punti: punti };
  }).filter(function (r) { return r.punti > 0; }).sort(function (a, b) { return b.punti - a.punti; });
}

async function trovaVoceListino(descrizione) {
  const risultati = cercaListinoLocale(descrizione);
  if (!risultati.length && !listinoTutto().length) return null;
  const nParole = parole(descrizione).length;
  // Una sola voce chiara: prende tutte le parole, o stacca nettamente la seconda.
  if (risultati.length === 1 && risultati[0].punti >= Math.min(2, nParole)) return risultati[0].voce;
  if (risultati.length > 1 && risultati[0].punti >= Math.min(2, nParole) && risultati[0].punti >= risultati[1].punti * 2) return risultati[0].voce;
  if (!chiaveAnthropic() || !navigator.onLine) return null;
  const candidate = (risultati.length ? risultati : listinoTutto().map(function (v) { return { voce: v }; })).slice(0, 20).map(function (r) { return r.voce; });
  if (!candidate.length) return null;
  const elenco = candidate.map(function (v, i) { return (i + 1) + '. ' + v.descrizione + ' (' + v.um + ')'; }).join('\n');
  try {
    const risposta = await chiamaClaude(REGOLE_CERCA_VOCE, 'Lavorazione dettata: ' + descrizione + '\n\nVoci del listino:\n' + elenco, 800);
    const m = String(risposta).trim().match(/^\D*(\d+)/);
    if (!m) return null;
    const i = parseInt(m[1], 10) - 1;
    return candidate[i] || null;
  } catch (e) { return null; }
}

async function normalizzaUm(testo) {
  const locale = normalizzaUmLocale(testo);
  if (locale) return locale;
  const t = String(testo || '').trim();
  if (!t || !chiaveAnthropic() || !navigator.onLine) return t;
  try {
    const r = (await chiamaClaude(REGOLE_UM, 'Unità: ' + t, 800)).trim();
    return (r && r !== '?' && r.length <= 6) ? r : t;
  } catch (e) { return t; }
}

/* ============================================================
   AVVISI DI UNA PAROLA E FOGLI DAL BASSO
   ============================================================ */

let timerToast = null;
function avvisa(parola, tipo) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = parola;
  t.className = 'toast su' + (tipo ? ' ' + tipo : '');
  clearTimeout(timerToast);
  timerToast = setTimeout(function () { t.className = 'toast'; }, 1800);
}

// Una finestra sola alla volta. Il foglio sale dal basso: sta sotto il pollice.
function apriFoglio(html, opzioni) {
  const f = document.getElementById('finestra');
  f.innerHTML = '<div class="velo" data-az="chiudi-foglio-velo"><div class="foglio" role="dialog">' + html + '</div></div>';
  f.hidden = false;
  if (opzioni && opzioni.pieno) f.firstChild.className = 'velo';
  const primo = f.querySelector('[autofocus]');
  if (primo) setTimeout(function () { primo.focus(); }, 50);
}
function chiudiFoglio() {
  const f = document.getElementById('finestra');
  f.hidden = true;
  f.innerHTML = '';
}
function foglioAperto() { return !document.getElementById('finestra').hidden; }

// Le conferme non usano confirm(): su iPhone installata esce un riquadro piccolo e grigio, illeggibile.
function chiedi(titolo, testo, etichettaOk, tipoOk, extra) {
  return new Promise(function (ok) {
    apriFoglio(
      '<h2>' + h(titolo) + '</h2>' + (testo ? '<p>' + h(testo) + '</p>' : '') + (extra || '') +
      '<button class="btn ' + (tipoOk === 'rosso' ? 'btn-rosso' : 'btn-ok') + '" data-az="conferma-si">' + h(etichettaOk || 'Conferma') + '</button>' +
      '<button class="btn" data-az="conferma-no">Annulla</button>'
    );
    attesaConferma = ok;
  });
}
let attesaConferma = null;

function mostraTestoPieno(titolo, testo) {
  const f = document.getElementById('finestra');
  f.innerHTML = '<div class="pieno"><h2 class="pieno-tit">' + h(titolo) + '</h2><div class="pieno-testo">' + h(testo) + '</div>' +
    '<button class="btn" data-az="chiudi-foglio" style="margin-top:12px">Chiudi</button></div>';
  f.hidden = false;
}

/* ============================================================
   LA REGISTRAZIONE
   Si preme per iniziare, si preme per fermare. Non si ferma da sola.
   La striscia vive fuori dalle schermate: si può scorrere e cambiare pagina
   mentre il microfono resta acceso.
   ============================================================ */

const REG = {
  attiva: false, recorder: null, stream: null, pezzi: [], inizio: 0, inizioPezzo: 0,
  timer: null, contesto: null, audioCtx: null, analizzatore: null, rafOnda: null, spezzaTimer: null, destinazione: null,
  // Chi ha fermato (la persona o il telefono), se c'è da riprendere, e il blocco dello schermo.
  fermataUtente: false, daRiprendere: false, sveglia: null
};

function registrazioneAttiva() { return REG.attiva; }

async function avviaRegistrazione(destinazione) {
  if (REG.attiva) return;
  if (!window.MediaRecorder || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    avvisa('Microfono non disponibile', 'err');
    return;
  }
  let stream;
  try {
    // Il permesso si chiede qui, alla prima pressione del bottone, non all'apertura dell'app.
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    avvisa('Microfono negato', 'err');
    return;
  }
  REG.stream = stream;
  REG.destinazione = destinazione;
  REG.attiva = true;
  REG.fermataUtente = false;
  REG.daRiprendere = false;
  REG.inizio = Date.now();
  sorvegliaTraccia(stream);
  avviaPezzo();
  avviaOnda(stream);
  tieniSveglio();
  document.getElementById('striscia').hidden = false;
  document.getElementById('reg-tempo').textContent = '0:00';
  REG.timer = setInterval(aggiornaTempoRegistrazione, 500);
  avvisa('Registrando', 'err');
  aggiornaVista();
}

/* Lo schermo non si spegne da solo finché si registra: in stand-by il telefono
   toglie il microfono all'app. Il blocco cade da solo quando la pagina va sotto
   (una chiamata, un'altra app) e si richiede quando torna. */
async function tieniSveglio() {
  if (!REG.attiva || !navigator.wakeLock) return;
  try {
    REG.sveglia = await navigator.wakeLock.request('screen');
    REG.sveglia.addEventListener('release', function () { REG.sveglia = null; });
  } catch (e) { REG.sveglia = null; }
}
function lasciaDormire() {
  if (REG.sveglia) { try { REG.sveglia.release(); } catch (e) { /* già rilasciato */ } REG.sveglia = null; }
}

/* Una chiamata in arrivo, o il telefono che va in stand-by, chiude la traccia
   del microfono senza che nessuno abbia premuto Stop. Quando succede si chiude
   il pezzo — così l'audio fatto fin lì è al sicuro — e si riprende con un
   pezzo nuovo appena il microfono torna, da solo. */
function sorvegliaTraccia(stream) {
  const traccia = stream.getAudioTracks()[0];
  if (!traccia) return;
  const interrotta = function () {
    if (!REG.attiva || REG.fermataUtente || REG.stream !== stream) return;
    if (REG.recorder && REG.recorder.state === 'recording') { try { REG.recorder.stop(); } catch (e) { riprendiRegistrazione(); } }
    else riprendiRegistrazione();
  };
  traccia.addEventListener('ended', interrotta);
  traccia.addEventListener('mute', interrotta);
}
async function riprendiRegistrazione() {
  if (!REG.attiva || REG.fermataUtente) return;
  if (REG.recorder && REG.recorder.state === 'recording') return;
  chiudiStream();
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch (e) {
    // Sotto una chiamata il microfono non si dà: si riprova quando l'app torna davanti.
    REG.daRiprendere = true;
    avvisa('Registrazione in pausa: riprende da sola', 'att');
    return;
  }
  if (!REG.attiva || REG.fermataUtente) { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
  REG.stream = stream;
  REG.daRiprendere = false;
  sorvegliaTraccia(stream);
  avviaPezzo();
  fermaOnda();
  avviaOnda(stream);
  tieniSveglio();
  avvisa('Registrazione ripresa', 'ok');
}

function avviaPezzo() {
  // Su iPhone esce audio/mp4: si accetta com'è, senza forzare formati.
  let recorder;
  try { recorder = new MediaRecorder(REG.stream); }
  catch (e) { avvisa('Registrazione non riuscita', 'err'); fermaRegistrazione(); return; }
  REG.recorder = recorder;
  REG.pezzi = [];
  REG.inizioPezzo = Date.now();
  recorder.ondataavailable = function (e) { if (e.data && e.data.size) REG.pezzi.push(e.data); };
  // Un errore del registratore non è uno Stop: si riprende con un pezzo nuovo.
  recorder.onerror = function () { if (REG.attiva && !REG.fermataUtente && recorder.state !== 'recording') riprendiRegistrazione(); };
  recorder.onstop = function () {
    const durata = Math.round((Date.now() - REG.inizioPezzo) / 1000);
    const blob = new Blob(REG.pezzi, { type: recorder.mimeType || 'audio/mp4' });
    const ora = oraAdesso(new Date(REG.inizioPezzo));
    REG.pezzi = [];
    if (blob.size > 0) salvaPezzoRegistrato(blob, durata, ora, REG.destinazione);
    if (REG.continua) { REG.continua = false; avviaPezzo(); }
    // Fermato non da chi registra ma dal telefono (chiamata, stand-by): si riprende.
    else if (REG.attiva && !REG.fermataUtente) riprendiRegistrazione();
    else chiudiStream();
  };
  recorder.start(1000);
  // Sopra i 40 minuti la trascrizione rifiuta il file: si spezza da soli e si va avanti senza fermarsi.
  clearTimeout(REG.spezzaTimer);
  REG.spezzaTimer = setTimeout(function () {
    if (REG.attiva && REG.recorder && REG.recorder.state === 'recording') { REG.continua = true; REG.recorder.stop(); }
  }, LIMITE_PEZZO_SECONDI * 1000);
}

function fermaRegistrazione() {
  if (!REG.attiva) return;
  REG.attiva = false;
  REG.fermataUtente = true;
  REG.daRiprendere = false;
  lasciaDormire();
  clearInterval(REG.timer);
  clearTimeout(REG.spezzaTimer);
  fermaOnda();
  document.getElementById('striscia').hidden = true;
  if (REG.recorder && REG.recorder.state !== 'inactive') {
    REG.continua = false;
    try { REG.recorder.stop(); } catch (e) { chiudiStream(); }
  } else chiudiStream();
  aggiornaVista();
}
function chiudiStream() {
  if (REG.stream) { REG.stream.getTracks().forEach(function (t) { t.stop(); }); REG.stream = null; }
  if (REG.audioCtx) { try { REG.audioCtx.close(); } catch (e) { /* già chiuso */ } REG.audioCtx = null; }
  REG.recorder = null;
}
function aggiornaTempoRegistrazione() {
  const el = document.getElementById('reg-tempo');
  if (el) el.textContent = durataBreve((Date.now() - REG.inizio) / 1000);
}

// L'onda non è decorazione: è l'unico modo di sapere che il microfono sta prendendo davvero.
function avviaOnda(stream) {
  const onda = document.getElementById('reg-onda');
  onda.innerHTML = '';
  const N = 24;
  for (let i = 0; i < N; i++) onda.appendChild(document.createElement('i'));
  const barre = Array.prototype.slice.call(onda.children);
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  try {
    REG.audioCtx = new AC();
    const sorgente = REG.audioCtx.createMediaStreamSource(stream);
    REG.analizzatore = REG.audioCtx.createAnalyser();
    REG.analizzatore.fftSize = 512;
    sorgente.connect(REG.analizzatore);
    if (REG.audioCtx.state === 'suspended') REG.audioCtx.resume();
  } catch (e) { return; }
  const dati = new Uint8Array(REG.analizzatore.fftSize);
  const storia = [];
  function passo() {
    if (!REG.attiva) return;
    REG.analizzatore.getByteTimeDomainData(dati);
    let somma = 0;
    for (let i = 0; i < dati.length; i++) { const v = (dati[i] - 128) / 128; somma += v * v; }
    const rms = Math.sqrt(somma / dati.length);
    storia.push(rms);
    if (storia.length > N) storia.shift();
    for (let i = 0; i < N; i++) {
      const v = storia[storia.length - N + i] || 0;
      barre[i].style.height = Math.max(4, Math.min(26, 4 + v * 160)) + 'px';
    }
    REG.rafOnda = requestAnimationFrame(passo);
  }
  passo();
}
function fermaOnda() { if (REG.rafOnda) cancelAnimationFrame(REG.rafOnda); REG.rafOnda = null; }

/* Appena fermato: si salva nel telefono, subito, e parte verso la trascrizione. */
async function salvaPezzoRegistrato(blob, durata, ora, destinazione) {
  const id = nuovoId();
  let rif = null;
  try { rif = await salvaMedia(id, blob); }
  catch (e) { avvisa('Audio non salvato', 'err'); return; }
  if (destinazione.tipo === 'sopralluogo') {
    const sop = sopralluogo(destinazione.id);
    if (!sop) return;
    const pezzo = { id: id, ora: ora, durata: durata, audio: rif, grezzo: '', titolo: '', sezione: '', sezioni: [], stato: 'in_coda', peso: blob.size };
    sop.pezzi.push(pezzo);
    salva('sopralluogo', sop);
    avvisa('Salvato', 'ok');
    accoda({ tipo: 'trascrizione', per: 'sopralluogo', sop: sop.id, pezzo: id, etichetta: 'Registrazione delle ' + ora });
  } else if (destinazione.tipo === 'contabilita') {
    avvisa('Salvato', 'ok');
    accoda({ tipo: 'trascrizione', per: 'contabilita', cantiere: destinazione.cantiere, audio: rif, ora: ora, etichetta: 'riga delle ' + ora });
  } else if (destinazione.tipo === 'nota') {
    avvisa('Salvato', 'ok');
    accoda({ tipo: 'trascrizione', per: 'nota', cantiere: destinazione.cantiere, audio: rif, ora: ora, etichetta: 'nota delle ' + ora });
  } else if (destinazione.tipo === 'rilievo') {
    const sop = sopralluogo(destinazione.sop);
    if (!sop) { await cancellaMedia(rif); return; }
    // Il rilievo resta una registrazione come le altre: si riascolta, si butta, si conta.
    // Quello che cambia è che la sua sezione è già decisa dal tasto.
    const nome = nomeSezione(destinazione.sezione);
    const pezzo = { id: id, ora: ora, durata: durata, audio: rif, grezzo: '', titolo: nome + ' delle ' + ora,
      sezione: destinazione.sezione, sezioni: [destinazione.sezione], stato: 'in_coda', peso: blob.size };
    sop.pezzi.push(pezzo);
    salva('sopralluogo', sop);
    avvisa('Salvato', 'ok');
    accoda({ tipo: 'trascrizione', per: 'rilievo', sop: sop.id, pezzo: id, sezione: destinazione.sezione, etichetta: nome + ' delle ' + ora });
  } else if (destinazione.tipo === 'foto') {
    const sop = sopralluogo(destinazione.sop);
    const f = sop && trovaFoto(sop, destinazione.foto);
    if (!f) { await cancellaMedia(rif); return; }
    // Il riferimento all'audio sta anche sulla foto: così la card Spazio lo conta e la schermata sa che c'è un referto in arrivo.
    f.audio = rif; f.stato = 'in_coda'; f.errore = null;
    salva('sopralluogo', sop);
    avvisa('Salvato', 'ok');
    accoda({ tipo: 'trascrizione', per: 'foto', sop: sop.id, foto: f.id, audio: rif, etichetta: nomeFoto(f) });
  }
  aggiornaVista();
}

/* ---- riascolto ---- */
let urlInAscolto = null;
let pezzoInAscolto = null;
async function riascolta(sopId, pezzoId) {
  const lettore = document.getElementById('lettore');
  if (pezzoInAscolto === pezzoId && !lettore.paused) { lettore.pause(); pezzoInAscolto = null; aggiornaVista(); return; }
  const sop = sopralluogo(sopId);
  const pezzo = sop && sop.pezzi.find(function (p) { return p.id === pezzoId; });
  if (!pezzo) return;
  if (!pezzo.audio) { avvisa(pezzo.archiviato ? 'Audio archiviato' : 'Senza audio', 'att'); return; }
  const blob = await leggiMedia(pezzo.audio);
  if (!blob) { avvisa('Audio non trovato', 'err'); return; }
  if (urlInAscolto) URL.revokeObjectURL(urlInAscolto);
  urlInAscolto = URL.createObjectURL(blob);
  lettore.src = urlInAscolto;
  pezzoInAscolto = pezzoId;
  lettore.onended = function () { pezzoInAscolto = null; aggiornaVista(); };
  try { await lettore.play(); } catch (e) { avvisa('Non si sente', 'err'); pezzoInAscolto = null; }
  aggiornaVista();
}

/* ============================================================
   LE FOTOGRAFIE
   Si scattano dal sopralluogo e restano attaccate a quel giorno, in IndexedDB
   come l'audio. Si riducono PRIMA di salvarle, sempre: nel telefono non entra
   mai una foto a piena risoluzione. Sulla foto non si scrive niente: data, ora
   e cantiere sono dati, e si mostrano accanto. Nel JSON che va su GitHub c'è
   solo il riferimento e il testo, mai l'immagine.
   ============================================================ */

// createImageBitmap raddrizza la foto secondo l'orientamento del telefono; se manca si passa da un <img>.
async function apriImmagine(file) {
  if (window.createImageBitmap) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch (e) { /* si prova l'altra strada */ }
  }
  return await new Promise(function (ok, no) {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = function () { URL.revokeObjectURL(url); ok(im); };
    im.onerror = function () { URL.revokeObjectURL(url); no(new Error('Il telefono non riesce ad aprire questa foto')); };
    im.src = url;
  });
}

/* Un documento può essere un PDF fatto dallo scanner del telefono. Si riconosce dal
   tipo o dal nome; si contano le pagine con pdf-lib quando c'è (null se non si riesce). */
function ePdf(file) { return file.type === 'application/pdf' || /\.pdf$/i.test(file.name || ''); }
async function contaPaginePdf(blob) {
  if (!window.PDFLib) return null;
  try { return (await window.PDFLib.PDFDocument.load(await blob.arrayBuffer(), { ignoreEncryption: true })).getPageCount(); }
  catch (e) { return null; }
}
// L'estensione con cui un file esce dal telefono: le scansioni PDF non sono jpg.
function estensioneMedia(f) { return f.formato === 'pdf' ? '.pdf' : '.jpg'; }
function tipoMedia(f, blob) { return blob.type || (f.formato === 'pdf' ? 'application/pdf' : 'image/jpeg'); }

// Lato lungo a latoMax, JPEG alla qualità detta. Torna il blob e le misure, che servono al PDF.
async function riduciFoto(file, latoMax, qualita) {
  const im = await apriImmagine(file);
  const w = im.naturalWidth || im.width, a = im.naturalHeight || im.height;
  if (!w || !a) throw new Error('Foto vuota');
  const scala = Math.min(1, latoMax / Math.max(w, a));
  const W = Math.max(1, Math.round(w * scala)), A = Math.max(1, Math.round(a * scala));
  const tela = document.createElement('canvas');
  tela.width = W; tela.height = A;
  tela.getContext('2d').drawImage(im, 0, 0, W, A);
  if (im.close) im.close();
  const blob = await new Promise(function (ok, no) {
    tela.toBlob(function (b) { if (b) ok(b); else no(new Error('Riduzione non riuscita')); }, 'image/jpeg', qualita);
  });
  // Safari tiene la memoria della tela finché esiste: la si svuota subito, il telefono ne ha poca.
  tela.width = 1; tela.height = 1;
  return { blob: blob, larghezza: W, altezza: A };
}

/* ---- la fotocamera dentro l'app ----
   La fotocamera del telefono, aperta dall'ingresso file, su Android chiude spesso la
   pagina per liberare memoria: la foto scattata non torna mai. Qui la camera si apre
   dentro l'app, a tutto schermo, e lo scatto non esce mai dalla pagina. Se la camera
   non si può aprire (permesso negato, browser vecchio) si torna all'ingresso file. */
let CAMERA = null;
function ingressoScatto() { const f = document.getElementById('file-foto-scatta'); if (f) f.click(); }
async function apriFotocamera(sopId) {
  if (CAMERA) return;
  if (!sopId || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { ingressoScatto(); return; }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } } });
  } catch (e) { ingressoScatto(); return; }
  const box = document.createElement('div');
  box.id = 'fotocamera';
  box.innerHTML = '<video autoplay playsinline muted></video>' +
    '<button class="chiudi" data-az="fotocamera-chiudi" aria-label="Chiudi">✕</button>' +
    '<button class="scatta" data-az="fotocamera-scatta" aria-label="Scatta"></button>';
  document.body.appendChild(box);
  const video = box.querySelector('video');
  video.srcObject = stream;
  CAMERA = { stream: stream, box: box, video: video, sop: sopId };
}
function chiudiFotocamera() {
  if (!CAMERA) return;
  CAMERA.stream.getTracks().forEach(function (t) { t.stop(); });
  CAMERA.box.remove();
  CAMERA = null;
}
// Il fotogramma di adesso diventa un JPEG e prende la strada di ogni altra foto.
async function scattaFotocamera() {
  if (!CAMERA || !CAMERA.video.videoWidth) return;
  const v = CAMERA.video, sop = CAMERA.sop;
  const tela = document.createElement('canvas');
  tela.width = v.videoWidth; tela.height = v.videoHeight;
  tela.getContext('2d').drawImage(v, 0, 0);
  const blob = await new Promise(function (ok) { tela.toBlob(ok, 'image/jpeg', 0.92); });
  tela.width = 1; tela.height = 1;
  chiudiFotocamera();
  if (!blob) { avvisa('Scatto non riuscito', 'err'); return; }
  await aggiungiFoto(new File([blob], 'scatto.jpg', { type: 'image/jpeg' }), sop, 'scatto');
}

/* Dal file scelto (scattato o preso dal rullino) alla voce in media del sopralluogo.
   Poi si apre la foto grande: la cosa più probabile è che voglia dire subito cos'è. */
async function aggiungiFoto(file, sopId, origine, genere) {
  const s = sopralluogo(sopId);
  if (!s || !file) return;
  const doc = !!GENERI[genere];
  /* Lo scanner del telefono restituisce un PDF: si salva com'è, senza disegnarlo.
     Le pagine si contano con pdf-lib, se c'è; se non si riesce restano ignote. */
  const pdf = doc && ePdf(file);
  avvisa(doc ? 'Preparo la scansione…' : 'Preparo la foto…');
  let ridotta;
  if (pdf) {
    ridotta = { blob: file, larghezza: 0, altezza: 0, pagine: await contaPaginePdf(file) };
  } else {
    try { ridotta = await riduciFoto(file, doc ? LATO_DOC : LATO_FOTO, doc ? QUALITA_DOC : QUALITA_FOTO); }
    catch (e) { avvisa(e.message || 'Foto non leggibile', 'err'); return; }
  }
  const id = nuovoId();
  let rif;
  try { rif = await salvaMedia(id, ridotta.blob); }
  catch (e) { avvisa('Foto non salvata', 'err'); return; }
  // Dal rullino vale la data del file, se è credibile; uno scatto è adesso.
  const d = (origine === 'rullino' && file.lastModified && file.lastModified < Date.now() - 60000) ? new Date(file.lastModified) : new Date();
  if (!Array.isArray(s.media)) s.media = [];
  const f = {
    id: id, codice: codiceNuovo(doc ? 'DOC' : 'FOTO'), tipo: 'foto', genere: doc ? genere : null, file: rif,
    quando: d.toISOString(), giorno: dataLocaleISO(d), ora: oraAdesso(d),
    // Un documento non è di una sezione del verbale: è un allegato, e ci va sempre.
    sezione: doc ? '' : SEZIONE_FOTO, referto: '', grezzo: '', nelPdf: doc,
    // Vale per tutto il cantiere, non solo per la giornata in cui è stato preso.
    cantiere: doc ? !!DOC_PER_CANTIERE : false,
    peso: ridotta.blob.size, larghezza: ridotta.larghezza, altezza: ridotta.altezza,
    stato: '', audio: null
  };
  // Campi in più solo per il PDF scansionato: una foto normale non li ha, e non cambia.
  if (pdf) { f.formato = 'pdf'; f.pagine = ridotta.pagine; }
  s.media.push(f);
  salva('sopralluogo', s);
  /* Dopo uno scatto non si cambia schermata: in cantiere le foto si fanno in fila, e
     cambiare pagina fra una e l'altra costava un tocco ogni volta. La miniatura compare
     da sola nella striscia; il referto si detta toccandola, quando si ha tempo. */
  if (doc) { avvisa(GENERI[genere] + ' salvata', 'ok'); aggiornaVista(); return; }
  avvisa('Foto salvata · ' + fotoNormali(s).length + ' oggi', 'ok');
  aggiornaVista();
}

/* Tolta una registrazione, si toglie l'audio dal telefono e i suoi lavori dalla coda.
   Il testo già finito nelle sezioni resta dov'è: è del verbale, non della registrazione. */
async function eliminaPezzo(s, p) {
  const loc = leggiLocale();
  loc.coda = loc.coda.filter(function (l) { return l.pezzo !== p.id; });
  salvaLocale();
  if (pezzoInAscolto === p.id) { const lettore = document.getElementById('lettore'); if (lettore) lettore.pause(); pezzoInAscolto = null; }
  if (p.audio) await cancellaMedia(p.audio);
  s.pezzi = s.pezzi.filter(function (x) { return x !== p; });
  salva('sopralluogo', s);
}

// Tolta una foto, si tolgono il file, l'audio del referto se è ancora in giro, e i suoi lavori in coda.
async function eliminaFoto(s, f) {
  const loc = leggiLocale();
  loc.coda = loc.coda.filter(function (l) { return l.foto !== f.id; });
  salvaLocale();
  if (f.file) { scordaFoto(f.file); await cancellaMedia(f.file); }
  if (f.audio) await cancellaMedia(f.audio);
  s.media = (s.media || []).filter(function (m) { return m !== f; });
  salva('sopralluogo', s);
}
// Quando si cancella un sopralluogo intero: i file di tutte le sue foto.
async function cancellaFileFoto(s) {
  for (const f of fotoDi(s)) {
    if (f.file) { scordaFoto(f.file); await cancellaMedia(f.file); }
    if (f.audio) await cancellaMedia(f.audio);
  }
}
/* Via un sopralluogo intero: i suoi audio, le sue foto, il suo verbale, e lui.
   La giornata resta: è un dato suo, e se questo era l'ultimo passaggio resta vuota. */
async function eliminaSopralluogo(s) {
  for (const p of s.pezzi) { if (p.audio) await cancellaMedia(p.audio); }
  await cancellaFileFoto(s);
  const v = verbaleDiSopralluogo(s.codice);
  if (v) cancella('verbale', v.id);
  assicuraGiornata(s.cantiere, s.giorno);
  cancella('sopralluogo', s.id);
}
/* Via una giornata intera: tutti i suoi sopralluoghi, il verbale di giornata, e lei.
   Il cantiere resta com'è. */
async function eliminaGiornata(codiceCantiere, giorno) {
  for (const s of sopralluoghiDelGiorno(codiceCantiere, giorno)) await eliminaSopralluogo(s);
  const vg = verbaleDiGiornata(codiceCantiere, giorno);
  if (vg) cancella('verbale', vg.id);
  const g = giornataDi(codiceCantiere, giorno);
  if (g) cancella('giornata', g.id);
}
// "Sicuro?" dopo l'"Eliminare?": per giornate, cantieri e aziende non si torna indietro.
async function chiediDueVolte(titolo, testo, etichetta) {
  const ok = await chiedi(titolo, testo, etichetta, 'rosso');
  chiudiFoglio();
  if (!ok) return false;
  const sicuro = await chiedi('Sicuro?', 'Non si torna indietro.', 'Sì, elimina', 'rosso');
  chiudiFoglio();
  return sicuro;
}

/* Le schermate sono stringhe HTML e IndexedDB è asincrono: le immagini si
   mettono dopo, leggendo il blob una volta sola e tenendo l'indirizzo in
   memoria. Le foto non cambiano mai una volta salvate, quindi si può. */
const URL_FOTO = {};
function urlFoto(rif) {
  if (!URL_FOTO[rif]) {
    URL_FOTO[rif] = leggiMedia(rif).then(function (blob) {
      if (!blob) { delete URL_FOTO[rif]; return null; }
      return URL.createObjectURL(blob);
    });
  }
  return URL_FOTO[rif];
}
function scordaFoto(rif) {
  const p = URL_FOTO[rif];
  if (!p) return;
  delete URL_FOTO[rif];
  p.then(function (u) { if (u) URL.revokeObjectURL(u); });
}
function caricaImmagini(radice) {
  radice.querySelectorAll('img[data-foto]').forEach(function (img) {
    urlFoto(img.dataset.foto).then(function (u) {
      if (!img.isConnected) return;
      if (u) img.src = u;
      else { const q = img.parentElement; if (q) { q.classList.add('persa'); img.remove(); } }
    });
  });
}

// La coda sa più della foto: se un lavoro suo è in corso o è fallito, lo si dice.
function statoLavoroFoto(f) {
  const loc = leggiLocale();
  const l = loc.coda.find(function (x) { return x.foto === f.id; });
  const copia = Object.assign({}, f);
  if (l) {
    if (l.stato === 'in_corso') copia.stato = l.tipo === 'referto' ? 'trascritto' : 'in_corso';
    else if (l.stato === 'fallito') { copia.stato = 'errore'; copia.errore = l.errore; }
    else if (l.stato === 'in_attesa') { copia.stato = l.tipo === 'referto' ? 'trascritto' : 'in_coda'; copia.errore = l.errore || null; }
  } else if (f.stato === 'in_coda' || f.stato === 'in_corso' || f.stato === 'trascritto') {
    // Un lavoro sparito dalla coda (svuotata a mano) non deve sembrare ancora in corso.
    copia.stato = 'errore'; copia.errore = 'tolto dalla coda';
  }
  return copia;
}
function descriviStatoFoto(st) {
  if (st.stato === 'in_coda') return { testo: 'referto in coda' + (st.errore ? ' · ' + st.errore : ''), classe: 'att' };
  if (st.stato === 'in_corso') return { testo: 'trascrivendo…', classe: 'att' };
  if (st.stato === 'trascritto') return { testo: 'trascritto, sistemo il referto…', classe: 'att' };
  if (st.stato === 'errore') return { testo: 'non riuscito: ' + (st.errore || ''), classe: 'err' };
  return { testo: '', classe: '' };
}

// Le miniature in fila. Con opzioni.segna sotto ognuna c'è il tasto per metterla nel PDF o toglierla.
function filaFoto(s, lista, opzioni) {
  opzioni = opzioni || {};
  if (!lista.length) return '';
  return '<div class="foto-fila">' + lista.map(function (x) {
    // Un elemento è la foto, oppure { sop, f } quando la fila mette insieme più sopralluoghi.
    const f = x.f || x, sx = x.sop || s;
    const st = statoLavoroFoto(f);
    const eti = opzioni.doc ? (GENERI_BREVI[f.genere] || 'documento') : (st.stato === 'errore' ? 'non riuscito' : ((st.stato && st.stato !== 'riordinato') ? 'referto…' : f.ora));
    return '<div class="foto-mini' + (f.nelPdf ? ' pdf' : '') + '">' +
      '<button class="q' + (f.file ? '' : ' manca') + (f.formato === 'pdf' ? ' scan' : '') + '" data-az="vai" data-a="#/foto/' + h(sx.id) + '/' + h(f.id) + '" aria-label="Apri ' + h(nomeFoto(f)) + '">' +
      // Una scansione PDF non ha miniatura: l'icona del documento e il numero di pagine.
      (f.file ? (f.formato === 'pdf' ? '<span class="ico ico-documento"></span><small>' + (f.pagine ? f.pagine + ' pag.' : 'PDF') + '</small>' : '<img data-foto="' + h(f.file) + '" alt="">') : '') + '</button>' +
      // La ✕ sull'angolo della miniatura: una foto sbagliata si butta senza aprirla, sempre.
      '<button class="x-mini" data-az="foto-elimina" data-sop="' + h(sx.id) + '" data-id="' + h(f.id) + '" aria-label="Elimina ' + h(nomeFoto(f)) + '">✕</button>' +
      /* Il bollino del PDF sta nell'angolo basso della foto. Dove serve scegliere si tocca,
         e non ruba una riga sotto la miniatura; altrove dice soltanto com'è messa. */
      (opzioni.segna
        ? '<button class="tacca' + (f.nelPdf ? ' on' : '') + '" data-az="foto-marca" data-sop="' + h(sx.id) + '" data-id="' + h(f.id) + '" aria-label="' + (f.nelPdf ? 'Togli dal PDF' : 'Metti nel PDF') + '">' + (f.nelPdf ? '✓ PDF' : '☐ PDF') + '</button>'
        : (f.nelPdf ? '<span class="tacca on">✓ PDF</span>' : '')) +
      '<span class="e' + (st.stato === 'errore' ? ' err' : ((st.stato && st.stato !== 'riordinato') ? ' att' : '')) + '">' + h(eti) + '</span>' +
      '</div>';
  }).join('') + '</div>';
}
// Le foto di un sopralluogo divise per sezione: serve alle schermate del giorno e al PDF.
function fotoPerSezione(s) {
  const per = {};
  fotoNormali(s).forEach(function (f) { const k = sezioneFoto(f); (per[k] = per[k] || []).push(f); });
  return per;
}

/* ---- notifiche ---- */
async function chiediNotificheUnaVolta() {
  const loc = leggiLocale();
  if (loc.notificheChieste || !('Notification' in window)) return;
  loc.notificheChieste = true;
  salvaLocale();
  try { await Notification.requestPermission(); } catch (e) { /* se dice no, non si insiste */ }
}
async function mostraNotifica(titolo, corpo, url) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
    if (reg && reg.showNotification) await reg.showNotification(titolo, { body: corpo, icon: 'icon-192.png', badge: 'icon-192.png', data: { url: url || './' }, tag: titolo });
    else new Notification(titolo, { body: corpo, icon: 'icon-192.png' });
  } catch (e) { /* niente errori a schermo per una notifica */ }
}

/* Alle 18, se per un cantiere attivo manca il sopralluogo di oggi, il telefono avvisa.
   Funziona solo con l'app aperta o in secondo piano da poco: senza un server non c'è altro modo. */
function controllaPromemoria() {
  const adesso = new Date();
  if (adesso.getHours() < 18) return;
  const loc = leggiLocale();
  const oggi = oggiISO();
  if (loc.promemoriaGiorno === oggi) return;
  loc.promemoriaGiorno = oggi;
  salvaLocale();
  valori(leggiTutto().cantieri).filter(function (c) { return c.stato === 'attivo'; }).forEach(function (c) {
    if (!sopralluogoDiOggi(c.codice)) mostraNotifica('Manca il sopralluogo di oggi', c.nome, '#/cantiere/' + c.id);
  });
}

/* ============================================================
   IL ROUTER E LE SCHERMATE
   Le rotte stanno nell'hash: così il gesto "indietro" dell'iPhone funziona
   e una pagina ricaricata riapre dove era.
   ============================================================ */

let ROTTA = { nome: 'dashboard', parametri: [] };
let devSbloccato = false;

/* I tre puntini aprono le loro voci dentro la card, non una finestra che copre
   lo schermo: si tocca, la card si allunga di tre righe, si sceglie e si richiude.
   Una sola card per volta, e cambiando schermata si richiude da sola. */
let PUNTI_APERTI = null;
function apriPunti(id) { PUNTI_APERTI = (PUNTI_APERTI === id ? null : id); aggiornaVista(); }
function vai(hash) { PUNTI_APERTI = null; ESPORTA_APERTO = null; location.hash = hash; }

/* Il tasto "Esporta" di una card con Visualizza · Esporta · Correggi: toccato,
   scende una tendina con le due strade — Esporta (condividi) e Scarica (nel
   telefono). Una tendina aperta alla volta, e si chiude cambiando schermata. */
let ESPORTA_APERTO = null;
// Scelta una voce, la tendina si richiude subito, prima che parta il lavoro.
function chiudiEsporta() { if (ESPORTA_APERTO) { ESPORTA_APERTO = null; aggiornaVista(); } }
function tastoEsporta(chiave) {
  const aperto = ESPORTA_APERTO === chiave;
  return '<button class="btn' + (aperto ? ' on' : '') + '" data-az="esporta-tendina" data-chiave="' + h(chiave) + '" aria-expanded="' + aperto + '">Esporta<span class="fr">' + (aperto ? '▴' : '▾') + '</span></button>';
}
/* I tre puntini di giornate, cantieri e aziende: il tasto, e sotto — nella card,
   come la tendina di Esporta — la sola voce Elimina. Gli attributi data-* arrivano
   già pronti, perché ogni cosa da eliminare si identifica a modo suo. */
function tastoPunti(chiave) {
  const aperto = PUNTI_APERTI === chiave;
  return '<button class="pill cod puntini' + (aperto ? ' on' : '') + '" data-az="menu-punti" data-chiave="' + h(chiave) + '" aria-label="Altro" aria-expanded="' + aperto + '">⋯</button>';
}
function vociPunti(chiave, azione, attributi) {
  if (PUNTI_APERTI !== chiave) return '';
  return '<div class="esp-voci"><button class="voce-m rossa" data-az="' + azione + '" ' + attributi + '><b>Elimina</b></button></div>';
}
// Le due voci scendono sotto la fila dei tasti, dentro la card: la fila scorre di lato e non può far uscire niente.
function vociEsporta(chiave, azEsporta, idEsporta, azScarica, idScarica) {
  if (ESPORTA_APERTO !== chiave) return '';
  return '<div class="esp-voci">' +
    '<button class="voce-m" data-az="' + azEsporta + '" data-id="' + h(idEsporta) + '"><b>Esporta</b><small>manda a qualcuno: mail, WhatsApp, stampa</small></button>' +
    '<button class="voce-m" data-az="' + azScarica + '" data-id="' + h(idScarica) + '"><b>Scarica</b><small>salva il PDF nel telefono</small></button></div>';
}
function leggiRotta() {
  const p = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  ROTTA = { nome: p[0] || 'dashboard', parametri: p.slice(1).map(decodeURIComponent) };
}
function aggiornaSeDev() { if (ROTTA.nome === 'dev') aggiornaVista(); }

/* Si ridisegna tutta la schermata. Se l'utente stava scrivendo in un campo,
   si rimette il cursore dove era: un riordino che arriva non deve fargli
   perdere la riga. */
function aggiornaVista() {
  const attivo = document.activeElement;
  let ricorda = null;
  if (attivo && attivo.closest && attivo.closest('#vista') && attivo.dataset.campo) {
    ricorda = { campo: attivo.dataset.campo, id: attivo.dataset.id || '', inizio: attivo.selectionStart, fine: attivo.selectionEnd };
  }
  const scroll = window.scrollY;
  disegna();
  if (ricorda) {
    const el = Array.prototype.find.call(document.querySelectorAll('#vista [data-campo]'), function (e) {
      return e.dataset.campo === ricorda.campo && (e.dataset.id || '') === ricorda.id;
    });
    if (el) { el.focus(); try { el.setSelectionRange(ricorda.inizio, ricorda.fine); } catch (e) { /* non è un campo di testo */ } }
  }
  window.scrollTo(0, scroll);
}

function disegna() {
  const vista = document.getElementById('vista');
  let html = '';
  try {
    switch (ROTTA.nome) {
      case 'dashboard': html = leggiLocale().saltaAziende ? vistaDashboard() : vistaAziende(); break;
      case 'aziende': html = vistaAziende(); break;
      case 'azienda': html = vistaDashboard(ROTTA.parametri[0]); break;
      case 'nuova-azienda': html = vistaAziendaForm(null); break;
      case 'modifica-azienda': html = vistaAziendaForm(ROTTA.parametri[0]); break;
      case 'cantiere': html = vistaCantiere(ROTTA.parametri[0]); break;
      case 'nuovo-cantiere': html = vistaCantiereForm(null, ROTTA.parametri[0]); break;
      case 'modifica-cantiere': html = vistaCantiereForm(ROTTA.parametri[0]); break;
      case 'giorno': html = vistaGiorno(ROTTA.parametri[0]); break;
      case 'giornata': html = vistaGiornata(ROTTA.parametri[0]); break;
      case 'verbale': html = vistaVerbaleModifica(ROTTA.parametri[0]); break;
      case 'relazione': html = vistaRelazione(ROTTA.parametri[0]); break;
      case 'modifica-relazione': html = vistaRelazioneModifica(ROTTA.parametri[0]); break;
      case 'foto': html = vistaFoto(ROTTA.parametri[0], ROTTA.parametri[1]); break;
      case 'contabilita': html = vistaContabilita(ROTTA.parametri[0]); break;
      case 'listino': html = vistaListino(ROTTA.parametri[0], ROTTA.parametri[1]); break;
      case 'note': html = vistaNote(ROTTA.parametri[0]); break;
      case 'pdf': html = vistaPdf(ROTTA.parametri[0]); break;
      case 'leggi': html = vistaLeggiPdf(ROTTA.parametri[0]); break;
      case 'cerca': html = vistaCerca(); break;
      case 'impostazioni':
        html = ROTTA.parametri[0] === 'aspetto' ? vistaImpostazioniAspetto()
          : ROTTA.parametri[0] === 'archivio' ? vistaImpostazioniArchivio()
          : vistaImpostazioni();
        break;
      case 'dev': html = vistaDev(); break;
      default: html = vistaDashboard();
    }
  } catch (e) {
    html = '<div class="top"><div class="tit"><h1>CANTIERI</h1></div></div><div class="avviso rosso">Qualcosa è andato storto: ' + h(e.message) + '</div>' +
      '<div class="modulo"><button class="btn" data-az="vai" data-a="#/">Torna all\'inizio</button></div>';
  }
  vista.innerHTML = html;
  vista.querySelectorAll('textarea.corpo, textarea.campo.auto').forEach(cresciTextarea);
  // Le foto arrivano da IndexedDB dopo: la schermata è già disegnata.
  caricaImmagini(vista);
  // Le pagine del PDF si disegnano dopo, quando il contenitore ha una larghezza.
  if (ROTTA.nome === 'leggi') mostraPdfDentro(ROTTA.parametri[0]);
}
function cresciTextarea(t) {
  t.style.height = 'auto';
  t.style.height = Math.max(60, t.scrollHeight + 2) + 'px';
}

// ---- pezzi comuni ----
function testata(o) {
  return '<div class="top">' +
    (o.indietro ? '<button class="indietro" data-az="vai" data-a="' + h(o.indietro) + '" aria-label="Indietro">‹</button>' : '') +
    '<div class="tit">' + (o.tocca ? '<button class="tocca" data-az="' + h(o.tocca) + '" data-id="' + h(o.id || '') + '">' : '') +
    '<h1' + (o.grande ? '' : ' class="pic"') + (o.idTitolo ? ' id="' + o.idTitolo + '"' : '') + '>' + h(o.titolo) + '</h1>' +
    (o.sotto ? '<div class="sub">' + o.sotto + '</div>' : '') + (o.tocca ? '</button>' : '') + '</div>' +
    (o.destra ? '<div class="destra">' + o.destra + '</div>' : '') +
    '</div>';
}
function tendina(chiave, etichetta, contenuto, n) {
  const aperta = !!leggiLocale().tendine[chiave];
  return '<button class="tend" data-az="tendina" data-chiave="' + h(chiave) + '" aria-expanded="' + aperta + '">' +
    '<span class="frec">▶</span> ' + h(etichetta) + (n != null ? '<span class="n">' + h(n) + '</span>' : '') + '</button>' +
    '<div' + (aperta ? '' : ' hidden') + '>' + contenuto + '</div>';
}
function testoElenco(testo, elenco) {
  if (!elenco) return h(testo);
  return righeElenco(testo).map(function (r) { return '<div class="voce"><span class="segno">●</span><span>' + h(r) + '</span></div>'; }).join('');
}
// "extra" è quello che sta sotto il testo: le foto della sezione. Una sezione con sole foto non ha corpo.
function rigaAudio(sop, pezzo, opzioni) {
  opzioni = opzioni || {};
  const suona = pezzoInAscolto === pezzo.id;
  let sotto = '', classe = '';
  const nome = pezzo.titolo || 'Registrazione delle ' + pezzo.ora;
  if (pezzo.stato === 'in_coda') { sotto = 'in coda' + (pezzo.errore ? ' · ' + pezzo.errore : '') + ' · ' + pezzo.ora; classe = 'att'; }
  else if (pezzo.stato === 'in_corso' || pezzo.stato === 'trascritto') { sotto = (pezzo.stato === 'trascritto' ? 'trascritto, riordino in corso' : 'trascrivendo…') + ' · ' + pezzo.ora; classe = 'att'; }
  else if (pezzo.stato === 'errore') { sotto = 'non riuscito: ' + (pezzo.errore || '') ; classe = 'err'; }
  else if (pezzo.archiviato) { sotto = 'audio archiviato il ' + dataSenzaAnno(pezzo.archiviato) + ' · ' + pezzo.ora; }
  else if (!pezzo.audio) { sotto = 'esempio, senza audio · ' + pezzo.ora; }
  else if (opzioni.dentroSezione) { sotto = pezzo.ora; }
  else { sotto = (pezzo.sezione ? nomeSezione(pezzo.sezione) : 'da smistare') + ' · ' + pezzo.ora; }
  const spento = !pezzo.audio;
  return '<div class="audio' + (opzioni.dentroSezione ? ' sotto' : '') + '">' +
    '<button class="play' + (spento ? ' spento' : '') + (suona ? ' suona' : '') + '" data-az="riascolta" data-sop="' + h(sop.id) + '" data-id="' + h(pezzo.id) + '" aria-label="Riascolta">' + (suona ? '❚❚' : '▶') + '</button>' +
    '<button class="n" data-az="vai-sezione" data-sop="' + h(sop.id) + '" data-id="' + h(pezzo.id) + '"><div class="t">' + h(nome) + '</div><div class="s ' + classe + '">' + h(sotto) + '</div></button>' +
    '<span class="d">' + durataBreve(pezzo.durata) + '</span>' +
    // La ✕ in fondo alla riga: una registrazione venuta male si butta e si rifà, sempre.
    '<button class="x-riga" data-az="pezzo-elimina" data-sop="' + h(sop.id) + '" data-id="' + h(pezzo.id) + '" aria-label="Elimina la registrazione">✕</button></div>';
}

/* Gli audio in una scatola alta tre righe, che scorre dentro di sé: dieci registrazioni
   non devono spingere il resto della giornata fuori dallo schermo. Il tasto sotto la
   apre tutta, e la scelta resta memorizzata come le tendine. */
const AUDIO_A_VISTA = 3;
function listaAudio(sop, pezzi, opzioni) {
  opzioni = opzioni || {};
  if (!pezzi.length) return '';
  const chiave = 'audio-' + (opzioni.chiave || sop.id);
  const tutta = !!leggiLocale().tendine[chiave];
  const troppi = pezzi.length > AUDIO_A_VISTA;
  return '<div class="audio-lista' + (troppi && !tutta ? ' corta' : '') + '">' +
    pezzi.map(function (p) { return rigaAudio(sop, statoLavoroPezzo(p), opzioni); }).join('') + '</div>' +
    (troppi ? '<button class="lista-tutta" data-az="lista-tutta" data-chiave="' + h(chiave) + '">' +
      (tutta ? '▲ Mostra solo le ultime ' + AUDIO_A_VISTA : '▼ Vedi tutte e ' + pezzi.length) + '</button>' : '');
}

function statoLavoroPezzo(pezzo) {
  // La coda sa più del pezzo: se un lavoro suo è in corso, lo si dice.
  const loc = leggiLocale();
  const l = loc.coda.find(function (x) { return x.pezzo === pezzo.id; });
  if (!l) return pezzo;
  const copia = Object.assign({}, pezzo);
  if (l.stato === 'in_corso') copia.stato = 'in_corso';
  else if (l.stato === 'fallito') { copia.stato = 'errore'; copia.errore = l.errore; }
  else if (l.stato === 'in_attesa' && pezzo.stato !== 'trascritto') { copia.stato = 'in_coda'; copia.errore = l.errore || null; }
  return copia;
}

/* ---------------- DASHBOARD ---------------- */
let filtroCantieri = '';
/* La prima schermata quando c'è almeno un'azienda: l'elenco delle imprese. Chi non la
   vuole la salta dalle impostazioni e trova un tastino piccolo per tornarci. */
function vistaAziende() {
  const aziende = aziendeTutte();
  const orfani = cantieriSenzaAzienda();
  let html = testata({ titolo: 'AZIENDE', grande: true, idTitolo: 'titolo-app', sotto: h(GIORNI_SETT[new Date().getDay()] + ' ' + new Date().getDate() + ' ' + MESI[new Date().getMonth()]),
    destra: '<button class="pill ok" data-az="vai" data-a="#/nuova-azienda">＋ azienda</button>' +
      '<button class="ingranaggio" data-az="vai" data-a="#/impostazioni" aria-label="Impostazioni"><span class="ico ico-ingranaggio"></span></button>' });
  html += cardSettimana();
  /* I cantieri stanno dentro la loro azienda, non in un elenco a parte: si vede subito
     chi ha cosa, e si entra dritti nel cantiere senza passare dalla scheda dell'impresa. */
  const rigaCantiere = function (c) {
    const sop = sopralluogoDiOggi(c.codice);
    let stato;
    if (c.stato === 'chiuso') stato = 'chiuso';
    else if (sop) stato = 'fatto alle ' + sop.ora + ' · ' + sop.pezzi.length + ' audio';
    else stato = 'da fare';
    return '<button class="riga" data-az="vai" data-a="#/cantiere/' + h(c.id) + '">' +
      '<span class="desc">' + h(c.nome) + '<small>' + h(c.committente || '') + (c.committente ? ' · ' : '') + h(stato) + '</small></span>' +
      (c.stato === 'chiuso' ? '<span class="pill grigia">chiuso</span>' : (sop ? '<span class="pill ok">✓</span>' : '<span class="pill att">oggi</span>')) +
      '<span class="frec">›</span></button>';
  };
  /* La riga dell'azienda apre e chiude i suoi cantieri: con più aziende in
     elenco si vedono prima le imprese, e si apre solo quella che serve. Con una
     sola azienda resta aperta, se no ci sarebbe un tocco in più ogni volta.
     La scheda dell'azienda si raggiunge dall'ultima riga di dentro. */
  aziende.forEach(function (a) {
    const cant = cantieriDiAzienda(a.codice).sort(function (x, z) { return x.nome.localeCompare(z.nome); });
    const attivi = cant.filter(function (c) { return c.stato !== 'chiuso'; });
    const daFare = attivi.filter(function (c) { return !sopralluogoDiOggi(c.codice); }).length;
    const chiave = 'azienda-' + a.codice;
    const memoria = leggiLocale().tendine;
    const aperta = Object.prototype.hasOwnProperty.call(memoria, chiave) ? !!memoria[chiave] : aziende.length === 1;
    /* Due tasti sulla stessa riga: il grosso apre e chiude i cantieri, quello
       piccolo a destra porta dritto nella scheda dell'azienda senza dover
       aprire niente. */
    html += '<div class="card">' +
      '<div class="riga az-capo">' +
      '<button class="apre" data-az="tendina" data-chiave="' + h(chiave) + '" aria-expanded="' + aperta + '">' +
      (a.logo ? '<img class="az-logo" data-foto="' + h(a.logo) + '" alt="">' : '<div class="az-logo vuoto">' + h((a.nome || '?').slice(0, 2).toUpperCase()) + '</div>') +
      '<span class="desc"><b>' + h(a.nome) + '</b><small>' + attivi.length + (attivi.length === 1 ? ' cantiere' : ' cantieri') + (daFare ? ' · ' + daFare + ' da fare' : '') + '</small></span>' +
      '<span class="frec">▶</span></button>' +
      '<button class="pill cod" data-az="vai" data-a="#/azienda/' + h(a.id) + '">apri</button>' +
      '</div>' +
      '<div' + (aperta ? '' : ' hidden') + '>' +
      attivi.map(rigaCantiere).join('') +
      // Ultima riga: "＋ cantiere" a sinistra, i tre puntini dell'azienda dal lato opposto.
      '<div class="riga az-capo"><button class="apre piu" data-az="vai" data-a="#/nuovo-cantiere/' + h(a.id) + '"><span class="desc">＋ cantiere</span></button>' + tastoPunti('azienda-' + a.id) + '</div>' +
      vociPunti('azienda-' + a.id, 'azienda-elimina', 'data-id="' + h(a.id) + '"') +
      '</div></div>';
  });
  if (orfani.length) {
    html += '<div class="eti">' + (aziende.length ? 'Senza azienda' : 'I tuoi cantieri') + ' <span class="n">' + orfani.length + '</span></div>';
    html += '<div class="card">' + orfani.sort(function (x, z) { return x.nome.localeCompare(z.nome); }).map(rigaCantiere).join('') + '</div>';
  }
  if (!aziende.length && !orfani.length) html += '<div class="vuoto-stato">Nessuna azienda e nessun cantiere. Comincia da “＋ azienda”.</div>';
  if (!REG.attiva) html += '<div class="barra"><button class="az verde" data-az="parla-dashboard"><span class="ico ico-microfono"></span> Detta un sopralluogo</button></div>';
  return html;
}

/* La scheda di un'azienda: i dati che finiscono sulla carta intestata, il logo e la firma. */
function vistaAziendaForm(id) {
  const a = id ? azienda(id) : null;
  if (id && !a) return vistaAziende();
  const v = a || { nome: '', ragione: '', tecnico: '', piva: '', indirizzo: '', telefono: '', mail: '', pec: '', sito: '', note: '' };
  let html = testata({ indietro: a ? '#/azienda/' + a.id : '#/', titolo: a ? 'Scheda azienda' : 'Nuova azienda', sotto: a ? h(a.nome) : '' });
  html += '<div class="modulo">' +
    '<label class="eticampo">Nome breve</label><input class="campo" id="a-nome" value="' + h(v.nome) + '" placeholder="es. Edil Rossi" autocomplete="off"' + (a ? '' : ' autofocus') + '>' +
    '<label class="eticampo">Ragione sociale</label><input class="campo" id="a-ragione" value="' + h(v.ragione || '') + '" placeholder="es. Edil Rossi S.r.l." autocomplete="off">' +
    '<label class="eticampo">Tecnico</label><input class="campo" id="a-tecnico" value="' + h(v.tecnico || '') + '" placeholder="es. Geom. Mario Rossi" autocomplete="off">' +
    /* La firma del tecnico sta con il suo nome: è quella che va in fondo a ogni
       verbale. Si scansiona da qui (foglio bianco, fotocamera o file). */
    (a ? '<label class="eticampo">Firma del tecnico</label><div class="az-firma">' +
      (a.firma ? '<img data-foto="' + h(a.firma) + '" alt="">' : '<div class="vuoto">niente</div>') +
      '<button class="btn" data-az="az-immagine" data-id="' + h(a.id) + '" data-quale="firma"><span class="ico ico-firma"></span> ' + (a.firma ? 'Cambia la firma' : 'Scansiona la firma') + '</button></div>' : '') +
    '<label class="eticampo">Partita IVA</label><input class="campo" id="a-piva" value="' + h(v.piva || '') + '" autocomplete="off">' +
    '<label class="eticampo">Indirizzo</label><input class="campo" id="a-ind" value="' + h(v.indirizzo || '') + '" autocomplete="off">' +
    '<div class="due"><div><label class="eticampo">Telefono</label><input class="campo" id="a-tel" type="tel" value="' + h(v.telefono || '') + '" autocomplete="off"></div>' +
    '<div><label class="eticampo">Mail</label><input class="campo" id="a-mail" type="email" value="' + h(v.mail || '') + '" autocomplete="off"></div></div>' +
    '<div class="due"><div><label class="eticampo">PEC</label><input class="campo" id="a-pec" type="email" value="' + h(v.pec || '') + '" autocomplete="off"></div>' +
    '<div><label class="eticampo">Sito</label><input class="campo" id="a-sito" value="' + h(v.sito || '') + '" placeholder="edilrossi.it" autocomplete="off"></div></div>' +
    '<label class="eticampo">Note</label><textarea class="campo auto" id="a-note" rows="2">' + h(v.note || '') + '</textarea>' +
    '</div>';
  if (a) {
    /* La banda intera: l'immagine che il cliente ha già, con dentro logo, dati e
       tutto il resto. Se c'è, va in cima e in fondo a ogni pagina del PDF al posto
       della carta intestata costruita a pezzi. */
    html += '<div class="card"><div class="card-capo">Banda intera<span class="dx">su ogni pagina del PDF</span></div>' +
      '<div class="az-banda"><div class="et">Intestazione</div>' +
      (a.banda ? '<img data-foto="' + h(a.banda) + '" alt="">' : '<div class="vuoto">niente</div>') +
      '<button class="btn medio" data-az="az-immagine" data-id="' + h(a.id) + '" data-quale="banda">' + (a.banda ? 'Cambia' : 'Metti') + '</button></div>' +
      '<div class="az-banda"><div class="et">Piè di pagina</div>' +
      (a.bandaPiede ? '<img data-foto="' + h(a.bandaPiede) + '" alt="">' : '<div class="vuoto">niente</div>') +
      '<button class="btn medio" data-az="az-immagine" data-id="' + h(a.id) + '" data-quale="bandaPiede">' + (a.bandaPiede ? 'Cambia' : 'Metti') + '</button></div>' +
      '<div class="card-piede">PNG largo quanto il foglio. Se c\'è, prende il posto della carta intestata qui sotto.</div></div>';

    html += '<div class="card"><div class="card-capo">Carta intestata<span class="dx">se non c\'è la banda</span></div><div class="card-in az-imm">' +
      '<div class="az-slot"><div class="et">Logo</div>' +
      (a.logo ? '<img data-foto="' + h(a.logo) + '" alt="">' : '<div class="vuoto">niente</div>') +
      '<button class="btn medio" data-az="az-immagine" data-id="' + h(a.id) + '" data-quale="logo">' + (a.logo ? 'Cambia' : 'Metti') + '</button></div>' +
      '</div><div class="card-piede">Il logo va in cima al PDF, la firma del tecnico (qui sopra) in fondo.</div></div>' +
      '<input type="file" accept="image/*" id="file-azienda" hidden data-campo="file-azienda" data-id="' + h(a.id) + '">' +
      '<div class="modulo"><button class="btn btn-rosso" data-az="azienda-elimina" data-id="' + h(a.id) + '">Elimina l\'azienda</button></div>';
  }
  html += '<div class="barra"><button class="az verde" data-az="azienda-salva" data-id="' + h(a ? a.id : '') + '">Salva</button></div>';
  return html;
}

function vistaDashboard(idAzienda) {
  const db = leggiTutto();
  const loc = leggiLocale();
  const oggi = oggiISO();
  const f = senzaAccenti(filtroCantieri);
  const base = idAzienda === 'senza' ? cantieriSenzaAzienda() : (idAzienda ? cantieriDiAzienda((azienda(idAzienda) || {}).codice) : valori(db.cantieri));
  const tutti = base.filter(function (c) {
    if (!f) return true;
    return senzaAccenti(c.nome + ' ' + c.committente + ' ' + c.codice + ' ' + (c.indirizzo || '')).indexOf(f) !== -1;
  });
  const attivi = tutti.filter(function (c) { return c.stato !== 'chiuso'; });
  const chiusi = tutti.filter(function (c) { return c.stato === 'chiuso'; });
  const daFare = [], fatti = [];
  attivi.forEach(function (c) { (sopralluogoDiOggi(c.codice) ? fatti : daFare).push(c); });
  const ordina = function (a, b) { return a.nome.localeCompare(b.nome); };
  daFare.sort(ordina); fatti.sort(ordina); chiusi.sort(ordina);

  const az = idAzienda && idAzienda !== 'senza' ? azienda(idAzienda) : null;
  const senza = idAzienda === 'senza';
  let html;
  if (az || senza) {
    html = testata({ indietro: '#/', titolo: az ? az.nome : 'Senza azienda', sotto: az ? h(az.ragione || '') : 'cantieri non ancora assegnati',
      destra: az ? '<button class="pill cod" data-az="vai" data-a="#/modifica-azienda/' + h(az.id) + '">scheda</button>' : '' });
  } else {
    html = testata({ titolo: 'CANTIERI', grande: true, idTitolo: 'titolo-app', sotto: h(GIORNI_SETT[new Date().getDay()] + ' ' + new Date().getDate() + ' ' + MESI[new Date().getMonth()]),
      destra: '<button class="pill ok" data-az="vai" data-a="#/nuovo-cantiere">＋ cantiere</button>' });
    // Chi ha scelto di saltare le aziende trova qui il modo di tornarci: piccolo, senza colore.
    if (aziendeTutte().length) html += '<button class="link blocco" data-az="vai" data-a="#/aziende" style="text-align:left"><span class="ico ico-edificio"></span> Aziende</button>';
  }
  html += '<div class="cerca"><span class="ico ico-lente"></span> <input type="search" placeholder="Cerca cantiere, committente, indirizzo" value="' + h(filtroCantieri) + '" data-campo="filtro-cantieri" autocomplete="off"></div>';

  if (SPAZIO.avviso) html += '<div class="avviso">Spazio quasi pieno: scarica audio e foto vecchi. <button class="link" data-az="vai" data-a="#/dev" style="min-height:auto">Apri</button></div>';
  if (!navigator.onLine) html += '<div class="avviso">Manca la rete: si registra e si salva lo stesso, la trascrizione parte quando torna.</div>';
  html += cardSettimana();
  const lavoriFalliti = loc.coda.filter(function (l) { return l.stato === 'fallito'; }).length;
  if (lavoriFalliti) html += '<div class="avviso rosso">' + lavoriFalliti + (lavoriFalliti === 1 ? ' lavoro non riuscito' : ' lavori non riusciti') + ': guarda la coda nel modo sviluppatore.</div>';

  function cardCantiere(c) {
    const sop = sopralluogoDiOggi(c.codice);
    const ultimi = sopralluoghiDi(c.codice);
    let stato, mini;
    if (sop) {
      stato = '<span class="pill ok">✓ ' + h(sop.ora) + '</span>';
      mini = sop.pezzi.length + ' audio · ' + sezioniPiene(sop.sezioni).length + ' sezioni';
    } else {
      stato = c.stato === 'chiuso' ? '<span class="pill grigia">chiuso</span>' : '<span class="pill att">da fare</span>';
      mini = ultimi.length ? 'ultimo: ' + (ultimi[0].giorno === oggi ? 'oggi' : nomeGiornoRelativo(ultimi[0].giorno).toLowerCase() + (Date.now() - daISO(ultimi[0].giorno).getTime() > 6 * 86400000 ? ' ' + dataSenzaAnno(ultimi[0].giorno) : '')) : 'nessun sopralluogo';
    }
    /* Due righe invece di tre: il nome con lo stato in fondo alla sua riga,
       e sotto tutto il resto in una frase sola. A destra non resta vuoto. */
    // I tre puntini in fondo alla riga del titolo; la voce Elimina scende sotto, nella card.
    return '<div class="card tocca" data-az="vai" data-a="#/cantiere/' + h(c.id) + '"><div class="card-in cant">' +
      '<p class="titolo">' + h(c.nome) + '</p>' + stato + tastoPunti('cantiere-' + c.id) +
      '<div class="sotto">' + [h(c.committente), c.indirizzo ? h(c.indirizzo) : '', h(mini)].filter(Boolean).join(' · ') + '</div>' +
      '</div>' + vociPunti('cantiere-' + c.id, 'cantiere-elimina', 'data-id="' + h(c.id) + '"') + '</div>';
  }
  /* Sotto la ricerca, una riga sola: il cantiere nuovo si prende tre quarti,
     la ricerca nei documenti l'ultimo quarto. */
  html += '<div class="duetasti">' +
    (az ? '<button class="btn piucantiere" data-az="vai" data-a="#/nuovo-cantiere/' + h(az.id) + '">＋ Nuovo cantiere</button>'
        : '<button class="btn piucantiere" data-az="vai" data-a="#/nuovo-cantiere">＋ Nuovo cantiere</button>') +
    '<button class="btn cercadoc" data-az="vai" data-a="#/cerca"><span class="ico ico-lente"></span> documenti</button>' +
    '</div>';
  if (!attivi.length && !chiusi.length) {
    html += '<div class="vuoto-stato">' + (f ? 'Nessun cantiere trovato.' : 'Nessun cantiere. Tocca “＋ cantiere” per aprirne uno.') + '</div>';
  }
  if (daFare.length) html += '<div class="eti">Da fare oggi <span class="n">' + daFare.length + '</span></div>' + daFare.map(cardCantiere).join('');
  if (fatti.length) html += '<div class="eti">Già fatti <span class="n">' + fatti.length + '</span></div>' + fatti.map(cardCantiere).join('');
  if (chiusi.length) html += tendina('chiusi', 'Cantieri chiusi (' + chiusi.length + ')', chiusi.map(cardCantiere).join(''));
  if (!REG.attiva) html += '<div class="barra"><button class="az verde" data-az="parla-dashboard"><span class="ico ico-microfono"></span> Detta un sopralluogo</button></div>';
  return html;
}

/* ---------------- CANTIERE: i giorni ---------------- */
function vistaCantiere(id) {
  const c = cantiere(id);
  if (!c) return vistaDashboard();
  const loc = leggiLocale();
  loc.ultimoCantiere = c.id; salvaLocale();
  const sops = sopralluoghiDi(c.codice);
  const nVerbali = sops.filter(function (s) { return s.chiuso; }).length;
  const cont = contabilitaDi(c.codice);
  const totale = totaleContabilita(cont);
  const oggi = oggiISO();
  /* Committente e indirizzo stanno su una riga sola sotto il titolo:
     erano due righe corte incolonnate a sinistra con mezzo schermo vuoto a destra. */
  let html = testata({ indietro: '#/', titolo: c.nome,
    sotto: h(c.committente) + (c.indirizzo ? ' · ' + h(c.indirizzo) : ''),
    destra: '<button class="pill ' + (c.stato === 'chiuso' ? 'grigia' : 'cod') + '" data-az="vai" data-a="#/modifica-cantiere/' + h(c.id) + '">' + (c.stato === 'chiuso' ? 'chiuso' : 'modifica') + '</button>' });
  // "giorni" conta le giornate, non i passaggi: tre sopralluoghi in un giorno sono un giorno.
  html += '<div class="numeri"><div class="n"><div class="v">' + giornateDi(c.codice).length + '</div><div class="k">giorni</div></div>' +
    '<div class="n"><div class="v">' + nVerbali + '</div><div class="k">verbali</div></div>' +
    '<div class="n"><div class="v fatto">' + h(compatto(totale)) + '</div><div class="k">contabilità €</div></div></div>';
  // Un cantiere chiuso ha la sua relazione in testa, prima dei giorni: è la cosa che si va a leggere.
  const rel = c.stato === 'chiuso' ? relazioneDi(c.codice) : null;
  if (c.stato === 'chiuso') {
    if (rel) {
      // La card si tocca per leggere la relazione; i tre tasti sotto fanno il resto.
      const pdfRel = pdfConChiave('relazione:' + rel.codice);
      html += '<div class="card tocca" data-az="vai" data-a="#/relazione/' + h(rel.id) + '"><div class="card-in"><p class="titolo">Relazione di fine cantiere</p><div class="sotto">chiuso il ' + h(dataEstesa(rel.chiusura)) + '</div>' +
        '<div class="fila"><span class="pill ok">chiuso</span><span class="mini">' + rel.giorni.length + (rel.giorni.length === 1 ? ' giorno · ' : ' giorni · ') + h(euro(rel.numeri.totale)) + '</span></div></div>' +
        '<div class="griglia tre">' +
        '<button class="btn" data-az="vai" data-a="' + (pdfRel ? '#/leggi/' + h(pdfRel.id) : '#/relazione/' + h(rel.id)) + '">Visualizza</button>' +
        tastoEsporta('rel-' + rel.id) +
        '<button class="btn" data-az="vai" data-a="#/modifica-relazione/' + h(rel.id) + '">Correggi</button></div>' + vociEsporta('rel-' + rel.id, 'esporta-pdf-relazione', rel.id, 'relazione-scarica', rel.id) + '</div>';
    }
    else html += '<div class="card tocca piu" data-az="relazione-genera" data-id="' + h(c.id) + '"><div class="card-in"><p class="titolo">＋ Scrivi la relazione di fine cantiere</p><div class="sotto">il riepilogo di tutti i giorni, con i conti</div></div></div>';
  }
  if (!sops.some(function (s) { return s.giorno === oggi; }) && c.stato !== 'chiuso') {
    html += '<div class="card tocca piu" data-az="nuovo-sopralluogo" data-id="' + h(c.id) + '"><div class="card-in"><p class="titolo">＋ Sopralluogo di oggi</p><div class="sotto">' + h(dataEstesa(oggi)) + '</div></div></div>';
  }
  /* Rilievi e bolle si prendono pensando al cantiere, non alla giornata: qui il tasto sta
     in chiaro, e quello che si detta o si scansiona finisce nel giorno di oggi. */
  /* Due piani. Quello del cantiere raccoglie i rilievi e i documenti che valgono
     per tutto il lavoro: quelli presi da qui nascono già così, quelli di una
     giornata ci arrivano quando li porti dentro tu. Il piano della giornata resta
     nella giornata. */
  /* Del cantiere: quello che vale per tutto il lavoro, non per una giornata sola.
     I rilievi in un blocco e le scansioni sotto: la categoria con cui sono stati
     presi non conta più, una volta che sono qui. */
  // Un rilievo appena dettato da qui si fa vedere qui, prima del resto.
  html += cardRilieviNuovi({ cantiere: c.codice });
  const rilCant = String(c.rilievi || '').trim();
  const docCant = documentiDelCantiere(c.codice);
  if (rilCant || docCant.length) {
    html += '<div class="card"><div class="card-capo">Del cantiere' +
      (rilCant ? '<button class="dx" data-az="rilievo-cantiere-svuota" data-id="' + h(c.id) + '">svuota i rilievi</button>' : '') + '</div>' +
      (rilCant ? '<div class="card-corpo">' + testoElenco(c.rilievi, true) + '</div>' : '');
    docCant.forEach(function (v) {
      html += '<button class="riga" data-az="vai" data-a="#/foto/' + h(v.sop.id) + '/' + h(v.f.id) + '">' +
        '<span class="desc">' + h(GENERI[v.f.genere] || 'Documento') + '<small>' + h(dataSenzaAnno(v.f.giorno)) + ', ' + h(oraCorta(v.f.ora)) + (v.f.formato === 'pdf' ? ' · ' + h(paginePdf(v.f)) : '') + '</small></span>' +
        '<span class="frec">›</span></button>';
    });
    html += '</div>';
  }
  if (c.stato !== 'chiuso') {
    html += '<div class="card"><div class="griglia">' +
      '<button class="btn" data-az="detta-rilievo" data-cantiere="' + h(c.id) + '" data-sezione="rilievi_ordine"><span class="ico ico-righello"></span> Rilievo d\'ordine</button>' +
      '<button class="btn" data-az="detta-rilievo" data-cantiere="' + h(c.id) + '" data-sezione="rilievi_contabilita"><span class="ico ico-calcolatrice"></span> Rilievo da contabilità</button>' +
      '<button class="btn" data-az="doc-scansiona" data-cantiere="' + h(c.id) + '" data-genere="bolla"><span class="ico ico-documento"></span> Bolla</button>' +
      '</div></div>' + ingressiDocumento(null);
  }

  /* I verbali di giornata in prima linea: sono i documenti che si vanno a cercare,
     e stanno prima dei giorni perché sono quelli che si mandano fuori. */
  html += strisciaVerbaliGiornata(c);
  /* Le giornate, dalla più recente, raggruppate per mese. Una riga per data: i
     passaggi di un giorno stanno dentro la giornata, non nell'elenco — se no
     "Oggi" compariva tre volte. La riga si apre sul primo passaggio del giorno,
     che ha già la striscia con gli altri. */
  let meseCorrente = null;
  giornateDi(c.codice).forEach(function (g) {
    const mese = g.giorno.slice(0, 7);
    if (mese !== meseCorrente) {
      if (meseCorrente) html += '</div>';
      /* Niente più intestazione del mese: la data sta già davanti a ogni riga.
         Fra un mese e l'altro basta una riga di stacco. */
      html += '<div class="card mese">';
      meseCorrente = mese;
    }
    // Una sezione piena in un passaggio qualsiasi conta una volta sola per la giornata.
    const piene = CHIAVI_SEZIONI.filter(function (k) { return g.sops.some(function (s) { return String(s.sezioni[k] || '').trim(); }); }).length;
    const audio = g.sops.reduce(function (t, s) { return t + s.pezzi.length; }, 0);
    const anteprima = g.sops.map(function (s) {
      return CHIAVI_SEZIONI.map(function (k) { return primaRiga(s.sezioni[k]); }).filter(Boolean)[0] || (s.sezioni.da_smistare ? primaRiga(s.sezioni.da_smistare) : '');
    }).filter(Boolean)[0] || (audio ? 'trascrizione in arrivo…' : 'ancora niente');
    let pill;
    if (g.verbale) pill = '<span class="pill ok">' + h(g.verbale.nome || 'verbale di giornata') + '</span>';
    else if (g.giorno === oggi) pill = '<span class="pill att">in corso</span>';
    else pill = '<span class="pill att">da chiudere</span>';
    /* Una giornata senza sopralluoghi si apre sulla sua schermata vuota. La riga è un
       div e non un bottone, così i tre puntini possono starci dentro. */
    const apre = g.sops.length ? '#/giorno/' + g.sops[0].id : '#/giornata/' + giornataDi(c.codice, g.giorno).id;
    const chiavePunti = 'giornata-' + c.codice + '-' + g.giorno;
    html += '<div class="giorno' + (g.giorno === oggi && !g.verbale ? ' oggi' : '') + '" data-az="vai" data-a="' + h(apre) + '">' +
      '<div class="n"><div class="titolo"><span class="gm">' + h(giornoMese(g.giorno)) + '</span> ' + h(nomeGiornoRelativo(g.giorno)) + ' · ' + g.sops.length + (g.sops.length === 1 ? ' sopralluogo' : ' sopralluoghi') + '</div>' +
      '<div class="prima">' + h(anteprima) + '</div>' +
      '<div class="stat">' + pill + '<span class="mini">' + piene + '/' + CHIAVI_SEZIONI.length + ' sezioni · ' + audio + ' audio</span>' + tastoPunti(chiavePunti) + '</div></div></div>' +
      vociPunti(chiavePunti, 'giornata-elimina', 'data-cantiere="' + h(c.id) + '" data-giorno="' + h(g.giorno) + '"');
  });
  if (meseCorrente) html += '</div>';
  if (!sops.length) html += '<div class="vuoto-stato">' + (c.stato === 'chiuso' ? 'Nessun sopralluogo in questo cantiere.' : 'Nessun sopralluogo ancora. Premi il bottone verde e parla.') + '</div>';
  html += tendina('voci-' + c.id, 'Contabilità · Note · Listino',
    '<div class="card">' +
    '<button class="riga" data-az="vai" data-a="#/contabilita/' + h(c.id) + '"><span class="desc">Contabilità<small>' + (cont ? cont.righe.length + ' righe · ' + h(euro(totale)) : 'ancora vuota') + '</small></span><span class="frec">›</span></button>' +
    '<button class="riga" data-az="vai" data-a="#/note/' + h(c.id) + '"><span class="desc">Note del cantiere<small>' + h(primaRiga(c.note) || 'nessuna nota') + '</small></span><span class="frec">›</span></button>' +
    '<button class="riga" data-az="vai" data-a="#/listino/' + h(c.id) + '"><span class="desc">Listino prezzi<small>' + listinoTutto().length + ' voci</small></span><span class="frec">›</span></button>' +
    '<button class="riga" data-az="vai" data-a="#/pdf/' + h(c.id) + '"><span class="desc">PDF archiviati<small>' + (pdfDi(c.codice).length ? pdfDi(c.codice).length + ' documenti · ' + h(pesoFile(pdfDi(c.codice).reduce(function (t, p) { return t + (p.peso || 0); }, 0))) : 'ancora nessuno') + '</small></span><span class="frec">›</span></button>' +
    '</div>');
  // In fondo, come nel giorno: l'azione grande a sinistra, "Chiudi" stretto a destra. Chiuso, al posto di Detta c'è la relazione, e Riapri.
  if (!REG.attiva) {
    if (c.stato === 'chiuso') {
      html += '<div class="barra">' + (rel ? '<button class="az verde" data-az="vai" data-a="#/relazione/' + h(rel.id) + '">Apri la relazione</button>' : '<button class="az verde" data-az="relazione-genera" data-id="' + h(c.id) + '">Scrivi la relazione</button>') +
        '<button class="az stretta" data-az="riapri-cantiere" data-id="' + h(c.id) + '">Riapri</button></div>';
    } else {
      html += '<div class="barra"><button class="az verde" data-az="parla-cantiere" data-id="' + h(c.id) + '"><span class="ico ico-microfono"></span> Detta un sopralluogo</button>' +
        '<button class="az stretta" data-az="chiudi-cantiere" data-id="' + h(c.id) + '">Chiudi</button></div>';
    }
  }
  return html;
}

function creaSopralluogo(c, giorno, ora) {
  assicuraGiornata(c.codice, giorno || oggiISO());
  return salva('sopralluogo', {
    cantiere: c.codice, giorno: giorno || oggiISO(), ora: ora || oraAdesso(), nome: '',
    sezioni: sezioniVuote(), pezzi: [], chiuso: null, media: [], posizione: null
  });
}
/* Dove va a finire quello che si detta adesso. In una giornata i sopralluoghi possono
   essere più d'uno: si scrive sull'ultimo rimasto aperto. Se sono tutti chiusi, o non ce
   n'è ancora nessuno, ne nasce uno con l'ora di adesso. La scelta vera, quando serve,
   arriva dopo: a testo trascritto, non prima di premere. */
function sopralluogoPerDettare(c) {
  const aperti = sopralluoghiApertiOggi(c.codice);
  return aperti.length ? aperti[aperti.length - 1] : creaSopralluogo(c);
}

/* Il giorno cambia allo scattare della mezzanotte. Non si apre niente da solo: un
   sopralluogo nasce quando si detta, e basta. Quelli di ieri rimasti aperti restano
   lì da chiudere, e non si mettono in mezzo al lavoro di oggi. */
let GIORNO_APP = oggiISO();
function controllaCambioGiorno() {
  const oggi = oggiISO();
  if (oggi === GIORNO_APP) return;
  GIORNO_APP = oggi;
  aggiornaVista();
}

/* ---------------- IL GIORNO ---------------- */
function vistaGiorno(id) {
  const s = sopralluogo(id);
  if (!s) return vistaDashboard();
  const c = cantierePerCodice(s.cantiere) || { nome: '?', id: '' };
  // Aprire un giorno vale come aprire il suo cantiere: è quello su cui "Detta" della dashboard andrà.
  if (c.id) { const loc = leggiLocale(); if (loc.ultimoCantiere !== c.id) { loc.ultimoCantiere = c.id; salvaLocale(); } }
  // Una vista sola: fatto il verbale, la giornata resta quella che era e si continua a lavorarci.
  return vistaGiornoInCorso(s, c);
}

/* La giornata senza sopralluoghi: la stessa testa della giornata piena, e sotto solo
   la striscia con "＋ un altro". Se intanto un sopralluogo c'è, si va su quello. */
function vistaGiornata(id) {
  const g = leggiTutto().giornate[id];
  if (!g) return vistaDashboard();
  const sops = sopralluoghiDelGiorno(g.cantiere, g.giorno);
  if (sops.length) return vistaGiorno(sops[0].id);
  const c = cantierePerCodice(g.cantiere) || { nome: '?', id: '' };
  const vg = verbaleDiGiornata(g.cantiere, g.giorno);
  let html = testata({ indietro: '#/cantiere/' + c.id, titolo: dataBreve(g.giorno), sotto: h(c.nome),
    destra: '<span class="pill att">vuota</span>' });
  html += '<div class="avanz"><div class="r">' +
    (vg
      ? '<button class="pill ok" data-az="vai" data-a="#/verbale/' + h(vg.id) + '">' + h(titoloVerbale(vg, true)) + '</button>'
      : '<button class="pill ok" data-az="giornata-verbale" data-cantiere="' + h(g.cantiere) + '" data-giorno="' + h(g.giorno) + '">Scrivi il verbale di giornata</button>') +
    '<span class="dx">0 audio · 0:00 | 0 foto</span></div></div>';
  html += '<div class="card"><div class="card-capo">Sopralluoghi del giorno<span class="dx">nessuno</span></div><div class="doc-fila">' +
    '<div class="doc-mini piu"><button class="q vuota" data-az="giornata-sopralluogo-nuovo" data-cantiere="' + h(g.cantiere) + '" data-giorno="' + h(g.giorno) + '"><span class="ora">＋</span><span class="nm">sopralluogo</span></button></div>' +
    '</div></div>';
  return html;
}

function vistaGiornoInCorso(s, c) {
  const parlato = s.pezzi.reduce(function (t, p) { return t + (p.durata || 0); }, 0);
  const registrandoQui = REG.attiva && REG.destinazione && ((REG.destinazione.tipo === 'sopralluogo' && REG.destinazione.id === s.id) ||
    (REG.destinazione.tipo === 'rilievo' && REG.destinazione.sop === s.id));
  const quanteFoto = fotoNormali(s).length;
  let html = testata({ indietro: '#/cantiere/' + c.id, titolo: dataBreve(s.giorno), sotto: h(c.nome) + (sopralluoghiDelGiorno(s.cantiere, s.giorno).length > 1 ? ' · ' + h(oraCorta(s.ora)) : ''), tocca: 'modifica-testata', id: s.id,
    destra: registrandoQui ? '<span class="pill reg">● rec</span>' :
      (s.chiuso ? '<span class="pill ok">verbale fatto</span>' : '<span class="pill att">' + (s.giorno < oggiISO() ? 'da chiudere' : 'in corso') + '</span>') });
  /* Una riga sola in testa: a sinistra il verbale di giornata — mette insieme i passaggi
     in un documento solo, quello che si manda fuori, e si scrive sempre: chi non ha
     ancora il verbale entra con i suoi appunti — a destra audio, parlato e foto. */
  const vg = verbaleDiGiornata(s.cantiere, s.giorno);
  html += '<div class="avanz"><div class="r">' +
    (vg
      ? '<button class="pill ok" data-az="vai" data-a="#/verbale/' + h(vg.id) + '">' + h(titoloVerbale(vg, true)) + '</button>' +
        '<button class="pill cod" data-az="giornata-verbale" data-cantiere="' + h(s.cantiere) + '" data-giorno="' + h(s.giorno) + '">Aggiorna</button>'
      : '<button class="pill ok" data-az="giornata-verbale" data-cantiere="' + h(s.cantiere) + '" data-giorno="' + h(s.giorno) + '">Scrivi il verbale di giornata</button>') +
    '<span class="dx">' + (registrandoQui ? 'sto ascoltando…' : (s.pezzi.length + ' audio · ' + durataBreve(parlato) + ' | ' + quanteFoto + ' foto')) + '</span></div></div>';

  /* Il verbale è fatto, ma la giornata resta quella che era: si cambia quello che si vuole
     e ogni correzione passa da sola nel verbale. Da qui si esce col PDF o si va a correggere il verbale. */
  if (s.chiuso) {
    const vb = verbaleDiSopralluogo(s.codice);
    /* Visualizza c'è sempre, e sta per primo: è il tasto che si preme di più.
       Se il PDF esiste apre quello, se no apre il verbale. */
    // Siamo già nel giorno: il nome dato a mano, se no "Verbale", con l'ora quando i passaggi sono più d'uno.
    html += '<div class="card"><div class="card-capo">' + h(vb && vb.nome ? vb.nome : 'Verbale' + (sopralluoghiDelGiorno(s.cantiere, s.giorno).length > 1 ? ' delle ' + oraCorta(s.ora) : '')) + '<span class="dx">fatto alle ' + h(oraDaISO(s.chiuso)) + '</span></div>' +
      '<div class="griglia tre">' +
      (vb ? '<button class="btn" data-az="verbale-vedi" data-id="' + h(vb.id) + '">Visualizza</button>' : '') +
      (vb ? tastoEsporta('vb-' + vb.id) : '<button class="btn" data-az="esporta-pdf" data-id="' + h(s.id) + '">Esporta</button>') +
      (vb ? '<button class="btn" data-az="vai" data-a="#/verbale/' + h(vb.id) + '">Correggi</button>' : '') + '</div>' + (vb ? vociEsporta('vb-' + vb.id, 'esporta-pdf', s.id, 'verbale-scarica', vb.id) : '') + '</div>';
  }

  if (String(s.sezioni.da_smistare || '').trim()) {
    html += '<div class="card gialla"><div class="card-capo gialla">Da smistare</div>' +
      '<textarea class="corpo" data-campo="sezione" data-id="' + h(s.id) + '" data-sezione="da_smistare">' + h(s.sezioni.da_smistare) + '</textarea>' +
      '<div class="card-piede">Manda questo testo in una sezione:</div><div class="griglia">' +
      SEZIONI.map(function (z) { return '<button class="btn" data-az="smista" data-id="' + h(s.id) + '" data-sezione="' + z.chiave + '">' + h(z.nome) + '</button>'; }).join('') +
      '</div></div>';
  }
  // La galleria della giornata sta sopra i sopralluoghi: da qui si spuntano le foto del verbale di giornata.
  html += cardFotoGiornata(s);
  /* I sopralluoghi della giornata, uno di fianco all'altro come le foto: si scorre
     di lato e si salta da un passaggio all'altro senza tornare al cantiere. */
  html += strisciaSopralluoghi(s);
  // Il rullino sta subito sotto i sopralluoghi, come ingresso; le foto si vedono già in alto.
  html += ingressiFoto(s);
  html += cardDaAssegnare(s);
  html += cardRilieviNuovi({ sop: s.id });
  html += cardFotoGiorno(s, !!s.chiuso);
  /* Rilievi e documenti stanno chiusi: sono lo strumento di un momento, non la cosa
     che si guarda entrando nella giornata. Il numero sulla linguetta dice se dentro
     c'è qualcosa, così non serve aprirla per saperlo. */
  const nStrumenti = righeSezione(s, 'rilievi_ordine') + righeSezione(s, 'rilievi_contabilita') + documentiDi(s).length;
  html += tendina('strumenti-' + s.id, 'Rilievi e documenti',
    cardStrumenti(s), nStrumenti || null) + ingressiDocumento(s);
  if (s.pezzi.length) {
    html += '<div class="card"><div class="card-capo">Audio di oggi<span class="dx">' + s.pezzi.length + ' · tocca per sentire</span></div>' +
      listaAudio(s, s.pezzi.slice().reverse()) + '</div>';
  }
  const fotoPer = fotoPerSezione(s);
  const vuote = [];
  SEZIONI.forEach(function (z) {
    const testo = s.sezioni[z.chiave] || '';
    const pezziQui = s.pezzi.filter(function (p) { return (p.sezioni || []).indexOf(z.chiave) !== -1 || p.sezione === z.chiave; });
    const fotoQui = fotoPer[z.chiave] || [];
    const card = '<div class="card" id="sez-' + z.chiave + '"><div class="card-capo' + (testo.trim() ? '' : ' spenta') + '">' + h(z.nome) + '</div>' +
      '<textarea class="corpo" data-campo="sezione" data-id="' + h(s.id) + '" data-sezione="' + z.chiave + '" placeholder="' + (z.elenco ? 'una voce per riga' : '—') + '">' + h(testo) + '</textarea>' +
      listaAudio(s, pezziQui, { dentroSezione: true, chiave: s.id + '-' + z.chiave }) + filaFoto(s, fotoQui, { segna: true }) + '</div>';
    // Una sezione con una foto dentro non è vuota: se finisse nella tendina, la foto sparirebbe.
    if (testo.trim() || fotoQui.length) html += card; else vuote.push(card);
  });
  if (vuote.length) html += tendina('vuote-' + s.id, vuote.length + (vuote.length === 1 ? ' sezione ancora vuota' : ' sezioni ancora vuote'), vuote.join(''));
  html += tendinaGrezzo(s);
  /* Solo dettare e fotografare. Il verbale si scrive dai puntini del sopralluogo,
     nella striscia in alto; una volta scritto, ogni correzione ci passa da sola. */
  if (!REG.attiva) {
    html += '<div class="barra"><button class="az verde" data-az="detta" data-id="' + h(s.id) + '"><span class="ico ico-microfono"></span> ' + (s.pezzi.length ? 'Continua' : 'Detta') + '</button>' +
      '<button class="az verde" data-az="foto-scatta" data-id="' + h(s.id) + '"><span class="ico ico-fotocamera"></span> Foto</button></div>';
  }
  return html;
}

/* I verbali di giornata del cantiere, uno di fianco all'altro. Stesse card, stessi
   tre puntini: Visualizza, Modifica, Esporta, Scarica. */
function strisciaVerbaliGiornata(c) {
  const lista = verbaliDiGiornata(c.codice);
  if (!lista.length) return '';
  return '<div class="card"><div class="card-capo">Verbali di giornata<span class="dx">' + lista.length + '</span></div>' +
    '<div class="doc-fila">' + lista.map(function (v) {
      const suoNome = String(v.nome || '').trim();
      const aperto = PUNTI_APERTI === v.id;
      return '<div class="doc-mini' + (aperto ? ' menu' : '') + '">' +
        '<div class="q">' +
        '<span class="ora">' + h(suoNome || 'Giornata ' + delGiorno(v.giorno)) + '</span>' +
        '<span class="nm">' + h(giornoMese(v.giorno)) + '</span></div>' +
        (aperto
          ? '<div class="voci">' + vociMenuVerbale(v) + '</div>'
          : '<button class="vedi" data-az="verbale-vedi" data-id="' + h(v.id) + '">Visualizza</button>') +
        '<button class="punti' + (aperto ? ' on' : '') + '" data-az="menu-verbale" data-id="' + h(v.id) + '" aria-label="Altro">⋯</button>' +
        '</div>';
    }).join('') + '</div></div>';
}

/* Il verbale di giornata mette insieme i verbali dei sopralluoghi di quel giorno.
   Sezione per sezione, con davanti l'ora del passaggio da cui viene il testo, così
   chi legge sa in che momento della giornata è successa ogni cosa. Si riscrive: è
   sempre lo stesso documento, con lo stesso codice. */
async function faiVerbaleGiornata(codiceCantiere, giorno) {
  const c = cantierePerCodice(codiceCantiere);
  if (!c) return;
  const sops = sopralluoghiDelGiorno(codiceCantiere, giorno);
  if (!sops.length) { avvisa('Nessun sopralluogo in questa giornata', 'att'); return; }
  // Senza verbale vuol dire senza verbale: non "non chiuso".
  const senza = sops.filter(function (x) { return !verbaleDiSopralluogo(x.codice); }).length;
  const gia = verbaleDiGiornata(codiceCantiere, giorno);
  // Una riga sola, e solo se serve: chi non ha il verbale entra con i suoi appunti.
  const testo = !senza ? '' : (senza === 1
    ? 'Un sopralluogo non ha ancora il suo verbale. I suoi appunti entrano lo stesso.'
    : senza + ' sopralluoghi non hanno ancora il loro verbale. I loro appunti entrano lo stesso.');
  const ok = await chiedi(gia ? 'Aggiornare il verbale di giornata?' : 'Scrivere il verbale di giornata?', testo, gia ? 'Aggiorna' : 'Scrivi', '',
    '<label class="eticampo">Nome del verbale</label><input class="campo" id="vg-nome" maxlength="80" placeholder="facoltativo" value="' + h(gia ? (gia.nome || '') : '') + '">');
  const campo = document.getElementById('vg-nome');
  const nomeScelto = campo ? campo.value.trim() : '';
  chiudiFoglio();
  if (!ok) return;
  const sezioni = {};
  CHIAVI_SEZIONI.forEach(function (k) { sezioni[k] = ''; });
  sops.forEach(function (x) {
    const vb = verbaleDiSopralluogo(x.codice);
    const fonte = vb ? vb.sezioni : x.sezioni;
    CHIAVI_SEZIONI.forEach(function (k) {
      const t = String(fonte[k] || '').trim();
      if (!t) return;
      sezioni[k] = aggiungiTesto(sezioni[k], 'Ore ' + x.ora + (String(x.nome || '').trim() ? ' · ' + x.nome : '') + '\n' + t);
    });
  });
  let v = gia;
  const campi = { cantiere: codiceCantiere, giorno: giorno, ora: sops[0].ora, giornata: true,
    sopralluoghi: sops.map(function (x) { return x.codice; }), nome: nomeScelto, sezioni: sezioni };
  if (v) { Object.assign(v, campi); v = salva('verbale', v); }
  else v = salva('verbale', campi);
  avvisa(gia ? 'Verbale di giornata aggiornato' : 'Verbale di giornata scritto', 'ok');
  aggiornaVista();
}

/* Le tre voci che compaiono dentro la card quando si toccano i puntini. */
function vociMenuVerbale(v) {
  return '<button class="voce-m" data-az="pdf-modifica" data-id="' + h(v.id) + '">Modifica</button>' +
    '<button class="voce-m" data-az="verbale-esporta" data-id="' + h(v.id) + '">Esporta</button>' +
    '<button class="voce-m" data-az="verbale-scarica" data-id="' + h(v.id) + '">Scarica</button>' +
    '<button class="voce-m rossa" data-az="verbale-elimina" data-id="' + h(v.id) + '">Elimina</button>';
}
/* Sul sopralluogo: prima del verbale si scrive o si modifica la giornata; dopo,
   le stesse voci del verbale. Elimina c'è sempre, e porta via anche il verbale. */
function vociMenuSopralluogo(x) {
  const vb = verbaleDiSopralluogo(x.codice);
  const elimina = '<button class="voce-m rossa" data-az="sopralluogo-elimina" data-id="' + h(x.id) + '">Elimina</button>';
  if (!vb) {
    return '<button class="voce-m" data-az="sopralluogo-chiudi" data-id="' + h(x.id) + '">Scrivi il verbale</button>' +
      '<button class="voce-m" data-az="vai" data-a="#/giorno/' + h(x.id) + '">Modifica</button>' + elimina;
  }
  return '<button class="voce-m" data-az="pdf-modifica" data-id="' + h(vb.id) + '">Modifica</button>' +
    '<button class="voce-m" data-az="verbale-esporta" data-id="' + h(vb.id) + '">Esporta</button>' +
    '<button class="voce-m" data-az="verbale-scarica" data-id="' + h(vb.id) + '">Scarica</button>' + elimina;
}

/* I tre puntini: le quattro cose che si fanno a un verbale senza aprirlo. */
function menuVerbale(idVerbale) {
  const v = verbale(idVerbale);
  if (!v) return;
  apriFoglio(
    '<h2>' + h(titoloVerbale(v, true)) + '</h2><p>' + h(dataBreve(v.giorno)) + (v.giornata ? ' · verbale di giornata' : ' · ore ' + h(v.ora)) + '</p>' +
    '<button class="btn btn-ok" data-az="pdf-modifica" data-id="' + h(v.id) + '">Modifica</button>' +
    '<button class="btn" data-az="verbale-esporta" data-id="' + h(v.id) + '">Esporta</button>' +
    '<button class="btn" data-az="verbale-scarica" data-id="' + h(v.id) + '">Scarica</button>' +
    '<button class="btn" data-az="chiudi-foglio">Chiudi</button>'
  );
}

/* Gli stessi tre puntini su un sopralluogo: portano al suo verbale, se c'è. */
/* I tre puntini del sopralluogo lavorano sul suo verbale: modificarlo,
   mandarlo fuori, salvarlo. Finché il verbale non c'è, l'unica cosa da fare
   è scriverlo, e il menu lo dice invece di mostrare tasti che non fanno niente. */
function menuSopralluogo(idSop) {
  const s = sopralluogo(idSop);
  if (!s) return;
  const vb = verbaleDiSopralluogo(s.codice);
  apriFoglio(
    '<h2>' + h(nomeSopralluogo(s)) + '</h2><p>' + h(dataBreve(s.giorno)) + ' · ore ' + h(s.ora) + '</p>' +
    (vb
      ? '<button class="btn btn-ok" data-az="pdf-modifica" data-id="' + h(vb.id) + '">Modifica</button>' +
        '<button class="btn" data-az="verbale-esporta" data-id="' + h(vb.id) + '">Esporta</button>' +
        '<button class="btn" data-az="verbale-scarica" data-id="' + h(vb.id) + '">Scarica</button>'
      : '<p style="color:var(--muted)">Il verbale non c\'è ancora.</p>' +
        '<button class="btn btn-ok" data-az="sopralluogo-chiudi" data-id="' + h(s.id) + '">Scrivi il verbale</button>') +
    '<button class="btn" data-az="chiudi-foglio">Chiudi</button>'
  );
}

/* Dare un nome al sopralluogo serve a nominarlo dettando: "questo va nel controllo
   del pomeriggio". Senza nome vale l'ora, e funziona lo stesso. Il posto normale
   per cambiarlo è il foglio della testata, insieme a data e ora; questa resta per
   chi ci arriva da un'altra strada. */
async function rinominaSopralluogo(idSop) {
  const s = sopralluogo(idSop);
  if (!s) return;
  const ok = await chiedi('Nome del sopralluogo', 'Serve a nominarlo quando detti: "questo va nel controllo del pomeriggio". Se lo lasci vuoto vale l\'ora.', 'Salva', '',
    '<input class="campo" id="sop-nome" maxlength="60" placeholder="controllo del pomeriggio" value="' + h(s.nome || '') + '">');
  const campo = document.getElementById('sop-nome');
  const nome = campo ? campo.value.trim() : '';
  chiudiFoglio();
  if (!ok) return;
  s.nome = nome;
  salva('sopralluogo', s);
  avvisa('Salvato', 'ok');
  aggiornaVista();
}

/* La striscia dei sopralluoghi del giorno. Ogni card ha l'ora e il nome, il tasto per
   aprirlo e i tre puntini con Visualizza, Modifica, Esporta e Scarica del suo verbale.
   In coda, il tasto per aprire un altro sopralluogo nello stesso giorno. */
function strisciaSopralluoghi(s) {
  const fratelli = sopralluoghiDelGiorno(s.cantiere, s.giorno);
  let html = '<div class="card"><div class="card-capo">Sopralluoghi del giorno<span class="dx">' + fratelli.length + (fratelli.length === 1 ? ' passaggio' : ' passaggi') + '</span></div>' +
    '<div class="doc-fila">';
  fratelli.forEach(function (x) {
    const vb = verbaleDiSopralluogo(x.codice);
    const qui = x.id === s.id;
    /* Il nome è il titolo, l'ora sta sotto: si cerca il sopralluogo per come lo
       si chiama, non per il minuto in cui è cominciato. Senza nome, il titolo
       è l'ora e sotto non c'è niente. */
    const suoNome = String(x.nome || '').trim();
    const aperto = PUNTI_APERTI === x.id;
    /* Il bordo azzurro dice "sei qui", e vale solo per un sopralluogo ancora
       aperto: su uno che ha già il verbale non c'è niente da segnare.
       Verde chi ha il verbale, grigio chi non ce l'ha: lo dice il verbale, non "chiuso". */
    html += '<div class="doc-mini' + (vb ? ' fatto' : ' spento') + (qui && !x.chiuso ? ' qui' : '') + (aperto ? ' menu' : '') + '">' +
      '<div class="q">' +
      '<span class="ora">' + h(suoNome || x.ora) + '</span>' +
      (suoNome ? '<span class="nm">' + h(x.ora) + '</span>' : '') + '</div>' +
      /* Visualizza apre il sopralluogo qui sotto. Su quello già aperto il tasto si chiama
         "Verbale di sopralluogo": apre il suo PDF se c'è, e se non è scritto chiede di scriverlo. */
      (aperto
        ? '<div class="voci">' + vociMenuSopralluogo(x) + '</div>'
        : (qui
          ? '<button class="vedi" data-az="sopralluogo-verbale" data-id="' + h(x.id) + '">Verbale di sopralluogo</button>'
          : '<button class="vedi" data-az="vai" data-a="#/giorno/' + h(x.id) + '">Visualizza</button>')) +
      '<button class="punti' + (aperto ? ' on' : '') + '" data-az="menu-sopralluogo" data-id="' + h(x.id) + '" aria-label="Altro">⋯</button>' +
      '</div>';
  });
  html += '<div class="doc-mini piu"><button class="q vuota" data-az="sopralluogo-nuovo" data-id="' + h(s.id) + '"><span class="ora">＋</span><span class="nm">un altro</span></button></div>';
  // Il verbale di giornata sta nella riga in testa alla giornata, non qui.
  return html + '</div></div>';
}

/* Le registrazioni che aspettano di sapere dove vanno. Finché sono qui il loro testo
   non è entrato in nessuna sezione: si tocca il sopralluogo giusto e ci va. */
function cardDaAssegnare(s) {
  const attesa = s.pezzi.filter(function (p) { return p.daAssegnare; });
  if (!attesa.length) return '';
  const aperti = sopralluoghiApertiOggi(s.cantiere);
  return '<div class="card gialla"><div class="card-capo gialla">' + attesa.length + (attesa.length === 1 ? ' registrazione da assegnare' : ' registrazioni da assegnare') + '</div>' +
    attesa.map(function (p) {
      let scelte = '<div class="griglia">';
      const visti = {};
      scelte += '<button class="btn btn-ok" data-az="assegna-pezzo" data-sop="' + h(s.id) + '" data-pezzo="' + h(p.id) + '" data-dest="' + h(s.id) + '">In questo (' + h(s.ora) + ')</button>';
      visti[s.id] = true;
      aperti.forEach(function (x) {
        if (visti[x.id]) return;
        visti[x.id] = true;
        scelte += '<button class="btn" data-az="assegna-pezzo" data-sop="' + h(s.id) + '" data-pezzo="' + h(p.id) + '" data-dest="' + h(x.id) + '">' + h(nomeSopralluogo(x)) + '</button>';
      });
      scelte += '<button class="btn" data-az="assegna-pezzo" data-sop="' + h(s.id) + '" data-pezzo="' + h(p.id) + '" data-dest="nuovo">Un sopralluogo nuovo</button></div>';
      return '<div class="card-capo spenta">' + h(p.titolo || ('Registrazione delle ' + p.ora)) + '<span class="dx">' + h(p.ora) + '</span></div>' +
        '<div class="card-corpo" style="color:var(--text-2)">' + h(p.grezzo || '') + '</div>' + scelte;
    }).join('') + '</div>';
}

/* Lo scanner del telefono: si fotografa una bolla di consegna o il modulo firme degli
   operai e resta allegato alla giornata. La fotocamera si apre già sul retro; dal rullino
   si prende una scansione fatta prima. Sono documenti, non foto: ci vanno nel PDF sempre. */
function ingressiDocumento(s) {
  // Il giorno lo scrive il tasto quando si preme: da un cantiere il giorno di oggi
  // potrebbe non esserci ancora, e crearlo solo per disegnare la pagina sarebbe sbagliato.
  const id = s ? h(s.id) : '';
  /* Un ingresso solo, senza "capture": il telefono apre il suo menu con dentro
     la fotocamera e il rullino. Prima c'erano due tasti e una riga di testo per
     dire la stessa cosa. */
  /* Con anche i PDF fra i tipi accettati l'iPhone mette nel menu "Scansiona documenti":
     ritaglia il foglio, lo raddrizza, mette più pagine in un file. È del telefono. */
  return '<input type="file" accept="image/*,application/pdf" multiple id="file-doc-scatta" hidden data-campo="file-documento" data-id="' + id + '" data-origine="rullino">';
}

/* Un tasto di rilievo o di scansione può stare in una giornata o in un cantiere.
   Dal cantiere vale il giorno di oggi: se non c'è ancora, nasce adesso. */
/* Il tasto indietro della schermata sa dove tornare meglio della cronologia:
   se non c'è, si torna all'elenco delle aziende. */
function indietro() {
  const b = document.querySelector('#vista .top .indietro');
  if (b && b.dataset.a) { vai(b.dataset.a); return; }
  if (location.hash && location.hash !== '#/') vai('#/');
}

function giornoDelTasto(el) {
  if (el.dataset.cantiere) { const c = cantiere(el.dataset.cantiere); return c ? sopralluogoPerDettare(c) : null; }
  return sopralluogo(el.dataset.id);
}
function apriScanner(el, idIngresso) {
  const s = giornoDelTasto(el);
  const f = document.getElementById(idIngresso);
  if (!s || !f) return;
  DOC_GENERE = el.dataset.genere;
  /* Un documento preso dalla schermata del cantiere nasce già come documento
     del cantiere: vale per tutto il lavoro, non solo per la giornata di oggi. */
  DOC_PER_CANTIERE = !!el.dataset.cantiere;
  f.dataset.id = s.id;
  f.click();
}

function righeSezione(s, k) { const t = String(s.sezioni[k] || '').trim(); return t ? righeElenco(t).length : 0; }

/* I quattro tasti su una fila sola che scorre: rilievi e documenti si prendono
   con lo stesso gesto e finiscono tutti nella giornata, quindi stanno insieme.
   Sotto, le scansioni già prese. */
function cardStrumenti(s) {
  const doc = documentiDi(s);
  const nOrd = righeSezione(s, 'rilievi_ordine'), nCont = righeSezione(s, 'rilievi_contabilita');
  const n = function (q) { return q ? ' · ' + q : ''; };
  let html = '<div class="card">' +
    (doc.length ? filaFoto(s, doc, { doc: true }) : '') +
    '<div class="griglia">' +
    (REG.attiva ? '' :
      '<button class="btn" data-az="detta-rilievo" data-id="' + h(s.id) + '" data-sezione="rilievi_ordine"><span class="ico ico-righello"></span> Rilievo d\'ordine' + n(nOrd) + '</button>' +
      '<button class="btn" data-az="detta-rilievo" data-id="' + h(s.id) + '" data-sezione="rilievi_contabilita"><span class="ico ico-calcolatrice"></span> Rilievo da contabilità' + n(nCont) + '</button>') +
    '<button class="btn" data-az="doc-scansiona" data-id="' + h(s.id) + '" data-genere="bolla"><span class="ico ico-documento"></span> Bolla' + n(doc.filter(function (f) { return f.genere === 'bolla'; }).length) + '</button>' +
    '</div>';
  const daPortare = (nOrd || nCont || doc.length);
  html += (daPortare ? '<div class="card-piede"><button class="link" style="margin-left:auto" data-az="al-cantiere" data-id="' + h(s.id) + '">porta nel cantiere</button></div>' : '') +
    '</div>';
  return html;
}


/* Tutte le foto della giornata in una fila sola, sopra i sopralluoghi. Sono le stesse
   foto dei passaggi, viste insieme: spunta ed elimina valgono da tutte e due le parti. */
function cardFotoGiornata(s) {
  const lista = [];
  sopralluoghiDelGiorno(s.cantiere, s.giorno).forEach(function (x) {
    fotoNormali(x).forEach(function (f) { lista.push({ sop: x, f: f }); });
  });
  if (!lista.length) return '';
  const nelPdf = lista.filter(function (x) { return x.f.nelPdf; }).length;
  return '<div class="card"><div class="card-capo">Foto della giornata<span class="dx">' + nelPdf + ' su ' + lista.length + ' nel PDF</span></div>' +
    filaFoto(s, lista, { segna: true }) + '</div>';
}

/* Le foto di questo sopralluogo, in una tendina chiusa: la galleria della giornata sta
   sopra e le mostra già tutte. Gli ingressi (fotocamera e rullino) stanno sotto la striscia. */
function cardFotoGiorno(s, conVerbale) {
  const foto = fotoNormali(s);
  const nelPdf = foto.filter(function (f) { return f.nelPdf; }).length;
  let html = '';
  if (foto.length) {
    const tutte = nelPdf === foto.length;
    // La spunta "nel PDF" c'è sempre: una foto marcata entra nel verbale di giornata anche se questo passaggio non ha il suo verbale.
    html += tendina('foto-' + s.id, 'Foto di questo sopralluogo',
      '<div class="card"><div class="card-capo">' + (conVerbale ? 'Foto del verbale' : 'Foto di oggi') + '<span class="dx">' + nelPdf + ' su ' + foto.length + ' nel PDF</span></div>' +
      filaFoto(s, foto, { segna: true }) +
      // Solo il tasto piccolo, a destra: il conteggio in testa dice già com'è messa.
      '<div class="card-piede dx"><button class="pill cod" data-az="foto-marca-tutte" data-id="' + h(s.id) + '">' + (tutte ? 'Smarca tutte' : 'Marca tutte') + '</button></div>' +
      '</div>', foto.length);
  }
  return html;
}

/* I due ingressi nascosti — la fotocamera (capture) e il rullino (senza) — più il
   link del rullino. Stanno nel giorno e anche nella schermata di una foto: dopo
   averne caricata una se ne carica un'altra da lì, senza tornare indietro. */
function ingressiFoto(s) {
  return '<input type="file" accept="image/*" capture="environment" id="file-foto-scatta" hidden data-campo="file-foto" data-id="' + h(s.id) + '" data-origine="scatto">' +
    '<input type="file" accept="image/*" multiple id="file-foto-rullino" hidden data-campo="file-foto" data-id="' + h(s.id) + '" data-origine="rullino">' +
    '<button class="link blocco" data-az="foto-rullino">＋ Foto dal rullino</button>';
}

// Il testo grezzo resta sempre sotto: è la prova di cosa è stato detto, anche dopo il riordino.
function tendinaGrezzo(s) {
  const grezzi = s.pezzi.filter(function (p) { return p.grezzo; });
  if (!grezzi.length) return '';
  return tendina('grezzo-' + s.id, 'Dettatura originale',
    '<div class="card">' + grezzi.map(function (p) {
      return '<div class="card-capo spenta">' + h(p.titolo || 'Registrazione delle ' + p.ora) + '<span class="dx">' + h(p.ora) + '</span></div><div class="card-corpo" style="color:var(--text-2)">' + h(p.grezzo) + '</div>';
    }).join('') + '</div>');
}

/* Chiudere la giornata vuol dire scrivere il verbale, e basta: la giornata non si blocca.
   Si continua a cambiarla, e ogni correzione passa da sola nel verbale. Il verbale è
   sempre lo stesso documento, con lo stesso codice: si riscrive, non se ne fa un altro. */
async function chiudiGiornata(sopId) {
  const s = sopralluogo(sopId);
  if (!s) return;
  if (REG.attiva) { avvisa('Ferma prima la registrazione', 'att'); return; }
  const inCoda = leggiLocale().coda.some(function (l) { return l.sop === s.id && l.stato !== 'fallito'; });
  const giaFatto = verbaleDiSopralluogo(s.codice);
  let testo = giaFatto
    ? 'Il verbale si rifà con quello che hai cambiato. Le correzioni fatte a mano sul verbale si perdono. La giornata resta modificabile.'
    : 'Si scrive il verbale della giornata. La giornata resta modificabile: se cambi qualcosa, il verbale si aggiorna da solo.';
  if (inCoda) testo = 'Una registrazione è ancora in coda: il suo testo non entrerà nel verbale. ' + testo;
  if (String(s.sezioni.da_smistare || '').trim()) testo = 'C\'è del testo da smistare: finirà nelle Note. ' + testo;
  const ok = await chiedi(giaFatto ? 'Aggiornare il verbale?' : 'Scrivere il verbale?', testo, giaFatto ? 'Aggiorna il verbale' : 'Scrivi il verbale', '',
    '<label class="eticampo">Nome del verbale</label><input class="campo" id="v-nome" maxlength="80" placeholder="facoltativo" value="' + h(giaFatto ? (giaFatto.nome || '') : '') + '">');
  // Il campo si legge prima di chiudere il foglio: dopo non c'è più.
  const campoNome = document.getElementById('v-nome');
  const nomeScelto = campoNome ? campoNome.value.trim() : '';
  chiudiFoglio();
  if (!ok) return;
  const sezioni = {};
  CHIAVI_SEZIONI.forEach(function (k) { sezioni[k] = s.sezioni[k] || ''; });
  if (String(s.sezioni.da_smistare || '').trim()) sezioni.note = aggiungiTesto(sezioni.note, s.sezioni.da_smistare);
  let v = giaFatto;
  if (v) { v.sezioni = sezioni; v.giorno = s.giorno; v.ora = s.ora; v.nome = nomeScelto; v = salva('verbale', v); }
  else v = salva('verbale', { sopralluogo: s.codice, cantiere: s.cantiere, giorno: s.giorno, ora: s.ora, nome: nomeScelto, sezioni: sezioni });
  /* I rilievi della giornata salgono da soli nei rilievi complessivi del
     cantiere: sono misure del lavoro, non della giornata. Si portano una volta
     sola, alla prima chiusura: se il verbale si rifà non si raddoppiano. */
  if (!s.rilieviPortati) {
    const cc = cantierePerCodice(s.cantiere);
    if (cc) {
      let raccolta = '';
      ['rilievi_ordine', 'rilievi_contabilita'].forEach(function (k) {
        const t = String(s.sezioni[k] || '').trim();
        if (t) raccolta = aggiungiTesto(raccolta, t);
      });
      if (raccolta) { cc.rilievi = aggiungiTesto(cc.rilievi || '', raccolta); salva('cantiere', cc); s.rilieviPortati = true; }
    }
  }
  // "chiuso" adesso vuol dire "verbale scritto, l'ultima volta a quest'ora".
  s.chiuso = adessoISO();
  s.verbale = v.codice;
  salva('sopralluogo', s);
  avvisa(giaFatto ? 'Verbale aggiornato' : 'Verbale scritto', 'ok');
  aggiornaVista();
}

/* ---------------- VERBALE: modifica ---------------- */
function vistaVerbaleModifica(id) {
  const v = verbale(id);
  if (!v) return vistaDashboard();
  const s = valori(leggiTutto().sopralluoghi).find(function (x) { return x.codice === v.sopralluogo; });
  const c = cantierePerCodice(v.cantiere) || { nome: '?', id: '' };
  const indietro = v.giornata ? ('#/cantiere/' + (cantiere(c.id) ? c.id : '')) : (s ? '#/giorno/' + s.id : '#/');
  let html = testata({ indietro: indietro || '#/', titolo: 'Modifica ' + (v.nome ? v.nome : (v.giornata ? 'giornata' : 'verbale')), sotto: h(c.nome) + ' · ' + h(dataBreve(v.giorno)) + (v.giornata ? '' : ' · ' + h(v.ora)),
    destra: '<span class="pill ok">' + (v.giornata ? 'giornata' : 'verbale') + '</span>' });
  html += '<div class="avviso" style="background:var(--surface);border-color:var(--line);color:var(--muted)">' +
    (v.giornata
      ? 'È il verbale di tutta la giornata: mette insieme i ' + ((v.sopralluoghi || []).length || 'vari') + ' sopralluoghi di quel giorno. Se lo rifai da capo, le correzioni fatte qui si perdono.'
      : 'Correggere il verbale non tocca il sopralluogo: la dettatura originale resta com\'era.') + '</div>';
  html += '<div class="card"><div class="card-capo">Nome del verbale</div>' +
    '<input class="campo" data-campo="nome-verbale" data-id="' + h(v.id) + '" maxlength="80" placeholder="facoltativo" value="' + h(v.nome || '') + '"></div>';
  SEZIONI.forEach(function (z) {
    const testo = v.sezioni[z.chiave] || '';
    html += '<div class="card"><div class="card-capo' + (testo.trim() ? '' : ' spenta') + '">' + h(z.nome) + '</div>' +
      '<textarea class="corpo" data-campo="sezione-verbale" data-id="' + h(v.id) + '" data-sezione="' + z.chiave + '" placeholder="' + (z.elenco ? 'una voce per riga' : '—') + '">' + h(testo) + '</textarea></div>';
  });
  html += '<div class="barra"><button class="az verde" data-az="salva-verbale" data-id="' + h(v.id) + '">Salva</button></div>';
  return html;
}

/* ============================================================
   LA CHIUSURA DEL CANTIERE E LA RELAZIONE DI FINE CANTIERE
   La giornata si chiude e ne esce un verbale; il cantiere si chiude e ne
   esce una relazione: un documento unico che racconta tutto il lavoro, con
   i conti. È una fotografia dei documenti al momento della chiusura, con un
   codice suo (REL-001): si corregge a mano come un verbale, e si rigenera
   se dopo la chiusura si aggiunge qualcosa. Un cantiere chiuso si riapre
   senza perdere niente: la relazione resta, e si riscrive quando si richiude.
   ============================================================ */

// id della relazione → vero finché Claude sta scrivendo le due righe "in breve"
const RELAZIONI_IN_SCRITTURA = {};

/* Il riepilogo per sezione: sotto ogni sezione, quello che è stato scritto nei
   vari giorni, ogni pezzo con la sua data davanti. Per un giorno chiuso vale
   il verbale, che è il documento corretto; per un giorno aperto il sopralluogo. */
function riepilogoPerSezione(sops) {
  const per = {};
  CHIAVI_SEZIONI.forEach(function (k) { per[k] = []; });
  sops.forEach(function (s) {
    const v = s.chiuso ? verbaleDiSopralluogo(s.codice) : null;
    const sezioni = v ? v.sezioni : s.sezioni;
    CHIAVI_SEZIONI.forEach(function (k) {
      let testo = String(sezioni[k] || '').trim();
      // In un giorno aperto il testo da smistare finirebbe nelle Note alla chiusura: qui si fa lo stesso, così non si perde.
      if (!v && k === 'note' && String(s.sezioni.da_smistare || '').trim()) testo = aggiungiTesto(testo, s.sezioni.da_smistare);
      if (testo) per[k].push({ giorno: s.giorno, codice: v ? v.codice : s.codice, aperta: !s.chiuso, testo: testo });
    });
  });
  return per;
}

/* L'etichetta di un pezzo del riepilogo. Nel PDF (esteso): la data, poi il codice del
   documento da cui viene. Sullo schermo: la data, e l'ora se quel giorno ha più passaggi. */
function etichettaBlocco(b, esteso) {
  const data = b.giorno ? (esteso ? dataEstesa(b.giorno) : dataBreve(b.giorno)) : 'aggiunto a mano';
  if (esteso) return data + (b.codice ? ' - ' + b.codice : '') + (b.aperta ? ' - giornata non chiusa' : '');
  const s = b.codice ? (sopralluogoPerCodice(b.codice) || sopralluogoPerCodice((verbalePerCodice(b.codice) || {}).sopralluogo)) : null;
  return data + (s && sopralluoghiDelGiorno(s.cantiere, s.giorno).length > 1 ? ' · ' + oraCorta(s.ora) : '');
}

/* Scrive la relazione dai documenti di adesso, o la riscrive se esiste già (stesso codice).
   Tutto quello che c'è dentro è copiato: correggere la relazione non tocca verbali e contabilità,
   e correggere quelli non cambia la relazione finché non la si rigenera. */
function generaRelazione(c, esistente) {
  // Dal primo giorno all'ultimo: la relazione racconta in ordine, non dal più recente.
  const sops = sopralluoghiDi(c.codice).slice().reverse();
  const cont = contabilitaDi(c.codice);
  const rel = esistente || { cantiere: c.codice };
  rel.apertura = c.aperto || (sops.length ? sops[0].giorno : oggiISO());
  rel.chiusura = c.chiuso || oggiISO();
  rel.numeri = {
    giorni: sops.length,
    verbali: sops.filter(function (s) { return s.chiuso; }).length,
    aperte: sops.filter(function (s) { return !s.chiuso; }).length,
    foto: sops.reduce(function (t, s) { return t + fotoNormali(s).length; }, 0),
    documenti: sops.reduce(function (t, s) { return t + documentiDi(s).length; }, 0),
    parlato: sops.reduce(function (t, s) { return t + s.pezzi.reduce(function (u, p) { return u + (p.durata || 0); }, 0); }, 0),
    totale: totaleContabilita(cont)
  };
  rel.sezioni = riepilogoPerSezione(sops);
  rel.contabilita = {
    codice: cont ? cont.codice : '',
    note: cont ? String(cont.note || '') : '',
    totale: totaleContabilita(cont),
    righe: (cont ? cont.righe : []).map(function (r) {
      return { codice: r.codice, descrizione: r.descrizione, quantita: r.quantita, um: r.um, prezzo: r.prezzo, importo: r.importo, dacompletare: !!r.dacompletare };
    })
  };
  rel.giorni = sops.map(function (s) {
    const v = s.chiuso ? verbaleDiSopralluogo(s.codice) : null;
    return { sop: s.id, sopralluogo: s.codice, verbale: v ? v.codice : (s.verbale || null), giorno: s.giorno, ora: s.ora, chiuso: !!s.chiuso,
      sezioni: sezioniPiene(v ? v.sezioni : s.sezioni).length, audio: s.pezzi.length, foto: fotoNormali(s).length, documenti: documentiDi(s).length };
  });
  rel.inBreve = '';
  rel.generata = adessoISO();
  // Nata da un cantiere di esempio, è un esempio anche lei: "butta via gli esempi" la porta via.
  if (c.esempio) rel.esempio = true;
  salva('relazione', rel);
  c.relazione = rel.codice;
  salva('cantiere', c);
  scriviInBreve(rel);
  return rel;
}

/* Le due righe "in breve" le scrive Claude con il foglio del riassunto, dal riepilogo appena fatto.
   Senza chiave o senza rete si salta: la relazione esce lo stesso, e si può rigenerare più tardi. */
async function scriviInBreve(rel) {
  if (!chiaveAnthropic() || !navigator.onLine) return;
  const c = cantierePerCodice(rel.cantiere) || {};
  const testo = SEZIONI.map(function (z) {
    const blocchi = (rel.sezioni[z.chiave] || []).filter(function (b) { return String(b.testo || '').trim(); });
    return blocchi.length ? z.nome + ':\n' + blocchi.map(function (b) { return (b.giorno ? dataBreve(b.giorno) + ': ' : '') + b.testo; }).join('\n') : '';
  }).filter(Boolean).join('\n\n');
  if (!testo) return;
  RELAZIONI_IN_SCRITTURA[rel.id] = true;
  aggiornaVista();
  try {
    const risposta = await chiamaClaude(REGOLE_RIASSUNTO, 'Cantiere: ' + (c.nome || '') + '\nPeriodo: dal ' + dataEstesa(rel.apertura) + ' al ' + dataEstesa(rel.chiusura) + '\nVerbali:\n' + testo.slice(0, 20000), 800);
    const fresca = relazione(rel.id);
    // Se nel frattempo è stata rigenerata o cancellata, questa risposta non vale più.
    if (fresca && fresca.generata === rel.generata) { fresca.inBreve = String(risposta || '').trim(); salva('relazione', fresca); }
  } catch (e) { /* senza "in breve" la relazione vale lo stesso */ }
  delete RELAZIONI_IN_SCRITTURA[rel.id];
  aggiornaVista();
}

async function chiudiCantiere(id) {
  const c = cantiere(id);
  if (!c || c.stato === 'chiuso') return;
  if (REG.attiva) { avvisa('Ferma prima la registrazione', 'att'); return; }
  const sops = sopralluoghiDi(c.codice);
  const aperte = sops.filter(function (s) { return !s.chiuso; }).length;
  const idSops = sops.map(function (s) { return s.id; });
  const inCoda = leggiLocale().coda.some(function (l) { return (idSops.indexOf(l.sop) !== -1 || l.cantiere === c.id) && l.stato !== 'fallito'; });
  const esistente = relazioneDi(c.codice);
  let testo = 'Si scrive la relazione di fine cantiere: il riepilogo di tutti i giorni e i conti. Il cantiere va fra quelli chiusi, e si potrà riaprire.';
  if (aperte) testo = (aperte === 1 ? 'Una giornata è ancora aperta' : aperte + ' giornate sono ancora aperte') + ': nella relazione compaiono come non chiuse. ' + testo;
  if (inCoda) testo = 'Una registrazione è ancora in coda: il suo testo non entrerà nella relazione. ' + testo;
  if (esistente) testo += ' La relazione si riscrive: le correzioni fatte a mano si perdono.';
  const ok = await chiedi('Chiudere il cantiere?', testo, 'Chiudi il cantiere');
  chiudiFoglio();
  if (!ok) return;
  c.stato = 'chiuso';
  c.chiuso = oggiISO();
  salva('cantiere', c);
  const rel = generaRelazione(c, esistente);
  avvisa('Relazione scritta', 'ok');
  vai('#/relazione/' + rel.id);
}

async function riapriCantiere(id) {
  const c = cantiere(id);
  if (!c || c.stato !== 'chiuso') return;
  const rel = relazioneDi(c.codice);
  const ok = await chiedi('Riaprire il cantiere?', c.nome + ' torna fra i cantieri attivi. Non si perde niente' + (rel ? ': la relazione resta, e si riscrive quando lo richiudi.' : '.'), 'Riapri il cantiere');
  chiudiFoglio();
  if (!ok) return;
  c.stato = 'attivo';
  c.chiuso = null;
  salva('cantiere', c);
  avvisa('Cantiere riaperto', 'ok');
  aggiornaVista();
}

async function rigeneraRelazione(relId) {
  const rel = relazione(relId);
  const c = rel && cantierePerCodice(rel.cantiere);
  if (!c) return;
  const ok = await chiedi('Rigenerare la relazione?', 'Si riscrive dai verbali e dalla contabilità di adesso. Le correzioni fatte a mano sulla relazione si perdono.', 'Rigenera');
  chiudiFoglio();
  if (!ok) return;
  generaRelazione(c, rel);
  avvisa('Rigenerata', 'ok');
  aggiornaVista();
}

/* ---------------- RELAZIONE: lettura ---------------- */
/* Si legge come si legge un giorno chiuso: i numeri in testa, poi le card, in fondo Esporta e Modifica. */
function vistaRelazione(id) {
  const rel = relazione(id);
  if (!rel) return vistaDashboard();
  const c = cantierePerCodice(rel.cantiere) || { nome: '?', id: '', codice: rel.cantiere, stato: 'chiuso' };
  const n = rel.numeri || {};
  const scrivendo = !!RELAZIONI_IN_SCRITTURA[rel.id];
  const inBreve = String(rel.inBreve || '').trim();
  let html = testata({ indietro: '#/cantiere/' + c.id, titolo: 'Relazione di fine cantiere', sotto: h(c.nome),
    // La pastiglia dice una parola: la data di chiusura sta nella card sotto. Una pastiglia lunga schiaccia il titolo.
    destra: c.stato === 'chiuso' ? '<span class="pill ok">chiuso</span>' : '<span class="pill att">riaperto</span>' });
  // L'intestazione
  html += '<div class="card"><div class="card-capo">Cantiere</div><div class="card-corpo">' + h(c.nome) +
    (c.committente ? '\nCommittente: ' + h(c.committente) : '') + (c.indirizzo ? '\n' + h(c.indirizzo) : '') +
    '\nAperto ' + h(dataEstesa(rel.apertura)) + '\nChiuso ' + h(dataEstesa(rel.chiusura)) + '</div>' +
    '<div class="card-piede">Scritta il ' + h(dataSenzaAnno(rel.generata)) + ' alle ' + h(oraDaISO(rel.generata)) + '</div></div>';
  // I numeri, come nella giornata chiusa; il totale è l'unico verde, le giornate aperte l'unico giallo
  html += '<div class="numeri sei">' +
    '<div class="n"><div class="v">' + (n.giorni || 0) + '</div><div class="k">giorni</div></div>' +
    '<div class="n"><div class="v">' + (n.verbali || 0) + '</div><div class="k">verbali</div></div>' +
    '<div class="n"><div class="v' + (n.aperte ? ' att' : '') + '">' + (n.aperte || 0) + '</div><div class="k">non chiuse</div></div>' +
    '<div class="n"><div class="v">' + (n.foto || 0) + '</div><div class="k">foto</div></div>' +
    '<div class="n"><div class="v">' + h(durataLunga(n.parlato)) + '</div><div class="k">parlato</div></div>' +
    '<div class="n"><div class="v fatto">' + h(compatto(n.totale)) + '</div><div class="k">totale €</div></div></div>';
  html += '<button class="link blocco" data-az="relazione-rigenera" data-id="' + h(rel.id) + '">↻ Rigenera dai documenti di adesso</button>';
  // In breve: due righe di Claude. Se mancano e nessuno le sta scrivendo, la card non c'è.
  if (scrivendo || inBreve) {
    html += '<div class="card"><div class="card-capo' + (inBreve ? '' : ' spenta') + '">In breve' + (scrivendo ? '<span class="dx att">scrivo…</span>' : '') + '</div>' +
      (inBreve ? '<div class="card-corpo">' + h(inBreve) + '</div>' : '') + '</div>';
  }
  // Il riepilogo per sezione: le sezioni vuote non si mostrano
  html += '<div class="eti">Riepilogo per sezione</div>';
  let piene = 0;
  SEZIONI.forEach(function (z) {
    const blocchi = (rel.sezioni[z.chiave] || []).filter(function (b) { return String(b.testo || '').trim(); });
    if (!blocchi.length) return;
    piene++;
    html += '<div class="card" id="sez-' + z.chiave + '"><div class="card-capo">' + h(z.nome) + '<span class="dx">' + blocchi.length + (blocchi.length === 1 ? ' giorno' : ' giorni') + '</span></div>' +
      blocchi.map(function (b) {
        return '<div class="card-capo spenta">' + h(etichettaBlocco(b)) + (b.aperta ? '<span class="dx att">non chiusa</span>' : '') + '</div>' +
          '<div class="card-corpo">' + testoElenco(b.testo, z.elenco) + '</div>';
      }).join('') + '</div>';
  });
  if (!piene) html += '<div class="vuoto-stato">Nessuna sezione compilata nei giorni di questo cantiere.</div>';
  // La contabilità completa: le righe senza prezzo si segnalano, il totale sta in fondo
  const cont = rel.contabilita || { righe: [], totale: 0, note: '' };
  const daCompletare = cont.righe.filter(function (r) { return r.dacompletare; }).length;
  html += '<div class="eti">Contabilità' + (daCompletare ? '<span class="n" style="color:var(--gold)">' + daCompletare + ' da completare</span>' : '') + '</div>';
  if (cont.righe.length) html += '<div class="card">' + cont.righe.map(function (r) { return rigaContabilitaHtml(r, { lettura: true }); }).join('') + '</div>';
  else html += '<div class="vuoto-stato">Nessuna riga di contabilità.</div>';
  html += '<div class="totale"><span class="eti">Totale</span><span class="cifra">' + h(euro(cont.totale)) + '</span></div>';
  if (String(cont.note || '').trim()) html += '<div class="card"><div class="card-capo spenta">Note della contabilità</div><div class="card-corpo">' + h(cont.note) + '</div></div>';
  // L'elenco dei giorni: una riga per giornata, si tocca e si va al giorno
  html += '<div class="eti">Giorni<span class="n">' + rel.giorni.length + '</span></div>';
  if (rel.giorni.length) {
    html += '<div class="card">' + rel.giorni.map(function (g) {
      return '<button class="riga" data-az="vai" data-a="#/giorno/' + h(g.sop) + '"><span class="desc">' + h(dataBreve(g.giorno)) + ' · ' + h(g.ora) +
        '<small>' + g.sezioni + '/' + CHIAVI_SEZIONI.length + ' sezioni · ' + g.audio + ' audio · ' + g.foto + ' foto' + (g.documenti ? ' · ' + g.documenti + ' doc' : '') + '</small></span>' +
        (g.chiuso ? '<span class="pill ok">chiusa</span>' : '<span class="pill att">non chiusa</span>') + '<span class="frec">›</span></button>';
    }).join('') + '</div>';
  } else html += '<div class="vuoto-stato">Nessun giorno di sopralluogo.</div>';
  // Le foto marcate, giorno per giorno: si leggono dal sopralluogo, come fa il PDF del verbale
  let fotoHtml = '';
  rel.giorni.forEach(function (g) {
    const s = sopralluogo(g.sop);
    const marcate = s ? fotoDi(s).filter(function (f) { return f.nelPdf; }) : [];
    if (!marcate.length) return;
    fotoHtml += '<div class="card"><div class="card-capo spenta">' + h(dataBreve(g.giorno)) + '<span class="dx">' + h(oraCorta(g.ora)) + '</span></div>' + filaFoto(s, marcate) + '</div>';
  });
  if (fotoHtml) html += '<div class="eti">Foto nel PDF</div>' + fotoHtml;
  html += '<div class="barra"><button class="az verde" data-az="esporta-pdf-relazione" data-id="' + h(rel.id) + '">Esporta PDF</button>' +
    '<button class="az stretta" data-az="vai" data-a="#/modifica-relazione/' + h(rel.id) + '">Modifica</button></div>';
  return html;
}

/* ---------------- RELAZIONE: modifica ---------------- */
/* Come la modifica del verbale, ma ogni sezione è fatta di pezzi con la loro data: un campo per pezzo. */
function vistaRelazioneModifica(id) {
  const rel = relazione(id);
  if (!rel) return vistaDashboard();
  const c = cantierePerCodice(rel.cantiere) || { nome: '?' };
  let html = testata({ indietro: '#/relazione/' + rel.id, titolo: 'Modifica relazione', sotto: 'relazione di fine cantiere · ' + h(c.nome) });
  html += '<div class="avviso" style="background:var(--surface);border-color:var(--line);color:var(--muted)">Correggere la relazione non tocca i verbali né la contabilità. Rigenerandola, le correzioni si perdono.</div>';
  html += '<div class="card"><div class="card-capo' + (String(rel.inBreve || '').trim() ? '' : ' spenta') + '">In breve</div>' +
    '<textarea class="corpo" data-campo="inbreve-relazione" data-id="' + h(rel.id) + '" placeholder="Due righe su com\'è andato il cantiere">' + h(rel.inBreve || '') + '</textarea></div>';
  SEZIONI.forEach(function (z) {
    const blocchi = rel.sezioni[z.chiave] || [];
    const pieno = blocchi.some(function (b) { return String(b.testo || '').trim(); });
    const segnaposto = z.elenco ? 'una voce per riga' : '—';
    html += '<div class="card"><div class="card-capo' + (pieno ? '' : ' spenta') + '">' + h(z.nome) + '</div>';
    if (blocchi.length) {
      blocchi.forEach(function (b, i) {
        html += '<div class="card-capo spenta">' + h(etichettaBlocco(b)) + (b.aperta ? '<span class="dx att">non chiusa</span>' : '') + '</div>' +
          '<textarea class="corpo" data-campo="blocco-relazione" data-id="' + h(rel.id + '/' + z.chiave + '/' + i) + '" placeholder="' + segnaposto + '">' + h(b.testo || '') + '</textarea>';
      });
    } else {
      // Una sezione rimasta vuota si può riempire a mano: il pezzo nasce alla prima lettera, senza data.
      html += '<textarea class="corpo" data-campo="blocco-relazione" data-id="' + h(rel.id + '/' + z.chiave + '/0') + '" placeholder="' + segnaposto + '"></textarea>';
    }
    html += '</div>';
  });
  html += '<div class="barra"><button class="az verde" data-az="salva-relazione" data-id="' + h(rel.id) + '">Salva</button></div>';
  return html;
}

/* ---------------- LA FOTO GRANDE ---------------- */
/* È una schermata e non un foglio: così la striscia di registrazione resta
   sopra a tutto e il gesto "indietro" riporta al giorno. Sotto la foto i suoi
   dati, poi il referto (che si corregge a mano come tutto il resto), la sezione
   e il tasto per il PDF. */
function vistaFoto(sopId, fotoId) {
  const s = sopralluogo(sopId);
  const f = s && trovaFoto(s, fotoId);
  if (!f) return s ? vistaGiorno(s.id) : vistaDashboard();
  const c = cantierePerCodice(s.cantiere) || { nome: '?', id: '' };
  const st = descriviStatoFoto(statoLavoroFoto(f));
  const registrandoQui = REG.attiva && REG.destinazione && REG.destinazione.tipo === 'foto' && REG.destinazione.foto === f.id;
  const sezione = sezioneFoto(f);
  const doc = !!GENERI[f.genere];
  let html = testata({ indietro: '#/giorno/' + s.id, titolo: nomeFoto(f), sotto: h(c.nome) + ' · ' + h(dataBreve(f.giorno)),
    destra: registrandoQui ? '<span class="pill reg">● rec</span>' : (f.nelPdf ? '<span class="pill ok">nel PDF</span>' : '<span class="pill grigia">non nel PDF</span>') });
  html += '<div class="foto-grande' + (f.file ? '' : ' manca') + '">' +
    (f.file
      ? (f.formato === 'pdf'
        ? '<div class="foto-vuota scan"><span class="ico ico-documento"></span>' + h(paginePdf(f)) + '<small>scansione del telefono: entra nel verbale com\'è</small></div>'
        : '<img data-foto="' + h(f.file) + '" alt="">')
      : '<div class="foto-vuota">Foto archiviata' + (f.archiviato ? ' il ' + h(dataSenzaAnno(f.archiviato)) : '') + ': è nei File del telefono.</div>') +
    '<div class="foto-dati">' + h(dataEstesa(f.giorno)) + ' alle ' + h(f.ora) + '<br>' + h(titoloSopralluogo(s)) + '</div></div>';
  html += '<div class="card"><div class="card-capo' + (String(f.referto || '').trim() ? '' : ' spenta') + '">Referto' + (st.testo ? '<span class="dx ' + st.classe + '">' + h(st.testo) + '</span>' : '') + '</div>' +
    '<textarea class="corpo" data-campo="referto-foto" data-id="' + h(f.id) + '" data-sop="' + h(s.id) + '" placeholder="' + (doc ? 'Detta o scrivi cosa c\'è su questo documento' : 'Detta o scrivi cosa si vede') + '">' + h(f.referto || '') + '</textarea>' +
    (f.grezzo ? '<div class="card-piede">« ' + h(f.grezzo) + ' »</div>' : '') + '</div>';
  // Un documento è un allegato del verbale, non appartiene a una sezione: la scelta non si mostra.
  if (!doc) html += '<div class="card"><div class="card-capo">Sezione del verbale<span class="dx">' + h(nomeSezione(sezione)) + '</span></div><div class="griglia">' +
    SEZIONI.map(function (z) { return '<button class="btn' + (z.chiave === sezione ? ' btn-ok' : '') + '" data-az="foto-sezione" data-sop="' + h(s.id) + '" data-id="' + h(f.id) + '" data-sezione="' + z.chiave + '">' + h(z.nome) + '</button>'; }).join('') +
    '</div></div>';
  html += '<div class="modulo">' +
    (f.genere ? '<button class="btn' + (f.cantiere ? ' btn-ok' : '') + '" style="margin-bottom:8px" data-az="foto-cantiere" data-sop="' + h(s.id) + '" data-id="' + h(f.id) + '">' + (f.cantiere ? '✓ Vale per tutto il cantiere' : 'Vale per tutto il cantiere') + '</button>' : '') +
    '<button class="btn' + (f.nelPdf ? ' btn-ok' : '') + '" data-az="foto-marca" data-sop="' + h(s.id) + '" data-id="' + h(f.id) + '">' + (f.nelPdf ? '✓ Nel PDF' : 'Metti nel PDF') + '</button>' +
    '<button class="btn btn-rosso medio" data-az="foto-elimina" data-sop="' + h(s.id) + '" data-id="' + h(f.id) + '" style="margin-top:12px">' + (doc ? 'Elimina il documento' : 'Elimina la foto') + '</button></div>';
  // I tasti della foto restano anche qui: caricata una, la successiva parte da questa schermata.
  html += ingressiFoto(s);
  if (!REG.attiva) html += '<div class="barra"><button class="az verde" data-az="foto-detta" data-sop="' + h(s.id) + '" data-id="' + h(f.id) + '"><span class="ico ico-microfono"></span> ' + (String(f.referto || '').trim() ? 'Aggiungi al referto' : 'Detta il referto') + '</button>' +
    '<button class="az stretta" data-az="foto-scatta"><span class="ico ico-fotocamera"></span> Foto</button></div>';
  return html;
}

/* ---------------- CONTABILITÀ ---------------- */
function vistaContabilita(idCantiere) {
  const c = cantiere(idCantiere);
  if (!c) return vistaDashboard();
  const cont = contabilitaDi(c.codice);
  const righe = cont ? cont.righe : [];
  const totale = totaleContabilita(cont);
  const loc = leggiLocale();
  const proposte = loc.proposte.filter(function (p) { return p.cantiere === c.id; });
  const inCoda = loc.coda.filter(function (l) { return l.cantiere === c.id && (l.per === 'contabilita' || l.tipo === 'contabilita'); });
  let html = testata({ indietro: '#/cantiere/' + c.id, titolo: 'Contabilità', sotto: h(c.nome),
    destra: righe.some(function (r) { return r.dacompletare; }) ? '<span class="pill att">da completare</span>' : '' });
  inCoda.forEach(function (l) {
    html += '<div class="avviso" style="color:var(--muted);border-color:var(--line);background:var(--surface)">' +
      (l.stato === 'fallito' ? 'Riga dettata non riuscita: ' + h(l.errore || '') : (l.stato === 'in_corso' ? 'Sto leggendo la riga dettata…' : 'Riga dettata in coda (' + h(l.etichetta || '') + ')')) + '</div>';
  });
  // Quello che torna dalla dettatura è una proposta: si guarda e si corregge prima di salvare.
  proposte.forEach(function (p) {
    html += '<div class="card gialla"><div class="card-capo gialla">Proposta dalla dettatura delle ' + h(p.ora) + '</div>' +
      '<div class="card-piede" style="border-top:0">« ' + h(p.grezzo) + ' »</div>' +
      p.righe.map(function (r, i) { return rigaContabilitaHtml(r, { proposta: p.id, indice: i }); }).join('') +
      '<div class="griglia"><button class="btn btn-ok" data-az="proposta-aggiungi" data-id="' + h(p.id) + '">Aggiungi</button>' +
      '<button class="btn" data-az="proposta-scarta" data-id="' + h(p.id) + '">Scarta</button></div></div>';
  });
  if (righe.length) {
    html += '<div class="card">' + righe.map(function (r) { return rigaContabilitaHtml(r, { cont: cont.id }); }).join('') + '</div>';
  } else if (!proposte.length) {
    html += '<div class="vuoto-stato">Nessuna riga. Premi il bottone verde e di\' per esempio: «Inserisci intonaco civile, 25 metri quadrati».</div>';
  }
  html += '<div class="totale"><span class="eti">Totale progressivo</span><span class="cifra">' + h(euro(totale)) + '</span></div>';
  html += '<div class="modulo"><label class="eticampo">Note</label><textarea class="campo auto" data-campo="note-contabilita" data-id="' + h(c.id) + '" placeholder="Note del documento">' + h(cont ? cont.note : '') + '</textarea></div>';
  if (!REG.attiva) {
    html += '<div class="barra"><button class="az verde" data-az="detta-contabilita" data-id="' + h(c.id) + '"><span class="ico ico-microfono"></span> Aggiungi una riga</button>' +
      '<button class="az stretta" data-az="riga-nuova" data-id="' + h(c.id) + '">＋ a mano</button></div>';
  }
  return html;
}
function rigaContabilitaHtml(r, rif) {
  // Nella relazione la riga è una copia e si legge soltanto: stesso disegno, ma non è un bottone.
  const tag = rif.lettura ? 'div' : 'button';
  const attr = rif.lettura ? '' : (rif.proposta ? ' data-az="riga-modifica" data-proposta="' + h(rif.proposta) + '" data-indice="' + rif.indice + '"' : ' data-az="riga-modifica" data-cont="' + h(rif.cont) + '" data-id="' + h(r.codice) + '"');
  return '<' + tag + ' class="voceriga' + (r.dacompletare ? ' dacompletare' : '') + '"' + attr + '>' +
    '<div class="desc">' + h(r.descrizione || '(senza descrizione)') + '</div>' +
    '<div class="conti">' + (r.codice ? '' : '<span class="codice">nuova</span>') + '<span>' + h(numeroIt(r.quantita)) + ' ' + h(r.um || '') + '</span>' +
    '<span>× ' + h(euro(r.prezzo)) + '</span>' + (r.dallistino ? '<span class="targa">listino</span>' : '') +
    '<span class="importo">' + (r.dacompletare ? 'da completare' : h(euro(r.importo))) + '</span></div></' + tag + '>';
}

function ricalcolaRiga(r) {
  r.quantita = Number(r.quantita) || 0;
  r.prezzo = Number(r.prezzo) || 0;
  r.importo = Math.round(r.quantita * r.prezzo * 100) / 100;
  r.dacompletare = !(r.prezzo > 0);
  return r;
}

// Il foglio per correggere una riga, campo per campo.
function apriRigaContabilita(riga, rif) {
  const um = riga.um || '';
  const opzioniUm = ['', 'm', 'm²', 'm³', 'kg', 'q', 't', 'n', 'h', 'corpo', 'l'];
  if (um && opzioniUm.indexOf(um) === -1) opzioniUm.push(um);
  apriFoglio(
    '<h2>' + (riga.codice ? h(primaRiga(riga.descrizione) || 'Riga') : 'Riga nuova') + '</h2>' +
    '<label class="eticampo">Descrizione lavorazione</label><input class="campo" id="r-desc" value="' + h(riga.descrizione) + '" autocomplete="off">' +
    '<div class="due" style="display:flex;gap:8px"><div style="flex:1"><label class="eticampo">Quantità</label><input class="campo" id="r-qta" inputmode="decimal" value="' + h(numeroIt(riga.quantita)) + '"></div>' +
    '<div style="flex:1"><label class="eticampo">Unità</label><select class="campo" id="r-um">' + opzioniUm.map(function (u) { return '<option value="' + h(u) + '"' + (u === um ? ' selected' : '') + '>' + (u || '—') + '</option>'; }).join('') + '</select></div></div>' +
    '<label class="eticampo">Prezzo unitario €</label><input class="campo" id="r-prezzo" inputmode="decimal" value="' + h(riga.prezzo ? numeroIt(riga.prezzo) : '') + '" placeholder="0,00">' +
    '<button class="btn medio" data-az="riga-cerca-listino" style="margin-top:12px"><span class="ico ico-lente"></span> Cerca nel listino</button>' +
    '<div class="righe"><button class="btn btn-ok" data-az="riga-salva">Salva</button>' +
    (riga.codice ? '<button class="btn btn-rosso" data-az="riga-elimina">Elimina</button>' : '') + '</div>' +
    '<button class="btn" data-az="chiudi-foglio" style="margin-top:8px">Annulla</button>'
  );
  RIGA_APERTA = { riga: riga, rif: rif };
}
let RIGA_APERTA = null;
function leggiRigaDalFoglio() {
  const r = RIGA_APERTA.riga;
  r.descrizione = document.getElementById('r-desc').value.trim();
  r.quantita = leggiNumero(document.getElementById('r-qta').value, ',');
  if (isNaN(r.quantita)) r.quantita = 0;
  r.um = document.getElementById('r-um').value;
  const p = leggiNumero(document.getElementById('r-prezzo').value, ',');
  r.prezzo = isNaN(p) ? 0 : p;
  return ricalcolaRiga(r);
}
function salvaRigaAperta() {
  const r = leggiRigaDalFoglio();
  const rif = RIGA_APERTA.rif;
  if (rif.proposta) {
    // Una riga di una proposta si corregge sul posto: entra in contabilità solo con "Aggiungi".
    salvaLocale();
  } else {
    const c = cantiere(rif.cantiere);
    const cont = contabilitaOCrea(c.codice);
    if (!r.codice) { r.codice = codiceNuovo('VOCE'); cont.righe.push(r); }
    else { const i = cont.righe.findIndex(function (x) { return x.codice === r.codice; }); if (i === -1) cont.righe.push(r); else cont.righe[i] = r; }
    salva('contabilita', cont);
  }
  chiudiFoglio();
  RIGA_APERTA = null;
  avvisa('Salvato', 'ok');
  aggiornaVista();
}

// Il selettore del listino: si cerca dentro la descrizione e si tocca la voce.
let filtroListinoScelta = '';
function apriSceltaListino() {
  leggiRigaDalFoglio();
  filtroListinoScelta = RIGA_APERTA.riga.descrizione || '';
  disegnaSceltaListino();
}
function disegnaSceltaListino() {
  const voci = filtroListinoScelta ? cercaListinoLocale(filtroListinoScelta).map(function (r) { return r.voce; }) : [];
  const elenco = (voci.length ? voci : listinoTutto()).slice(0, 60);
  apriFoglio(
    '<h2>Cerca nel listino</h2>' +
    '<div class="cerca" style="margin:0 0 12px"><span class="ico ico-lente"></span> <input type="search" id="scelta-cerca" placeholder="Cerca nella descrizione" value="' + h(filtroListinoScelta) + '" data-campo="filtro-scelta" autocomplete="off" autofocus></div>' +
    '<div class="lista">' + (elenco.length ? elenco.map(function (v) {
      return '<button class="riga" data-az="scegli-voce" data-id="' + h(v.id) + '"><span class="desc">' + h(v.descrizione) + '<small>' + h(v.um) + '</small></span><span class="dx">' + h(euro(v.prezzo)) + '</span></button>';
    }).join('') : '<div class="vuoto-stato">' + (listinoTutto().length ? 'Nessuna voce trovata.' : 'Il listino è vuoto.') + '</div>') + '</div>' +
    '<button class="btn" data-az="scelta-annulla">Torna alla riga</button>'
  );
}

/* ---------------- LISTINO ---------------- */
let filtroListino = '';
function vistaListino(idCantiere, sotto) {
  const c = cantiere(idCantiere);
  if (!c) return vistaDashboard();
  if (sotto === 'carica') return vistaCaricaListino(c);
  const tutte = listinoTutto();
  const voci = filtroListino ? cercaListinoLocale(filtroListino).map(function (r) { return r.voce; }) : tutte;
  let html = testata({ indietro: '#/cantiere/' + c.id, titolo: 'Listino prezzi', sotto: tutte.length + ' voci · ' + h(c.nome) });
  html += '<div class="cerca"><span class="ico ico-lente"></span> <input type="search" placeholder="Cerca nella descrizione" value="' + h(filtroListino) + '" data-campo="filtro-listino" autocomplete="off"></div>';
  html += '<div class="modulo"><button class="btn medio" data-az="vai" data-a="#/listino/' + h(c.id) + '/carica"><span class="ico ico-documento"></span> Carica listino da file</button>' +
    // Svuotare tutto in un colpo: un listino sbagliato o di prova si butta senza toccare le voci una per una.
    (tutte.length ? '<button class="btn medio btn-rosso" data-az="listino-svuota" style="margin-top:8px"><span class="ico ico-cestino"></span> Svuota il listino</button>' : '') + '</div>';
  if (voci.length) {
    html += '<div class="card" style="margin-top:12px">' + voci.slice(0, 200).map(function (v) {
      return '<button class="riga" data-az="voce-modifica" data-id="' + h(v.id) + '"><span class="desc">' + h(v.descrizione) + '<small>' + (v.rif ? h(v.rif) + ' · ' : '') + h(v.um || '—') + '</small></span><span class="dx">' + h(euro(v.prezzo)) + '</span></button>';
    }).join('') + '</div>';
    if (voci.length > 200) html += '<div class="vuoto-stato">Mostrate le prime 200: cerca per restringere.</div>';
  } else {
    html += '<div class="vuoto-stato">' + (filtroListino ? 'Nessuna voce trovata.' : 'Il listino è vuoto. Aggiungi una voce, o carica un file.') + '</div>';
  }
  html += '<div class="barra"><button class="az verde" data-az="voce-nuova">＋ Aggiungi voce</button></div>';
  return html;
}
function apriVoceListino(v) {
  VOCE_APERTA = v || { descrizione: '', um: '', prezzo: 0 };
  apriFoglio(
    '<h2>' + (v ? 'Voce del listino' : 'Nuova voce') + '</h2>' +
    '<label class="eticampo">Descrizione</label><input class="campo" id="v-desc" value="' + h(VOCE_APERTA.descrizione) + '" autocomplete="off"' + (v ? '' : ' autofocus') + '>' +
    '<div style="display:flex;gap:8px"><div style="flex:1"><label class="eticampo">Unità</label><input class="campo" id="v-um" value="' + h(VOCE_APERTA.um) + '" placeholder="m², kg, h…" autocomplete="off"></div>' +
    '<div style="flex:1"><label class="eticampo">Prezzo unitario €</label><input class="campo" id="v-prezzo" inputmode="decimal" value="' + h(VOCE_APERTA.prezzo ? numeroIt(VOCE_APERTA.prezzo) : '') + '"></div></div>' +
    '<div class="righe"><button class="btn btn-ok" data-az="voce-salva">Salva</button>' + (v ? '<button class="btn btn-rosso" data-az="voce-elimina">Elimina</button>' : '') + '</div>' +
    '<button class="btn" data-az="chiudi-foglio" style="margin-top:8px">Annulla</button>'
  );
}
let VOCE_APERTA = null;
async function salvaVoceAperta() {
  const v = VOCE_APERTA;
  v.descrizione = document.getElementById('v-desc').value.trim();
  if (!v.descrizione) { avvisa('Manca la descrizione', 'att'); return; }
  v.um = await normalizzaUm(document.getElementById('v-um').value);
  const p = leggiNumero(document.getElementById('v-prezzo').value, ',');
  v.prezzo = isNaN(p) ? 0 : p;
  salva('listino', v);
  chiudiFoglio();
  avvisa('Salvato', 'ok');
  aggiornaVista();
}

/* ---- caricamento da file: il listino lo legge Claude ---- */
const IMPORT = { passo: 'file', nome: '', righe: [], schema: null, errore: '', esempi: [], daClaude: false };

function vistaCaricaListino(c) {
  let html = testata({ indietro: '#/listino/' + c.id, titolo: 'Carica listino', sotto: h(IMPORT.nome || 'da un file CSV') });
  if (IMPORT.passo === 'file') {
    html += '<div class="modulo"><p style="color:var(--text-2);margin:8px 0 16px">Scegli il file del prezzario esportato dal foglio di calcolo, in formato CSV. L\'app legge le prime righe, capisce com\'è fatto e ti chiede solo conferma.</p>' +
      '<input type="file" id="file-listino" accept=".csv,.txt,text/csv,text/plain" hidden data-campo="file-listino">' +
      '<button class="btn btn-ok" data-az="scegli-file">Scegli il file</button></div>';
  } else if (IMPORT.passo === 'lettura') {
    html += '<div class="vuoto-stato">Sto leggendo com\'è fatto il file…</div>';
  } else if (IMPORT.passo === 'conferma') {
    const s = IMPORT.schema;
    const int = IMPORT.righe[s.riga_intestazione] || [];
    const nomeCol = function (i) { return i == null || i < 0 ? '—' : 'colonna ' + (i + 1) + (int[i] ? ' “' + int[i] + '”' : ''); };
    html += '<div class="card"><div class="card-capo' + (IMPORT.daClaude ? '' : ' spenta') + '">' + (IMPORT.daClaude ? 'Ho capito così' : 'Scelta a mano') + '</div>' +
      '<div class="card-corpo" style="font-size:17px">Intestazione alla riga ' + (s.riga_intestazione + 1) + '\nDescrizione ← ' + h(nomeCol(s.colonne.descrizione)) + '\nUnità ← ' + h(nomeCol(s.colonne.um)) + '\nPrezzo ← ' + h(nomeCol(s.colonne.prezzo)) + '\nCodice ← ' + h(nomeCol(s.colonne.codice)) + '\nDecimali con ' + (s.decimali === ',' ? 'la virgola' : 'il punto') + '</div>' +
      '<div class="card-capo spenta">Tre righe lette</div>' +
      (IMPORT.esempi.length ? IMPORT.esempi.map(function (e) { return '<div class="riga" style="min-height:52px"><span class="desc">' + h(e.descrizione) + '<small>' + h(e.rif ? e.rif + ' · ' : '') + h(e.um || '—') + '</small></span><span class="dx">' + h(euro(e.prezzo)) + '</span></div>'; }).join('') : '<div class="card-corpo" style="color:var(--gold)">Con queste colonne non esce nessuna riga buona: correggi con “Cambia”.</div>') +
      '</div>';
    if (IMPORT.errore) html += '<div class="avviso">' + h(IMPORT.errore) + '</div>';
    html += '<div class="modulo"><button class="btn btn-ok" data-az="import-carica"' + (IMPORT.esempi.length ? '' : ' disabled') + '>Carica</button>' +
      '<button class="link blocco" data-az="import-cambia" style="margin:8px 0 0">Cambia: scegli le colonne a mano</button></div>';
  } else if (IMPORT.passo === 'manuale') {
    const s = IMPORT.schema;
    const int = IMPORT.righe[s.riga_intestazione] || [];
    const nCol = Math.max.apply(null, IMPORT.righe.slice(0, 40).map(function (r) { return r.length; }).concat([1]));
    const ruoli = [['', 'ignora'], ['descrizione', 'descrizione'], ['um', 'unità'], ['prezzo', 'prezzo'], ['codice', 'codice']];
    html += '<div class="card"><div class="card-capo">Com\'è fatto il file</div>' +
      '<div class="colonna"><span class="nome">Riga di intestazione</span><select class="campo" data-campo="import-intestazione">' +
      IMPORT.righe.slice(0, 40).map(function (r, i) { return '<option value="' + i + '"' + (i === s.riga_intestazione ? ' selected' : '') + '>riga ' + (i + 1) + ': ' + h((r.join(' | ')).slice(0, 30)) + '</option>'; }).join('') + '</select></div>' +
      '<div class="colonna"><span class="nome">Decimali</span><select class="campo" data-campo="import-decimali"><option value=","' + (s.decimali === ',' ? ' selected' : '') + '>virgola (12,50)</option><option value="."' + (s.decimali === '.' ? ' selected' : '') + '>punto (12.50)</option></select></div>';
    for (let i = 0; i < nCol; i++) {
      const ruolo = Object.keys(s.colonne).find(function (k) { return s.colonne[k] === i; }) || '';
      html += '<div class="colonna"><span class="nome">' + (i + 1) + '. ' + h(int[i] || '(senza nome)') + '</span><select class="campo" data-campo="import-colonna" data-indice="' + i + '">' +
        ruoli.map(function (r) { return '<option value="' + r[0] + '"' + (r[0] === ruolo ? ' selected' : '') + '>' + r[1] + '</option>'; }).join('') + '</select></div>';
    }
    html += '<div class="anteprima">' + h(IMPORT.righe.slice(0, 8).map(function (r, i) { return (i + 1) + '  ' + r.join(' | '); }).join('\n')) + '</div></div>';
    html += '<div class="modulo"><button class="btn btn-ok" data-az="import-conferma-manuale">Vedi come viene</button></div>';
  } else if (IMPORT.passo === 'fatto') {
    html += '<div class="card"><div class="card-capo">Caricato</div><div class="card-corpo">' + h(IMPORT.esito) + '</div></div>' +
      '<div class="modulo"><button class="btn btn-ok" data-az="vai" data-a="#/listino/' + h(c.id) + '">Vai al listino</button></div>';
  }
  return html;
}

// Il file si legge come testo, riga per riga; il separatore è quello che compare di più nella prima riga.
function leggiCSV(testo) {
  testo = String(testo).replace(/^\uFEFF/, '');
  const righeGrezze = testo.split(/\r\n|\r|\n/);
  const prima = righeGrezze.find(function (r) { return r.trim(); }) || '';
  const conta = function (ch) { return (prima.split(ch).length - 1); };
  let sep = ';';
  const nV = conta(','), nPV = conta(';'), nT = conta('\t');
  if (nT > nV && nT > nPV) sep = '\t'; else if (nV > nPV) sep = ','; else sep = ';';
  const righe = [];
  let campo = '', riga = [], dentro = false;
  // Un campo fra virgolette può contenere il separatore e gli a capo: si legge carattere per carattere.
  for (let i = 0; i < testo.length; i++) {
    const ch = testo[i];
    if (dentro) {
      if (ch === '"') { if (testo[i + 1] === '"') { campo += '"'; i++; } else dentro = false; }
      else campo += ch;
    } else if (ch === '"') dentro = true;
    else if (ch === sep) { riga.push(campo); campo = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && testo[i + 1] === '\n') i++;
      riga.push(campo); campo = '';
      if (riga.some(function (x) { return x.trim(); })) righe.push(riga.map(function (x) { return x.trim(); }));
      riga = [];
    } else campo += ch;
  }
  riga.push(campo);
  if (riga.some(function (x) { return x.trim(); })) righe.push(riga.map(function (x) { return x.trim(); }));
  return righe;
}

async function avviaImportListino(file) {
  IMPORT.nome = file.name;
  if (/\.xlsx?$/i.test(file.name)) { IMPORT.passo = 'file'; avvisa('Per adesso solo CSV', 'att'); aggiornaVista(); return; }
  const testo = await file.text();
  IMPORT.righe = leggiCSV(testo);
  IMPORT.errore = '';
  IMPORT.daClaude = false;
  if (!IMPORT.righe.length) { avvisa('File vuoto', 'err'); IMPORT.passo = 'file'; aggiornaVista(); return; }
  IMPORT.passo = 'lettura';
  aggiornaVista();
  const prime = IMPORT.righe.slice(0, 30).map(function (r, i) { return i + ': ' + r.join(' ; '); }).join('\n');
  let schema = null;
  if (chiaveAnthropic() && navigator.onLine) {
    try {
      const risposta = await chiamaClaude(REGOLE_LISTINO, 'Prime righe del file (indice: campi separati da " ; "):\n' + prime, 800);
      schema = estraiJSON(risposta);
    } catch (e) { IMPORT.errore = 'Claude non ha risposto (' + e.message + '): scegli le colonne a mano.'; }
  } else {
    IMPORT.errore = navigator.onLine ? 'Manca la chiave Anthropic: scegli le colonne a mano.' : 'Manca la rete: scegli le colonne a mano.';
  }
  if (schema && schema.colonne) {
    IMPORT.schema = {
      riga_intestazione: Number(schema.riga_intestazione) || 0,
      colonne: { codice: intOrNull(schema.colonne.codice), descrizione: intOrNull(schema.colonne.descrizione), um: intOrNull(schema.colonne.um), prezzo: intOrNull(schema.colonne.prezzo) },
      decimali: schema.decimali === '.' ? '.' : ',',
      migliaia: schema.migliaia || null,
      riga_categoria: schema.riga_categoria || ''
    };
    IMPORT.daClaude = true;
    IMPORT.esempi = applicaSchemaListino(IMPORT.righe, IMPORT.schema).slice(0, 3);
    IMPORT.passo = 'conferma';
  } else {
    IMPORT.schema = indovinaSchemaLocale(IMPORT.righe);
    IMPORT.passo = 'manuale';
  }
  aggiornaVista();
}
function intOrNull(v) { return (v == null || v === '' || isNaN(Number(v))) ? null : Number(v); }

// Senza Claude si parte da un'ipotesi minima: la prima riga con più campi è l'intestazione, e il resto lo sceglie l'uomo.
function indovinaSchemaLocale(righe) {
  let ri = 0, max = 0;
  righe.slice(0, 15).forEach(function (r, i) { const n = r.filter(Boolean).length; if (n > max) { max = n; ri = i; } });
  const int = righe[ri] || [];
  const trova = function (re) { const i = int.findIndex(function (x) { return re.test(senzaAccenti(x)); }); return i === -1 ? null : i; };
  return { riga_intestazione: ri, colonne: { codice: trova(/^(cod|codice|art|tariffa)/), descrizione: trova(/descr|voce|lavoraz/), um: trova(/^(u\.?m\.?|unit)/), prezzo: trova(/prez|importo|euro|€/) }, decimali: ',', migliaia: '.', riga_categoria: '' };
}

/* Si applica lo schema a tutto il file, senza altre chiamate.
   Una riga senza prezzo leggibile è un titolo di categoria, o rumore: si salta. */
function applicaSchemaListino(righe, s) {
  const out = [];
  const cd = s.colonne.descrizione, cu = s.colonne.um, cp = s.colonne.prezzo, cc = s.colonne.codice;
  if (cd == null || cp == null) return out;
  for (let i = s.riga_intestazione + 1; i < righe.length; i++) {
    const r = righe[i];
    const desc = (r[cd] || '').trim();
    const prezzo = leggiNumero(r[cp], s.decimali, s.migliaia);
    if (!desc || isNaN(prezzo) || prezzo <= 0) continue;
    const um = cu != null ? normalizzaUmLocale(r[cu] || '') || (r[cu] || '').trim() : '';
    out.push({ descrizione: desc, um: um, prezzo: Math.round(prezzo * 100) / 100, rif: cc != null ? (r[cc] || '').trim() : '' });
  }
  return out;
}
function importaListino() {
  const voci = applicaSchemaListino(IMPORT.righe, IMPORT.schema);
  if (!voci.length) { avvisa('Nessuna riga leggibile', 'err'); return; }
  const esistenti = {};
  listinoTutto().forEach(function (v) { esistenti[senzaAccenti(v.descrizione)] = v; });
  let nuove = 0, aggiornate = 0;
  voci.forEach(function (n) {
    const k = senzaAccenti(n.descrizione);
    // La stessa descrizione già presente si aggiorna: due voci uguali con prezzi diversi confondono.
    if (esistenti[k]) { const v = esistenti[k]; v.um = n.um || v.um; v.prezzo = n.prezzo; v.rif = n.rif || v.rif; salva('listino', v); aggiornate++; }
    else { salva('listino', { descrizione: n.descrizione, um: n.um, prezzo: n.prezzo, rif: n.rif }); nuove++; }
  });
  IMPORT.esito = 'Lette ' + voci.length + ' voci da ' + IMPORT.nome + ': ' + nuove + ' nuove, ' + aggiornate + ' aggiornate.';
  IMPORT.passo = 'fatto';
  avvisa('Caricato', 'ok');
  aggiornaVista();
}

/* ---------------- NOTE DEL CANTIERE ---------------- */
function vistaNote(idCantiere) {
  const c = cantiere(idCantiere);
  if (!c) return vistaDashboard();
  const inCoda = leggiLocale().coda.filter(function (l) { return l.cantiere === c.id && (l.per === 'nota' || l.tipo === 'nota'); });
  let html = testata({ indietro: '#/cantiere/' + c.id, titolo: 'Note del cantiere', sotto: h(c.nome) });
  inCoda.forEach(function (l) { html += '<div class="avviso" style="color:var(--muted);border-color:var(--line);background:var(--surface)">' + (l.stato === 'fallito' ? 'Nota dettata non riuscita: ' + h(l.errore || '') : 'Nota dettata in arrivo…') + '</div>'; });
  html += '<div class="modulo"><textarea class="campo auto" data-campo="note-cantiere" data-id="' + h(c.id) + '" placeholder="Note che valgono per tutto il cantiere" style="min-height:200px">' + h(c.note || '') + '</textarea></div>';
  if (!REG.attiva) html += '<div class="barra"><button class="az verde" data-az="detta-nota" data-id="' + h(c.id) + '"><span class="ico ico-microfono"></span> Detta una nota</button></div>';
  return html;
}

/* ---------------- CERCA NEI DOCUMENTI ---------------- */
let filtroDocumenti = '';
function vistaCerca() {
  let html = testata({ indietro: '#/', titolo: 'Cerca nei documenti', sotto: 'sopralluoghi, verbali, contabilità' });
  html += '<div class="cerca"><span class="ico ico-lente"></span> <input type="search" placeholder="Una parola: ferro, ponteggio, Rossi…" value="' + h(filtroDocumenti) + '" data-campo="filtro-documenti" autocomplete="off" autofocus></div>';
  const q = senzaAccenti(filtroDocumenti.trim());
  if (q.length < 2) { html += '<div class="vuoto-stato">Scrivi almeno due lettere.</div>'; return html; }
  const db = leggiTutto();
  const risultati = [];
  const stralcio = function (testo) {
    const t = String(testo || '');
    const i = senzaAccenti(t).indexOf(q);
    if (i === -1) return '';
    const a = Math.max(0, i - 40), b = Math.min(t.length, i + q.length + 60);
    return (a > 0 ? '…' : '') + t.slice(a, b).replace(/\n/g, ' ') + (b < t.length ? '…' : '');
  };
  valori(db.sopralluoghi).forEach(function (s) {
    CHIAVI_SEZIONI.concat(['da_smistare']).forEach(function (k) {
      const st = stralcio(s.sezioni[k]);
      if (st) risultati.push({ cantiere: s.cantiere, cosa: 'Sopralluogo', giorno: s.giorno, dove: nomeSezione(k), testo: st, a: '#/giorno/' + s.id });
    });
  });
  valori(db.verbali).forEach(function (v) {
    const s = valori(db.sopralluoghi).find(function (x) { return x.codice === v.sopralluogo; });
    CHIAVI_SEZIONI.forEach(function (k) {
      const st = stralcio(v.sezioni[k]);
      if (st) risultati.push({ cantiere: v.cantiere, cosa: v.nome || (v.giornata ? 'Giornata' : 'Verbale'), giorno: v.giorno, dove: nomeSezione(k), testo: st, a: s ? '#/giorno/' + s.id : '#/verbale/' + v.id });
    });
  });
  valori(db.contabilita).forEach(function (c) {
    const cant = cantierePerCodice(c.cantiere);
    (c.righe || []).forEach(function (r) {
      const st = stralcio(r.descrizione);
      if (st) risultati.push({ cantiere: c.cantiere, cosa: 'Contabilità', giorno: c.aggiornato.slice(0, 10), dove: 'Riga di contabilità', testo: st, a: cant ? '#/contabilita/' + cant.id : '#/' });
    });
    const sn = stralcio(c.note);
    if (sn) risultati.push({ cantiere: c.cantiere, cosa: 'Contabilità', giorno: c.aggiornato.slice(0, 10), dove: 'Note della contabilità', testo: sn, a: cant ? '#/contabilita/' + cant.id : '#/' });
  });
  valori(db.cantieri).forEach(function (c) {
    const sn = stralcio(c.note);
    if (sn) risultati.push({ cantiere: c.codice, cosa: 'Cantiere', giorno: c.aggiornato.slice(0, 10), dove: 'Note del cantiere', testo: sn, a: '#/note/' + c.id });
  });
  risultati.sort(function (a, b) { return b.giorno.localeCompare(a.giorno); });
  if (!risultati.length) { html += '<div class="vuoto-stato">Niente con «' + h(filtroDocumenti) + '».</div>'; return html; }
  html += '<div class="eti">Risultati <span class="n">' + risultati.length + '</span></div>';
  risultati.slice(0, 100).forEach(function (r) {
    const cant = cantierePerCodice(r.cantiere);
    html += '<div class="card tocca" data-az="vai" data-a="' + h(r.a) + '"><div class="card-in"><div class="fila" style="margin:0 0 6px"><span class="pill cod">' + h(r.cosa) + '</span><span class="mini">' + h(cant ? cant.nome : '') + ' · ' + h(dataSenzaAnno(r.giorno)) + '</span></div>' +
      '<div class="sotto" style="color:var(--azione);font-size:14px;text-transform:uppercase;letter-spacing:.05em">' + h(r.dove) + '</div><div style="font-size:17px;margin-top:4px">' + h(r.testo) + '</div></div></div>';
  });
  return html;
}

/* ---------------- CANTIERE: nuovo / modifica ---------------- */
function vistaCantiereForm(id, idAzienda) {
  const c = id ? cantiere(id) : null;
  if (id && !c) return vistaDashboard();
  const azNuova = idAzienda ? azienda(idAzienda) : null;
  const v = c || { nome: '', committente: '', indirizzo: '', stato: 'attivo', aperto: oggiISO(), azienda: azNuova ? azNuova.codice : '' };
  const aziende = aziendeTutte();
  let html = testata({ indietro: c ? '#/cantiere/' + c.id : '#/', titolo: c ? 'Modifica cantiere' : 'Nuovo cantiere', sotto: c ? h(c.nome) : '' });
  html += '<div class="modulo">' +
    '<label class="eticampo">Nome del cantiere</label><input class="campo" id="c-nome" value="' + h(v.nome) + '" placeholder="es. Via Mazzini 14" autocomplete="off"' + (c ? '' : ' autofocus') + '>' +
    '<label class="eticampo">Committente</label><input class="campo" id="c-comm" value="' + h(v.committente) + '" autocomplete="off">' +
    '<label class="eticampo">Indirizzo</label><input class="campo" id="c-ind" value="' + h(v.indirizzo || '') + '" autocomplete="off">' +
    (aziende.length ? '<label class="eticampo">Azienda</label><select class="campo" id="c-azienda"><option value="">— nessuna —</option>' +
      aziende.map(function (a) { return '<option value="' + h(a.codice) + '"' + ((v.azienda || '') === a.codice ? ' selected' : '') + '>' + h(a.nome) + '</option>'; }).join('') + '</select>' : '') +
    '<div class="due"><div><label class="eticampo">Stato</label><select class="campo" id="c-stato"><option value="attivo"' + (v.stato !== 'chiuso' ? ' selected' : '') + '>attivo</option><option value="chiuso"' + (v.stato === 'chiuso' ? ' selected' : '') + '>chiuso</option></select></div>' +
    '<div><label class="eticampo">Aperto il</label><input class="campo" id="c-aperto" type="date" value="' + h(v.aperto || '') + '"></div></div>' +
    '</div>';
  html += '<div class="barra"><button class="az verde" data-az="cantiere-salva" data-id="' + h(c ? c.id : '') + '">Salva</button></div>';
  return html;
}

/* ============================================================
   MODO SVILUPPATORE
   Si entra con cinque tocchi sul titolo e un PIN. Qui stanno le chiavi,
   la coda, i consumi, lo spazio, la copia su GitHub e i dati di esempio.
   Fuori di qui, niente di tecnico.
   ============================================================ */

// Il conto della settimana da chiudere: si misura quando serve, e la schermata lo legge già pronto.
const SETT_CONTO = { inizio: null, audio: 0, foto: 0, byte: 0 };
async function contaSettimana() {
  const sett = settimanaDaChiudere();
  if (!sett) { SETT_CONTO.inizio = null; SETT_CONTO.audio = 0; SETT_CONTO.foto = 0; SETT_CONTO.byte = 0; return; }
  if (SETT_CONTO.inizio === sett.inizio) return;
  const p = await pesoSettimana(sett.inizio, sett.fine);
  SETT_CONTO.inizio = sett.inizio; SETT_CONTO.audio = p.audio; SETT_CONTO.foto = p.foto; SETT_CONTO.byte = p.byte;
}

const SPAZIO = { usato: 0, quota: 0, audioByte: 0, audioN: 0, fotoByte: 0, fotoN: 0, pdfByte: 0, pdfN: 0, mesi: {}, vecchi: 0, fotoVecchie: 0, avviso: false, orfani: [] };

async function misuraSpazio() {
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const e = await navigator.storage.estimate();
      SPAZIO.usato = e.usage || 0; SPAZIO.quota = e.quota || 0;
    }
  } catch (e) { /* non tutti i browser lo dicono */ }
  const elenco = await elencaMedia();
  const perId = {};
  valori(leggiTutto().sopralluoghi).forEach(function (s) {
    s.pezzi.forEach(function (p) { if (p.audio) perId[p.audio.replace(/^idb:/, '')] = { sop: s, pezzo: p }; });
    // Le foto, e l'audio di un referto non ancora trascritto: non sono orfani, hanno un documento.
    fotoDi(s).forEach(function (f) {
      if (f.file) perId[f.file.replace(/^idb:/, '')] = { sop: s, foto: f };
      if (f.audio) perId[f.audio.replace(/^idb:/, '')] = { sop: s, pezzo: { scaricato: null } };
    });
  });
  // I PDF archiviati hanno un padrone anche loro: senza questo finirebbero fra gli orfani da buttare.
  const perPdf = {};
  pdfArchiviati().forEach(function (p) { if (p.file) perPdf[p.file.replace(/^idb:/, '')] = p; });
  // Logo e firma delle aziende: hanno un padrone anche loro, e non si buttano.
  valori(leggiTutto().aziende).forEach(function (a) {
    ['logo', 'firma', 'banda', 'bandaPiede'].forEach(function (k) {
      if (a[k]) perPdf[a[k].replace(/^idb:/, '')] = a;
    });
  });
  const limite = giorniFa(GIORNI_AUDIO);
  SPAZIO.audioByte = 0; SPAZIO.audioN = 0; SPAZIO.fotoByte = 0; SPAZIO.fotoN = 0; SPAZIO.pdfByte = 0; SPAZIO.pdfN = 0; SPAZIO.mesi = {}; SPAZIO.vecchi = 0; SPAZIO.fotoVecchie = 0; SPAZIO.orfani = [];
  elenco.forEach(function (m) {
    if (perPdf[m.id]) { SPAZIO.pdfByte += m.peso || 0; SPAZIO.pdfN += 1; return; }
    const rif = perId[m.id];
    // Un audio senza documento (una nota già trascritta, un pezzo di un sopralluogo cancellato) è solo peso morto.
    if (!rif) { SPAZIO.orfani.push(m.id); return; }
    const mese = rif.sop.giorno.slice(0, 7);
    const voce = SPAZIO.mesi[mese] || (SPAZIO.mesi[mese] = { byte: 0, n: 0, scaricati: 0, foto: { byte: 0, n: 0, scaricati: 0 } });
    if (rif.foto) {
      voce.foto.byte += m.peso || 0; voce.foto.n += 1;
      if (rif.foto.scaricato) voce.foto.scaricati += 1;
      SPAZIO.fotoByte += m.peso || 0; SPAZIO.fotoN += 1;
      if (rif.sop.giorno < limite) SPAZIO.fotoVecchie += 1;
      return;
    }
    voce.byte += m.peso || 0; voce.n += 1;
    if (rif.pezzo.scaricato) voce.scaricati += 1;
    SPAZIO.audioByte += m.peso || 0; SPAZIO.audioN += 1;
    if (rif.sop.giorno < limite) SPAZIO.vecchi += 1;
  });
  SPAZIO.avviso = SPAZIO.quota > 0 && (SPAZIO.usato / SPAZIO.quota) > SOGLIA_SPAZIO;
  return SPAZIO;
}

/* Le impostazioni: quello che l'utente cambia davvero. La roba tecnica —
   chiavi, coda, spazio, copia su GitHub — resta nel modo tecnico, che da qui
   si raggiunge con una riga. */
function vistaImpostazioni() {
  const c = (leggiLocale().colori) || {};
  let html = testata({ indietro: '#/', titolo: 'Impostazioni' });
  const voce = function (dove, nome, sotto) {
    return '<button class="riga" data-az="vai" data-a="#/impostazioni/' + dove + '">' +
      '<span class="desc">' + h(nome) + '<small>' + h(sotto) + '</small></span><span class="frec">›</span></button>';
  };
  html += '<div class="card">' +
    voce('aspetto', 'Aspetto', (tinta(c.primario) || tinta('verde')).nome + ' e ' + (tinta(c.secondario) || tinta('azzurro')).nome) +
    voce('archivio', 'Archivio', 'aziende, cantieri, verbali') +
    '<button class="riga" data-az="vai" data-a="#/dev"><span class="desc">Modo tecnico<small>chiavi, coda, spazio, copia su GitHub</small></span><span class="frec">›</span></button>' +
    '</div>';
  return html;
}

function vistaImpostazioniAspetto() {
  const c = (leggiLocale().colori) || {};
  const blocco = function (quale, sceltoId, difetto, titolo, spiega) {
    const ora = tinta(sceltoId) || tinta(difetto);
    const suMisura = /^#/.test(String(sceltoId || ''));
    /* Una riga sola che scorre di lato, come la striscia delle foto. Il primo
       posto è del pennello: si vede subito che il colore te lo puoi fare tu. */
    return '<div class="card"><div class="card-capo">' + h(titolo) + '<span class="dx">' + h(ora.nome) + '</span></div>' +
      '<div class="tinte">' +
      '<span class="pennello-box' + (suMisura ? ' scelta' : '') + '">' +
      '<input type="color" class="pennello" value="' + h(ora.val) + '" data-campo="colore-libero" data-quale="' + quale + '" aria-label="Fatti il colore che vuoi" title="Fatti il colore che vuoi">' +
      '</span>' +
      TINTE.map(function (t) {
        const scelto = !suMisura && (sceltoId ? t.id === sceltoId : t.id === difetto);
        return '<button class="tinta' + (scelto ? ' scelta' : '') + '" data-az="colore" data-quale="' + quale + '" data-tinta="' + t.id + '"' +
          ' style="--tinta:' + t.val + '" aria-label="' + h(t.nome) + '" title="' + h(t.nome) + '"></button>';
      }).join('') + '</div>' +
      '<div class="card-piede"><span style="flex:1">' + h(spiega) + '</span>' +
      '<button class="link" data-az="colore" data-quale="' + quale + '" data-tinta="' + difetto + '">torna a ' + h(tinta(difetto).nome.toLowerCase()) + '</button></div>' +
      '</div>';
  };
  let html = testata({ indietro: '#/impostazioni', titolo: 'Aspetto' });
  html += blocco('primario', c.primario, 'verde', 'Colore principale', 'Il lavoro fatto, i tasti, i totali.');
  html += blocco('secondario', c.secondario, 'azzurro', 'Colore secondario', 'Quello che si apre e si consulta.');
  return html;
}

function vistaImpostazioniArchivio() {
  const db = leggiTutto();
  const az = valori(db.aziende || {});
  const cant = valori(db.cantieri).sort(function (a, b) { return a.nome.localeCompare(b.nome); });
  const verb = valori(db.verbali).sort(function (a, b) { return (b.giorno + b.ora).localeCompare(a.giorno + a.ora); });
  const pdf = pdfArchiviati().sort(function (a, b) { return String(b.quando).localeCompare(String(a.quando)); });
  let html = testata({ indietro: '#/impostazioni', titolo: 'Archivio' });

  html += tendina('arc-aziende', 'Aziende', '<div class="card">' + (az.length ? az.map(function (a) {
    return '<button class="riga" data-az="vai" data-a="#/azienda/' + h(a.id) + '">' +
      '<span class="desc">' + h(a.nome) + '<small>' + cantieriDiAzienda(a.codice).length + ' cantieri</small></span>' +
      '<span class="frec">›</span></button>';
  }).join('') : '<div class="card-corpo">Nessuna azienda.</div>') + '</div>', az.length);

  html += tendina('arc-cantieri', 'Cantieri', '<div class="card">' + (cant.length ? cant.map(function (c) {
    return '<button class="riga" data-az="vai" data-a="#/cantiere/' + h(c.id) + '">' +
      '<span class="desc">' + h(c.nome) + '<small>' + h(c.committente || 'senza committente') + (c.stato === 'chiuso' ? ' · chiuso' : '') + '</small></span>' +
      '<span class="frec">›</span></button>';
  }).join('') : '<div class="card-corpo">Nessun cantiere.</div>') + '</div>', cant.length);

  html += tendina('arc-verbali', 'Verbali', '<div class="card">' + (verb.length ? verb.map(function (v) {
    const sop = valori(db.sopralluoghi).find(function (z) { return z.codice === v.sopralluogo; });
    const c = cantierePerCodice(v.cantiere);
    return '<button class="riga"' + (sop ? ' data-az="vai" data-a="#/giorno/' + h(sop.id) + '"' : '') + '>' +
      '<span class="desc">' + h(titoloVerbale(v, true)) + '<small>' + h(giornoMese(v.giorno)) + ' · ' + h(c ? c.nome : '') + '</small></span>' +
      (sop ? '<span class="frec">›</span>' : '') + '</button>';
  }).join('') : '<div class="card-corpo">Nessun verbale.</div>') + '</div>', verb.length);

  html += tendina('arc-pdf', 'PDF archiviati', '<div class="card">' + (pdf.length ? pdf.map(function (p) {
    return '<div class="riga-pdf"><button class="n" data-az="pdf-apri" data-id="' + h(p.id) + '">' +
      '<span class="t">' + h(p.nome || 'documento.pdf') + '</span>' +
      '<span class="s">' + h(p.giorno ? giornoMese(p.giorno) : '') + (p.peso ? ' · ' + h(pesoFile(p.peso)) : '') + '</span></button>' +
      '<button class="pill cod" data-az="pdf-manda" data-id="' + h(p.id) + '">manda</button></div>';
  }).join('') : '<div class="card-corpo">Nessun PDF archiviato.</div>') + '</div>', pdf.length);

  return html;
}

function vistaDev() {
  if (!devSbloccato) {
    return testata({ indietro: '#/', titolo: 'Modo sviluppatore', sotto: 'serve il PIN' }) +
      '<div class="modulo"><input class="campo pin" id="pin" type="password" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="····" autofocus>' +
      '<button class="btn btn-ok" data-az="pin-verifica" style="margin-top:12px">Entra</button></div>';
  }
  const loc = leggiLocale();
  const mese = oggiISO().slice(0, 7);
  const c = loc.consumi[mese] || { ingresso: 0, uscita: 0, cacheLettura: 0, cacheScrittura: 0, chiamate: 0 };
  const percento = SPAZIO.quota ? Math.round(SPAZIO.usato / SPAZIO.quota * 100) : null;
  const statoChiave = function (k) { return k ? '<span class="pill ok">impostata</span>' : '<span class="pill att">mancante</span>'; };
  let html = testata({ indietro: '#/', titolo: 'Modo sviluppatore', sotto: 'versione ' + VERSIONE_APP + ' · ' + (navigator.onLine ? 'in rete' : 'senza rete') });
  html += '<div class="dev">';
  // Le chiavi: si scrivono, non si rileggono mai in chiaro.
  html += '<div class="card"><div class="card-capo">Chiavi dei servizi</div><div class="card-in">' +
    '<label class="eticampo">Chiave Groq (gsk_…) ' + statoChiave(loc.chiavi.groq) + '</label><input class="campo" id="k-groq" type="password" autocomplete="off" placeholder="' + (loc.chiavi.groq ? 'lascia vuoto per non cambiarla' : 'incolla qui') + '">' +
    '<label class="eticampo">Chiave Anthropic (sk-ant-…) ' + statoChiave(loc.chiavi.anthropic) + '</label><input class="campo" id="k-anthropic" type="password" autocomplete="off" placeholder="' + (loc.chiavi.anthropic ? 'lascia vuoto per non cambiarla' : 'incolla qui') + '">' +
    '<label class="eticampo">Token GitHub (github_pat_…) ' + statoChiave(loc.chiavi.github) + '</label><input class="campo" id="k-github" type="password" autocomplete="off" placeholder="' + (loc.chiavi.github ? 'lascia vuoto per non cambiarlo' : 'incolla qui') + '">' +
    '<label class="eticampo">Repository GitHub (utente/nome)</label><input class="campo" id="k-repo" autocomplete="off" value="' + h(loc.repo || '') + '" placeholder="' + h(repoGitHub() || 'tuonome/cantieri') + '">' +
    '<label class="eticampo">Modello per il riordino</label><input class="campo" id="k-modello" autocomplete="off" value="' + h(loc.modello || MODELLO) + '">' +
    '<label class="eticampo">Mail dove mandare la settimana</label><input class="campo" id="k-mail" type="email" autocomplete="off" value="' + h(loc.mail || '') + '" placeholder="nome@esempio.it">' +
    '<label class="eticampo">Prima schermata</label><select class="campo" id="k-salta"><option value=""' + (loc.saltaAziende ? '' : ' selected') + '>le aziende</option><option value="1"' + (loc.saltaAziende ? ' selected' : '') + '>i cantieri, salta le aziende</option></select>' +
    '<button class="btn btn-ok" data-az="chiavi-salva" style="margin-top:16px">Salva le chiavi</button>' +
    '<button class="btn btn-rosso medio" data-az="chiavi-cancella" style="margin-top:8px">Cancella tutte le chiavi</button></div></div>';
  // La coda
  const coda = loc.coda;
  html += '<div class="card"><div class="card-capo' + (coda.length ? '' : ' spenta') + '">Coda<span class="dx">' + coda.length + ' lavori</span></div>' +
    (coda.length ? coda.map(function (l) {
      const cls = l.stato === 'fallito' ? 'err' : (l.stato === 'in_corso' ? 'ok' : 'att');
      return '<div class="coda-riga"><span>' + h(descriviLavoro(l)) + (l.errore ? '<br><small style="color:var(--muted)">' + h(l.errore) + ' · tentativi ' + (l.tentativi || 0) + '</small>' : '') + '</span><span class="stato ' + cls + '">' + h(l.stato.replace('_', ' ')) + '</span></div>';
    }).join('') : '<div class="card-corpo" style="color:var(--muted)">Vuota: niente in attesa.</div>') +
    '<div class="griglia"><button class="btn" data-az="coda-riprova">Riprova i falliti</button><button class="btn btn-rosso" data-az="coda-svuota">Svuota la coda</button></div></div>';
  // Consumi
  html += '<div class="card"><div class="card-capo">Consumi di ' + h(titoloMese(mese + '-01')) + '</div><div class="card-corpo">' +
    'Token in ingresso: ' + h(numeroIt(c.ingresso, 0)) + '\nToken in uscita: ' + h(numeroIt(c.uscita, 0)) +
    '\nLetti dalla cache: ' + h(numeroIt(c.cacheLettura, 0)) + ' · scritti in cache: ' + h(numeroIt(c.cacheScrittura, 0)) +
    '\nChiamate: ' + c.chiamate + '\nSpesa stimata: ' + spesaStimata(c).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 3 }) + ' $</div>' +
    '<div class="card-piede">Ultima chiamata: ' + (loc.ultimaCache ? h(numeroIt(loc.ultimaCache.letti, 0)) + ' token letti dalla cache' + (loc.ultimaCache.letti > 0 ? ' ✓' : (loc.ultimaCache.scritti > 0 ? ' (scritti ' + h(numeroIt(loc.ultimaCache.scritti, 0)) + ')' : ' — la cache non ha lavorato')) : 'nessuna ancora') + '</div></div>';
  // Spazio
  html += '<div class="card' + (SPAZIO.avviso ? ' attenzione' : '') + '"><div class="card-capo">Spazio</div><div class="card-corpo">' +
    (SPAZIO.quota ? 'Occupato: ' + h(megabyte(SPAZIO.usato)) + ' su ' + h(megabyte(SPAZIO.quota)) + ' (' + percento + '%)' : 'Occupato: il telefono non lo dice') +
    '\nAudio nel telefono: ' + SPAZIO.audioN + ' (' + h(megabyte(SPAZIO.audioByte)) + ')' +
    '\nFoto nel telefono: ' + SPAZIO.fotoN + ' (' + h(megabyte(SPAZIO.fotoByte)) + ')' +
    (SPAZIO.vecchi ? '\nAudio più vecchi di ' + GIORNI_AUDIO + ' giorni: ' + SPAZIO.vecchi + ' — da scaricare' : '') +
    (SPAZIO.fotoVecchie ? '\nFoto più vecchie di ' + GIORNI_AUDIO + ' giorni: ' + SPAZIO.fotoVecchie + ' — da scaricare' : '') +
    (SPAZIO.avviso ? '\nSpazio quasi pieno: scarica audio e foto vecchi e libera.' : '') + '</div>';
  const mesi = Object.keys(SPAZIO.mesi).sort();
  mesi.forEach(function (m) {
    const v = SPAZIO.mesi[m];
    const nomeMese = h(MESI[parseInt(m.slice(5), 10) - 1]);
    const contoScaricati = function (x) { return x.scaricati >= x.n ? ' · scaricati' : (x.scaricati ? ' · ' + x.scaricati + ' scaricati' : ''); };
    // Prima si porta fuori tutto, audio e foto, poi si libera: il tasto rosso si accende solo allora.
    const tuttiScaricati = v.scaricati >= v.n && v.foto.scaricati >= v.foto.n;
    html += '<div class="card-piede" style="flex-wrap:wrap;gap:8px"><span style="flex:1 1 100%">' + h(titoloMese(m + '-01')) + ': ' +
      (v.n ? v.n + ' audio, ' + h(megabyte(v.byte)) + contoScaricati(v) : 'nessun audio') + '<br>' +
      (v.foto.n ? v.foto.n + ' foto, ' + h(megabyte(v.foto.byte)) + contoScaricati(v.foto) : 'nessuna foto') + '</span>' +
      (v.n ? '<button class="btn medio" style="flex:1 1 100%" data-az="spazio-scarica" data-mese="' + m + '">Scarica gli audio di ' + nomeMese + '</button>' : '') +
      (v.foto.n ? '<button class="btn medio" style="flex:1 1 100%" data-az="spazio-scarica-foto" data-mese="' + m + '">Scarica le foto di ' + nomeMese + '</button>' : '') +
      '<button class="btn medio btn-rosso" style="flex:1 1 100%" data-az="spazio-libera" data-mese="' + m + '"' + (tuttiScaricati ? '' : ' disabled') + '>Libera spazio</button></div>';
  });
  if (SPAZIO.orfani.length) html += '<div class="card-piede"><span style="flex:1">' + SPAZIO.orfani.length + ' audio senza documento</span><button class="btn medio" data-az="spazio-orfani">Pulisci</button></div>';
  html += '</div>';
  // GitHub
  const g = loc.github;
  html += '<div class="card"><div class="card-capo' + (githubPronto() ? '' : ' spenta') + '">Copia su GitHub</div><div class="card-corpo">' +
    (githubPronto() ? 'Repository: ' + h(repoGitHub()) + ', ramo dati' : 'Non configurata: servono token e repository.') +
    '\nUltimo invio: ' + (g.ultimoInvio ? h(new Date(g.ultimoInvio).toLocaleString('it-IT')) : 'mai') +
    (g.daMandare ? '\nCi sono modifiche da mandare.' : '') + (g.errore ? '\nErrore: ' + h(g.errore) : '') + '</div>' +
    '<div class="griglia"><button class="btn" data-az="github-manda">Manda adesso</button><button class="btn" data-az="github-scarica">Scarica da GitHub</button></div></div>';
  // Dati di esempio
  const nEsempio = Object.keys(COLLEZIONI).reduce(function (n, t) { return n + valori(leggiTutto()[COLLEZIONI[t]]).filter(function (o) { return o.esempio; }).length; }, 0);
  html += '<div class="card"><div class="card-capo' + (nEsempio ? '' : ' spenta') + '">Dati di esempio<span class="dx">' + nEsempio + ' documenti</span></div>' +
    '<div class="griglia"><button class="btn btn-rosso" data-az="esempio-butta"' + (nEsempio ? '' : ' disabled') + '>Butta via gli esempi</button><button class="btn" data-az="esempio-rimetti">Rimetti gli esempi</button></div></div>';
  html += '<div class="card"><div class="card-capo spenta">Notifiche</div><div class="card-corpo">' + ('Notification' in window ? 'Permesso: ' + h(Notification.permission) : 'Non disponibili su questo browser') + '\nPromemoria delle 18: ' + (loc.promemoriaGiorno === oggiISO() ? 'già mandato oggi' : 'non ancora oggi') + '</div>' +
    '<div class="griglia"><button class="btn" data-az="notifiche-chiedi">Chiedi il permesso</button><button class="btn" data-az="notifiche-prova">Prova una notifica</button></div></div>';
  html += '<div class="modulo"><button class="btn" data-az="dev-esci">Esci dal modo sviluppatore</button></div>';
  html += '</div>';
  return html;
}

async function scaricaAudioMese(mese) {
  const file = [];
  const pezziDelMese = [];
  for (const s of valori(leggiTutto().sopralluoghi)) {
    if (s.giorno.slice(0, 7) !== mese) continue;
    for (const p of s.pezzi) {
      if (!p.audio) continue;
      const blob = await leggiMedia(p.audio);
      if (!blob) continue;
      const nome = s.codice + '_' + s.giorno + '_' + p.ora.replace(':', '-') + '_' + nomeFile(p.titolo || 'registrazione') + '.' + estensioneAudio(blob.type);
      file.push(new File([blob], nome, { type: blob.type || 'audio/mp4' }));
      pezziDelMese.push({ sop: s, pezzo: p });
    }
  }
  if (!file.length) { avvisa('Niente da scaricare', 'att'); return; }
  if (!(await portaFuori(file, 'Audio CANTIERI ' + mese))) return;
  const adesso = adessoISO();
  const toccati = new Set();
  pezziDelMese.forEach(function (x) { x.pezzo.scaricato = adesso; toccati.add(x.sop); });
  toccati.forEach(function (s) { salva('sopralluogo', s); });
  avvisa('Scaricati', 'ok');
  await misuraSpazio();
  aggiornaVista();
}

/* I file escono dal telefono con il tasto di condivisione dell'iPhone (i File, iCloud).
   Torna vero se sono usciti, falso se l'uomo ha annullato: serve ad audio e foto allo stesso modo. */
async function portaFuori(file, titolo) {
  if (navigator.share && navigator.canShare && navigator.canShare({ files: file })) {
    try { await navigator.share({ files: file, title: titolo }); return true; }
    catch (e) { if (e && e.name === 'AbortError') { avvisa('Annullato', 'att'); return false; } }
  }
  // Senza condivisione (un computer): si scaricano uno per uno.
  for (const f of file) {
    const url = URL.createObjectURL(f);
    const a = document.createElement('a'); a.href = url; a.download = f.name; document.body.appendChild(a); a.click(); a.remove();
    await attendi(300);
    URL.revokeObjectURL(url);
  }
  return true;
}

// Come per gli audio: le foto di un mese escono tutte insieme, col nome che dice giorno, ora, codice e referto.
async function scaricaFotoMese(mese) {
  const file = [];
  const fotoDelMese = [];
  for (const s of valori(leggiTutto().sopralluoghi)) {
    if (s.giorno.slice(0, 7) !== mese) continue;
    for (const f of fotoDi(s)) {
      if (!f.file) continue;
      const blob = await leggiMedia(f.file);
      if (!blob) continue;
      const referto = primaRiga(f.referto);
      const nome = s.codice + '_' + f.giorno + '_' + String(f.ora || '').replace(':', '-') + '_' + f.codice + (referto ? '_' + nomeFile(referto) : '') + estensioneMedia(f);
      file.push(new File([blob], nome, { type: tipoMedia(f, blob) }));
      fotoDelMese.push({ sop: s, foto: f });
    }
  }
  if (!file.length) { avvisa('Niente da scaricare', 'att'); return; }
  if (!(await portaFuori(file, 'Foto CANTIERI ' + mese))) return;
  const adesso = adessoISO();
  const toccati = new Set();
  fotoDelMese.forEach(function (x) { x.foto.scaricato = adesso; toccati.add(x.sop); });
  toccati.forEach(function (s) { salva('sopralluogo', s); });
  avvisa('Scaricate', 'ok');
  await misuraSpazio();
  aggiornaVista();
}

// Cancella solo dopo che lo scaricamento è andato a buon fine, e solo i file: testo, referti e nomi restano per sempre.
async function liberaSpazioMese(mese) {
  const ok = await chiedi('Liberare lo spazio?', 'Gli audio e le foto di ' + titoloMese(mese + '-01') + ' si cancellano dal telefono. Il testo trascritto, i referti e i nomi restano.', 'Libera spazio', 'rosso');
  chiudiFoglio();
  if (!ok) return;
  const oggi = oggiISO();
  for (const s of valori(leggiTutto().sopralluoghi)) {
    if (s.giorno.slice(0, 7) !== mese) continue;
    let toccato = false;
    for (const p of s.pezzi) {
      if (!p.audio || !p.scaricato) continue;
      await cancellaMedia(p.audio);
      p.audio = null; p.archiviato = oggi; toccato = true;
    }
    for (const f of fotoDi(s)) {
      if (!f.file || !f.scaricato) continue;
      scordaFoto(f.file);
      await cancellaMedia(f.file);
      f.file = null; f.archiviato = oggi; toccato = true;
    }
    if (toccato) salva('sopralluogo', s);
  }
  avvisa('Spazio liberato', 'ok');
  await misuraSpazio();
  aggiornaVista();
}

/* ============================================================
   IL PDF
   Tre modi: questo verbale, tutti i verbali di un cantiere in un periodo,
   una sola sezione. Le sezioni vuote non si stampano. Quando è pronto si apre
   il tasto di condivisione dell'iPhone: nessun invio automatico.
   ============================================================ */

/* Si arriva qui da un sopralluogo — e allora si prende il suo verbale — oppure
   direttamente da un verbale, anche da quello di giornata. */
function apriEsportaPdf(sopId, idVerbale) {
  let v = idVerbale ? verbale(idVerbale) : null;
  if (!v) { const s = sopralluogo(sopId); v = s ? verbaleDiSopralluogo(s.codice) : null; }
  if (!v) { avvisa('Nessun verbale', 'att'); return; }
  const c = cantierePerCodice(v.cantiere);
  const tutti = valori(leggiTutto().verbali).filter(function (x) { return x.cantiere === v.cantiere; }).sort(function (a, b) { return a.giorno.localeCompare(b.giorno); });
  const primo = tutti.length ? tutti[0].giorno : v.giorno;
  // Nel cantiere chiuso c'è una voce in più: la relazione di fine cantiere.
  const rel = c && c.stato === 'chiuso' ? relazioneDi(c.codice) : null;
  apriFoglio(
    '<h2>Esporta PDF</h2><p>' + h(c ? c.nome + ' · ' : '') + h(titoloVerbale(v, true)) + '</p>' +
    '<label class="eticampo">Cosa</label><select class="campo" id="pdf-modo" data-campo="pdf-modo">' +
    '<option value="questo">Questo verbale</option><option value="periodo">Tutti i verbali del cantiere in un periodo</option><option value="sezione">Una sola sezione</option>' +
    (rel ? '<option value="relazione">Relazione di fine cantiere</option>' : '') + '</select>' +
    '<div id="pdf-periodo" hidden>' +
    '<label class="eticampo">Periodi pronti</label>' +
    '<div class="periodi">' +
    '<button class="pill cod" data-az="pdf-quando" data-quando="settimana">questa settimana</button>' +
    '<button class="pill cod" data-az="pdf-quando" data-quando="settimana-scorsa">settimana scorsa</button>' +
    '<button class="pill cod" data-az="pdf-quando" data-quando="mese">questo mese</button>' +
    '<button class="pill cod" data-az="pdf-quando" data-quando="mese-scorso">mese scorso</button>' +
    '</div>' +
    '<div style="display:flex;gap:8px"><div style="flex:1"><label class="eticampo">Dal</label><input class="campo" type="date" id="pdf-dal" value="' + h(primo) + '"></div><div style="flex:1"><label class="eticampo">Al</label><input class="campo" type="date" id="pdf-al" value="' + h(v.giorno) + '"></div></div></div>' +
    '<div id="pdf-sezione" hidden><label class="eticampo">Sezione</label><select class="campo" id="pdf-quale">' + SEZIONI.map(function (z) { return '<option value="' + z.chiave + '">' + h(z.nome) + '</option>'; }).join('') + '</select>' +
    '<label class="eticampo">Di quali verbali</label><select class="campo" id="pdf-ambito" data-campo="pdf-ambito"><option value="questo">Solo questo verbale</option><option value="periodo">Tutti quelli di un periodo</option></select></div>' +
    '<button class="btn btn-ok" data-az="pdf-crea" data-id="' + h(v.id) + '">Crea il PDF</button>' +
    '<button class="btn" data-az="chiudi-foglio">Annulla</button>'
  );
}
// Le tendine del foglio PDF si mostrano a seconda del modo scelto.
function aggiornaFoglioPdf() {
  const modo = document.getElementById('pdf-modo');
  if (!modo) return;
  const ambito = document.getElementById('pdf-ambito');
  document.getElementById('pdf-sezione').hidden = modo.value !== 'sezione';
  document.getElementById('pdf-periodo').hidden = !(modo.value === 'periodo' || (modo.value === 'sezione' && ambito.value === 'periodo'));
}

async function creaPdf(idVerbale) {
  if (!window.PDFLib) { avvisa('PDF non pronto: serve la rete la prima volta', 'err'); return; }
  const v = verbale(idVerbale);
  if (!v) return;
  const modo = document.getElementById('pdf-modo').value;
  if (modo === 'relazione') {
    // La relazione ha il suo PDF: il foglio è servito solo a sceglierla.
    chiudiFoglio();
    const rel = relazioneDi(v.cantiere);
    if (rel) await creaPdfRelazione(rel.id); else avvisa('Nessuna relazione', 'att');
    return;
  }
  const dal = document.getElementById('pdf-dal').value, al = document.getElementById('pdf-al').value;
  const quale = document.getElementById('pdf-quale').value;
  const ambito = document.getElementById('pdf-ambito').value;
  let verbali = [v], soloSezione = null, riassunto = '';
  if (modo === 'periodo' || (modo === 'sezione' && ambito === 'periodo')) {
    verbali = valori(leggiTutto().verbali).filter(function (x) { return x.cantiere === v.cantiere && x.giorno >= dal && x.giorno <= al; });
    /* Un giorno entra una volta sola: se ha il verbale di giornata vale quello, che
       già mette insieme i sopralluoghi; se no i verbali dei singoli sopralluoghi. */
    const giorniConGiornata = {};
    verbali.forEach(function (x) { if (x.giornata) giorniConGiornata[x.giorno] = true; });
    verbali = verbali.filter(function (x) { return x.giornata || !giorniConGiornata[x.giorno]; })
      .sort(function (a, b) { return (a.giorno + a.ora).localeCompare(b.giorno + b.ora); });
    if (!verbali.length) { avvisa('Nessun verbale nel periodo', 'att'); return; }
  }
  if (modo === 'sezione') soloSezione = quale;
  chiudiFoglio();
  avvisa('Preparo il PDF…');
  if (modo === 'periodo' && verbali.length > 1 && chiaveAnthropic() && navigator.onLine) {
    // Due righe in testa che dicono come è andato il periodo: le scrive Claude dai verbali.
    try {
      const testo = verbali.map(function (x) { return dataBreve(x.giorno) + ':\n' + sezioniPiene(x.sezioni).map(function (k) { return nomeSezione(k) + ': ' + x.sezioni[k]; }).join('\n'); }).join('\n\n');
      riassunto = (await chiamaClaude(REGOLE_RIASSUNTO, 'Verbali:\n' + testo.slice(0, 20000), 800)).trim();
    } catch (e) { riassunto = ''; }
  }
  let byte;
  try { byte = await costruisciPdf(verbali, soloSezione, riassunto, { dal: dal, al: al, modo: modo }); }
  catch (e) { avvisa('PDF non riuscito', 'err'); return; }
  const c = cantierePerCodice(v.cantiere);
  // Se il verbale ha un nome, il file lo porta dietro al codice: VER-003_getto-solaio.pdf
  const baseVerbale = v.nome ? v.codice + '_' + nomeFile(v.nome) : v.codice;
  const nome = (modo === 'questo' ? baseVerbale : (modo === 'periodo' ? (c ? c.codice : 'cantiere') + '_' + dal + '_' + al : baseVerbale + '_' + quale)) + '.pdf';
  // Prima resta nell'app, poi esce: se la condivisione la annulli, il documento c'è lo stesso.
  const archiviato = await archiviaPdf(byte, nome, {
    chiave: modo === 'questo' ? 'verbale:' + v.codice : (modo === 'periodo' ? 'periodo:' + v.cantiere + ':' + dal + ':' + al : 'sezione:' + v.codice + ':' + quale),
    tipo: modo === 'questo' ? 'verbale' : (modo === 'periodo' ? 'periodo' : 'sezione'),
    cantiere: v.cantiere, sopralluogo: modo === 'questo' ? v.sopralluogo : '', giorno: modo === 'periodo' ? al : v.giorno
  });
  /* Finiti nel PDF, i rilievi della giornata si svuotano: il testo è nel verbale,
     nel PDF e nei rilievi complessivi del cantiere, e nella giornata non serve
     più. Foto e audio restano dove sono: quelli si buttano da soli con il tempo. */
  verbali.forEach(function (x) {
    const sop = valori(leggiTutto().sopralluoghi).find(function (z) { return z.codice === x.sopralluogo; });
    if (!sop) return;
    let svuotato = false;
    ['rilievi_ordine', 'rilievi_contabilita'].forEach(function (k) {
      if (String(sop.sezioni[k] || '').trim()) { sop.sezioni[k] = ''; svuotato = true; }
    });
    if (svuotato) salva('sopralluogo', sop);
  });
  /* Il PDF è fatto e archiviato. Adesso si sceglie cosa farne: mandarlo fuori,
     guardarlo qui dentro, o tornare a correggere il verbale da cui nasce. */
  apriFoglioPdfFatto(archiviato, v.id);
}

/* Scarica: il file finisce nei download, senza passare dal foglio di condivisione.
   Se il PDF non c'è ancora si apre la scelta del PDF, che lo fa e poi lo archivia. */
async function scaricaVerbale(idVerbale) {
  const v = verbale(idVerbale);
  if (!v) return;
  const p = pdfConChiave('verbale:' + v.codice);
  if (!p) { apriEsportaPdf(null, v.id); return; }
  const blob = p.file ? await leggiMedia(p.file) : null;
  if (!blob) { avvisa('Il file non c\'è più', 'err'); return; }
  scaricaBlob(blob, p.nome || 'verbale.pdf');
}
// Un file che scende nel telefono: un link di download, premuto e buttato.
function scaricaBlob(blob, nome) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nome; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  avvisa('Scaricato', 'ok');
}

/* Le tre strade dopo "Crea il PDF". */
function apriFoglioPdfFatto(p, idVerbale) {
  if (!p) return;
  apriFoglio(
    '<h2>PDF pronto</h2><p>' + h(p.nome || 'documento.pdf') + ' · ' + h(pesoFile(p.peso || 0)) + '</p>' +
    '<button class="btn btn-ok" data-az="pdf-manda" data-id="' + h(p.id) + '">Esporta</button>' +
    '<button class="btn" data-az="pdf-leggi" data-id="' + h(p.id) + '">Visualizza</button>' +
    (idVerbale ? '<button class="btn" data-az="pdf-modifica" data-id="' + h(idVerbale) + '">Modifica il verbale</button>' : '') +
    '<button class="btn" data-az="chiudi-foglio">Chiudi</button>'
  );
}

// Le lettere che il carattere standard non sa scrivere si sostituiscono, se no pdf-lib si ferma.
function testoPdf(s) {
  return String(s || '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[—–]/g, '-').replace(/…/g, '...')
    .replace(/[^\x20-\x7E\xA0-\xFF\u20AC\u2022\n]/g, '?');
}
function spezzaRighe(font, testo, corpo, larghezza) {
  const righe = [];
  String(testo).split('\n').forEach(function (par) {
    const parole = par.split(/\s+/).filter(Boolean);
    if (!parole.length) { righe.push(''); return; }
    let riga = '';
    parole.forEach(function (p) {
      const prova = riga ? riga + ' ' + p : p;
      if (font.widthOfTextAtSize(prova, corpo) <= larghezza) riga = prova;
      else {
        if (riga) righe.push(riga);
        // Una parola più lunga della riga si spezza a forza.
        while (font.widthOfTextAtSize(p, corpo) > larghezza && p.length > 1) {
          let n = p.length;
          while (n > 1 && font.widthOfTextAtSize(p.slice(0, n), corpo) > larghezza) n--;
          righe.push(p.slice(0, n)); p = p.slice(n);
        }
        riga = p;
      }
    });
    if (riga) righe.push(riga);
  });
  return righe;
}

async function costruisciPdf(verbali, soloSezione, riassunto, info) {
  const PDF = window.PDFLib;
  const doc = await PDF.PDFDocument.create();
  const normale = await doc.embedFont(PDF.StandardFonts.Helvetica);
  const grassetto = await doc.embedFont(PDF.StandardFonts.HelveticaBold);
  const L = 595.28, A = 841.89, M = 50;
  const larghezza = L - 2 * M;
  let pagina = null, y = 0, numero = 0;
  // Il marchio dell'azienda del cantiere: logo, firma e i dati della carta intestata.
  let marchio = { az: null, logo: null, firma: null, banda: null, piede: null };
  /* Le bande dell'azienda: immagini larghe quanto il foglio, in cima e in fondo
     a ogni pagina. Sono la carta intestata vera del cliente, non una ricostruita
     a pezzi, quindi quando ci sono comandano loro. */
  const altBanda = function (img) { return img ? (img.height * L / img.width) : 0; };
  const nuovaPagina = function () {
    pagina = doc.addPage([L, A]);
    numero++;
    y = A - M;
    let bassoPiede = 28;
    if (marchio.piede) {
      const la = altBanda(marchio.piede);
      pagina.drawImage(marchio.piede, { x: 0, y: 0, width: L, height: la });
      bassoPiede = la + 10;
    }
    pagina.drawText(testoPdf((marchio.az ? marchio.az.nome + ' - ' : '') + 'CANTIERI - pagina ' + numero), { x: M, y: bassoPiede, size: 9, font: normale, color: PDF.rgb(0.5, 0.5, 0.5) });
    if (marchio.banda) {
      const la = altBanda(marchio.banda);
      pagina.drawImage(marchio.banda, { x: 0, y: A - la, width: L, height: la });
      y = A - la - 18;
    }
  };
  /* Il fondo utile della pagina si alza se c'è la banda del piè di pagina:
     senza questo il testo ci finirebbe sopra. */
  const fondo = function () { return M + (marchio.piede ? altBanda(marchio.piede) : 0); };
  const spazio = function (alt) { if (!pagina || y - alt < fondo()) nuovaPagina(); };
  const scrivi = function (testo, corpo, font, colore, rientro) {
    const righe = spezzaRighe(font, testoPdf(testo), corpo, larghezza - (rientro || 0));
    righe.forEach(function (r) {
      spazio(corpo * 1.4);
      if (r) pagina.drawText(r, { x: M + (rientro || 0), y: y - corpo, size: corpo, font: font, color: colore || PDF.rgb(0, 0, 0) });
      y -= corpo * 1.4;
    });
  };
  // Le foto marcate si preparano tutte prima: l'incorporazione è asincrona, il ciclo sotto no.
  marchio = await preparaMarchio(doc, verbali[0]);
  const fotoPerVerbale = await preparaFotoPdf(doc, verbali, soloSezione);
  // I documenti solo quando si stampa tutto: un'estrazione di una sezione sola non li riguarda.
  const docPerVerbale = soloSezione ? {} : await preparaDocumentiPdf(doc, verbali);
  /* Le foto vanno a due per riga, in due colonne larghe mezza pagina: un verbale con dodici
     foto occupava dodici pagine, così ne occupa tre. Sotto ogni foto il suo referto e i suoi
     dati, dentro la sua colonna: si legge come una scheda, non come un elenco. */
  const VUOTO_COL = 18;
  const LARG_COL = (larghezza - VUOTO_COL) / 2;
  const ALT_COL = 210;
  const datiFoto = function (f, c) { return f.codice + ' - ' + dataEstesa(f.giorno) + ', ' + (f.ora || '') + ' - ' + (c.nome || ''); };
  const mancaFoto = function (f) { return '[' + (f.file ? 'foto non leggibile' : 'foto archiviata' + (f.archiviato ? ' il ' + dataSenzaAnno(f.archiviato) : '')) + ']'; };
  /* Quanto è alto il blocco di una foto nella sua colonna. Si misura prima di disegnare:
     serve per sapere se la riga ci sta nella pagina e per far partire le due colonne dalla
     stessa altezza. */
  const misuraFoto = function (voce, c) {
    const f = voce.foto;
    let alt = 0, lo = 0, la = 0;
    if (voce.img) {
      const scala = Math.min(LARG_COL / voce.img.width, ALT_COL / voce.img.height, 1);
      lo = voce.img.width * scala; la = voce.img.height * scala;
      alt += la + 6;
    } else {
      alt += spezzaRighe(normale, testoPdf(mancaFoto(f)), 9, LARG_COL).length * 9 * 1.35 + 4;
    }
    const ref = String(f.referto || '').trim();
    if (ref) alt += spezzaRighe(normale, testoPdf(ref), 10, LARG_COL).length * 10 * 1.35 + 2;
    alt += spezzaRighe(normale, testoPdf(datiFoto(f, c)), 8, LARG_COL).length * 8 * 1.35;
    return { alt: alt, lo: lo, la: la };
  };
  const altezzaFoto = function (voce, c) { return voce ? misuraFoto(voce, c).alt : 0; };
  // Il testo dentro una colonna: stessa spezzatura del resto, ma largo mezza pagina.
  const scriviCol = function (testo, corpo, colore, x, cima) {
    spezzaRighe(normale, testoPdf(testo), corpo, LARG_COL).forEach(function (r) {
      if (r) pagina.drawText(r, { x: x, y: cima - corpo, size: corpo, font: normale, color: colore || PDF.rgb(0, 0, 0) });
      cima -= corpo * 1.35;
    });
    return cima;
  };
  const disegnaColonna = function (voce, c, x, cima, m) {
    const f = voce.foto;
    if (voce.img) {
      // Una foto in piedi è più stretta della colonna: si centra, così la pagina resta dritta.
      pagina.drawImage(voce.img, { x: x + (LARG_COL - m.lo) / 2, y: cima - m.la, width: m.lo, height: m.la });
      cima -= m.la + 6;
    } else {
      cima = scriviCol(mancaFoto(f), 9, PDF.rgb(0.45, 0.45, 0.45), x, cima) - 4;
    }
    const ref = String(f.referto || '').trim();
    if (ref) cima = scriviCol(ref, 10, null, x, cima) - 2;
    scriviCol(datiFoto(f, c), 8, PDF.rgb(0.45, 0.45, 0.45), x, cima);
  };
  /* Un documento non si mette in colonna: va largo quanto la pagina e alto quanto serve
     per leggerlo. Uno per riga, col suo cartellino sotto. */
  const ALT_DOC = 470;
  // Quanto è alto un documento sulla pagina: serve per non lasciare il titolo orfano in fondo.
  const altezzaDoc = function (voce) {
    if (!voce || !voce.img) return 40;
    return voce.img.height * Math.min(larghezza / voce.img.width, ALT_DOC / voce.img.height, 1) + 44;
  };
  const disegnaDocumenti = function (lista, c) {
    lista.forEach(function (voce) {
      const f = voce.foto;
      const eti = (GENERI[f.genere] || 'Documento') + ' - ' + f.codice + ' - ' + dataEstesa(f.giorno) + ', ' + (f.ora || '') + ' - ' + (c.nome || '');
      if (voce.pagine && voce.pagine.length) {
        /* Scansione PDF: l'etichetta e il referto stanno qui, poi le sue pagine
           entrano intere una dopo l'altra, e quello che segue riparte su una
           pagina nuova. Le pagine copiate contano nella numerazione. */
        spazio(40);
        scrivi(eti, 9, normale, PDF.rgb(0.45, 0.45, 0.45));
        if (String(f.referto || '').trim()) scrivi(f.referto, 10, normale);
        scrivi('(' + voce.pagine.length + (voce.pagine.length === 1 ? ' pagina allegata' : ' pagine allegate') + ')', 9, normale, PDF.rgb(0.45, 0.45, 0.45));
        voce.pagine.forEach(function (p) { doc.addPage(p); numero++; });
        pagina = null;
        return;
      }
      if (voce.img) {
        const scala = Math.min(larghezza / voce.img.width, ALT_DOC / voce.img.height, 1);
        const lo = voce.img.width * scala, la = voce.img.height * scala;
        spazio(Math.min(la + 44, A - 2 * M));
        y -= 4;
        pagina.drawImage(voce.img, { x: M + (larghezza - lo) / 2, y: y - la, width: lo, height: la });
        y -= la + 6;
      } else {
        spazio(40);
        scrivi('[' + (voce.fallito ? 'scansione PDF non copiabile: saltata' : (f.file ? 'documento non leggibile' : 'documento archiviato')) + ']', 10, normale, PDF.rgb(0.45, 0.45, 0.45));
      }
      if (String(f.referto || '').trim()) scrivi(f.referto, 10, normale);
      scrivi(eti, 9, normale, PDF.rgb(0.45, 0.45, 0.45));
      y -= 10;
    });
  };
  /* La carta intestata: logo a sinistra, i dati dell'azienda di fianco, e una riga sotto.
     Sta solo sulla prima pagina; sulle altre il nome torna nel piede. */
  const disegnaIntestazione = function () {
    if (!marchio.az) return;
    // Con la banda in cima la carta intestata c'è già: qui non si aggiunge niente.
    if (marchio.banda) return;
    const a = marchio.az;
    const righe = [a.ragione || a.nome, a.tecnico || '', a.indirizzo,
      [a.piva ? 'P.IVA ' + a.piva : '', a.telefono || ''].filter(Boolean).join('   -   '),
      [a.mail || '', a.sito || ''].filter(Boolean).join('   -   ')].filter(Boolean);
    let bassoLogo = y;
    let x = M;
    if (marchio.logo) {
      const scala = Math.min(140 / marchio.logo.width, 50 / marchio.logo.height, 1);
      const lo = marchio.logo.width * scala, la = marchio.logo.height * scala;
      pagina.drawImage(marchio.logo, { x: M, y: y - la, width: lo, height: la });
      bassoLogo = y - la;
      x = M + lo + 16;
    }
    let yy = y;
    righe.forEach(function (r, i) {
      const corpo = i === 0 ? 12 : 9;
      yy -= corpo;
      pagina.drawText(testoPdf(r), { x: x, y: yy, size: corpo, font: i === 0 ? grassetto : normale, color: i === 0 ? PDF.rgb(0, 0, 0) : PDF.rgb(0.4, 0.4, 0.4) });
      yy -= 4;
    });
    y = Math.min(bassoLogo, yy) - 10;
    pagina.drawLine({ start: { x: M, y: y }, end: { x: L - M, y: y }, thickness: 1.2, color: PDF.rgb(0.2, 0.2, 0.2) });
    y -= 18;
  };

  /* La firma in fondo: data a sinistra, azienda e firma a destra, sopra una riga.
     Se la firma non c'è resta lo spazio bianco per farla a penna. */
  const disegnaFirma = function () {
    if (!marchio.az) return;
    const a = marchio.az;
    spazio(130);
    y -= 24;
    pagina.drawText(testoPdf(dataEstesa(oggiISO())), { x: M, y: y - 10, size: 10, font: normale, color: PDF.rgb(0.45, 0.45, 0.45) });
    const x = L - M - 200;
    pagina.drawText(testoPdf(a.ragione || a.nome), { x: x, y: y - 10, size: 10, font: normale, color: PDF.rgb(0.45, 0.45, 0.45) });
    y -= 20;
    if (marchio.firma) {
      const scala = Math.min(200 / marchio.firma.width, 62 / marchio.firma.height, 1);
      const lo = marchio.firma.width * scala, la = marchio.firma.height * scala;
      pagina.drawImage(marchio.firma, { x: x, y: y - la, width: lo, height: la });
      y -= la + 4;
    } else y -= 46;
    pagina.drawLine({ start: { x: x, y: y }, end: { x: L - M, y: y }, thickness: 0.6, color: PDF.rgb(0.4, 0.4, 0.4) });
    pagina.drawText(testoPdf(a.tecnico ? a.tecnico : 'Firma'), { x: x, y: y - 12, size: 9, font: normale, color: PDF.rgb(0.45, 0.45, 0.45) });
    y -= 24;
  };

  const disegnaFotoGriglia = function (lista, c) {
    for (let i = 0; i < lista.length; i += 2) {
      const coppia = lista.slice(i, i + 2);
      const mis = coppia.map(function (v) { return misuraFoto(v, c); });
      const alt = Math.max.apply(null, mis.map(function (m) { return m.alt; }));
      // Le due foto della riga partono dalla stessa altezza; la riga finisce sulla più lunga.
      spazio(Math.min(alt + 12, A - 2 * M));
      const cima = y - 4;
      coppia.forEach(function (voce, j) { disegnaColonna(voce, c, M + j * (LARG_COL + VUOTO_COL), cima, mis[j]); });
      y = cima - alt - 12;
    }
  };
  // La relazione di fine cantiere ha una forma sua, ma la pagina, il testo e le foto sono questi:
  // le passa come attrezzi e si ferma qui. "giu" e "linea" muovono y e pagina, che vivono solo qui dentro.
  if (info.relazione) {
    disegnaRelazionePdf(info.relazione, {
      PDF: PDF, normale: normale, grassetto: grassetto, scrivi: scrivi, spazio: spazio, nuovaPagina: nuovaPagina,
      disegnaFotoGriglia: disegnaFotoGriglia, disegnaDocumenti: disegnaDocumenti, altezzaFoto: altezzaFoto, altezzaDoc: altezzaDoc,
      disegnaIntestazione: disegnaIntestazione, disegnaFirma: disegnaFirma,
      fotoPerGiorno: fotoPerVerbale, docPerGiorno: docPerVerbale,
      giu: function (n) { y -= n; },
      linea: function () { spazio(14); y -= 6; pagina.drawLine({ start: { x: M, y: y }, end: { x: L - M, y: y }, thickness: 0.8, color: PDF.rgb(0.2, 0.2, 0.2) }); y -= 12; }
    });
    return await doc.save();
  }
  const c0 = cantierePerCodice(verbali[0].cantiere) || {};
  let ultimoCantiere = c0;
  const conCopertina = info.modo === 'periodo' || (info.modo === 'sezione' && verbali.length > 1);
  if (conCopertina) {
    nuovaPagina();
    disegnaIntestazione();
    scrivi(soloSezione ? nomeSezione(soloSezione).toUpperCase() : 'VERBALI DI SOPRALLUOGO', 18, grassetto);
    y -= 6;
    scrivi((c0.codice || '') + ' - ' + (c0.nome || ''), 12, grassetto);
    scrivi('Committente: ' + (c0.committente || '') + (c0.indirizzo ? '\nIndirizzo: ' + c0.indirizzo : ''), 11, normale);
    scrivi('Periodo: dal ' + dataEstesa(info.dal) + ' al ' + dataEstesa(info.al) + ' - ' + verbali.length + (verbali.length === 1 ? ' verbale' : ' verbali'), 11, normale);
    if (riassunto) { y -= 8; scrivi('In breve', 11, grassetto); scrivi(riassunto, 11, normale); }
    y -= 10;
  }
  verbali.forEach(function (v, i) {
    const c = cantierePerCodice(v.cantiere) || {};
    if (!pagina) { nuovaPagina(); disegnaIntestazione(); } else if (i > 0) { y -= 16; spazio(120); }
    const testataPiena = !soloSezione || verbali.length === 1;
    if (testataPiena) {
      scrivi('VERBALE DI SOPRALLUOGO', 16, grassetto);
      y -= 4;
      if (v.nome) scrivi(v.nome, 12, grassetto);
      scrivi(v.codice + '   -   sopralluogo ' + (v.sopralluogo || ''), 11, normale);
      scrivi('Cantiere: ' + (c.codice || '') + ' - ' + (c.nome || '') + (c.indirizzo ? ' - ' + c.indirizzo : ''), 11, normale);
      scrivi('Committente: ' + (c.committente || ''), 11, normale);
      scrivi('Data: ' + dataEstesa(v.giorno) + '   Ora: ' + (v.ora || ''), 11, normale);
      spazio(14); y -= 6;
      pagina.drawLine({ start: { x: M, y: y }, end: { x: L - M, y: y }, thickness: 0.8, color: PDF.rgb(0.2, 0.2, 0.2) });
      y -= 12;
    } else {
      scrivi(dataEstesa(v.giorno).toUpperCase() + ' - ' + nomeVerbale(v), 12, grassetto);
    }
    const chiavi = soloSezione ? [soloSezione] : CHIAVI_SEZIONI;
    const fotoQui = fotoPerVerbale[v.id] || {};
    let stampate = 0;
    chiavi.forEach(function (k) {
      const testo = String(v.sezioni[k] || '').trim();
      const foto = fotoQui[k] || [];
      if (!testo && !foto.length) return;
      const def = SEZIONI.find(function (z) { return z.chiave === k; });
      // Una sezione di sole foto: il titolo deve stare nella stessa pagina della prima foto, non orfano in fondo.
      spazio(40 + (testo ? 0 : altezzaFoto(foto[0], c) + 40));
      scrivi(def.nome.toUpperCase(), 11, grassetto);
      if (!testo) { /* sezione con sole foto: il titolo fa da intestazione e basta */ }
      else if (def.elenco) righeElenco(testo).forEach(function (r) { scrivi('• ' + r, 11, normale, null, 6); });
      else scrivi(testo, 11, normale);
      disegnaFotoGriglia(foto, c);
      y -= 8;
      stampate++;
    });
    if (!stampate) scrivi(soloSezione ? '(sezione vuota)' : '(nessuna sezione compilata)', 11, normale, PDF.rgb(0.45, 0.45, 0.45));
    if (i === verbali.length - 1) ultimoCantiere = c;
    const docQui = docPerVerbale[v.id] || [];
    if (docQui.length) {
      y -= 6;
      // Il titolo resta sulla stessa pagina del primo documento.
      spazio(Math.min(30 + altezzaDoc(docQui[0]), A - 2 * M));
      scrivi('DOCUMENTI ALLEGATI', 11, grassetto);
      disegnaDocumenti(docQui, c);
    }
  });
  disegnaFirma();
  return await doc.save();
}

/* I sopralluoghi da cui un verbale prende foto e documenti: uno solo per il verbale di un
   sopralluogo; per la giornata tutti i passaggi, nell'ordine di v.sopralluoghi, o per ora
   se un verbale di giornata vecchio non lo porta. Lo stato del sopralluogo non conta. */
function sopralluoghiDelVerbale(v, sops) {
  if (!v.giornata) return sops.filter(function (x) { return x.codice === v.sopralluogo; });
  if (!(v.sopralluoghi || []).length) return sopralluoghiDelGiorno(v.cantiere, v.giorno);
  return v.sopralluoghi.map(function (k) { return sops.find(function (x) { return x.codice === k; }); })
    .filter(Boolean);
}

/* Le foto marcate dei verbali richiesti, ricompresse per la stampa e già incorporate nel
   documento: { idVerbale: { chiaveSezione: [ { foto, img } ] } }. Una foto il cui file non
   c'è più (archiviata) entra lo stesso, senza immagine: il referto è informazione. */
async function preparaFotoPdf(doc, verbali, soloSezione) {
  const per = {};
  const sops = valori(leggiTutto().sopralluoghi);
  for (const v of verbali) {
    for (const s of sopralluoghiDelVerbale(v, sops)) for (const f of fotoNormali(s)) {
      if (!f.nelPdf) continue;
      const k = sezioneFoto(f);
      if (soloSezione && k !== soloSezione) continue;
      let img = null;
      if (f.file) {
        const blob = await leggiMedia(f.file);
        if (blob) {
          try {
            const ridotta = await riduciFoto(blob, LATO_FOTO_PDF, QUALITA_FOTO_PDF);
            img = await doc.embedJpg(await ridotta.blob.arrayBuffer());
          } catch (e) { img = null; }
        }
      }
      per[v.id] = per[v.id] || {};
      (per[v.id][k] = per[v.id][k] || []).push({ foto: f, img: img });
    }
  }
  return per;
}

/* Logo e firma dell'azienda del cantiere, già incorporati nel documento. Senza azienda,
   o senza immagini, si restituisce vuoto e il PDF esce come prima. */
async function preparaMarchio(doc, primo) {
  const vuoto = { az: null, logo: null, firma: null, banda: null, piede: null };
  if (!primo) return vuoto;
  const c = cantierePerCodice(primo.cantiere);
  const a = aziendaDiCantiere(c);
  if (!a) return vuoto;
  const dentro = async function (rif) {
    if (!rif) return null;
    const blob = await leggiMedia(rif);
    if (!blob) return null;
    try {
      const ridotta = await riduciFoto(blob, LATO_LOGO, QUALITA_LOGO);
      return await doc.embedJpg(await ridotta.blob.arrayBuffer());
    } catch (e) { return null; }
  };
  const dentroGrande = async function (rif) {
    if (!rif) return null;
    const blob = await leggiMedia(rif);
    if (!blob) return null;
    try {
      const ridotta = await riduciFoto(blob, LATO_BANDA, QUALITA_LOGO);
      return await doc.embedJpg(await ridotta.blob.arrayBuffer());
    } catch (e) { return null; }
  };
  return { az: a, logo: await dentro(a.logo), firma: await dentro(a.firma),
    banda: await dentroGrande(a.banda), piede: await dentroGrande(a.bandaPiede) };
}

/* Le bolle e i moduli firme marcati, pronti da stampare: { idVerbale: [ { foto, img } ] }.
   Si riducono meno delle foto, perché di un documento conta quello che c'è scritto. */
async function preparaDocumentiPdf(doc, verbali) {
  const per = {};
  const sops = valori(leggiTutto().sopralluoghi);
  for (const v of verbali) {
    for (const s of sopralluoghiDelVerbale(v, sops)) for (const f of documentiDi(s)) {
      if (!f.nelPdf) continue;
      let img = null, pagine = null, fallito = false;
      if (f.file) {
        const blob = await leggiMedia(f.file);
        if (blob) {
          try {
            if (f.formato === 'pdf') {
              /* Una scansione PDF si copia dentro pagina per pagina. Se non si
                 riesce (file rovinato, cifrato), il documento si salta e nel PDF
                 resta una riga che lo dice: l'esportazione non si ferma. */
              const src = await window.PDFLib.PDFDocument.load(await blob.arrayBuffer(), { ignoreEncryption: true });
              pagine = await doc.copyPages(src, src.getPageIndices());
            } else {
              const ridotta = await riduciFoto(blob, LATO_DOC_PDF, QUALITA_DOC_PDF);
              img = await doc.embedJpg(await ridotta.blob.arrayBuffer());
            }
          } catch (e) { img = null; pagine = null; fallito = true; }
        }
      }
      (per[v.id] = per[v.id] || []).push({ foto: f, img: img, pagine: pagine, fallito: fallito });
    }
  }
  return per;
}

/* La relazione di fine cantiere sulla carta, nell'ordine deciso: intestazione, numeri, in breve,
   riepilogo per sezione, contabilità col totale, elenco dei giorni, foto marcate. Riceve gli
   attrezzi di costruisciPdf e non ne conosce l'interno: la meccanica del PDF resta una sola. */
function disegnaRelazionePdf(rel, a) {
  const c = cantierePerCodice(rel.cantiere) || {};
  const grigio = a.PDF.rgb(0.45, 0.45, 0.45);
  const giallo = a.PDF.rgb(0.62, 0.45, 0);
  const n = rel.numeri || {};
  const titolo = function (t) { a.giu(6); a.spazio(70); a.scrivi(t, 12, a.grassetto); a.giu(4); };
  a.nuovaPagina();
  a.disegnaIntestazione();
  a.scrivi('RELAZIONE DI FINE CANTIERE', 18, a.grassetto);
  a.giu(4);
  a.scrivi(rel.codice, 11, a.normale);
  a.scrivi('Cantiere: ' + (c.codice || '') + ' - ' + (c.nome || '') + (c.indirizzo ? ' - ' + c.indirizzo : ''), 11, a.normale);
  a.scrivi('Committente: ' + (c.committente || ''), 11, a.normale);
  a.scrivi('Aperto il ' + dataEstesa(rel.apertura) + '   -   Chiuso il ' + dataEstesa(rel.chiusura), 11, a.normale);
  a.linea();
  // I numeri in una riga, e il totale sotto in grassetto
  const conta = function (q, uno, tanti) { return (q || 0) + ' ' + ((q || 0) === 1 ? uno : tanti); };
  a.scrivi(conta(n.giorni, 'giorno di sopralluogo', 'giorni di sopralluogo') + ', ' + conta(n.verbali, 'verbale chiuso', 'verbali chiusi') + ', ' + conta(n.aperte, 'giornata non chiusa', 'giornate non chiuse') + ', ' + (n.foto || 0) + ' foto, ' + (n.documenti || 0) + ' documenti, ' + durataLunga(n.parlato) + ' di parlato', 11, a.normale);
  a.scrivi('Contabilità: ' + euro(n.totale), 12, a.grassetto);
  if (String(rel.inBreve || '').trim()) { titolo('IN BREVE'); a.scrivi(rel.inBreve, 11, a.normale); }
  // Il riepilogo per sezione: le sezioni vuote non si stampano
  titolo('RIEPILOGO PER SEZIONE');
  let stampate = 0;
  SEZIONI.forEach(function (z) {
    const blocchi = (rel.sezioni[z.chiave] || []).filter(function (b) { return String(b.testo || '').trim(); });
    if (!blocchi.length) return;
    a.spazio(60);
    a.scrivi(z.nome.toUpperCase(), 11, a.grassetto);
    blocchi.forEach(function (b) {
      a.spazio(40);
      a.scrivi(etichettaBlocco(b, true), 9, a.normale, grigio);
      if (z.elenco) righeElenco(b.testo).forEach(function (r) { a.scrivi('• ' + r, 11, a.normale, null, 6); });
      else a.scrivi(b.testo, 11, a.normale);
      a.giu(4);
    });
    a.giu(6);
    stampate++;
  });
  if (!stampate) a.scrivi('(nessuna sezione compilata)', 11, a.normale, grigio);
  // La contabilità completa: ogni riga coi suoi numeri, le righe senza prezzo segnalate, il totale in fondo
  const cont = rel.contabilita || { righe: [], totale: 0, note: '' };
  titolo('CONTABILITÀ' + (cont.codice ? ' - ' + cont.codice : ''));
  if (!cont.righe.length) a.scrivi('(nessuna riga)', 11, a.normale, grigio);
  cont.righe.forEach(function (r) {
    a.spazio(36);
    a.scrivi((r.codice ? r.codice + '   ' : '') + (r.descrizione || '(senza descrizione)'), 11, a.normale);
    a.scrivi(numeroIt(r.quantita) + ' ' + (r.um || '') + '  ×  ' + euro(r.prezzo) + '  =  ' + (r.dacompletare ? 'DA COMPLETARE: manca il prezzo' : euro(r.importo)), 10, a.normale, r.dacompletare ? giallo : grigio, 6);
    a.giu(3);
  });
  const daCompletare = cont.righe.filter(function (r) { return r.dacompletare; }).length;
  a.giu(4); a.spazio(40);
  a.scrivi('TOTALE   ' + euro(cont.totale), 13, a.grassetto);
  if (daCompletare) a.scrivi(daCompletare + (daCompletare === 1 ? ' riga senza prezzo non conta' : ' righe senza prezzo non contano') + ' nel totale.', 10, a.normale, giallo);
  if (String(cont.note || '').trim()) a.scrivi('Note: ' + cont.note, 10, a.normale, grigio);
  // L'elenco dei giorni, dal primo all'ultimo; le giornate non chiuse marcate
  titolo('ELENCO DEI GIORNI');
  if (!rel.giorni.length) a.scrivi('(nessun giorno di sopralluogo)', 11, a.normale, grigio);
  rel.giorni.forEach(function (g) {
    a.scrivi('• ' + dataEstesa(g.giorno) + ', ' + (g.ora || '') + '  -  ' + (g.chiuso ? (g.verbale || 'chiusa') : g.sopralluogo + ' (NON CHIUSA)') + '  -  ' + g.sezioni + ' sezioni, ' + g.audio + ' audio, ' + g.foto + ' foto' + (g.documenti ? ', ' + g.documenti + ' documenti' : ''), 11, a.normale, g.chiuso ? null : giallo, 6);
  });
  // I documenti allegati, giorno per giorno: bolle e moduli firme, larghi quanto la pagina
  const conDoc = rel.giorni.filter(function (g) { return (a.docPerGiorno[g.sop] || []).length; });
  if (conDoc.length) {
    titolo('DOCUMENTI ALLEGATI');
    conDoc.forEach(function (g) {
      a.spazio(30 + a.altezzaDoc((a.docPerGiorno[g.sop] || [])[0]));
      a.scrivi(dataEstesa(g.giorno).toUpperCase() + ' - ' + (g.verbale || g.sopralluogo), 11, a.grassetto);
      a.disegnaDocumenti(a.docPerGiorno[g.sop], c);
    });
  }
  // Le foto marcate, giorno per giorno, con il referto: come nel PDF del verbale
  const conFoto = rel.giorni.filter(function (g) { return a.fotoPerGiorno[g.sop]; });
  if (conFoto.length) {
    a.giu(6);
    conFoto.forEach(function (g, i) {
      const per = a.fotoPerGiorno[g.sop];
      const prima = CHIAVI_SEZIONI.map(function (k) { return (per[k] || [])[0]; }).filter(Boolean)[0];
      // Il titolo FOTO e quello del giorno restano sulla stessa pagina della prima foto, non orfani in fondo.
      a.spazio((i === 0 ? 30 : 0) + 40 + a.altezzaFoto(prima, c) + 40);
      if (i === 0) { a.scrivi('FOTO', 12, a.grassetto); a.giu(4); }
      a.scrivi(dataEstesa(g.giorno).toUpperCase() + ' - ' + (g.verbale || g.sopralluogo), 11, a.grassetto);
      // Il nome della sezione una volta sola, poi le sue foto a due per riga.
      CHIAVI_SEZIONI.forEach(function (k) {
        const qui = per[k] || [];
        if (!qui.length) return;
        a.scrivi(nomeSezione(k), 9, a.normale, grigio);
        a.disegnaFotoGriglia(qui, c);
      });
    });
  }
  a.disegnaFirma();
}

async function creaPdfRelazione(relId, soloScarica) {
  if (!window.PDFLib) { avvisa('PDF non pronto: serve la rete la prima volta', 'err'); return; }
  const rel = relazione(relId);
  if (!rel) return;
  avvisa('Preparo il PDF…');
  // Le foto marcate si cercano giorno per giorno: a preparaFotoPdf bastano l'id e il codice del sopralluogo.
  const giorni = rel.giorni.map(function (g) { return { id: g.sop, sopralluogo: g.sopralluogo, cantiere: rel.cantiere, giorno: g.giorno }; });
  let byte;
  try { byte = await costruisciPdf(giorni.length ? giorni : [{ cantiere: rel.cantiere }], null, rel.inBreve, { modo: 'relazione', relazione: rel }); }
  catch (e) { avvisa('PDF non riuscito', 'err'); return; }
  await archiviaPdf(byte, rel.codice + '.pdf', { chiave: 'relazione:' + rel.codice, tipo: 'relazione', cantiere: rel.cantiere, giorno: rel.chiusura });
  const blob = new Blob([byte], { type: 'application/pdf' });
  // "Scarica" salva il file nel telefono; "Esporta" apre la condivisione.
  if (soloScarica) scaricaBlob(blob, rel.codice + '.pdf');
  else await condividiFile(blob, rel.codice + '.pdf', 'Relazione di fine cantiere');
}
/* Scarica la relazione: il PDF archiviato se c'è, se no lo si fa adesso. */
async function scaricaRelazione(relId) {
  const rel = relazione(relId);
  if (!rel) return;
  const p = pdfConChiave('relazione:' + rel.codice);
  const blob = p && p.file ? await leggiMedia(p.file) : null;
  if (blob) { scaricaBlob(blob, p.nome || rel.codice + '.pdf'); return; }
  await creaPdfRelazione(relId, true);
}

/* ---------------- LA SETTIMANA ----------------
   La settimana va da lunedì a domenica. Chiusa, foto e audio di quella settimana restano
   nel telefono tre giorni: lunedì, martedì, mercoledì. Mercoledì il conto si chiude e il
   materiale va mandato fuori. Scaricarlo prima si può sempre. */

// Il lunedì della settimana in cui cade una data.
function lunediDi(iso) {
  const d = daISO(iso);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return dataLocaleISO(d);
}

/* La settimana chiusa che aspetta di essere sistemata, oppure niente.
   Prima di mercoledì non compare: i tre giorni non sono ancora passati. */
function settimanaDaChiudere() {
  const oggi = oggiISO();
  if ((daISO(oggi).getDay() + 6) % 7 < 2) return null;
  const lun = daISO(lunediDi(oggi));
  lun.setDate(lun.getDate() - 7);
  const inizio = dataLocaleISO(lun);
  lun.setDate(lun.getDate() + 6);
  const fine = dataLocaleISO(lun);
  if (leggiLocale().settimane[inizio]) return null;
  return { inizio: inizio, fine: fine };
}

// Quello che c'è dentro una settimana: le registrazioni e le foto di quei giorni.
function materialeSettimana(inizio, fine) {
  const audio = [], foto = [];
  valori(leggiTutto().sopralluoghi).forEach(function (s) {
    if (s.giorno < inizio || s.giorno > fine) return;
    s.pezzi.forEach(function (p) { if (p.audio) audio.push({ sop: s, pezzo: p }); });
    fotoDi(s).forEach(function (f) { if (f.file) foto.push({ sop: s, foto: f }); });
  });
  return { audio: audio, foto: foto };
}

async function pesoSettimana(inizio, fine) {
  const m = materialeSettimana(inizio, fine);
  const elenco = await elencaMedia();
  const pesi = {};
  elenco.forEach(function (x) { pesi[x.id] = x.peso || 0; });
  let byte = 0;
  m.audio.forEach(function (a) { byte += pesi[a.pezzo.audio.replace(/^idb:/, '')] || 0; });
  m.foto.forEach(function (f) { byte += pesi[f.foto.file.replace(/^idb:/, '')] || 0; });
  return { audio: m.audio.length, foto: m.foto.length, byte: byte };
}

/* Manda fuori tutta la settimana in un colpo: audio e foto con i nomi già buoni.
   Sul telefono si apre il foglio di condivisione e si sceglie la mail. */
async function mandaSettimana(inizio, fine) {
  avvisa('Preparo la settimana…');
  const m = materialeSettimana(inizio, fine);
  const file = [];
  for (const a of m.audio) {
    const blob = await leggiMedia(a.pezzo.audio);
    if (!blob) continue;
    const titolo = a.pezzo.titolo ? '_' + nomeFile(a.pezzo.titolo) : '';
    file.push(new File([blob], a.sop.codice + '_' + a.sop.giorno + '_' + String(a.pezzo.ora || '').replace(':', '-') + titolo + '.webm', { type: blob.type || 'audio/webm' }));
  }
  for (const f of m.foto) {
    const blob = await leggiMedia(f.foto.file);
    if (!blob) continue;
    const referto = primaRiga(f.foto.referto);
    file.push(new File([blob], f.sop.codice + '_' + f.foto.giorno + '_' + String(f.foto.ora || '').replace(':', '-') + '_' + f.foto.codice + (referto ? '_' + nomeFile(referto) : '') + estensioneMedia(f.foto), { type: tipoMedia(f.foto, blob) }));
  }
  if (!file.length) { segnaSettimanaFatta(inizio, 'vuota'); avvisa('Niente da mandare', 'att'); aggiornaVista(); return; }
  if (!(await portaFuori(file, 'CANTIERI · settimana del ' + dataSenzaAnno(inizio)))) return;
  const adesso = adessoISO();
  const loc = leggiLocale();
  m.audio.forEach(function (a) { a.pezzo.scaricato = adesso; salva('sopralluogo', a.sop); });
  m.foto.forEach(function (f) { f.foto.scaricato = adesso; salva('sopralluogo', f.sop); });
  segnaSettimanaFatta(inizio, 'mandata');
  const tolti = await liberaSettimana(inizio, fine);
  avvisa(file.length + ' file mandati fuori' + (tolti.tolte ? ', ' + tolti.tolte + ' liberati' : ''), 'ok');
  if (tolti.restate) avvisa(tolti.restate + (tolti.restate === 1 ? ' giornata resta: manca il suo PDF' : ' giornate restano: manca il loro PDF'), 'att');
  SETT_CONTO.inizio = null;
  await contaSettimana();
  aggiornaVista();
}

/* Si libera solo quello che è già dentro un PDF. Una giornata senza il suo verbale in PDF
   tiene le sue foto: cancellarle vorrebbe dire perderle, e il PDF non le avrebbe mai viste.
   Il documento resta comunque: codice, ora e referto, segnati come archiviati. */
async function liberaSettimana(inizio, fine) {
  const oggi = oggiISO();
  let tolte = 0, restate = 0;
  for (const s of valori(leggiTutto().sopralluoghi)) {
    if (s.giorno < inizio || s.giorno > fine) continue;
    if (!s.chiuso || !pdfPerSopralluogo(s.codice)) { restate++; continue; }
    let toccato = false;
    for (const p of s.pezzi) {
      if (!p.audio) continue;
      await cancellaMedia(p.audio);
      p.audio = null; p.archiviato = oggi; toccato = true; tolte++;
    }
    for (const f of fotoDi(s)) {
      if (!f.file) continue;
      scordaFoto(f.file);
      await cancellaMedia(f.file);
      f.file = null; f.archiviato = oggi; toccato = true; tolte++;
    }
    if (toccato) salva('sopralluogo', s);
  }
  return { tolte: tolte, restate: restate };
}

function segnaSettimanaFatta(inizio, come) {
  const loc = leggiLocale();
  loc.settimane[inizio] = { come: come, quando: adessoISO() };
  salvaLocale();
}

/* ---------------- L'ARCHIVIO DEI PDF ----------------
   Un PDF generato non si butta più: resta nel telefono e si riapre dall'app. È lui
   l'archivio vero, perché foto e audio prima o poi se ne vanno. Rifare lo stesso
   documento non ne crea un secondo: sostituisce quello di prima, stessa chiave. */

function pdfArchiviati() {
  const l = leggiLocale().pdf;
  return Array.isArray(l) ? l : [];
}
function pdfDi(codiceCantiere) {
  return pdfArchiviati().filter(function (p) { return p.cantiere === codiceCantiere; })
    .sort(function (a, b) { return String(b.quando).localeCompare(String(a.quando)); });
}
function pdfConChiave(chiave) {
  return pdfArchiviati().find(function (p) { return p.chiave === chiave; }) || null;
}
function pdfPerSopralluogo(codiceSop) {
  return pdfArchiviati().find(function (p) { return p.tipo === 'verbale' && p.sopralluogo === codiceSop; }) || null;
}

async function archiviaPdf(byte, nome, meta) {
  const loc = leggiLocale();
  if (!Array.isArray(loc.pdf)) loc.pdf = [];
  const id = nuovoId();
  let rif;
  try { rif = await salvaMedia(id, new Blob([byte], { type: 'application/pdf' })); }
  catch (e) { avvisa('PDF non archiviato: manca spazio', 'att'); return null; }
  // Stessa chiave, stesso documento: quello vecchio esce di scena e il suo file si cancella.
  const vecchio = loc.pdf.find(function (p) { return p.chiave === meta.chiave; });
  if (vecchio) {
    if (vecchio.file) await cancellaMedia(vecchio.file);
    loc.pdf = loc.pdf.filter(function (p) { return p !== vecchio; });
  }
  const scheda = {
    id: id, chiave: meta.chiave, tipo: meta.tipo, nome: nome,
    cantiere: meta.cantiere || '', sopralluogo: meta.sopralluogo || '', giorno: meta.giorno || oggiISO(),
    quando: adessoISO(), peso: byte.length || byte.byteLength || 0, file: rif
  };
  loc.pdf.push(scheda);
  salvaLocale();
  return scheda;
}

/* pdf.js serve solo a guardare un PDF dentro l'app: si scarica la prima volta
   che si tocca "Visualizza", non all'avvio. Sta su cdnjs, l'unico posto esterno
   che il service worker mette in cache, quindi dalla seconda volta c'è anche
   senza linea. */
let PDFJS = null;
function caricaPdfJs() {
  if (PDFJS) return PDFJS;
  PDFJS = new Promise(function (ok, no) {
    if (window.pdfjsLib) return ok(window.pdfjsLib);
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    s.onload = function () {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      ok(window.pdfjsLib);
    };
    s.onerror = function () { PDFJS = null; no(new Error('serve la rete la prima volta')); };
    document.head.appendChild(s);
  });
  return PDFJS;
}

/* Disegna le pagine del PDF una sotto l'altra, dentro la schermata. */
async function mostraPdfDentro(idPdf) {
  const box = document.getElementById('pdf-pagine');
  if (!box) return;
  const p = pdfArchiviati().find(function (x) { return x.id === idPdf; });
  if (!p) { box.innerHTML = '<div class="vuoto-stato">Questo PDF non c\'è più.</div>'; return; }
  try {
    const lib = await caricaPdfJs();
    const blob = p.file ? await leggiMedia(p.file) : null;
    if (!blob) { box.innerHTML = '<div class="vuoto-stato">Il file non c\'è più.</div>'; return; }
    const doc = await lib.getDocument({ data: await blob.arrayBuffer() }).promise;
    box.innerHTML = '';
    const largo = Math.min(box.clientWidth || 360, 900);
    for (let n = 1; n <= doc.numPages; n++) {
      const pagina = await doc.getPage(n);
      const base = pagina.getViewport({ scale: 1 });
      // Si disegna al doppio per non vedere i pixel sugli schermi fitti.
      const scala = (largo / base.width) * Math.min(window.devicePixelRatio || 1, 2);
      const vista = pagina.getViewport({ scale: scala });
      const tela = document.createElement('canvas');
      tela.width = vista.width; tela.height = vista.height;
      tela.className = 'pdf-pagina';
      tela.style.width = largo + 'px';
      box.appendChild(tela);
      await pagina.render({ canvasContext: tela.getContext('2d'), viewport: vista }).promise;
    }
  } catch (e) {
    box.innerHTML = '<div class="vuoto-stato">Non riesco a mostrarlo qui: ' + h(e.message) + '.<br>Usa Esporta per aprirlo fuori.</div>';
  }
}

/* La schermata che mostra un PDF archiviato. */
function vistaLeggiPdf(idPdf) {
  const p = pdfArchiviati().find(function (x) { return x.id === idPdf; });
  if (!p) return vistaDashboard();
  const c = p.cantiere ? cantierePerCodice(p.cantiere) : null;
  const sop = p.sopralluogo ? valori(leggiTutto().sopralluoghi).find(function (z) { return z.codice === p.sopralluogo; }) : null;
  const v = sop ? verbaleDiSopralluogo(sop.codice) : null;
  let html = testata({
    indietro: c ? '#/pdf/' + c.id : '#/',
    titolo: p.nome || 'documento.pdf',
    sotto: h(dataBreve(p.giorno)) + ' · ' + h(pesoFile(p.peso || 0))
  });
  html += '<div id="pdf-pagine" class="pdf-pagine"><div class="vuoto-stato">Apro il documento…</div></div>';
  html += '<div class="barra"><button class="az verde" data-az="pdf-manda" data-id="' + h(p.id) + '"><span class="ico ico-invio"></span> Esporta</button>' +
    (v ? '<button class="az" data-az="pdf-modifica" data-id="' + h(v.id) + '">Modifica</button>' : '') + '</div>';
  return html;
}

async function apriPdf(id) {
  const p = pdfArchiviati().find(function (x) { return x.id === id; });
  if (!p) return;
  const blob = p.file ? await leggiMedia(p.file) : null;
  if (!blob) { avvisa('Il file non c\'è più', 'err'); return; }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.target = '_blank'; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
}

async function mandaFuoriPdf(id) {
  const p = pdfArchiviati().find(function (x) { return x.id === id; });
  if (!p) return;
  const blob = p.file ? await leggiMedia(p.file) : null;
  if (!blob) { avvisa('Il file non c\'è più', 'err'); return; }
  await condividiFile(blob, p.nome, 'PDF di CANTIERI');
}

async function eliminaPdf(id) {
  const loc = leggiLocale();
  const p = pdfArchiviati().find(function (x) { return x.id === id; });
  if (!p) return;
  if (p.file) await cancellaMedia(p.file);
  loc.pdf = pdfArchiviati().filter(function (x) { return x.id !== id; });
  salvaLocale();
}

const NOMI_PDF = { verbale: 'Verbale della giornata', periodo: 'Verbali di un periodo', sezione: 'Una sezione sola', relazione: 'Relazione di fine cantiere' };

function vistaPdf(idCantiere) {
  const c = cantiere(idCantiere);
  if (!c) return vistaDashboard();
  const elenco = pdfDi(c.codice);
  const totale = elenco.reduce(function (t, p) { return t + (p.peso || 0); }, 0);
  let html = testata({ indietro: '#/cantiere/' + c.id, titolo: 'PDF', sotto: h(c.nome) + ' · ' + elenco.length + (elenco.length === 1 ? ' documento · ' : ' documenti · ') + h(pesoFile(totale)) });
  if (!elenco.length) return html + '<div class="vuoto-stato">Ancora nessun PDF. Si archiviano da soli quando li generi.</div>';
  let meseCorrente = null;
  elenco.forEach(function (p) {
    const mese = String(p.giorno).slice(0, 7);
    if (mese !== meseCorrente) {
      if (meseCorrente) html += '</div>';
      html += '<div class="eti">' + h(titoloMese(p.giorno)) + '</div><div class="card">';
      meseCorrente = mese;
    }
    html += '<div class="riga-pdf"><button class="n" data-az="pdf-apri" data-id="' + h(p.id) + '">' +
      '<div class="t">' + h(p.nome) + '</div>' +
      '<div class="s">' + h(dataBreve(p.giorno)) + ' · ' + h(pesoFile(p.peso)) + ' · ' + h(NOMI_PDF[p.tipo] || p.tipo) + '</div></button>' +
      '<button class="pill cod" data-az="pdf-manda" data-id="' + h(p.id) + '">Manda</button>' +
      '<button class="x-riga" data-az="pdf-elimina" data-id="' + h(p.id) + '" aria-label="Elimina">✕</button></div>';
  });
  if (meseCorrente) html += '</div>';
  html += '<div class="vuoto-stato" style="text-align:left">I PDF restano nel telefono. Foto e audio no: quelli si buttano ogni settimana.</div>';
  return html;
}

async function condividiFile(blob, nome, titolo) {
  const file = new File([blob], nome, { type: blob.type });
  if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: titolo }); avvisa('Pronto', 'ok'); return; }
    catch (e) { if (e && e.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = nome; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  avvisa('Scaricato', 'ok');
}

/* ============================================================
   LE AZIONI
   Un solo ascoltatore per i tocchi e uno per i campi: ogni bottone porta
   data-az, ogni campo data-campo. Le schermate si ridisegnano da zero e
   non c'è niente da ricollegare.
   ============================================================ */

const SALVATAGGI = {};
// Un salvataggio ogni battuta sarebbe troppo: si aspetta mezzo secondo di fermo.
function salvaConCalma(chiave, fn) {
  if (SALVATAGGI[chiave]) clearTimeout(SALVATAGGI[chiave].timer);
  SALVATAGGI[chiave] = { fn: fn, timer: setTimeout(function () { delete SALVATAGGI[chiave]; fn(); }, 500) };
}
// Uscendo da un campo, o chiudendo l'app, quello in sospeso si scrive subito.
function salvaAdesso(chiave) {
  const s = SALVATAGGI[chiave];
  if (!s) return false;
  clearTimeout(s.timer);
  delete SALVATAGGI[chiave];
  s.fn();
  return true;
}
function salvaSubitoTutto() {
  Object.keys(SALVATAGGI).forEach(salvaAdesso);
}

let tocchiTitolo = 0, timerTocchi = null;

const AZIONI = {
  'vai': function (el) { vai(el.dataset.a); },
  'chiudi-foglio': function () { chiudiFoglio(); if (attesaConferma) { attesaConferma(false); attesaConferma = null; } },
  'chiudi-foglio-velo': function (el, ev) { if (ev.target === el) AZIONI['chiudi-foglio'](); },
  'conferma-si': function () { if (attesaConferma) { const f = attesaConferma; attesaConferma = null; f(true); } },
  'conferma-no': function () { chiudiFoglio(); if (attesaConferma) { const f = attesaConferma; attesaConferma = null; f(false); } },
  'colore': function (el) {
    const loc = leggiLocale();
    if (!loc.colori) loc.colori = { primario: '', secondario: '' };
    loc.colori[el.dataset.quale] = el.dataset.tinta;
    salvaLocale();
    applicaColori();
    disegna();
  },
  'tendina': function (el) {
    const loc = leggiLocale();
    loc.tendine[el.dataset.chiave] = !loc.tendine[el.dataset.chiave];
    salvaLocale();
    const aperta = loc.tendine[el.dataset.chiave];
    el.setAttribute('aria-expanded', String(aperta));
    /* Quello che si apre di solito sta subito dopo il tasto. Quando il tasto
       divide la riga con un altro (l'azienda, che ha anche "scheda"), sta
       subito dopo la riga intera. */
    let box = el.nextElementSibling;
    if (!box || box.hasAttribute('data-az')) box = el.parentElement ? el.parentElement.nextElementSibling : null;
    if (box) { box.hidden = !aperta; box.querySelectorAll('textarea.corpo').forEach(cresciTextarea); }
  },
  'riascolta': function (el) { riascolta(el.dataset.sop, el.dataset.id); },
  // Apre o richiude una lista di audio lunga. La scelta sta con le tendine, così regge il ridisegno.
  'lista-tutta': function (el) {
    const loc = leggiLocale();
    loc.tendine[el.dataset.chiave] = !loc.tendine[el.dataset.chiave];
    salvaLocale();
    aggiornaVista();
  },
  'pezzo-elimina': async function (el) {
    const s = sopralluogo(el.dataset.sop);
    const p = s && s.pezzi.find(function (x) { return x.id === el.dataset.id; });
    if (!p) return;
    const nome = p.titolo || 'Registrazione delle ' + p.ora;
    const ok = await chiedi('Eliminare questa registrazione?', nome + '. L\'audio si cancella dal telefono; il testo già finito nelle sezioni resta.', 'Elimina', 'rosso');
    chiudiFoglio();
    if (!ok) return;
    await eliminaPezzo(s, p);
    avvisa('Eliminata', 'ok');
    aggiornaVista();
  },
  'vai-sezione': function (el) {
    const s = sopralluogo(el.dataset.sop);
    const p = s && s.pezzi.find(function (x) { return x.id === el.dataset.id; });
    if (!p) return;
    if (p.grezzo && (!p.sezione || p.stato === 'errore')) { mostraTestoPieno(p.titolo || 'Registrazione delle ' + p.ora, p.grezzo); return; }
    const chiave = p.sezione === 'da_smistare' ? null : p.sezione;
    if (!chiave) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    const card = document.getElementById('sez-' + chiave);
    if (!card) { avvisa(nomeSezione(chiave)); return; }
    // Se la sezione sta in una tendina chiusa, la si apre.
    const contenitore = card.parentElement;
    if (contenitore && contenitore.hidden) { contenitore.hidden = false; const t = contenitore.previousElementSibling; if (t) t.setAttribute('aria-expanded', 'true'); contenitore.querySelectorAll('textarea.corpo').forEach(cresciTextarea); }
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.remove('lampeggia'); void card.offsetWidth; card.classList.add('lampeggia');
  },
  'parla-dashboard': function () {
    const loc = leggiLocale();
    let c = loc.ultimoCantiere ? cantiere(loc.ultimoCantiere) : null;
    if (!c || c.stato === 'chiuso') c = valori(leggiTutto().cantieri).filter(function (x) { return x.stato !== 'chiuso'; }).sort(function (a, b) { return a.nome.localeCompare(b.nome); })[0] || null;
    if (!c) { avvisa('Apri prima un cantiere', 'att'); vai('#/nuovo-cantiere'); return; }
    dettaSu(c);
  },
  'parla-cantiere': function (el) { const c = cantiere(el.dataset.id); if (c) dettaSu(c); },
  'nuovo-sopralluogo': function (el) { const c = cantiere(el.dataset.id); if (!c) return; const s = sopralluogoPerDettare(c); vai('#/giorno/' + s.id); },
  'detta': function (el) {
    const s = sopralluogo(el.dataset.id);
    if (!s) return;
    avviaRegistrazione({ tipo: 'sopralluogo', id: s.id });
  },
  'doc-scansiona': function (el) { apriScanner(el, 'file-doc-scatta'); },
  /* Porta nel cantiere, o toglie, tutti i documenti di una giornata in un tocco. */
  /* Porta nel cantiere tutto quello che questa giornata ha da portare: le
     scansioni si marcano (restano anche qui), i rilievi si accodano al testo del
     cantiere. Un tocco solo: erano quattro tasti per dire la stessa cosa. */
  'al-cantiere': function (el) {
    const s = sopralluogo(el.dataset.id);
    if (!s) return;
    const c = cantierePerCodice(s.cantiere);
    const doc = documentiDi(s);
    const tutti = doc.length && doc.every(function (f) { return f.cantiere; });
    let fatto = 0;
    doc.forEach(function (f) { if (!f.cantiere) { f.cantiere = true; fatto++; } });
    if (fatto) salva('sopralluogo', s);
    if (c) {
      let testo = '';
      ['rilievi_ordine', 'rilievi_contabilita'].forEach(function (k) {
        const t = String(s.sezioni[k] || '').trim();
        if (t) testo = aggiungiTesto(testo, t);
      });
      if (testo) { c.rilievi = aggiungiTesto(c.rilievi || '', testo); salva('cantiere', c); fatto++; }
    }
    avvisa(fatto ? 'Nel cantiere' : (tutti ? 'Già tutto nel cantiere' : 'Non c\'è niente da portare'), fatto ? 'ok' : 'att');
    aggiornaVista();
  },
  /* Lo stesso su una scansione sola, dalla sua schermata. */
  'foto-cantiere': function (el) {
    const s = sopralluogo(el.dataset.sop);
    const f = s ? trovaFoto(s, el.dataset.id) : null;
    if (!f) return;
    f.cantiere = !f.cantiere;
    salva('sopralluogo', s);
    avvisa(f.cantiere ? 'Vale per tutto il cantiere' : 'Solo di questa giornata', 'ok');
    aggiornaVista();
  },
  'rilievo-cantiere-svuota': async function (el) {
    const c = cantiere(el.dataset.id);
    if (!c) return;
    const si = await chiedi('Svuoto questo rilievo del cantiere?', 'Quello scritto nelle giornate resta dov\'è.', 'Svuota', 'rosso');
    chiudiFoglio();
    if (!si) return;
    c.rilievi = '';
    salva('cantiere', c);
    aggiornaVista();
  },
  'detta-rilievo': function (el) {
    const s = giornoDelTasto(el);
    if (!s) return;
    avviaRegistrazione({ tipo: 'rilievo', sop: s.id, sezione: el.dataset.sezione });
  },
  // La scheda del rilievo appena arrivato: si accetta, si corregge, si salva.
  'rilievo-ok': function (el) { togliRilievoNuovo(el.dataset.id); aggiornaVista(); },
  'rilievo-correggi': function (el) { const r = rilievoNuovo(el.dataset.id); if (r) { r.modifica = true; salvaLocale(); aggiornaVista(); } },
  'rilievo-annulla': function (el) { const r = rilievoNuovo(el.dataset.id); if (r) { r.modifica = false; salvaLocale(); aggiornaVista(); } },
  'rilievo-salva': function (el) {
    const campo = document.getElementById('ril-' + el.dataset.id);
    correggiRilievo(el.dataset.id, campo ? campo.value : '');
    avvisa('Rilievo corretto', 'ok');
    aggiornaVista();
  },
  'chiudi-giornata': function (el) { chiudiGiornata(el.dataset.id); },
  /* Un altro passaggio nello stesso giorno: nasce con l'ora di adesso e si apre subito. */
  'sopralluogo-nuovo': function (el) {
    const s = sopralluogo(el.dataset.id);
    if (!s) return;
    const c = cantierePerCodice(s.cantiere);
    if (!c) return;
    const n = creaSopralluogo(c, s.giorno, oraAdesso());
    vai('#/giorno/' + n.id);
  },
  'assegna-pezzo': function (el) { assegnaPezzo(el.dataset.sop, el.dataset.pezzo, el.dataset.dest); },
  'menu-sopralluogo': function (el) { apriPunti(el.dataset.id); },
  'menu-verbale': function (el) { apriPunti(el.dataset.id); },
  'sopralluogo-apri': function (el) { chiudiFoglio(); vai('#/giorno/' + el.dataset.id); },
  'sopralluogo-nome': function (el) { rinominaSopralluogo(el.dataset.id); },
  'sopralluogo-chiudi': function (el) { PUNTI_APERTI = null; chiudiFoglio(); chiudiGiornata(el.dataset.id); },
  'giornata-verbale': function (el) { faiVerbaleGiornata(el.dataset.cantiere, el.dataset.giorno); },
  /* Visualizza sul sopralluogo già aperto: il suo verbale — il PDF se c'è, se no il testo.
     Se il verbale non è ancora scritto si chiede di scriverlo, e poi si apre. */
  'sopralluogo-verbale': async function (el) {
    const s = sopralluogo(el.dataset.id);
    if (!s) return;
    let vb = verbaleDiSopralluogo(s.codice);
    if (!vb) { await chiudiGiornata(s.id); vb = verbaleDiSopralluogo(s.codice); }
    if (!vb) return;
    const p = pdfConChiave('verbale:' + vb.codice);
    vai(p ? '#/leggi/' + p.id : '#/verbale/' + vb.id);
  },
  /* Visualizza: se il PDF c'è già si legge quello, se no si apre il verbale. */
  'verbale-vedi': function (el) {
    const v = verbale(el.dataset.id);
    if (foglioAperto()) chiudiFoglio();
    if (!v && el.dataset.sop) { const sx = sopralluogo(el.dataset.sop); const vx = sx ? verbaleDiSopralluogo(sx.codice) : null; if (vx) { vai('#/verbale/' + vx.id); return; } }
    if (!v) return;
    const p = pdfConChiave('verbale:' + v.codice);
    vai(p ? '#/leggi/' + p.id : '#/verbale/' + v.id);
  },
  'verbale-esporta': function (el) {
    const v = verbale(el.dataset.id);
    PUNTI_APERTI = null;
    if (!v) return;
    const p = pdfConChiave('verbale:' + v.codice);
    chiudiFoglio();
    if (p) mandaFuoriPdf(p.id); else apriEsportaPdf(null, v.id);
  },
  'verbale-scarica': function (el) { const id = el.dataset.id; PUNTI_APERTI = null; chiudiEsporta(); chiudiFoglio(); scaricaVerbale(id); },
  /* Si butta il verbale, non la giornata: il sopralluogo resta con i suoi audio e
     le sue sezioni, e torna "da chiudere". Un verbale di giornata si butta e basta. */
  'verbale-elimina': async function (el) {
    const v = verbale(el.dataset.id);
    PUNTI_APERTI = null;
    if (!v) return;
    chiudiFoglio();
    const ok = await chiedi('Eliminare il verbale?', titoloVerbale(v, true) + (v.giornata ? '' : ': la giornata resta com\'è, con audio e sezioni.'), 'Elimina', 'rosso');
    chiudiFoglio();
    if (!ok) return;
    const s = valori(leggiTutto().sopralluoghi).find(function (x) { return x.codice === v.sopralluogo; });
    cancella('verbale', v.id);
    if (s && !v.giornata) { s.verbale = null; s.chiuso = null; salva('sopralluogo', s); }
    avvisa('Verbale eliminato', 'ok');
    if (ROTTA.nome === 'verbale') vai(s ? '#/giorno/' + s.id : '#/'); else aggiornaVista();
  },
  'esporta-pdf': function (el) { chiudiEsporta(); apriEsportaPdf(el.dataset.id); },
  'pdf-crea': function (el) { creaPdf(el.dataset.id); },
  /* Le scorciatoie del periodo: riempiono le due date al posto tuo. Fine
     settimana e fine mese sono i due momenti in cui i verbali si mandano. */
  'pdf-quando': function (el) {
    const p = periodoPronto(el.dataset.quando);
    const dal = document.getElementById('pdf-dal'), al = document.getElementById('pdf-al');
    if (dal) dal.value = p.dal;
    if (al) al.value = p.al;
    document.querySelectorAll('[data-az="pdf-quando"]').forEach(function (b) { b.classList.toggle('ok', b === el); });
  },
  // --- chiusura del cantiere e relazione ---
  'chiudi-cantiere': function (el) { chiudiCantiere(el.dataset.id); },
  'riapri-cantiere': function (el) { riapriCantiere(el.dataset.id); },
  'relazione-genera': function (el) {
    // Un cantiere messo "chiuso" dal modulo non ha la relazione: la si scrive da qui.
    const c = cantiere(el.dataset.id);
    if (!c) return;
    const rel = generaRelazione(c, relazioneDi(c.codice));
    avvisa('Relazione scritta', 'ok');
    vai('#/relazione/' + rel.id);
  },
  'relazione-rigenera': function (el) { rigeneraRelazione(el.dataset.id); },
  'esporta-pdf-relazione': function (el) { chiudiEsporta(); creaPdfRelazione(el.dataset.id); },
  'relazione-scarica': function (el) { chiudiEsporta(); scaricaRelazione(el.dataset.id); },
  'esporta-tendina': function (el) { ESPORTA_APERTO = (ESPORTA_APERTO === el.dataset.chiave ? null : el.dataset.chiave); aggiornaVista(); },
  'salva-relazione': function (el) {
    const rel = relazione(el.dataset.id);
    if (!rel) return;
    salva('relazione', rel);
    avvisa('Salvato', 'ok');
    vai('#/relazione/' + rel.id);
  },
  'salva-verbale': function (el) {
    const v = verbale(el.dataset.id);
    if (!v) return;
    salva('verbale', v);
    avvisa('Salvato', 'ok');
    const s = valori(leggiTutto().sopralluoghi).find(function (x) { return x.codice === v.sopralluogo; });
    vai(s ? '#/giorno/' + s.id : '#/');
  },
  'smista': function (el) {
    const s = sopralluogo(el.dataset.id);
    if (!s) return;
    const testo = String(s.sezioni.da_smistare || '').trim();
    if (!testo) return;
    s.sezioni[el.dataset.sezione] = aggiungiTesto(s.sezioni[el.dataset.sezione], testo);
    s.sezioni.da_smistare = '';
    // I pezzi che stavano "da smistare" adesso hanno una sezione: così l'audio si trova sotto il testo.
    s.pezzi.forEach(function (p) { if (p.sezione === 'da_smistare' || (!p.sezione && p.stato === 'riordinato')) { p.sezione = el.dataset.sezione; p.sezioni = [el.dataset.sezione]; } });
    salva('sopralluogo', s);
    allineaVerbale(s, [el.dataset.sezione]);
    avvisa('Spostato in ' + nomeSezione(el.dataset.sezione), 'ok');
    aggiornaVista();
  },
  'modifica-testata': function (el) {
    const s = sopralluogo(el.dataset.id);
    if (!s) return;
    const cantieri = valori(leggiTutto().cantieri).sort(function (a, b) { return a.nome.localeCompare(b.nome); });
    apriFoglio(
      '<h2>' + h(titoloSopralluogo(s)) + '</h2>' +
      '<label class="eticampo">Cantiere</label><select class="campo" id="t-cantiere">' + cantieri.map(function (c) { return '<option value="' + h(c.codice) + '"' + (c.codice === s.cantiere ? ' selected' : '') + '>' + h(c.nome) + '</option>'; }).join('') + '</select>' +
      '<div style="display:flex;gap:8px"><div style="flex:1"><label class="eticampo">Data</label><input class="campo" type="date" id="t-data" value="' + h(s.giorno) + '"></div>' +
      '<div style="flex:1"><label class="eticampo">Ora</label><input class="campo" type="time" id="t-ora" value="' + h(s.ora) + '"></div></div>' +
      /* Il nome serve a chiamarlo dettando: "questo va nel controllo del pomeriggio". */
      '<label class="eticampo">Nome del sopralluogo</label><input class="campo" id="t-nome" maxlength="60" placeholder="facoltativo, se no vale l\'ora" value="' + h(s.nome || '') + '">' +
      '<div class="righe"><button class="btn btn-ok" data-az="testata-salva" data-id="' + h(s.id) + '">Salva</button>' +
      '<button class="btn btn-rosso" data-az="sopralluogo-elimina" data-id="' + h(s.id) + '">Elimina</button></div>' +
      '<button class="btn" data-az="chiudi-foglio" style="margin-top:8px">Annulla</button>'
    );
  },
  'testata-salva': function (el) {
    const s = sopralluogo(el.dataset.id);
    if (!s) return;
    const codiceCant = document.getElementById('t-cantiere').value;
    const giorno = document.getElementById('t-data').value || s.giorno;
    const ora = document.getElementById('t-ora').value || s.ora;
    const campoNome = document.getElementById('t-nome');
    s.cantiere = codiceCant; s.giorno = giorno; s.ora = ora;
    if (campoNome) s.nome = campoNome.value.trim();
    salva('sopralluogo', s);
    const v = verbaleDiSopralluogo(s.codice);
    if (v) { v.cantiere = codiceCant; v.giorno = giorno; v.ora = ora; salva('verbale', v); }
    chiudiFoglio(); avvisa('Salvato', 'ok'); aggiornaVista();
  },
  'sopralluogo-elimina': async function (el) {
    const s = sopralluogo(el.dataset.id);
    PUNTI_APERTI = null;
    if (!s) return;
    chiudiFoglio();
    const ok = await chiedi('Eliminare il sopralluogo?', titoloSopralluogo(s) + ': si cancellano il sopralluogo, i suoi audio' + (s.verbale ? ' e il suo verbale' : '') + '.', 'Elimina', 'rosso');
    chiudiFoglio();
    if (!ok) return;
    await eliminaSopralluogo(s);
    avvisa('Eliminato', 'ok');
    // Si resta nella giornata: su un altro passaggio se c'è, se no sulla giornata vuota.
    const resto = sopralluoghiDelGiorno(s.cantiere, s.giorno);
    vai(resto.length ? '#/giorno/' + resto[0].id : '#/giornata/' + giornataDi(s.cantiere, s.giorno).id);
  },
  'menu-punti': function (el) { apriPunti(el.dataset.chiave); },
  'giornata-elimina': async function (el) {
    PUNTI_APERTI = null;
    const c = cantiere(el.dataset.cantiere);
    if (!c) return;
    const n = sopralluoghiDelGiorno(c.codice, el.dataset.giorno).length;
    const ok = await chiediDueVolte('Eliminare la giornata?', dataBreve(el.dataset.giorno) + ': si cancellano ' + n + (n === 1 ? ' sopralluogo' : ' sopralluoghi') + ', i loro audio, le foto e i verbali.', 'Elimina');
    if (!ok) return;
    await eliminaGiornata(c.codice, el.dataset.giorno);
    avvisa('Eliminata', 'ok');
    if (ROTTA.nome === 'cantiere') aggiornaVista(); else vai('#/cantiere/' + c.id);
  },
  // Nella giornata vuota: nasce il primo sopralluogo e ci si entra.
  'giornata-sopralluogo-nuovo': function (el) {
    const c = cantierePerCodice(el.dataset.cantiere);
    if (!c) return;
    vai('#/giorno/' + creaSopralluogo(c, el.dataset.giorno, oraAdesso()).id);
  },
  // --- foto ---
  // Il sopralluogo lo dice il tasto; dove non lo dice (schermata della foto) lo sa l'ingresso file.
  'foto-scatta': function (el) { const f = document.getElementById('file-foto-scatta'); apriFotocamera(el.dataset.id || (f ? f.dataset.id : '')); },
  'fotocamera-scatta': function () { return scattaFotocamera(); },
  'fotocamera-chiudi': function () { chiudiFotocamera(); },
  'foto-rullino': function () { const f = document.getElementById('file-foto-rullino'); if (f) f.click(); },
  'foto-sezione': function (el) {
    const s = sopralluogo(el.dataset.sop);
    const f = s && trovaFoto(s, el.dataset.id);
    if (!f) return;
    f.sezione = el.dataset.sezione;
    // Scelta a mano: da qui in poi Claude non la sposta più.
    f.sezioneScelta = true;
    salva('sopralluogo', s);
    avvisa(nomeSezione(f.sezione), 'ok');
    aggiornaVista();
  },
  'foto-marca': function (el) {
    const s = sopralluogo(el.dataset.sop);
    const f = s && trovaFoto(s, el.dataset.id);
    if (!f) return;
    f.nelPdf = !f.nelPdf;
    salva('sopralluogo', s);
    avvisa(f.nelPdf ? 'Nel PDF' : 'Fuori dal PDF', f.nelPdf ? 'ok' : undefined);
    aggiornaVista();
  },
  'foto-marca-tutte': function (el) {
    const s = sopralluogo(el.dataset.id);
    if (!s) return;
    const foto = fotoDi(s);
    if (!foto.length) return;
    // Se sono già tutte dentro, il tasto le tira fuori tutte: un tasto solo, due versi.
    const tutte = foto.every(function (f) { return f.nelPdf; });
    foto.forEach(function (f) { f.nelPdf = !tutte; });
    salva('sopralluogo', s);
    avvisa(tutte ? 'Nessuna nel PDF' : 'Tutte nel PDF', tutte ? undefined : 'ok');
    aggiornaVista();
  },
  'foto-detta': function (el) {
    const s = sopralluogo(el.dataset.sop);
    const f = s && trovaFoto(s, el.dataset.id);
    if (!f) return;
    avviaRegistrazione({ tipo: 'foto', sop: s.id, foto: f.id });
  },
  'foto-elimina': async function (el) {
    const s = sopralluogo(el.dataset.sop);
    const f = s && trovaFoto(s, el.dataset.id);
    if (!f) return;
    if (REG.attiva && REG.destinazione && REG.destinazione.foto === f.id) { avvisa('Ferma prima la registrazione', 'att'); return; }
    const ok = await chiedi('Eliminare ' + nomeFoto(f).toLowerCase() + '?', 'La foto e il suo referto si cancellano dal telefono.', 'Elimina', 'rosso');
    chiudiFoglio();
    if (!ok) return;
    await eliminaFoto(s, f);
    avvisa('Eliminata', 'ok');
    // Dalla schermata della foto si torna al giorno; dalla miniatura si resta dov'è, si ridisegna e basta.
    if (ROTTA.nome === 'foto') vai('#/giorno/' + s.id); else aggiornaVista();
  },
  // --- contabilità ---
  'detta-contabilita': function (el) { const c = cantiere(el.dataset.id); if (c) avviaRegistrazione({ tipo: 'contabilita', cantiere: c.id }); },
  'riga-nuova': function (el) { apriRigaContabilita(ricalcolaRiga({ descrizione: '', quantita: 0, um: '', prezzo: 0 }), { cantiere: el.dataset.id }); },
  'riga-modifica': function (el) {
    if (el.dataset.proposta) {
      const p = leggiLocale().proposte.find(function (x) { return x.id === el.dataset.proposta; });
      if (!p) return;
      apriRigaContabilita(p.righe[Number(el.dataset.indice)], { proposta: p.id, cantiere: p.cantiere });
    } else {
      const cont = leggiTutto().contabilita[el.dataset.cont];
      const r = cont && cont.righe.find(function (x) { return x.codice === el.dataset.id; });
      if (!r) return;
      const c = cantierePerCodice(cont.cantiere);
      apriRigaContabilita(r, { cantiere: c ? c.id : '' });
    }
  },
  'riga-salva': function () { if (RIGA_APERTA) salvaRigaAperta(); },
  'riga-elimina': async function () {
    if (!RIGA_APERTA) return;
    const r = RIGA_APERTA.riga, rif = RIGA_APERTA.rif;
    chiudiFoglio();
    const ok = await chiedi('Eliminare la riga?', r.descrizione, 'Elimina', 'rosso');
    chiudiFoglio();
    if (!ok) return;
    if (rif.proposta) {
      const loc = leggiLocale();
      const p = loc.proposte.find(function (x) { return x.id === rif.proposta; });
      if (p) { p.righe = p.righe.filter(function (x) { return x !== r; }); if (!p.righe.length) loc.proposte = loc.proposte.filter(function (x) { return x.id !== p.id; }); salvaLocale(); }
    } else {
      const c = cantiere(rif.cantiere);
      const cont = c && contabilitaDi(c.codice);
      if (cont) { cont.righe = cont.righe.filter(function (x) { return x.codice !== r.codice; }); salva('contabilita', cont); }
    }
    RIGA_APERTA = null;
    avvisa('Eliminata', 'ok');
    aggiornaVista();
  },
  'riga-cerca-listino': function () { if (RIGA_APERTA) apriSceltaListino(); },
  'scelta-annulla': function () { if (RIGA_APERTA) apriRigaContabilita(RIGA_APERTA.riga, RIGA_APERTA.rif); else chiudiFoglio(); },
  'scegli-voce': function (el) {
    const v = leggiTutto().listino[el.dataset.id];
    if (!v || !RIGA_APERTA) return;
    const r = RIGA_APERTA.riga;
    r.descrizione = v.descrizione; r.um = v.um; r.prezzo = v.prezzo; r.dallistino = v.codice;
    ricalcolaRiga(r);
    apriRigaContabilita(r, RIGA_APERTA.rif);
  },
  'proposta-aggiungi': function (el) {
    const loc = leggiLocale();
    const p = loc.proposte.find(function (x) { return x.id === el.dataset.id; });
    const c = p && cantiere(p.cantiere);
    if (!c) return;
    const cont = contabilitaOCrea(c.codice);
    p.righe.forEach(function (r) { r.codice = codiceNuovo('VOCE'); cont.righe.push(ricalcolaRiga(r)); });
    salva('contabilita', cont);
    loc.proposte = loc.proposte.filter(function (x) { return x.id !== p.id; });
    salvaLocale();
    avvisa('Aggiunte ' + p.righe.length + (p.righe.length === 1 ? ' riga' : ' righe'), 'ok');
    aggiornaVista();
  },
  'proposta-scarta': function (el) {
    const loc = leggiLocale();
    loc.proposte = loc.proposte.filter(function (x) { return x.id !== el.dataset.id; });
    salvaLocale();
    avvisa('Scartata');
    aggiornaVista();
  },
  // --- listino ---
  'voce-nuova': function () { apriVoceListino(null); },
  'listino-svuota': async function () {
    const tutte = listinoTutto();
    if (!tutte.length) return;
    const ok = await chiedi('Svuotare il listino?', 'Si cancellano tutte e ' + tutte.length + ' le voci. Le righe di contabilità già scritte restano come sono, col prezzo che hanno adesso.', 'Svuota il listino', 'rosso');
    chiudiFoglio();
    if (!ok) return;
    tutte.forEach(function (v) { cancella('listino', v.id); });
    filtroListino = '';
    avvisa('Listino svuotato', 'ok');
    aggiornaVista();
  },
  'voce-modifica': function (el) { const v = leggiTutto().listino[el.dataset.id]; if (v) apriVoceListino(v); },
  'voce-salva': function () { if (VOCE_APERTA) salvaVoceAperta(); },
  'voce-elimina': async function () {
    if (!VOCE_APERTA || !VOCE_APERTA.id) return;
    const v = VOCE_APERTA;
    chiudiFoglio();
    const ok = await chiedi('Eliminare la voce?', v.descrizione, 'Elimina', 'rosso');
    chiudiFoglio();
    if (!ok) return;
    cancella('listino', v.id);
    VOCE_APERTA = null;
    avvisa('Eliminata', 'ok');
    aggiornaVista();
  },
  'scegli-file': function () { const f = document.getElementById('file-listino'); if (f) f.click(); },
  'import-carica': function () { importaListino(); },
  'import-cambia': function () { IMPORT.passo = 'manuale'; aggiornaVista(); },
  'import-conferma-manuale': function () {
    IMPORT.daClaude = false;
    IMPORT.errore = (IMPORT.schema.colonne.descrizione == null || IMPORT.schema.colonne.prezzo == null) ? 'Servono almeno la colonna della descrizione e quella del prezzo.' : '';
    IMPORT.esempi = applicaSchemaListino(IMPORT.righe, IMPORT.schema).slice(0, 3);
    IMPORT.passo = 'conferma';
    aggiornaVista();
  },
  // --- note ---
  'detta-nota': function (el) { const c = cantiere(el.dataset.id); if (c) avviaRegistrazione({ tipo: 'nota', cantiere: c.id }); },
  // --- cantiere ---
  'azienda-salva': async function (el) {
    const nome = document.getElementById('a-nome').value.trim();
    if (!nome) { avvisa('Manca il nome', 'att'); document.getElementById('a-nome').focus(); return; }
    const nuova = !el.dataset.id;
    const a = el.dataset.id ? azienda(el.dataset.id) : { media: [] };
    if (!a) return;
    a.nome = nome;
    a.ragione = document.getElementById('a-ragione').value.trim();
    a.piva = document.getElementById('a-piva').value.trim();
    a.indirizzo = document.getElementById('a-ind').value.trim();
    a.telefono = document.getElementById('a-tel').value.trim();
    a.mail = document.getElementById('a-mail').value.trim();
    a.pec = document.getElementById('a-pec').value.trim();
    a.tecnico = (document.getElementById('a-tecnico') || {}).value ? document.getElementById('a-tecnico').value.trim() : '';
    a.sito = (document.getElementById('a-sito') || {}).value ? document.getElementById('a-sito').value.trim() : '';
    a.note = document.getElementById('a-note').value.trim();
    const salvata = salva('azienda', a);
    avvisa('Salvata', 'ok');
    /* La prima azienda si porta dietro i cantieri che c'erano già: senza, resterebbero
       in un limbo che nessuno guarda. Si spostano poi uno per uno dalla loro scheda. */
    // La prima azienda si porta dentro i cantieri che c'erano già, senza chiedere:
    // altrimenti resterebbero in un elenco a parte. Si spostano dalla scheda del cantiere.
    const orfani = cantieriSenzaAzienda();
    if (nuova && orfani.length) {
      orfani.forEach(function (c) { c.azienda = salvata.codice; salva('cantiere', c); });
      avvisa(orfani.length + (orfani.length === 1 ? ' cantiere messo dentro' : ' cantieri messi dentro'), 'ok');
    }
    vai('#/azienda/' + salvata.id);
  },
  'azienda-elimina': async function (el) {
    const a = azienda(el.dataset.id);
    if (!a) return;
    const cant = cantieriDiAzienda(a.codice);
    PUNTI_APERTI = null;
    const ok = await chiediDueVolte('Eliminare ' + a.nome + '?', (cant.length ? 'I suoi ' + cant.length + ' cantieri non si cancellano: tornano fra quelli senza azienda.' : 'Non ha cantieri.'), 'Elimina');
    if (!ok) return;
    for (const k of ['logo', 'firma', 'banda', 'bandaPiede']) if (a[k]) await cancellaMedia(a[k]);
    cant.forEach(function (c) { c.azienda = ''; salva('cantiere', c); });
    cancella('azienda', a.id);
    avvisa('Eliminata', 'ok');
    if (ROTTA.nome === 'dashboard' || ROTTA.nome === 'aziende') aggiornaVista(); else vai('#/');
  },
  'az-immagine': function (el) {
    AZ_IMMAGINE = { id: el.dataset.id, quale: el.dataset.quale };
    const f = document.getElementById('file-azienda');
    if (f) f.click();
  },
  'cantiere-salva': function (el) {
    const nome = document.getElementById('c-nome').value.trim();
    if (!nome) { avvisa('Manca il nome', 'att'); document.getElementById('c-nome').focus(); return; }
    const c = el.dataset.id ? cantiere(el.dataset.id) : { note: '' };
    if (!c) return;
    c.nome = nome;
    c.committente = document.getElementById('c-comm').value.trim();
    c.indirizzo = document.getElementById('c-ind').value.trim();
    const selAz = document.getElementById('c-azienda');
    if (selAz) c.azienda = selAz.value;
    c.stato = document.getElementById('c-stato').value;
    c.aperto = document.getElementById('c-aperto').value || oggiISO();
    // Chiudere o riaprire dal modulo vale come farlo dalla scheda: la data di chiusura segue lo stato.
    if (c.stato === 'chiuso') { if (!c.chiuso) c.chiuso = oggiISO(); } else c.chiuso = null;
    salva('cantiere', c);
    avvisa('Salvato', 'ok');
    vai('#/cantiere/' + c.id);
  },
  'cantiere-elimina': async function (el) {
    const c = cantiere(el.dataset.id);
    if (!c) return;
    const sops = sopralluoghiDi(c.codice);
    const rel = relazioneDi(c.codice);
    PUNTI_APERTI = null;
    const ok = await chiediDueVolte('Eliminare ' + c.nome + '?', 'Si cancellano anche ' + sops.length + ' sopralluoghi, i verbali' + (rel ? ', la relazione' : '') + ' e la contabilità. Il listino resta.', 'Elimina tutto');
    if (!ok) return;
    if (rel) cancella('relazione', rel.id);
    // Giornata per giornata: vanno via i sopralluoghi, i verbali di giornata e le giornate stesse.
    for (const g of giornateDi(c.codice)) await eliminaGiornata(c.codice, g.giorno);
    const cont = contabilitaDi(c.codice);
    if (cont) cancella('contabilita', cont.id);
    cancella('cantiere', c.id);
    avvisa('Eliminato', 'ok');
    if (ROTTA.nome === 'cantiere') vai('#/'); else aggiornaVista();
  },
  // --- modo sviluppatore ---
  'pin-verifica': function () {
    const v = (document.getElementById('pin').value || '').trim();
    if (v === PIN) { devSbloccato = true; misuraSpazio().then(aggiornaVista); aggiornaVista(); }
    else { avvisa('PIN sbagliato', 'err'); document.getElementById('pin').value = ''; }
  },
  'dev-esci': function () { devSbloccato = false; vai('#/'); },
  'chiavi-salva': function () {
    const loc = leggiLocale();
    const g = document.getElementById('k-groq').value.trim(), a = document.getElementById('k-anthropic').value.trim(), gh = document.getElementById('k-github').value.trim();
    if (g) loc.chiavi.groq = g;
    if (a) loc.chiavi.anthropic = a;
    if (gh) loc.chiavi.github = gh;
    loc.repo = document.getElementById('k-repo').value.trim();
    loc.modello = document.getElementById('k-modello').value.trim() || MODELLO;
    loc.mail = document.getElementById('k-mail').value.trim();
    loc.saltaAziende = !!document.getElementById('k-salta').value;
    salvaLocale();
    avvisa('Salvato', 'ok');
    aggiornaVista();
    elaboraCoda();
    if (loc.github.daMandare) programmaInvioGitHub();
  },
  'chiavi-cancella': async function () {
    const ok = await chiedi('Cancellare le chiavi?', 'Groq, Anthropic e GitHub: l\'app smette di trascrivere e di salvare online finché non le rimetti.', 'Cancella', 'rosso');
    chiudiFoglio();
    if (!ok) return;
    const loc = leggiLocale();
    loc.chiavi = { groq: '', anthropic: '', github: '' };
    salvaLocale();
    avvisa('Cancellate', 'ok');
    aggiornaVista();
  },
  'coda-riprova': function () {
    const loc = leggiLocale();
    loc.coda.forEach(function (l) { if (l.stato === 'fallito' || l.stato === 'in_corso') { l.stato = 'in_attesa'; l.tentativi = 0; l.prossimo = 0; l.errore = null; } });
    salvaLocale();
    // I pezzi segnati in errore tornano in coda anche nell'elenco degli audio.
    valori(leggiTutto().sopralluoghi).forEach(function (s) {
      let toccato = false;
      s.pezzi.forEach(function (p) { if (p.stato === 'errore' && loc.coda.some(function (l) { return l.pezzo === p.id; })) { p.stato = p.grezzo ? 'trascritto' : 'in_coda'; p.errore = null; toccato = true; } });
      if (toccato) salva('sopralluogo', s);
    });
    avvisa('Riprovo', 'ok');
    aggiornaVista();
    elaboraCoda();
  },
  'coda-svuota': async function () {
    const ok = await chiedi('Svuotare la coda?', 'I lavori in attesa si perdono. Gli audio restano nel telefono e si possono rimandare riascoltandoli.', 'Svuota', 'rosso');
    chiudiFoglio();
    if (!ok) return;
    const loc = leggiLocale();
    const ids = loc.coda.map(function (l) { return l.pezzo; }).filter(Boolean);
    loc.coda = [];
    salvaLocale();
    valori(leggiTutto().sopralluoghi).forEach(function (s) {
      let toccato = false;
      s.pezzi.forEach(function (p) { if (ids.indexOf(p.id) !== -1 && p.stato !== 'riordinato') { p.stato = 'errore'; p.errore = 'tolto dalla coda'; toccato = true; } });
      if (toccato) salva('sopralluogo', s);
    });
    avvisa('Coda vuota', 'ok');
    aggiornaVista();
  },
  'settimana-manda': function (el) { mandaSettimana(el.dataset.inizio, el.dataset.fine); },
  'settimana-fatta': async function (el) {
    const ok = await chiedi('Settimana già a posto?', 'Foto e audio di quella settimana si liberano dal telefono. Restano solo quelli delle giornate che non hanno ancora il loro PDF. Il testo e i verbali non si toccano.', 'Sì, ce l\'ho già', 'rosso');
    chiudiFoglio();
    if (!ok) return;
    segnaSettimanaFatta(el.dataset.inizio, 'a mano');
    const t = await liberaSettimana(el.dataset.inizio, el.dataset.fine);
    if (t.tolte) avvisa(t.tolte + ' file liberati dal telefono', 'ok');
    if (t.restate) avvisa(t.restate + (t.restate === 1 ? ' giornata resta: manca il suo PDF' : ' giornate restano: manca il loro PDF'), 'att');
    SETT_CONTO.inizio = null;
    contaSettimana().then(aggiornaVista);
  },
  'pdf-apri': function (el) { vai('#/leggi/' + el.dataset.id); },
  'pdf-leggi': function (el) { chiudiFoglio(); vai('#/leggi/' + el.dataset.id); },
  'pdf-modifica': function (el) { chiudiFoglio(); vai('#/verbale/' + el.dataset.id); },
  'pdf-fuori': function (el) { apriPdf(el.dataset.id); },
  'pdf-manda': function (el) { mandaFuoriPdf(el.dataset.id); },
  'pdf-elimina': async function (el) {
    const p = pdfArchiviati().find(function (x) { return x.id === el.dataset.id; });
    if (!p) return;
    const ok = await chiedi('Eliminare questo PDF?', p.nome + '. Si può rifare dalla giornata, ma le foto già buttate non tornano.', 'Elimina', 'rosso');
    chiudiFoglio();
    if (!ok) return;
    await eliminaPdf(p.id);
    avvisa('Eliminato', 'ok');
    aggiornaVista();
  },
  'spazio-scarica': function (el) { scaricaAudioMese(el.dataset.mese); },
  'spazio-scarica-foto': function (el) { scaricaFotoMese(el.dataset.mese); },
  'spazio-libera': function (el) { liberaSpazioMese(el.dataset.mese); },
  'spazio-orfani': async function () {
    for (const id of SPAZIO.orfani) await cancellaMedia(id);
    avvisa('Puliti', 'ok');
    await misuraSpazio();
    aggiornaVista();
  },
  'github-manda': async function () {
    if (!githubPronto()) { avvisa('Manca token o repository', 'att'); return; }
    avvisa('Mando…');
    const ok = await inviaGitHub();
    avvisa(ok ? 'Mandato' : 'Non riuscito', ok ? 'ok' : 'err');
    aggiornaVista();
  },
  'github-scarica': async function () {
    if (!repoGitHub()) { avvisa('Manca il repository', 'att'); return; }
    avvisa('Scarico…');
    try { const cambiato = await scaricaGitHub(); avvisa(cambiato ? 'Aggiornato' : 'Già allineato', 'ok'); }
    catch (e) { avvisa('Non riuscito', 'err'); leggiLocale().github.errore = e.message; salvaLocale(); }
    aggiornaVista();
  },
  'esempio-butta': async function () {
    const ok = await chiedi('Buttare via gli esempi?', 'Si cancellano i cantieri, i sopralluoghi, i verbali, la contabilità e il listino di esempio. I documenti veri restano.', 'Butta via', 'rosso');
    chiudiFoglio();
    if (!ok) return;
    buttaDatiEsempio();
    avvisa('Fatto', 'ok');
    aggiornaVista();
  },
  'esempio-rimetti': function () { inserisciDatiEsempio(); avvisa('Rimessi', 'ok'); aggiornaVista(); },
  'notifiche-chiedi': async function () {
    if (!('Notification' in window)) { avvisa('Non disponibili', 'att'); return; }
    const loc = leggiLocale(); loc.notificheChieste = true; salvaLocale();
    try { await Notification.requestPermission(); } catch (e) { /* niente */ }
    aggiornaVista();
  },
  'notifiche-prova': function () { mostraNotifica('Manca il sopralluogo di CANT-000', 'È una prova.', './'); }
};

async function dettaSu(c) {
  const s = sopralluogoPerDettare(c);
  vai('#/giorno/' + s.id);
  await avviaRegistrazione({ tipo: 'sopralluogo', id: s.id });
}

// I campi: si aggiorna il modello subito, si scrive nel telefono dopo mezzo secondo di fermo.
function suCampo(el, evento) {
  const campo = el.dataset.campo;
  if (campo === 'filtro-cantieri') { filtroCantieri = el.value; aggiornaVista(); return; }
  if (campo === 'filtro-listino') { filtroListino = el.value; aggiornaVista(); return; }
  if (campo === 'filtro-documenti') { filtroDocumenti = el.value; aggiornaVista(); return; }
  if (campo === 'filtro-scelta') { filtroListinoScelta = el.value; disegnaSceltaListino(); return; }
  if (campo === 'sezione') {
    const s = sopralluogo(el.dataset.id);
    if (!s) return;
    s.sezioni[el.dataset.sezione] = el.value;
    cresciTextarea(el);
    const capo = el.previousElementSibling;
    if (capo && capo.classList.contains('card-capo') && !capo.classList.contains('gialla')) capo.classList.toggle('spenta', !el.value.trim());
    salvaConCalma('sop-' + s.id, function () { salva('sopralluogo', s); allineaVerbale(s, [el.dataset.sezione]); chiediNotificheUnaVolta(); });
    return;
  }
  if (campo === 'nome-verbale') {
    const v = verbale(el.dataset.id);
    if (!v) return;
    v.nome = el.value.trim();
    salvaConCalma('ver-' + v.id, function () { salva('verbale', v); });
    return;
  }
  if (campo === 'sezione-verbale') {
    const v = verbale(el.dataset.id);
    if (!v) return;
    v.sezioni[el.dataset.sezione] = el.value;
    cresciTextarea(el);
    const capo = el.previousElementSibling;
    if (capo) capo.classList.toggle('spenta', !el.value.trim());
    salvaConCalma('ver-' + v.id, function () { salva('verbale', v); });
    return;
  }
  if (campo === 'inbreve-relazione') {
    const rel = relazione(el.dataset.id);
    if (!rel) return;
    rel.inBreve = el.value;
    cresciTextarea(el);
    const capo = el.previousElementSibling;
    if (capo) capo.classList.toggle('spenta', !el.value.trim());
    salvaConCalma('rel-' + el.dataset.id, function () { salva('relazione', rel); });
    return;
  }
  if (campo === 'blocco-relazione') {
    // L'id del campo dice relazione, sezione e pezzo: "id/sezione/indice". Così ogni campo ha un id suo,
    // e dopo un ridisegno il cursore torna nel pezzo giusto e non nel primo della relazione.
    const p = String(el.dataset.id).split('/');
    const rel = relazione(p[0]);
    if (!rel) return;
    const blocchi = rel.sezioni[p[1]] || (rel.sezioni[p[1]] = []);
    const i = Number(p[2]) || 0;
    // Il pezzo di una sezione vuota nasce qui, senza data: è un'aggiunta a mano.
    if (!blocchi[i]) blocchi[i] = { giorno: null, codice: '', aperta: false, testo: '' };
    blocchi[i].testo = el.value;
    cresciTextarea(el);
    salvaConCalma('rel-' + el.dataset.id, function () { salva('relazione', rel); });
    return;
  }
  if (campo === 'note-contabilita') {
    const c = cantiere(el.dataset.id);
    if (!c) return;
    cresciTextarea(el);
    salvaConCalma('cont-' + c.id, function () { const cont = contabilitaOCrea(c.codice); cont.note = el.value; salva('contabilita', cont); });
    return;
  }
  if (campo === 'note-cantiere') {
    const c = cantiere(el.dataset.id);
    if (!c) return;
    c.note = el.value;
    cresciTextarea(el);
    salvaConCalma('cant-' + c.id, function () { salva('cantiere', c); });
    return;
  }
  if (campo === 'file-listino' && evento === 'change') {
    const f = el.files && el.files[0];
    if (f) avviaImportListino(f);
    return;
  }
  if (campo === 'file-foto' && evento === 'change') {
    const scelte = Array.prototype.slice.call(el.files || []);
    const sopId = el.dataset.id, origine = el.dataset.origine;
    // Si svuota subito: così la stessa foto si può scegliere di nuovo, e il file grosso non resta appeso al campo.
    el.value = '';
    if (!scelte.length) return;
    // Dal rullino se ne possono prendere più d'una: si caricano in fila e si resta dov'è.
    (async function () {
      for (const f of scelte) await aggiungiFoto(f, sopId, origine);
      if (scelte.length > 1) { avvisa(scelte.length + ' foto salvate', 'ok'); aggiornaVista(); }
    })().catch(function (e) { avvisa('Errore: ' + e.message, 'err'); });
    return;
  }
  /* La ruota dei colori: si muove il cursore e il colore si vede subito, si
     salva quando si lascia andare. */
  if (campo === 'colore-libero') {
    const loc = leggiLocale();
    if (!loc.colori) loc.colori = { primario: '', secondario: '' };
    loc.colori[el.dataset.quale] = el.value;
    if (evento === 'input') {
      document.documentElement.style.setProperty(el.dataset.quale === 'primario' ? '--accent' : '--azione', el.value);
    } else { salvaLocale(); applicaColori(); disegna(); }
    return;
  }
  if (campo === 'file-azienda' && evento === 'change') {
    const file = el.files && el.files[0];
    el.value = '';
    if (!file || !AZ_IMMAGINE) return;
    const dove = AZ_IMMAGINE; AZ_IMMAGINE = null;
    (async function () {
      const a = azienda(dove.id);
      if (!a) return;
      avvisa('Preparo l\'immagine…');
      // Una banda è larga quanto il foglio: si riduce meno, se no in stampa sgrana.
      const banda = dove.quale === 'banda' || dove.quale === 'bandaPiede';
      const ridotta = await riduciFoto(file, banda ? LATO_BANDA : LATO_LOGO, QUALITA_LOGO);
      const id = nuovoId();
      const rif = await salvaMedia(id, ridotta.blob);
      if (a[dove.quale]) { scordaFoto(a[dove.quale]); await cancellaMedia(a[dove.quale]); }
      a[dove.quale] = rif;
      salva('azienda', a);
      avvisa({ logo: 'Logo messo', firma: 'Firma messa', banda: 'Intestazione messa', bandaPiede: 'Piè di pagina messo' }[dove.quale] || 'Fatto', 'ok');
      aggiornaVista();
    })().catch(function (e) { avvisa('Errore: ' + e.message, 'err'); });
    return;
  }
  if (campo === 'file-documento' && evento === 'change') {
    const scelte = Array.prototype.slice.call(el.files || []);
    const sopId = el.dataset.id, origine = el.dataset.origine, genere = GENERI[DOC_GENERE] ? DOC_GENERE : 'bolla';
    el.value = '';
    if (!scelte.length) return;
    (async function () {
      for (const f of scelte) await aggiungiFoto(f, sopId, origine, genere);
      if (scelte.length > 1) avvisa(scelte.length + ' scansioni salvate', 'ok');
      // Scansionata da un cantiere, si va nel giorno dov'è finita; già nel giorno, si ridisegna e basta.
      if (ROTTA.nome === 'giorno') aggiornaVista(); else vai('#/giorno/' + sopId);
    })().catch(function (e) { avvisa('Errore: ' + e.message, 'err'); });
    return;
  }
  if (campo === 'referto-foto') {
    const s = sopralluogo(el.dataset.sop);
    const f = s && trovaFoto(s, el.dataset.id);
    if (!f) return;
    f.referto = el.value;
    cresciTextarea(el);
    const capo = el.previousElementSibling;
    if (capo && capo.classList.contains('card-capo')) capo.classList.toggle('spenta', !el.value.trim());
    salvaConCalma('foto-' + f.id, function () { salva('sopralluogo', s); });
    return;
  }
  if (campo === 'import-intestazione') { IMPORT.schema.riga_intestazione = Number(el.value) || 0; aggiornaVista(); return; }
  if (campo === 'import-decimali') { IMPORT.schema.decimali = el.value; return; }
  if (campo === 'import-colonna') {
    const i = Number(el.dataset.indice);
    Object.keys(IMPORT.schema.colonne).forEach(function (k) { if (IMPORT.schema.colonne[k] === i) IMPORT.schema.colonne[k] = null; });
    if (el.value) IMPORT.schema.colonne[el.value] = i;
    aggiornaVista();
    return;
  }
  if (campo === 'pdf-modo' || campo === 'pdf-ambito') { aggiornaFoglioPdf(); return; }
}

/* ============================================================
   L'AVVIO
   ============================================================ */

function avvio() {
  const db = leggiTutto();
  leggiLocale();
  applicaColori();
  // La prima volta l'app parte con i dati di esempio dentro.
  if (!archivioEsiste()) { inserisciDatiEsempio(); }
  else if (!conta(db.cantieri) && db.soloEsempio) { inserisciDatiEsempio(); }
  sistemaAziende();
  ripescaDaAssegnare();

  leggiRotta();
  disegna();

  // Un solo ascoltatore per tutti i tocchi
  document.addEventListener('click', function (ev) {
    const el = ev.target.closest('[data-az]');
    if (!el) return;
    if (el.disabled) return;
    const fn = AZIONI[el.dataset.az];
    if (!fn) return;
    ev.preventDefault();
    try { const r = fn(el, ev); if (r && r.catch) r.catch(function (e) { avvisa('Errore: ' + e.message, 'err'); }); }
    catch (e) { avvisa('Errore: ' + e.message, 'err'); }
  });
  /* Torna indietro trascinando dal bordo sinistro, come fa il telefono nelle sue
     app. Serve soprattutto quando CANTIERI è installata sulla schermata home:
     lì la barra del browser non c'è, e senza questo l'unico modo di tornare
     indietro è il tasto in cima allo schermo, lontano dal pollice.
     Il gesto parte solo dai primi 32 pixel: dentro la pagina ci sono file che
     scorrono di lato — le foto, i tasti dei rilievi — e non vanno disturbate. */
  let tocco = null;
  document.addEventListener('touchstart', function (ev) {
    if (ev.touches.length !== 1) { tocco = null; return; }
    const t = ev.touches[0];
    tocco = t.clientX <= 32 ? { x: t.clientX, y: t.clientY, quando: Date.now() } : null;
  }, { passive: true });
  document.addEventListener('touchend', function (ev) {
    if (!tocco) return;
    const t = ev.changedTouches[0];
    const dx = t.clientX - tocco.x, dy = Math.abs(t.clientY - tocco.y);
    const veloce = Date.now() - tocco.quando < 700;
    tocco = null;
    if (dx > 70 && dy < 60 && veloce) indietro();
  }, { passive: true });

  document.addEventListener('input', function (ev) { const el = ev.target.closest('[data-campo]'); if (el) suCampo(el, 'input'); });
  document.addEventListener('change', function (ev) { const el = ev.target.closest('[data-campo]'); if (el && (el.type === 'file' || el.type === 'color' || el.tagName === 'SELECT')) suCampo(el, 'change'); });
  // Uscendo da un campo si dice "Salvato": una parola, per sapere che è andata.
  document.addEventListener('focusout', function (ev) {
    const el = ev.target;
    if (!el || !el.dataset || !el.dataset.campo) return;
    const prefissi = { 'sezione': 'sop-', 'sezione-verbale': 'ver-', 'note-cantiere': 'cant-', 'note-contabilita': 'cont-', 'referto-foto': 'foto-', 'inbreve-relazione': 'rel-', 'blocco-relazione': 'rel-' };
    const pre = prefissi[el.dataset.campo];
    if (pre && salvaAdesso(pre + el.dataset.id)) avvisa('Salvato', 'ok');
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter' && ev.target && ev.target.id === 'pin') { ev.preventDefault(); AZIONI['pin-verifica'](); }
    if (ev.key === 'Escape' && foglioAperto()) AZIONI['chiudi-foglio']();
  });

  // Cinque tocchi di fila sul titolo: il modo sviluppatore
  document.addEventListener('click', function (ev) {
    if (!ev.target.closest('#titolo-app')) return;
    tocchiTitolo++;
    clearTimeout(timerTocchi);
    timerTocchi = setTimeout(function () { tocchiTitolo = 0; }, 1500);
    if (tocchiTitolo >= 5) { tocchiTitolo = 0; devSbloccato = false; vai('#/dev'); }
  });

  document.getElementById('reg-ferma').addEventListener('click', function () {
    // Il permesso delle notifiche si chiede qui, dentro il tocco: iPhone lo accetta solo così.
    chiediNotificheUnaVolta();
    fermaRegistrazione();
  });

  window.addEventListener('hashchange', function () {
    leggiRotta();
    if (ROTTA.nome !== 'listino' || ROTTA.parametri[1] !== 'carica') { IMPORT.passo = 'file'; IMPORT.errore = ''; }
    if (ROTTA.nome !== 'dev') devSbloccato = false;
    if (foglioAperto()) chiudiFoglio();
    chiudiFotocamera();
    disegna();
    window.scrollTo(0, 0);
    if (ROTTA.nome === 'dev' && devSbloccato) misuraSpazio().then(aggiornaVista);
  });

  window.addEventListener('online', function () { avvisa('Rete tornata', 'ok'); elaboraCoda(); if (leggiLocale().github.daMandare) programmaInvioGitHub(); aggiornaVista(); });
  window.addEventListener('offline', function () { avvisa('Manca la rete', 'att'); aggiornaVista(); });
  // Prima di sparire si scrive quello che è rimasto in sospeso.
  window.addEventListener('pagehide', function () { salvaSubitoTutto(); salvagenteGitHub(); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') { salvaSubitoTutto(); salvagenteGitHub(); }
    else {
      // Tornati davanti con il microfono acceso: si riprende se era in pausa, e lo schermo resta sveglio.
      if (REG.attiva) { if (REG.daRiprendere || !REG.recorder || REG.recorder.state !== 'recording') riprendiRegistrazione(); else tieniSveglio(); }
      ricaricaSeFresco(); controllaCambioGiorno(); aggiornaVista(); elaboraCoda(); controllaPromemoria(); contaSettimana().then(function () { if (SETT_CONTO.inizio) aggiornaVista(); });
    }
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(function () { /* senza service worker l'app funziona lo stesso, solo non senza rete */ });
  }

  elaboraCoda();
  setInterval(elaboraCoda, 60000);
  setInterval(controllaPromemoria, 60000);
  setInterval(controllaCambioGiorno, 60000);
  controllaPromemoria();
  misuraSpazio().then(function () { if (SPAZIO.avviso) aggiornaVista(); });
  contaSettimana().then(function () { if (SETT_CONTO.inizio) aggiornaVista(); });

  // La copia online: si legge senza token, e se c'è qualcosa da mandare si manda.
  if (navigator.onLine && repoGitHub()) {
    scaricaGitHub().then(function (cambiato) {
      if (cambiato) { sistemaAziende(); avvisa('Aggiornato da GitHub', 'ok'); aggiornaVista(); }
      if (leggiLocale().github.daMandare) programmaInvioGitHub();
    }).catch(function () { /* il file può non esserci ancora: non è un errore */ });
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', avvio);
else avvio();
