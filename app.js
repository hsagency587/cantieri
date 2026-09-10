/* CANTIERI — app.js
   Verbali di sopralluogo dettati a voce, contabilità e listino prezzi.
   Un file solo, JavaScript normale, nessuna compilazione.
   I commenti spiegano il perché: il cosa lo dice il codice. */
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

// Le undici sezioni del sopralluogo, nell'ordine deciso. Non si toccano.
const SEZIONI = [
  { chiave: 'lavorazioni_eseguite',     nome: 'Lavorazioni eseguite',              elenco: false },
  { chiave: 'lavorazioni_non_eseguite', nome: 'Lavorazioni non eseguite',          elenco: false },
  { chiave: 'operai',                   nome: 'Operai presenti',                   elenco: true  },
  { chiave: 'attrezzature_presenti',    nome: 'Attrezzature presenti in cantiere', elenco: true  },
  { chiave: 'attrezzature_necessarie',  nome: 'Attrezzature necessarie',           elenco: true  },
  { chiave: 'materiali_impiegati',      nome: 'Materiali impiegati',               elenco: true  },
  { chiave: 'materiali_necessari',      nome: 'Materiali necessari',               elenco: true  },
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
  sicurezza: ['sicurezza'],
  problemi: ['problemi', 'anomalie', 'problemi o anomalie', 'anomalia', 'problema'],
  osservazioni: ['osservazioni', 'altre osservazioni'],
  note: ['note', 'nota', 'appunti']
};

// Prefissi dei codici automatici e dove sta ogni tipo di documento nell'archivio.
const PREFISSI = { cantiere: 'CANT', sopralluogo: 'SOP', verbale: 'VER', contabilita: 'CON', voce: 'VOCE', listino: 'LIS' };
const COLLEZIONI = { cantiere: 'cantieri', sopralluogo: 'sopralluoghi', verbale: 'verbali', contabilita: 'contabilita', listino: 'listino' };

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
- sicurezza: ponteggi, protezioni, dispositivi, prescrizioni, mancanze rilevate.
- problemi: anomalie, difetti, ritardi, contestazioni, cose che non vanno.
- osservazioni: quello che non sta nelle altre sezioni ma va scritto.
- note: appunti liberi.
- da_smistare: quello che non sai dove mettere.

Le frasi che aprono una sezione ("capitolo operai", "lavorazioni eseguite", "materiali che servono", "sicurezza"...) tagliano il testo: togli quelle parole dal risultato. Se non ci sono, decidi dal contenuto. Distingui sempre quello che c'è adesso da quello che servirà dopo: sono sezioni diverse.

Sistema punteggiatura e a capo. Togli le esitazioni. NON RIASSUMERE: tieni tutto quello che è stato detto, con le stesse parole. NON INVENTARE NIENTE: se una cosa non è stata detta, non c'è. Se una sezione è vuota, lasciala vuota.

Scrivi ore, misure e quantità in cifre. I nomi propri che trovi nell'elenco allegato scrivili esattamente come stanno lì.

Dai anche un titolo alla registrazione: tre o quattro parole prese da quello che è stato detto, la cosa più importante. Non un riassunto, un'etichetta: "Getto solaio primo piano", "Ponteggio senza fermapiede".

Rispondi soltanto con un oggetto JSON con queste chiavi: titolo, lavorazioni_eseguite, lavorazioni_non_eseguite, operai, attrezzature_presenti, attrezzature_necessarie, materiali_impiegati, materiali_necessari, sicurezza, problemi, osservazioni, note, da_smistare. Ogni valore è una stringa; negli elenchi separa le voci con un a capo. Niente altro testo.
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

const REGOLE_RIASSUNTO = `Ricevi i verbali di sopralluogo di un cantiere in un periodo. Scrivi due righe, in italiano, che dicono come è andata: cosa è stato fatto, cosa manca, se ci sono stati problemi. Usa solo quello che c'è nei verbali: non inventare niente. Niente titoli, niente elenchi, solo le due righe.`;

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

const CHIAVE_DATI = 'cantieri.dati';
const CHIAVE_LOCALE = 'cantieri.locale';
const NOME_IDB = 'cantieri-audio';
const STORE_IDB = 'audio';

let DB = null;       // i documenti, in memoria
let LOCALE = null;   // le cose del telefono, in memoria

function archivioVuoto() {
  return {
    versione: 1,
    contatori: { CANT: 0, SOP: 0, VER: 0, CON: 0, VOCE: 0, LIS: 0 },
    cantieri: {}, sopralluoghi: {}, verbali: {}, contabilita: {}, listino: {},
    cancellati: {},     // id → quando: perché una cancellazione arrivi anche all'altra copia
    soloEsempio: true,  // finché è vero, dentro ci sono solo i dati di esempio
    aggiornato: adessoISO()
  };
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
    scaricati: {}
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
  if (!DB.cancellati) DB.cancellati = {};
  return DB;
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
    DB = sulTelefono;
    if (!DB.cancellati) DB.cancellati = {};
  }
}
function persisti() {
  try { localStorage.setItem(CHIAVE_DATI, JSON.stringify(DB)); }
  catch (e) { avvisa('Spazio pieno', 'err'); }
}

function codiceNuovo(prefisso) {
  const db = leggiTutto();
  db.contatori[prefisso] = (db.contatori[prefisso] || 0) + 1;
  const n = db.contatori[prefisso];
  // Tre cifre, che diventano quattro da sole quando serve.
  return prefisso + '-' + String(n).padStart(3, '0');
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
function contabilitaOCrea(codiceCantiere) {
  let c = contabilitaDi(codiceCantiere);
  if (!c) c = salva('contabilita', { cantiere: codiceCantiere, note: '', righe: [] });
  return c;
}
function listinoTutto() {
  return valori(leggiTutto().listino).sort(function (a, b) { return a.codice.localeCompare(b.codice); });
}
function sopralluogoDiOggi(codiceCantiere) {
  const oggi = oggiISO();
  return sopralluoghiDi(codiceCantiere).find(function (s) { return s.giorno === oggi; }) || null;
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

/* ============================================================
   I DATI DI ESEMPIO
   Tre cantieri (uno chiuso), due sopralluoghi con le sezioni piene, un
   verbale, una contabilità con quattro righe, un listino di quindici voci.
   Le date sono relative a oggi, così la demo sembra viva anche fra un mese.
   ============================================================ */

function giorniFa(n) { return dataLocaleISO(new Date(Date.now() - n * 86400000)); }

function inserisciDatiEsempio() {
  const oggi = oggiISO();
  const c1 = salva('cantiere', { nome: 'Via Mazzini 14', committente: 'Immobiliare Castelli', indirizzo: 'via Mazzini 14, Vigevano', note: 'Accesso dal cancello sul retro, chiave dal custode.\nReferente del committente: geom. Ferrari, 333 1234567.', aperto: giorniFa(40), stato: 'attivo', esempio: true });
  const c2 = salva('cantiere', { nome: 'Scuola media Pascoli', committente: 'Comune di Mortara', indirizzo: 'via Roma 8, Mortara', note: '', aperto: giorniFa(20), stato: 'attivo', esempio: true });
  salva('cantiere', { nome: 'Villa Serra, rifacimento tetto', committente: 'Famiglia Serra', indirizzo: 'strada per Gambolò 12', note: 'Lavori consegnati.', aperto: giorniFa(120), stato: 'chiuso', esempio: true });

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

  // Il sopralluogo di oggi, in corso
  salva('sopralluogo', {
    cantiere: c1.codice, giorno: oggi, ora: '14:30',
    sezioni: Object.assign(sezioniVuote(), {
      lavorazioni_eseguite: 'Getto del solaio al primo piano, completato entro le 12. Ripresa delle tracce impianti sul lato est.',
      operai: 'Mario Rossi (Edil Rossi) — capo squadra\n2 muratori (Edil Rossi) — getto solaio\nLuca Bianchi (Impianti Bianchi) — tracce impianti',
      sicurezza: 'Ponteggio lato nord senza fermapiede sul terzo impalcato. Segnalato al capo squadra.'
    }),
    pezzi: [
      { id: nuovoId(), ora: '14:31', durata: 42, audio: null, grezzo: 'lavorazioni eseguite getto del solaio al primo piano completato entro le dodici ripresa delle tracce impianti sul lato est', titolo: 'Getto solaio primo piano', sezione: 'lavorazioni_eseguite', sezioni: ['lavorazioni_eseguite'], stato: 'riordinato', esempio: true },
      { id: nuovoId(), ora: '14:36', durata: 65, audio: null, grezzo: 'capitolo operai mario rossi della edil rossi capo squadra due muratori sempre rossi sul getto e luca bianchi impianti bianchi sulle tracce', titolo: 'Squadra Rossi e impianti', sezione: 'operai', sezioni: ['operai'], stato: 'riordinato', esempio: true },
      { id: nuovoId(), ora: '14:49', durata: 145, audio: null, grezzo: 'sicurezza il ponteggio lato nord non ha il fermapiede sul terzo impalcato l\'ho segnalato al capo squadra', titolo: 'Ponteggio senza fermapiede', sezione: 'sicurezza', sezioni: ['sicurezza'], stato: 'riordinato', esempio: true }
    ],
    chiuso: null, media: [], posizione: null, esempio: true
  });

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
  const risposta = await fetch('https://raw.githubusercontent.com/' + repo + '/dati/dati.json?t=' + Date.now(), { cache: 'no-store' });
  if (!risposta.ok) throw new Error('GitHub ' + risposta.status);
  const remoto = await risposta.json();
  const db = leggiTutto();
  if (!remoto || !remoto.contatori) return false;
  let cambiato;
  if (db.soloEsempio && conta(remoto.cantieri)) {
    // Nel telefono ci sono solo gli esempi e online c'è roba vera: gli esempi si buttano, senza mescolarli.
    DB = remoto;
    if (!DB.cancellati) DB.cancellati = {};
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
  const tipi = { trascrizione: 'Trascrizione', riordino: 'Riordino', contabilita: 'Contabilità', nota: 'Nota' };
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
  if (lavoro.tipo === 'trascrizione' || lavoro.tipo === 'riordino') {
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
}

async function lavoroRiordino(l) {
  const sop = sopralluogo(l.sop);
  if (!sop) return;
  const pezzo = sop.pezzi.find(function (p) { return p.id === l.pezzo; });
  if (!pezzo || pezzo.stato === 'riordinato') return;
  if (!chiaveAnthropic()) {
    // Senza chiave il testo non si perde: va in "da smistare", e l'uomo lo mette dove va.
    const r = { titolo: '' }; r.da_smistare = pezzo.grezzo;
    applicaRiordino(sop, pezzo, r);
    pezzo.titolo = pezzo.titolo || 'Registrazione delle ' + pezzo.ora;
    salva('sopralluogo', sop);
    return;
  }
  const risultato = await riordinaConClaude(sop, pezzo.grezzo);
  applicaRiordino(sop, pezzo, risultato);
  avvisa('Riordinato', 'ok');
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
function chiedi(titolo, testo, etichettaOk, tipoOk) {
  return new Promise(function (ok) {
    apriFoglio(
      '<h2>' + h(titolo) + '</h2>' + (testo ? '<p>' + h(testo) + '</p>' : '') +
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
  timer: null, contesto: null, audioCtx: null, analizzatore: null, rafOnda: null, spezzaTimer: null, destinazione: null
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
  REG.inizio = Date.now();
  avviaPezzo();
  avviaOnda(stream);
  document.getElementById('striscia').hidden = false;
  document.getElementById('reg-tempo').textContent = '0:00';
  REG.timer = setInterval(aggiornaTempoRegistrazione, 500);
  avvisa('Registrando', 'err');
  aggiornaVista();
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
  recorder.onstop = function () {
    const durata = Math.round((Date.now() - REG.inizioPezzo) / 1000);
    const blob = new Blob(REG.pezzi, { type: recorder.mimeType || 'audio/mp4' });
    const ora = oraAdesso(new Date(REG.inizioPezzo));
    REG.pezzi = [];
    if (blob.size > 0) salvaPezzoRegistrato(blob, durata, ora, REG.destinazione);
    if (REG.continua) { REG.continua = false; avviaPezzo(); }
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
    if (!sopralluogoDiOggi(c.codice)) mostraNotifica('Manca il sopralluogo di ' + c.codice, c.nome, '#/cantiere/' + c.id);
  });
}

/* ============================================================
   IL ROUTER E LE SCHERMATE
   Le rotte stanno nell'hash: così il gesto "indietro" dell'iPhone funziona
   e una pagina ricaricata riapre dove era.
   ============================================================ */

let ROTTA = { nome: 'dashboard', parametri: [] };
let devSbloccato = false;

function vai(hash) { location.hash = hash; }
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
      case 'dashboard': html = vistaDashboard(); break;
      case 'cantiere': html = vistaCantiere(ROTTA.parametri[0]); break;
      case 'nuovo-cantiere': html = vistaCantiereForm(null); break;
      case 'modifica-cantiere': html = vistaCantiereForm(ROTTA.parametri[0]); break;
      case 'giorno': html = vistaGiorno(ROTTA.parametri[0]); break;
      case 'verbale': html = vistaVerbaleModifica(ROTTA.parametri[0]); break;
      case 'contabilita': html = vistaContabilita(ROTTA.parametri[0]); break;
      case 'listino': html = vistaListino(ROTTA.parametri[0], ROTTA.parametri[1]); break;
      case 'note': html = vistaNote(ROTTA.parametri[0]); break;
      case 'cerca': html = vistaCerca(); break;
      case 'dev': html = vistaDev(); break;
      default: html = vistaDashboard();
    }
  } catch (e) {
    html = '<div class="top"><div class="tit"><h1>CANTIERI</h1></div></div><div class="avviso rosso">Qualcosa è andato storto: ' + h(e.message) + '</div>' +
      '<div class="modulo"><button class="btn" data-az="vai" data-a="#/">Torna all\'inizio</button></div>';
  }
  vista.innerHTML = html;
  vista.querySelectorAll('textarea.corpo, textarea.campo.auto').forEach(cresciTextarea);
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
function cardSezioneLettura(chiave, testo) {
  const s = SEZIONI.find(function (x) { return x.chiave === chiave; });
  return '<div class="card" id="sez-' + chiave + '"><div class="card-capo">' + h(s.nome) + '</div>' +
    '<div class="card-corpo">' + testoElenco(testo, s.elenco) + '</div></div>';
}
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
    '<span class="d">' + durataBreve(pezzo.durata) + '</span></div>';
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
function vistaDashboard() {
  const db = leggiTutto();
  const loc = leggiLocale();
  const oggi = oggiISO();
  const f = senzaAccenti(filtroCantieri);
  const tutti = valori(db.cantieri).filter(function (c) {
    if (!f) return true;
    return senzaAccenti(c.nome + ' ' + c.committente + ' ' + c.codice + ' ' + (c.indirizzo || '')).indexOf(f) !== -1;
  });
  const attivi = tutti.filter(function (c) { return c.stato !== 'chiuso'; });
  const chiusi = tutti.filter(function (c) { return c.stato === 'chiuso'; });
  const daFare = [], fatti = [];
  attivi.forEach(function (c) { (sopralluogoDiOggi(c.codice) ? fatti : daFare).push(c); });
  const ordina = function (a, b) { return a.nome.localeCompare(b.nome); };
  daFare.sort(ordina); fatti.sort(ordina); chiusi.sort(ordina);

  let html = testata({ titolo: 'CANTIERI', grande: true, idTitolo: 'titolo-app', sotto: h(GIORNI_SETT[new Date().getDay()] + ' ' + new Date().getDate() + ' ' + MESI[new Date().getMonth()]),
    destra: '<button class="pill ok" data-az="vai" data-a="#/nuovo-cantiere">＋ cantiere</button>' });
  html += '<div class="cerca">🔍 <input type="search" placeholder="Cerca cantiere, committente, codice" value="' + h(filtroCantieri) + '" data-campo="filtro-cantieri" autocomplete="off"></div>';
  html += '<button class="link blocco" data-az="vai" data-a="#/cerca">🔎 Cerca nei documenti</button>';
  if (SPAZIO.avviso) html += '<div class="avviso">Spazio quasi pieno: scarica gli audio vecchi. <button class="link" data-az="vai" data-a="#/dev" style="min-height:auto">Apri</button></div>';
  if (!navigator.onLine) html += '<div class="avviso">Manca la rete: si registra e si salva lo stesso, la trascrizione parte quando torna.</div>';
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
    return '<div class="card tocca" data-az="vai" data-a="#/cantiere/' + h(c.id) + '"><div class="card-in">' +
      '<p class="titolo">' + h(c.nome) + '</p><div class="sotto">' + h(c.committente) + (c.indirizzo ? ' · ' + h(c.indirizzo) : '') + '</div>' +
      '<div class="fila">' + stato + '<span class="pill cod">' + h(c.codice) + '</span><span class="mini">' + h(mini) + '</span></div></div></div>';
  }
  if (!attivi.length && !chiusi.length) {
    html += '<div class="vuoto-stato">' + (f ? 'Nessun cantiere trovato.' : 'Nessun cantiere. Tocca “＋ cantiere” per aprirne uno.') + '</div>';
  }
  if (daFare.length) html += '<div class="eti">Da fare oggi <span class="n">' + daFare.length + '</span></div>' + daFare.map(cardCantiere).join('');
  if (fatti.length) html += '<div class="eti">Già fatti <span class="n">' + fatti.length + '</span></div>' + fatti.map(cardCantiere).join('');
  if (chiusi.length) html += tendina('chiusi', 'Cantieri chiusi (' + chiusi.length + ')', chiusi.map(cardCantiere).join(''));
  if (!REG.attiva) html += '<div class="barra"><button class="az verde" data-az="parla-dashboard">🎙️ Detta un sopralluogo</button></div>';
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
  let html = testata({ indietro: '#/', titolo: c.nome, sotto: h(c.committente) + ' · ' + h(c.codice),
    destra: '<button class="pill ' + (c.stato === 'chiuso' ? 'grigia' : 'cod') + '" data-az="vai" data-a="#/modifica-cantiere/' + h(c.id) + '">' + (c.stato === 'chiuso' ? 'chiuso' : 'modifica') + '</button>' });
  if (c.indirizzo) html += '<div class="sub" style="margin:-4px 16px 12px;font-size:16px;color:var(--muted)">' + h(c.indirizzo) + '</div>';
  html += '<div class="numeri"><div class="n"><div class="v">' + sops.length + '</div><div class="k">giorni</div></div>' +
    '<div class="n"><div class="v">' + nVerbali + '</div><div class="k">verbali</div></div>' +
    '<div class="n"><div class="v fatto">' + h(compatto(totale)) + '</div><div class="k">contabilità €</div></div></div>';
  if (!sops.some(function (s) { return s.giorno === oggi; }) && c.stato !== 'chiuso') {
    html += '<div class="card tocca piu" data-az="nuovo-sopralluogo" data-id="' + h(c.id) + '"><div class="card-in"><p class="titolo">＋ Sopralluogo di oggi</p><div class="sotto">' + h(dataEstesa(oggi)) + '</div></div></div>';
  }
  // I giorni, dal più recente, raggruppati per mese
  let meseCorrente = null;
  sops.forEach(function (s) {
    const mese = s.giorno.slice(0, 7);
    if (mese !== meseCorrente) {
      if (meseCorrente) html += '</div>';
      html += '<div class="eti">' + h(titoloMese(s.giorno)) + '</div><div class="card">';
      meseCorrente = mese;
    }
    const d = daISO(s.giorno);
    const piene = sezioniPiene(s.sezioni).length;
    const anteprima = CHIAVI_SEZIONI.map(function (k) { return primaRiga(s.sezioni[k]); }).filter(Boolean)[0] || (s.sezioni.da_smistare ? primaRiga(s.sezioni.da_smistare) : '') || (s.pezzi.length ? 'trascrizione in arrivo…' : 'ancora niente');
    let pill;
    if (s.chiuso) pill = '<span class="pill ok">' + h(s.verbale || 'chiuso') + '</span>';
    else if (s.giorno === oggi) pill = '<span class="pill att">in corso</span>';
    else pill = '<span class="pill att">da chiudere</span>';
    html += '<button class="giorno' + (s.giorno === oggi && !s.chiuso ? ' oggi' : '') + '" data-az="vai" data-a="#/giorno/' + h(s.id) + '">' +
      '<div class="data"><div class="dnum">' + d.getDate() + '</div><div class="dset">' + GIORNI_BREVI[d.getDay()] + '</div></div>' +
      '<div class="n"><div class="titolo">' + h(nomeGiornoRelativo(s.giorno)) + ' · ' + h(s.ora) + '</div>' +
      '<div class="prima">' + h(anteprima) + '</div>' +
      '<div class="stat">' + pill + '<span class="mini">' + piene + '/11 sezioni · ' + s.pezzi.length + ' audio</span></div></div></button>';
  });
  if (meseCorrente) html += '</div>';
  if (!sops.length) html += '<div class="vuoto-stato">Nessun sopralluogo ancora. Premi il bottone verde e parla.</div>';
  html += tendina('voci-' + c.id, 'Contabilità · Note · Listino',
    '<div class="card">' +
    '<button class="riga" data-az="vai" data-a="#/contabilita/' + h(c.id) + '"><span class="desc">Contabilità<small>' + (cont ? h(cont.codice) + ' · ' + cont.righe.length + ' righe · ' + h(euro(totale)) : 'ancora vuota') + '</small></span><span class="frec">›</span></button>' +
    '<button class="riga" data-az="vai" data-a="#/note/' + h(c.id) + '"><span class="desc">Note del cantiere<small>' + h(primaRiga(c.note) || 'nessuna nota') + '</small></span><span class="frec">›</span></button>' +
    '<button class="riga" data-az="vai" data-a="#/listino/' + h(c.id) + '"><span class="desc">Listino prezzi<small>' + listinoTutto().length + ' voci</small></span><span class="frec">›</span></button>' +
    '</div>');
  if (!REG.attiva && c.stato !== 'chiuso') html += '<div class="barra"><button class="az verde" data-az="parla-cantiere" data-id="' + h(c.id) + '">🎙️ Detta un sopralluogo</button></div>';
  return html;
}

function creaSopralluogo(c, giorno, ora) {
  return salva('sopralluogo', {
    cantiere: c.codice, giorno: giorno || oggiISO(), ora: ora || oraAdesso(),
    sezioni: sezioniVuote(), pezzi: [], chiuso: null, media: [], posizione: null
  });
}
// Il sopralluogo di oggi su quel cantiere: quello aperto se c'è, altrimenti uno nuovo.
function sopralluogoPerDettare(c) {
  const oggi = sopralluoghiDi(c.codice).filter(function (s) { return s.giorno === oggiISO() && !s.chiuso; })[0];
  return oggi || creaSopralluogo(c);
}

/* ---------------- IL GIORNO ---------------- */
function vistaGiorno(id) {
  const s = sopralluogo(id);
  if (!s) return vistaDashboard();
  const c = cantierePerCodice(s.cantiere) || { nome: '?', id: '' };
  // Aprire un giorno vale come aprire il suo cantiere: è quello su cui "Detta" della dashboard andrà.
  if (c.id) { const loc = leggiLocale(); if (loc.ultimoCantiere !== c.id) { loc.ultimoCantiere = c.id; salvaLocale(); } }
  return s.chiuso ? vistaGiornoChiuso(s, c) : vistaGiornoInCorso(s, c);
}

function vistaGiornoInCorso(s, c) {
  const piene = sezioniPiene(s.sezioni);
  const parlato = s.pezzi.reduce(function (t, p) { return t + (p.durata || 0); }, 0);
  const registrandoQui = REG.attiva && REG.destinazione && REG.destinazione.tipo === 'sopralluogo' && REG.destinazione.id === s.id;
  let html = testata({ indietro: '#/cantiere/' + c.id, titolo: dataBreve(s.giorno), sotto: h(c.nome) + ' · ' + h(s.codice), tocca: 'modifica-testata', id: s.id,
    destra: registrandoQui ? '<span class="pill reg">● rec</span>' : '<span class="pill att">' + (s.giorno < oggiISO() ? 'da chiudere' : 'in corso') + '</span>' });
  html += '<div class="avanz"><div class="r"><span><b>' + piene.length + '</b> sezioni su 11</span><span class="dx">' +
    (registrandoQui ? 'sto ascoltando…' : (s.pezzi.length + ' audio · ' + durataBreve(parlato) + ' di parlato')) + '</span></div>' +
    '<div class="barra-av"><i style="width:' + Math.round(piene.length / 11 * 100) + '%"></i></div></div>';

  if (String(s.sezioni.da_smistare || '').trim()) {
    html += '<div class="card gialla"><div class="card-capo gialla">Da smistare</div>' +
      '<textarea class="corpo" data-campo="sezione" data-id="' + h(s.id) + '" data-sezione="da_smistare">' + h(s.sezioni.da_smistare) + '</textarea>' +
      '<div class="card-piede">Manda questo testo in una sezione:</div><div class="griglia">' +
      SEZIONI.map(function (z) { return '<button class="btn" data-az="smista" data-id="' + h(s.id) + '" data-sezione="' + z.chiave + '">' + h(z.nome) + '</button>'; }).join('') +
      '</div></div>';
  }
  if (s.pezzi.length) {
    html += '<div class="card"><div class="card-capo">Audio di oggi<span class="dx">tocca per sentire</span></div>' +
      s.pezzi.slice().reverse().map(function (p) { return rigaAudio(s, statoLavoroPezzo(p)); }).join('') + '</div>';
  }
  const vuote = [];
  SEZIONI.forEach(function (z) {
    const testo = s.sezioni[z.chiave] || '';
    const pezziQui = s.pezzi.filter(function (p) { return (p.sezioni || []).indexOf(z.chiave) !== -1 || p.sezione === z.chiave; });
    const card = '<div class="card" id="sez-' + z.chiave + '"><div class="card-capo' + (testo.trim() ? '' : ' spenta') + '">' + h(z.nome) + '</div>' +
      '<textarea class="corpo" data-campo="sezione" data-id="' + h(s.id) + '" data-sezione="' + z.chiave + '" placeholder="' + (z.elenco ? 'una voce per riga' : '—') + '">' + h(testo) + '</textarea>' +
      pezziQui.map(function (p) { return rigaAudio(s, statoLavoroPezzo(p), { dentroSezione: true }); }).join('') + '</div>';
    if (testo.trim()) html += card; else vuote.push(card);
  });
  if (vuote.length) html += tendina('vuote-' + s.id, vuote.length + (vuote.length === 1 ? ' sezione ancora vuota' : ' sezioni ancora vuote'), vuote.join(''));
  html += tendinaGrezzo(s);
  if (!REG.attiva) {
    html += '<div class="barra"><button class="az verde" data-az="detta" data-id="' + h(s.id) + '">🎙️ ' + (s.pezzi.length ? 'Continua' : 'Detta') + '</button>' +
      '<button class="az stretta" data-az="chiudi-giornata" data-id="' + h(s.id) + '">Chiudi</button></div>';
  }
  return html;
}

function vistaGiornoChiuso(s, c) {
  const v = verbaleDiSopralluogo(s.codice);
  const sezioni = v ? v.sezioni : s.sezioni;
  const piene = sezioniPiene(sezioni);
  const parlato = s.pezzi.reduce(function (t, p) { return t + (p.durata || 0); }, 0);
  let html = testata({ indietro: '#/cantiere/' + c.id, titolo: dataBreve(s.giorno), sotto: h(c.nome) + ' · ' + h(v ? v.codice : s.codice), tocca: 'modifica-testata', id: s.id,
    destra: '<span class="pill ok">chiuso alle ' + h(oraDaISO(s.chiuso)) + '</span>' });
  html += '<div class="numeri"><div class="n"><div class="v">' + piene.length + '/11</div><div class="k">sezioni</div></div>' +
    '<div class="n"><div class="v">' + s.pezzi.length + '</div><div class="k">audio</div></div>' +
    '<div class="n"><div class="v">' + durataBreve(parlato) + '</div><div class="k">parlato</div></div></div>';
  if (s.pezzi.length) {
    html += '<div class="card"><div class="card-capo">Audio della giornata</div>' +
      s.pezzi.map(function (p) { return rigaAudio(s, statoLavoroPezzo(p)); }).join('') + '</div>';
  }
  piene.forEach(function (k) { html += cardSezioneLettura(k, sezioni[k]); });
  if (!piene.length) html += '<div class="vuoto-stato">Verbale senza sezioni piene.</div>';
  html += tendinaGrezzo(s);
  html += '<div class="barra"><button class="az verde" data-az="esporta-pdf" data-id="' + h(s.id) + '">Esporta PDF</button>' +
    (v ? '<button class="az stretta" data-az="vai" data-a="#/verbale/' + h(v.id) + '">Modifica</button>' : '') + '</div>';
  return html;
}

// Il testo grezzo resta sempre sotto: è la prova di cosa è stato detto, anche dopo il riordino.
function tendinaGrezzo(s) {
  const grezzi = s.pezzi.filter(function (p) { return p.grezzo; });
  if (!grezzi.length) return '';
  return tendina('grezzo-' + s.id, 'Dettatura originale (' + s.codice + ')',
    '<div class="card">' + grezzi.map(function (p) {
      return '<div class="card-capo spenta">' + h(p.titolo || 'Registrazione delle ' + p.ora) + '<span class="dx">' + h(p.ora) + '</span></div><div class="card-corpo" style="color:var(--text-2)">' + h(p.grezzo) + '</div>';
    }).join('') + '</div>');
}

async function chiudiGiornata(sopId) {
  const s = sopralluogo(sopId);
  if (!s || s.chiuso) return;
  if (REG.attiva) { avvisa('Ferma prima la registrazione', 'att'); return; }
  const inCoda = leggiLocale().coda.some(function (l) { return l.sop === s.id && l.stato !== 'fallito'; });
  let testo = 'Si crea il verbale della giornata. Il sopralluogo resta com\'è, il verbale si potrà correggere.';
  if (inCoda) testo = 'Una registrazione è ancora in coda: il suo testo non entrerà nel verbale. ' + testo;
  if (String(s.sezioni.da_smistare || '').trim()) testo = 'C\'è del testo da smistare: finirà nelle Note. ' + testo;
  const ok = await chiedi('Chiudere la giornata?', testo, 'Chiudi la giornata');
  chiudiFoglio();
  if (!ok) return;
  const sezioni = {};
  CHIAVI_SEZIONI.forEach(function (k) { sezioni[k] = s.sezioni[k] || ''; });
  if (String(s.sezioni.da_smistare || '').trim()) sezioni.note = aggiungiTesto(sezioni.note, s.sezioni.da_smistare);
  const v = salva('verbale', { sopralluogo: s.codice, cantiere: s.cantiere, giorno: s.giorno, ora: s.ora, sezioni: sezioni });
  s.chiuso = adessoISO();
  s.verbale = v.codice;
  salva('sopralluogo', s);
  avvisa('Verbale ' + v.codice, 'ok');
  aggiornaVista();
}

/* ---------------- VERBALE: modifica ---------------- */
function vistaVerbaleModifica(id) {
  const v = verbale(id);
  if (!v) return vistaDashboard();
  const s = valori(leggiTutto().sopralluoghi).find(function (x) { return x.codice === v.sopralluogo; });
  const c = cantierePerCodice(v.cantiere) || { nome: '?' };
  let html = testata({ indietro: s ? '#/giorno/' + s.id : '#/', titolo: 'Modifica ' + v.codice, sotto: h(c.nome) + ' · ' + h(dataBreve(v.giorno)) + ' · ' + h(v.ora),
    destra: '<span class="pill ok">verbale</span>' });
  html += '<div class="avviso" style="background:var(--surface);border-color:var(--line);color:var(--muted)">Correggere il verbale non tocca il sopralluogo: la dettatura originale resta com\'era.</div>';
  SEZIONI.forEach(function (z) {
    const testo = v.sezioni[z.chiave] || '';
    html += '<div class="card"><div class="card-capo' + (testo.trim() ? '' : ' spenta') + '">' + h(z.nome) + '</div>' +
      '<textarea class="corpo" data-campo="sezione-verbale" data-id="' + h(v.id) + '" data-sezione="' + z.chiave + '" placeholder="' + (z.elenco ? 'una voce per riga' : '—') + '">' + h(testo) + '</textarea></div>';
  });
  html += '<div class="barra"><button class="az verde" data-az="salva-verbale" data-id="' + h(v.id) + '">Salva</button></div>';
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
  let html = testata({ indietro: '#/cantiere/' + c.id, titolo: 'Contabilità', sotto: h(c.nome) + (cont ? ' · ' + h(cont.codice) : ''),
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
    html += '<div class="barra"><button class="az verde" data-az="detta-contabilita" data-id="' + h(c.id) + '">🎙️ Aggiungi una riga</button>' +
      '<button class="az stretta" data-az="riga-nuova" data-id="' + h(c.id) + '">＋ a mano</button></div>';
  }
  return html;
}
function rigaContabilitaHtml(r, rif) {
  const attr = rif.proposta ? 'data-az="riga-modifica" data-proposta="' + h(rif.proposta) + '" data-indice="' + rif.indice + '"' : 'data-az="riga-modifica" data-cont="' + h(rif.cont) + '" data-id="' + h(r.codice) + '"';
  return '<button class="voceriga' + (r.dacompletare ? ' dacompletare' : '') + '" ' + attr + '>' +
    '<div class="desc">' + h(r.descrizione || '(senza descrizione)') + '</div>' +
    '<div class="conti"><span class="codice">' + h(r.codice || 'nuova') + '</span><span>' + h(numeroIt(r.quantita)) + ' ' + h(r.um || '') + '</span>' +
    '<span>× ' + h(euro(r.prezzo)) + '</span>' + (r.dallistino ? '<span class="targa">' + h(r.dallistino) + '</span>' : '') +
    '<span class="importo">' + (r.dacompletare ? 'da completare' : h(euro(r.importo))) + '</span></div></button>';
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
    '<h2>' + (riga.codice ? h(riga.codice) : 'Riga') + '</h2>' +
    '<label class="eticampo">Descrizione lavorazione</label><input class="campo" id="r-desc" value="' + h(riga.descrizione) + '" autocomplete="off">' +
    '<div class="due" style="display:flex;gap:8px"><div style="flex:1"><label class="eticampo">Quantità</label><input class="campo" id="r-qta" inputmode="decimal" value="' + h(numeroIt(riga.quantita)) + '"></div>' +
    '<div style="flex:1"><label class="eticampo">Unità</label><select class="campo" id="r-um">' + opzioniUm.map(function (u) { return '<option value="' + h(u) + '"' + (u === um ? ' selected' : '') + '>' + (u || '—') + '</option>'; }).join('') + '</select></div></div>' +
    '<label class="eticampo">Prezzo unitario €</label><input class="campo" id="r-prezzo" inputmode="decimal" value="' + h(riga.prezzo ? numeroIt(riga.prezzo) : '') + '" placeholder="0,00">' +
    '<button class="btn medio" data-az="riga-cerca-listino" style="margin-top:12px">🔎 Cerca nel listino</button>' +
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
    '<div class="cerca" style="margin:0 0 12px">🔍 <input type="search" id="scelta-cerca" placeholder="Cerca nella descrizione" value="' + h(filtroListinoScelta) + '" data-campo="filtro-scelta" autocomplete="off" autofocus></div>' +
    '<div class="lista">' + (elenco.length ? elenco.map(function (v) {
      return '<button class="riga" data-az="scegli-voce" data-id="' + h(v.id) + '"><span class="desc">' + h(v.descrizione) + '<small>' + h(v.codice) + ' · ' + h(v.um) + '</small></span><span class="dx">' + h(euro(v.prezzo)) + '</span></button>';
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
  html += '<div class="cerca">🔍 <input type="search" placeholder="Cerca nella descrizione" value="' + h(filtroListino) + '" data-campo="filtro-listino" autocomplete="off"></div>';
  html += '<div class="modulo"><button class="btn medio" data-az="vai" data-a="#/listino/' + h(c.id) + '/carica">📄 Carica listino da file</button></div>';
  if (voci.length) {
    html += '<div class="card" style="margin-top:12px">' + voci.slice(0, 200).map(function (v) {
      return '<button class="riga" data-az="voce-modifica" data-id="' + h(v.id) + '"><span class="desc">' + h(v.descrizione) + '<small>' + h(v.codice) + (v.rif ? ' · ' + h(v.rif) : '') + ' · ' + h(v.um || '—') + '</small></span><span class="dx">' + h(euro(v.prezzo)) + '</span></button>';
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
    '<h2>' + (v ? h(v.codice) : 'Nuova voce') + '</h2>' +
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
  let html = testata({ indietro: '#/cantiere/' + c.id, titolo: 'Note del cantiere', sotto: h(c.nome) + ' · ' + h(c.codice) });
  inCoda.forEach(function (l) { html += '<div class="avviso" style="color:var(--muted);border-color:var(--line);background:var(--surface)">' + (l.stato === 'fallito' ? 'Nota dettata non riuscita: ' + h(l.errore || '') : 'Nota dettata in arrivo…') + '</div>'; });
  html += '<div class="modulo"><textarea class="campo auto" data-campo="note-cantiere" data-id="' + h(c.id) + '" placeholder="Note che valgono per tutto il cantiere" style="min-height:200px">' + h(c.note || '') + '</textarea></div>';
  if (!REG.attiva) html += '<div class="barra"><button class="az verde" data-az="detta-nota" data-id="' + h(c.id) + '">🎙️ Detta una nota</button></div>';
  return html;
}

/* ---------------- CERCA NEI DOCUMENTI ---------------- */
let filtroDocumenti = '';
function vistaCerca() {
  let html = testata({ indietro: '#/', titolo: 'Cerca nei documenti', sotto: 'sopralluoghi, verbali, contabilità' });
  html += '<div class="cerca">🔍 <input type="search" placeholder="Una parola: ferro, ponteggio, Rossi…" value="' + h(filtroDocumenti) + '" data-campo="filtro-documenti" autocomplete="off" autofocus></div>';
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
      if (st) risultati.push({ cantiere: s.cantiere, codice: s.codice, giorno: s.giorno, dove: nomeSezione(k), testo: st, a: '#/giorno/' + s.id });
    });
  });
  valori(db.verbali).forEach(function (v) {
    const s = valori(db.sopralluoghi).find(function (x) { return x.codice === v.sopralluogo; });
    CHIAVI_SEZIONI.forEach(function (k) {
      const st = stralcio(v.sezioni[k]);
      if (st) risultati.push({ cantiere: v.cantiere, codice: v.codice, giorno: v.giorno, dove: nomeSezione(k), testo: st, a: s ? '#/giorno/' + s.id : '#/verbale/' + v.id });
    });
  });
  valori(db.contabilita).forEach(function (c) {
    const cant = cantierePerCodice(c.cantiere);
    (c.righe || []).forEach(function (r) {
      const st = stralcio(r.descrizione);
      if (st) risultati.push({ cantiere: c.cantiere, codice: r.codice, giorno: c.aggiornato.slice(0, 10), dove: 'Contabilità ' + c.codice, testo: st, a: cant ? '#/contabilita/' + cant.id : '#/' });
    });
    const sn = stralcio(c.note);
    if (sn) risultati.push({ cantiere: c.cantiere, codice: c.codice, giorno: c.aggiornato.slice(0, 10), dove: 'Note della contabilità', testo: sn, a: cant ? '#/contabilita/' + cant.id : '#/' });
  });
  valori(db.cantieri).forEach(function (c) {
    const sn = stralcio(c.note);
    if (sn) risultati.push({ cantiere: c.codice, codice: c.codice, giorno: c.aggiornato.slice(0, 10), dove: 'Note del cantiere', testo: sn, a: '#/note/' + c.id });
  });
  risultati.sort(function (a, b) { return b.giorno.localeCompare(a.giorno); });
  if (!risultati.length) { html += '<div class="vuoto-stato">Niente con «' + h(filtroDocumenti) + '».</div>'; return html; }
  html += '<div class="eti">Risultati <span class="n">' + risultati.length + '</span></div>';
  risultati.slice(0, 100).forEach(function (r) {
    const cant = cantierePerCodice(r.cantiere);
    html += '<div class="card tocca" data-az="vai" data-a="' + h(r.a) + '"><div class="card-in"><div class="fila" style="margin:0 0 6px"><span class="pill cod">' + h(r.codice) + '</span><span class="mini">' + h(cant ? cant.nome : r.cantiere) + ' · ' + h(dataSenzaAnno(r.giorno)) + '</span></div>' +
      '<div class="sotto" style="color:var(--azione);font-size:14px;text-transform:uppercase;letter-spacing:.05em">' + h(r.dove) + '</div><div style="font-size:17px;margin-top:4px">' + h(r.testo) + '</div></div></div>';
  });
  return html;
}

/* ---------------- CANTIERE: nuovo / modifica ---------------- */
function vistaCantiereForm(id) {
  const c = id ? cantiere(id) : null;
  if (id && !c) return vistaDashboard();
  const v = c || { nome: '', committente: '', indirizzo: '', stato: 'attivo', aperto: oggiISO() };
  let html = testata({ indietro: c ? '#/cantiere/' + c.id : '#/', titolo: c ? 'Modifica ' + c.codice : 'Nuovo cantiere', sotto: c ? h(c.nome) : 'il codice arriva da solo' });
  html += '<div class="modulo">' +
    '<label class="eticampo">Nome del cantiere</label><input class="campo" id="c-nome" value="' + h(v.nome) + '" placeholder="es. Via Mazzini 14" autocomplete="off"' + (c ? '' : ' autofocus') + '>' +
    '<label class="eticampo">Committente</label><input class="campo" id="c-comm" value="' + h(v.committente) + '" autocomplete="off">' +
    '<label class="eticampo">Indirizzo</label><input class="campo" id="c-ind" value="' + h(v.indirizzo || '') + '" autocomplete="off">' +
    '<div class="due"><div><label class="eticampo">Stato</label><select class="campo" id="c-stato"><option value="attivo"' + (v.stato !== 'chiuso' ? ' selected' : '') + '>attivo</option><option value="chiuso"' + (v.stato === 'chiuso' ? ' selected' : '') + '>chiuso</option></select></div>' +
    '<div><label class="eticampo">Aperto il</label><input class="campo" id="c-aperto" type="date" value="' + h(v.aperto || '') + '"></div></div>' +
    (c ? '<button class="btn btn-rosso" data-az="cantiere-elimina" data-id="' + h(c.id) + '" style="margin-top:24px">Elimina il cantiere</button>' : '') +
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

const SPAZIO = { usato: 0, quota: 0, audioByte: 0, audioN: 0, mesi: {}, vecchi: 0, avviso: false, orfani: [] };

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
  });
  const limite = giorniFa(GIORNI_AUDIO);
  SPAZIO.audioByte = 0; SPAZIO.audioN = 0; SPAZIO.mesi = {}; SPAZIO.vecchi = 0; SPAZIO.orfani = [];
  elenco.forEach(function (m) {
    const rif = perId[m.id];
    // Un audio senza documento (una nota già trascritta, un pezzo di un sopralluogo cancellato) è solo peso morto.
    if (!rif) { SPAZIO.orfani.push(m.id); return; }
    const mese = rif.sop.giorno.slice(0, 7);
    const voce = SPAZIO.mesi[mese] || (SPAZIO.mesi[mese] = { byte: 0, n: 0, scaricati: 0 });
    voce.byte += m.peso || 0; voce.n += 1;
    if (rif.pezzo.scaricato) voce.scaricati += 1;
    SPAZIO.audioByte += m.peso || 0; SPAZIO.audioN += 1;
    if (rif.sop.giorno < limite) SPAZIO.vecchi += 1;
  });
  SPAZIO.avviso = SPAZIO.quota > 0 && (SPAZIO.usato / SPAZIO.quota) > SOGLIA_SPAZIO;
  return SPAZIO;
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
    (SPAZIO.vecchi ? '\nPiù vecchi di ' + GIORNI_AUDIO + ' giorni: ' + SPAZIO.vecchi + ' — da scaricare' : '') +
    (SPAZIO.avviso ? '\nSpazio quasi pieno: scarica gli audio vecchi e libera.' : '') + '</div>';
  const mesi = Object.keys(SPAZIO.mesi).sort();
  mesi.forEach(function (m) {
    const v = SPAZIO.mesi[m];
    const tuttiScaricati = v.scaricati >= v.n;
    html += '<div class="card-piede" style="flex-wrap:wrap;gap:8px"><span style="flex:1 1 100%">' + h(titoloMese(m + '-01')) + ': ' + v.n + ' audio, ' + h(megabyte(v.byte)) + (tuttiScaricati ? ' · scaricati' : (v.scaricati ? ' · ' + v.scaricati + ' scaricati' : '')) + '</span>' +
      '<button class="btn medio" style="flex:1" data-az="spazio-scarica" data-mese="' + m + '">Scarica gli audio di ' + h(MESI[parseInt(m.slice(5), 10) - 1]) + '</button>' +
      '<button class="btn medio btn-rosso" style="flex:1" data-az="spazio-libera" data-mese="' + m + '"' + (tuttiScaricati ? '' : ' disabled') + '>Libera spazio</button></div>';
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
  let riuscito = false;
  if (navigator.share && navigator.canShare && navigator.canShare({ files: file })) {
    try { await navigator.share({ files: file, title: 'Audio CANTIERI ' + mese }); riuscito = true; }
    catch (e) { if (e && e.name === 'AbortError') { avvisa('Annullato', 'att'); return; } }
  }
  if (!riuscito) {
    // Senza condivisione (un computer): si scaricano uno per uno.
    for (const f of file) {
      const url = URL.createObjectURL(f);
      const a = document.createElement('a'); a.href = url; a.download = f.name; document.body.appendChild(a); a.click(); a.remove();
      await attendi(300);
      URL.revokeObjectURL(url);
    }
    riuscito = true;
  }
  if (riuscito) {
    const adesso = adessoISO();
    const toccati = new Set();
    pezziDelMese.forEach(function (x) { x.pezzo.scaricato = adesso; toccati.add(x.sop); });
    toccati.forEach(function (s) { salva('sopralluogo', s); });
    avvisa('Scaricati', 'ok');
    await misuraSpazio();
    aggiornaVista();
  }
}

// Cancella solo dopo che lo scaricamento è andato a buon fine, e solo l'audio: testo e nomi restano per sempre.
async function liberaSpazioMese(mese) {
  const ok = await chiedi('Liberare lo spazio?', 'Gli audio di ' + titoloMese(mese + '-01') + ' si cancellano dal telefono. Il testo trascritto e i nomi restano.', 'Libera spazio', 'rosso');
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

function apriEsportaPdf(sopId) {
  const s = sopralluogo(sopId);
  const v = s && verbaleDiSopralluogo(s.codice);
  if (!v) { avvisa('Nessun verbale', 'att'); return; }
  const c = cantierePerCodice(v.cantiere);
  const tutti = valori(leggiTutto().verbali).filter(function (x) { return x.cantiere === v.cantiere; }).sort(function (a, b) { return a.giorno.localeCompare(b.giorno); });
  const primo = tutti.length ? tutti[0].giorno : v.giorno;
  apriFoglio(
    '<h2>Esporta PDF</h2><p>' + h(c ? c.nome : '') + ' · ' + h(v.codice) + '</p>' +
    '<label class="eticampo">Cosa</label><select class="campo" id="pdf-modo" data-campo="pdf-modo">' +
    '<option value="questo">Questo verbale</option><option value="periodo">Tutti i verbali del cantiere in un periodo</option><option value="sezione">Una sola sezione</option></select>' +
    '<div id="pdf-periodo" hidden><div style="display:flex;gap:8px"><div style="flex:1"><label class="eticampo">Dal</label><input class="campo" type="date" id="pdf-dal" value="' + h(primo) + '"></div><div style="flex:1"><label class="eticampo">Al</label><input class="campo" type="date" id="pdf-al" value="' + h(v.giorno) + '"></div></div></div>' +
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
  const dal = document.getElementById('pdf-dal').value, al = document.getElementById('pdf-al').value;
  const quale = document.getElementById('pdf-quale').value;
  const ambito = document.getElementById('pdf-ambito').value;
  let verbali = [v], soloSezione = null, riassunto = '';
  if (modo === 'periodo' || (modo === 'sezione' && ambito === 'periodo')) {
    verbali = valori(leggiTutto().verbali).filter(function (x) { return x.cantiere === v.cantiere && x.giorno >= dal && x.giorno <= al; }).sort(function (a, b) { return (a.giorno + a.ora).localeCompare(b.giorno + b.ora); });
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
  const nome = (modo === 'questo' ? v.codice : (modo === 'periodo' ? (c ? c.codice : 'cantiere') + '_' + dal + '_' + al : v.codice + '_' + quale)) + '.pdf';
  await condividiFile(new Blob([byte], { type: 'application/pdf' }), nome, 'Verbale di sopralluogo');
}

// Le lettere che il carattere standard non sa scrivere si sostituiscono, se no pdf-lib si ferma.
function testoPdf(s) {
  return String(s || '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[—–]/g, '-').replace(/…/g, '...')
    .replace(/[^\x20-\x7E\xA0-\xFF\u20AC\u2022]/g, '?');
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
  const nuovaPagina = function () {
    pagina = doc.addPage([L, A]);
    numero++;
    y = A - M;
    pagina.drawText(testoPdf('CANTIERI - pagina ' + numero), { x: M, y: 28, size: 9, font: normale, color: PDF.rgb(0.5, 0.5, 0.5) });
  };
  const spazio = function (alt) { if (!pagina || y - alt < M) nuovaPagina(); };
  const scrivi = function (testo, corpo, font, colore, rientro) {
    const righe = spezzaRighe(font, testoPdf(testo), corpo, larghezza - (rientro || 0));
    righe.forEach(function (r) {
      spazio(corpo * 1.4);
      if (r) pagina.drawText(r, { x: M + (rientro || 0), y: y - corpo, size: corpo, font: font, color: colore || PDF.rgb(0, 0, 0) });
      y -= corpo * 1.4;
    });
  };
  const c0 = cantierePerCodice(verbali[0].cantiere) || {};
  const conCopertina = info.modo === 'periodo' || (info.modo === 'sezione' && verbali.length > 1);
  if (conCopertina) {
    nuovaPagina();
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
    if (!pagina) nuovaPagina(); else if (i > 0) { y -= 16; spazio(120); }
    const testataPiena = !soloSezione || verbali.length === 1;
    if (testataPiena) {
      scrivi('VERBALE DI SOPRALLUOGO', 16, grassetto);
      y -= 4;
      scrivi(v.codice + '   -   sopralluogo ' + (v.sopralluogo || ''), 11, normale);
      scrivi('Cantiere: ' + (c.codice || '') + ' - ' + (c.nome || '') + (c.indirizzo ? ' - ' + c.indirizzo : ''), 11, normale);
      scrivi('Committente: ' + (c.committente || ''), 11, normale);
      scrivi('Data: ' + dataEstesa(v.giorno) + '   Ora: ' + (v.ora || ''), 11, normale);
      spazio(14); y -= 6;
      pagina.drawLine({ start: { x: M, y: y }, end: { x: L - M, y: y }, thickness: 0.8, color: PDF.rgb(0.2, 0.2, 0.2) });
      y -= 12;
    } else {
      scrivi(dataEstesa(v.giorno).toUpperCase() + ' - ' + v.codice, 12, grassetto);
    }
    const chiavi = soloSezione ? [soloSezione] : CHIAVI_SEZIONI;
    let stampate = 0;
    chiavi.forEach(function (k) {
      const testo = String(v.sezioni[k] || '').trim();
      if (!testo) return;
      const def = SEZIONI.find(function (z) { return z.chiave === k; });
      spazio(40);
      scrivi(def.nome.toUpperCase(), 11, grassetto);
      if (def.elenco) righeElenco(testo).forEach(function (r) { scrivi('• ' + r, 11, normale, null, 6); });
      else scrivi(testo, 11, normale);
      y -= 8;
      stampate++;
    });
    if (!stampate) scrivi(soloSezione ? '(sezione vuota)' : '(nessuna sezione compilata)', 11, normale, PDF.rgb(0.45, 0.45, 0.45));
  });
  return await doc.save();
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
  'tendina': function (el) {
    const loc = leggiLocale();
    loc.tendine[el.dataset.chiave] = !loc.tendine[el.dataset.chiave];
    salvaLocale();
    const aperta = loc.tendine[el.dataset.chiave];
    el.setAttribute('aria-expanded', String(aperta));
    if (el.nextElementSibling) { el.nextElementSibling.hidden = !aperta; el.nextElementSibling.querySelectorAll('textarea.corpo').forEach(cresciTextarea); }
  },
  'riascolta': function (el) { riascolta(el.dataset.sop, el.dataset.id); },
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
  'chiudi-giornata': function (el) { chiudiGiornata(el.dataset.id); },
  'esporta-pdf': function (el) { apriEsportaPdf(el.dataset.id); },
  'pdf-crea': function (el) { creaPdf(el.dataset.id); },
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
    avvisa('Spostato in ' + nomeSezione(el.dataset.sezione), 'ok');
    aggiornaVista();
  },
  'modifica-testata': function (el) {
    const s = sopralluogo(el.dataset.id);
    if (!s) return;
    const cantieri = valori(leggiTutto().cantieri).sort(function (a, b) { return a.nome.localeCompare(b.nome); });
    apriFoglio(
      '<h2>' + h(s.codice) + '</h2>' +
      '<label class="eticampo">Cantiere</label><select class="campo" id="t-cantiere">' + cantieri.map(function (c) { return '<option value="' + h(c.codice) + '"' + (c.codice === s.cantiere ? ' selected' : '') + '>' + h(c.nome) + ' · ' + h(c.codice) + '</option>'; }).join('') + '</select>' +
      '<div style="display:flex;gap:8px"><div style="flex:1"><label class="eticampo">Data</label><input class="campo" type="date" id="t-data" value="' + h(s.giorno) + '"></div>' +
      '<div style="flex:1"><label class="eticampo">Ora</label><input class="campo" type="time" id="t-ora" value="' + h(s.ora) + '"></div></div>' +
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
    s.cantiere = codiceCant; s.giorno = giorno; s.ora = ora;
    salva('sopralluogo', s);
    const v = verbaleDiSopralluogo(s.codice);
    if (v) { v.cantiere = codiceCant; v.giorno = giorno; v.ora = ora; salva('verbale', v); }
    chiudiFoglio(); avvisa('Salvato', 'ok'); aggiornaVista();
  },
  'sopralluogo-elimina': async function (el) {
    const s = sopralluogo(el.dataset.id);
    if (!s) return;
    chiudiFoglio();
    const ok = await chiedi('Eliminare ' + s.codice + '?', 'Si cancellano il sopralluogo, i suoi audio' + (s.verbale ? ' e il verbale ' + s.verbale : '') + '. Il codice non verrà riusato.', 'Elimina', 'rosso');
    chiudiFoglio();
    if (!ok) return;
    for (const p of s.pezzi) { if (p.audio) await cancellaMedia(p.audio); }
    const v = verbaleDiSopralluogo(s.codice);
    if (v) cancella('verbale', v.id);
    const c = cantierePerCodice(s.cantiere);
    cancella('sopralluogo', s.id);
    avvisa('Eliminato', 'ok');
    vai(c ? '#/cantiere/' + c.id : '#/');
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
  'voce-modifica': function (el) { const v = leggiTutto().listino[el.dataset.id]; if (v) apriVoceListino(v); },
  'voce-salva': function () { if (VOCE_APERTA) salvaVoceAperta(); },
  'voce-elimina': async function () {
    if (!VOCE_APERTA || !VOCE_APERTA.id) return;
    const v = VOCE_APERTA;
    chiudiFoglio();
    const ok = await chiedi('Eliminare ' + v.codice + '?', v.descrizione, 'Elimina', 'rosso');
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
  'cantiere-salva': function (el) {
    const nome = document.getElementById('c-nome').value.trim();
    if (!nome) { avvisa('Manca il nome', 'att'); document.getElementById('c-nome').focus(); return; }
    const c = el.dataset.id ? cantiere(el.dataset.id) : { note: '' };
    if (!c) return;
    c.nome = nome;
    c.committente = document.getElementById('c-comm').value.trim();
    c.indirizzo = document.getElementById('c-ind').value.trim();
    c.stato = document.getElementById('c-stato').value;
    c.aperto = document.getElementById('c-aperto').value || oggiISO();
    salva('cantiere', c);
    avvisa('Salvato', 'ok');
    vai('#/cantiere/' + c.id);
  },
  'cantiere-elimina': async function (el) {
    const c = cantiere(el.dataset.id);
    if (!c) return;
    const sops = sopralluoghiDi(c.codice);
    const ok = await chiedi('Eliminare ' + c.codice + '?', c.nome + ': si cancellano anche ' + sops.length + ' sopralluoghi, i verbali e la contabilità. Il listino resta.', 'Elimina tutto', 'rosso');
    chiudiFoglio();
    if (!ok) return;
    for (const s of sops) {
      for (const p of s.pezzi) { if (p.audio) await cancellaMedia(p.audio); }
      const v = verbaleDiSopralluogo(s.codice);
      if (v) cancella('verbale', v.id);
      cancella('sopralluogo', s.id);
    }
    const cont = contabilitaDi(c.codice);
    if (cont) cancella('contabilita', cont.id);
    cancella('cantiere', c.id);
    avvisa('Eliminato', 'ok');
    vai('#/');
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
  'spazio-scarica': function (el) { scaricaAudioMese(el.dataset.mese); },
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
    salvaConCalma('sop-' + s.id, function () { salva('sopralluogo', s); chiediNotificheUnaVolta(); });
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
  // La prima volta l'app parte con i dati di esempio dentro.
  if (!archivioEsiste()) { inserisciDatiEsempio(); }
  else if (!conta(db.cantieri) && db.soloEsempio) { inserisciDatiEsempio(); }

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
  document.addEventListener('input', function (ev) { const el = ev.target.closest('[data-campo]'); if (el) suCampo(el, 'input'); });
  document.addEventListener('change', function (ev) { const el = ev.target.closest('[data-campo]'); if (el && (el.type === 'file' || el.tagName === 'SELECT')) suCampo(el, 'change'); });
  // Uscendo da un campo si dice "Salvato": una parola, per sapere che è andata.
  document.addEventListener('focusout', function (ev) {
    const el = ev.target;
    if (!el || !el.dataset || !el.dataset.campo) return;
    const prefissi = { 'sezione': 'sop-', 'sezione-verbale': 'ver-', 'note-cantiere': 'cant-', 'note-contabilita': 'cont-' };
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
    else { ricaricaSeFresco(); aggiornaVista(); elaboraCoda(); controllaPromemoria(); }
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(function () { /* senza service worker l'app funziona lo stesso, solo non senza rete */ });
  }

  elaboraCoda();
  setInterval(elaboraCoda, 60000);
  setInterval(controllaPromemoria, 60000);
  controllaPromemoria();
  misuraSpazio().then(function () { if (SPAZIO.avviso) aggiornaVista(); });

  // La copia online: si legge senza token, e se c'è qualcosa da mandare si manda.
  if (navigator.onLine && repoGitHub()) {
    scaricaGitHub().then(function (cambiato) {
      if (cambiato) { avvisa('Aggiornato da GitHub', 'ok'); aggiornaVista(); }
      if (leggiLocale().github.daMandare) programmaInvioGitHub();
    }).catch(function () { /* il file può non esserci ancora: non è un errore */ });
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', avvio);
else avvio();
