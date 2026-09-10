# Togliere i dati da un repository pubblico

**Procedura riutilizzabile · scritta il 10/09/2026 · provata su hsagency587/cantieri**

Serve quando un'app salva i suoi dati dentro lo stesso repository GitHub da cui viene pubblicata, e quel repository è pubblico. In quel caso chiunque conosca l'indirizzo legge i dati.

Tempo: 15 minuti. Non si scrive una riga di codice.

---

## Quando si usa questa procedura

**Sì**, se l'app:

- è pubblicata con GitHub Pages da un repo pubblico;
- salva i suoi dati in un file (`dati.json` o simile) dentro quello stesso repo, tramite l'API di GitHub;
- ha il nome del repository scritto in un campo delle impostazioni, non fisso nel codice.

**No**, se i dati stanno già in un database vero o in un servizio esterno. Lì il problema è un altro.

---

## La cosa da non fare

**Non rendere privato il repository del codice.**

Con l'account GitHub gratuito, GitHub Pages pubblica solo da repository pubblici. Se rendi privato quello del codice, il sito si spegne. Servirebbe GitHub Pro.

La soluzione è un'altra: il codice resta pubblico, i dati vanno in un secondo repository privato. Nel codice non c'è niente di riservato.

---

## Prima di partire: tre cose da controllare

**1. Il nome del repository è un campo, non è nel codice.**
Apri le impostazioni dell'app. Se c'è una casella tipo "Repository GitHub (utente/nome)", sei a posto.
Se non c'è, la procedura funziona lo stesso ma serve cambiare una riga di codice: quella dove compare `api.github.com/repos/`.

**2. Come si chiama il ramo dove finiscono i dati.**
Guarda il repo attuale: se i dati stanno in un ramo separato (per esempio `dati`), quel ramo va ricreato uguale nel repo nuovo. Se stanno su `main`, non devi creare niente.

**3. Come si chiama il file.**
Di solito `dati.json`. Serve solo per la verifica finale.

---

## I sei passi

### 1 — Il repository nuovo (3 min)

Vai su `github.com/new`.

- Nome: `<nome-app>-dati` (esempio: `cantieri-dati`)
- Visibilità: **Private**
- "Add a README file": **acceso** — serve, altrimenti il repo nasce vuoto e non ci puoi creare rami sopra
- Crea

### 2 — Il ramo dei dati (1 min)

*Salta questo passo se l'app scrive su `main`.*

Vai su `github.com/<utente>/<nome-app>-dati/branches` → **New branch**.

- Nome: esattamente quello che usa l'app (nel caso CANTIERI: `dati`)
- Source: `main`
- Create new branch

### 3 — Il token nuovo (4 min)

Vai su `github.com/settings/personal-access-tokens/new`.

GitHub chiede di confermare che sei tu, con un codice via email. Questo lo devi fare di persona.

Poi compila:

- **Token name**: `<nome-app>-dati`
- **Expiration**: 90 giorni
- **Repository access**: "Only select repositories" → scegli solo `<nome-app>-dati`
- **Permissions** → Add permissions → cerca `Contents` → mettilo su **Read and write**
  (`Metadata: Read-only` si aggiunge da solo, è obbligatorio)
- **Generate token**

Copia il token subito. GitHub non te lo fa più vedere.

Un token fatto così vale solo su quel repository. Se esce, chi lo ha non può toccare nient'altro del tuo account.

### 4 — L'app (2 min)

Nelle impostazioni dell'app:

- Token GitHub → incolla quello nuovo
- Repository GitHub → scrivi `<utente>/<nome-app>-dati`
- Salva

Poi fai una modifica qualsiasi dentro l'app, così parte un salvataggio.

**Se l'app è installata su più telefoni, questo passo va fatto su ognuno.** Quelli non aggiornati smettono di salvare online, e i dati restano chiusi lì dentro.

### 5 — Verifica, prima di cancellare (1 min)

Apri `github.com/<utente>/<nome-app>-dati/tree/<ramo>`.

Deve esserci il file dei dati, con l'ora di adesso.

**Se non c'è, fermati qui.** Non cancellare niente: il vecchio giro funziona ancora, quindi non hai perso nulla. Controlla il nome del repo scritto nell'app e il nome del ramo.

### 6 — Chiudi il vecchio (3 min)

Solo dopo che il passo 5 è andato bene.

**Cancella il ramo dei dati dal repo pubblico:**
`github.com/<utente>/<repo-pubblico>/branches` → cestino accanto al ramo.

*Se i dati stavano su `main` insieme al codice, il ramo non si cancella: si cancella il file. Vai al file su GitHub, apri il menu dei tre puntini e scegli Delete.*

**Revoca il token vecchio:**
`github.com/settings/personal-access-tokens` → Delete accanto al token di prima → conferma.

---

## La prova che ha funzionato

Apri una finestra in incognito e vai su:

```
https://raw.githubusercontent.com/<utente>/<repo-pubblico>/<ramo>/<file>.json
```

Deve rispondere **404: Not Found**.

Se risponde con i dati, qualcosa non è andato: il ramo è ancora lì.

---

## Quello che questa procedura non fa

**I dati vecchi non spariscono dalla storia.** Cancellare un ramo li toglie dalla vista e dalle ricerche, ma chi si è già segnato l'indirizzo esatto di un vecchio salvataggio può ancora raggiungerlo per un po'.

Per la pulizia completa serve cancellare e ricreare il repository del codice. Sono 10 minuti in più, e va fatto quando nessuno ci sta lavorando sopra.

**Le chiavi restano nel telefono.** Se l'app usa servizi a pagamento (trascrizione, modelli di testo), quelle chiavi stanno ancora nella memoria del browser di chi usa l'app. Chi ha il telefono in mano le legge.

Finché l'app è tua, è un rischio piccolo. Il giorno che la dai a qualcun altro, non basta più: lì serve un server tuo in mezzo.

---

## Da segnare sul calendario

Il token scade dopo 90 giorni. Il giorno che scade, l'app smette di salvare online senza dire niente di chiaro.

Mettiti un promemoria una settimana prima. Rifare il token sono due minuti: stessa pagina, stessi permessi, e lo reincolli nell'app.

---

## Se qualcosa va storto

**L'app dice che non riesce a salvare.**
Tre cause, in ordine di probabilità: il nome del repo scritto male nelle impostazioni, il ramo che non esiste nel repo nuovo, il token incollato con uno spazio davanti.

**Hai cancellato il ramo per sbaglio prima della verifica.**
Su GitHub, nella pagina dei rami, per qualche giorno compare l'icona per ripristinarlo. Usala.

**Hai revocato il token prima di incollare quello nuovo.**
Non si è perso niente: i dati sono nel telefono. Incolla il token nuovo e riparte al primo salvataggio.
