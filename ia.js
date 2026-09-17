/* CANTIERI — ia.js: le regole per Claude (REGOLE_), chiamaClaude, Groq, registraConsumo, spesaStimata, la coda dei lavori */
'use strict';


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
- sicurezza: ponteggi, protezioni, dispositivi, prescrizioni, mancanze rilevate.
- problemi: anomalie, difetti, ritardi, contestazioni, cose che non vanno.
- osservazioni: quello che non sta nelle altre sezioni ma va scritto.
- note: appunti liberi.
- da_smistare: quello che non sai dove mettere.

Le frasi che aprono una sezione ("capitolo operai", "lavorazioni eseguite", "materiali che servono", "sicurezza"...) tagliano il testo: togli quelle parole dal risultato. Se non ci sono, decidi dal contenuto. Distingui sempre quello che c'è adesso da quello che servirà dopo: sono sezioni diverse.

Sistema punteggiatura e a capo. Togli le esitazioni. NON RIASSUMERE: tieni tutto quello che è stato detto, con le stesse parole. NON INVENTARE NIENTE: se una cosa non è stata detta, non c'è. Se una sezione è vuota, lasciala vuota.

Scrivi ore, misure e quantità in cifre. I nomi propri che trovi nell'elenco allegato scrivili esattamente come stanno lì.

Dai anche un titolo alla registrazione: tre o quattro parole prese da quello che è stato detto, la cosa più importante. Non un riassunto, un'etichetta: "Getto solaio primo piano", "Ponteggio senza fermapiede".

Rispondi soltanto con un oggetto JSON con queste chiavi: titolo, lavorazioni_eseguite, lavorazioni_non_eseguite, operai, attrezzature_presenti, attrezzature_necessarie, materiali_impiegati, materiali_necessari, rilievi_ordine, sicurezza, problemi, osservazioni, note, da_smistare. Ogni valore è una stringa; negli elenchi separa le voci con un a capo. Niente altro testo.
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
5-bis. Una misura dettata dopo "rilievo d'ordine" va in rilievi_ordine: è la misura di un prodotto, con la quantità, e non va in materiali_necessari, che dice cosa serve e non quanto misura.
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

const REGOLE_LISTINO = `Ricevi le prime righe di un prezzario edile italiano esportato da un foglio di calcolo. Devi capire com'è fatto.

Dimmi: qual è l'indice della riga di intestazione (partendo da 0), quale colonna contiene la descrizione della lavorazione, quale l'unità di misura, quale il prezzo unitario, e quale l'eventuale codice della voce. Le colonne si indicano con il loro indice, partendo da 0.

Dimmi anche come sono scritti i numeri: se il separatore dei decimali è la virgola o il punto, e se c'è un separatore delle migliaia.

Ignora le colonne che non servono (manodopera, incidenze, note, capitoli). Se una riga del file è un titolo di categoria e non una lavorazione, dimmi come si riconosce.

Se non riesci a capire una colonna, mettila a null: l'utente la sceglierà a mano.

Rispondi soltanto con un oggetto JSON: {"riga_intestazione":0,"colonne":{"codice":null,"descrizione":1,"um":2,"prezzo":3},"decimali":",","migliaia":".","riga_categoria":"la descrizione è in maiuscolo e il prezzo è vuoto"}. Niente altro testo.`;

// Una pagina di prezzario fotografata: le voci le legge Claude, una pagina per volta.
const REGOLE_LISTINO_IMMAGINE = `Ricevi la fotografia di una pagina di un prezzario edile. Ricavi le voci del prezzario (codice se c'è, descrizione, unità di misura, prezzo). Non inventare prezzi: se non si legge, prezzo è null. Una riga che è un titolo di capitolo va riportata con la sola descrizione e prezzo null.
Risposta solo JSON:
{"righe":[{"codice":null,"descrizione":"","um":"","prezzo":null}]}`;

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

Dì anche in quale sezione del verbale va questa foto, scegliendo fra: lavorazioni_eseguite, lavorazioni_non_eseguite, operai, attrezzature_presenti, attrezzature_necessarie, materiali_impiegati, materiali_necessari, rilievi_ordine, sicurezza, problemi, osservazioni, note.
Vale la stessa regola del verbale: un lavoro fatto va in lavorazioni_eseguite; una crepa, un difetto, un ritardo vanno in problemi; ponteggi, parapetti e protezioni vanno in sicurezza, che ha la precedenza su problemi; un materiale posato va in materiali_impiegati, uno che manca in materiali_necessari. Se non è chiaro, scrivi osservazioni.

Rispondi soltanto con un oggetto JSON: {"didascalia":"…","sezione":"…"}. Niente altro testo.`;

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
  const tipi = { trascrizione: 'Trascrizione', riordino: 'Riordino', contabilita: 'Contabilità', nota: 'Nota', referto: 'Referto foto', rilievo: 'Rilievo', bolla: 'Bolla' };
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
  if (l.tipo === 'nota') return await lavoroNota(l);
  if (l.tipo === 'referto') return await lavoroReferto(l);
  if (l.tipo === 'rilievo') return await lavoroRilievo(l);
  throw new Error('Lavoro sconosciuto');
}
