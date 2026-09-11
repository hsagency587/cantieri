# Pubblicare prima sull'anteprima, poi in produzione

**Procedura · scritta l'11/09/2026 · repository hsagency587/cantieri**

Questo file dice a chi modifica l'app dove mette le mani. Vale per ogni agente e per ogni sessione. Si legge prima di toccare un file.

---

## La regola

**Su `main` non si scrive mai a mano.**

Le modifiche si fanno sul ramo `prova`. Si guardano all'indirizzo di anteprima. Arrivano a chi usa l'app solo con un'unione fatta apposta, e solo quando Simone lo dice.

Gli indirizzi sono due:

| Cosa | Indirizzo | Chi la vede |
|---|---|---|
| L'app vera | `https://hsagency587.github.io/cantieri/` | il padre di Simone, e domani i clienti |
| L'anteprima | `https://hsagency587.github.io/cantieri/anteprime/prova/` | solo chi ha l'indirizzo |

---

## Come funziona l'anteprima

Nel repository c'è `.github/workflows/anteprime.yml`.

A ogni caricamento su un ramo che non sia `main`, copia i file di quel ramo dentro `anteprime/<nome del ramo>/` su `main`. GitHub Pages li pubblica da lì. I file dell'app vera, che stanno nella radice, non vengono toccati.

Se apri un ramo nuovo — per esempio `colori` — nasce da solo `https://hsagency587.github.io/cantieri/anteprime/colori/`. Non c'è niente da configurare.

La cartella `anteprime/` la scrive il robot. **A mano non si tocca.**

---

## Il giro di lavoro

### 1 — Mettersi sul ramo giusto

```
git fetch
git checkout prova
git pull
```

Se `git status` dice `main`, fermarsi e tornare su `prova`.

### 2 — Modificare

Le regole di stile stanno in `STILE.md`. Il foglio da modificare è `stile.css`. `styles.css` non si apre.

### 3 — Pubblicare sull'anteprima

```
git add -A
git commit -m "cosa ho cambiato"
git push
```

Poi aspettare circa un minuto: prima gira il lavoro "Anteprime dei rami", poi GitHub ricostruisce il sito.

### 4 — Guardare

Aprire l'indirizzo dell'anteprima e ricaricare svuotando la cache (`Ctrl+F5`). Senza quello il browser serve la copia di prima.

### 5 — Portare in produzione

**Solo quando Simone dice di sì.**

```
git checkout main
git pull
git merge prova
git push
git checkout prova
```

Dopo il caricamento su `main` il numero della cache si alza da solo, e i telefoni scaricano la versione nuova al primo giro con la rete.

---

## Le tre trappole

**1. L'anteprima legge i dati veri.**

Le due copie stanno sullo stesso dominio, quindi pescano dallo stesso cassetto del browser: `cantieri.dati`, `cantieri.locale` e l'archivio audio `cantieri-audio`. Aprire l'anteprima e salvare vuol dire scrivere nell'archivio vero.

Finché non è sistemato: **dall'anteprima si guarda, non si salva.**

Il rimedio previsto, quando si deciderà di farlo, è in due righe: un prefisso alle tre chiavi ricavato dall'indirizzo, e il nome della cache del service worker che contenga l'indirizzo invece del solo numero di versione. Scritte così stanno bene su tutti e due i rami e non vanno disfatte all'unione.

**2. Su `main` lavora anche un'altra chat.**

Prima di unire, sempre `git pull` su `main`. Se il caricamento viene respinto, si lancia `pubblica.ps1`, che fa l'ordine giusto: salva quello che hai in mano, scarica quello che è arrivato, pubblica.

**3. Il marcatore `[cache]` nel commit dell'anteprima non si toglie.**

Il robot dell'anteprima salva con un messaggio che finisce per `[cache]`. Serve a non far ripartire il lavoro "Controlla e numero cache" su `main`: quella modifica non tocca nessun file dell'app, quindi il numero della cache di chi la usa non deve muoversi.

---

## Cosa non si tocca

- `main`, direttamente.
- `.github/workflows/pubblica.yml` — è il controllo dei file e il numero della cache.
- La cartella `anteprime/`.
- `styles.css`.

---

## Se qualcosa va storto

**L'anteprima non si aggiorna.**
Guardare in Actions il lavoro "Anteprime dei rami". Se è verde, il file è già su `main` e sta ricostruendo il sito: aspettare un minuto. Se è rosso, l'errore è quasi sempre nel passo "Salvo su main", e vuol dire che `main` si è mosso durante il lavoro: basta ricaricare il ramo.

**L'anteprima risponde 404.**
Il ramo non è mai stato caricato su GitHub, oppure il nome nell'indirizzo non corrisponde al nome del ramo.

**Una modifica è finita su `main` per sbaglio.**
Non cancellarla a mano e non riscrivere la storia. Dirlo a Simone e fermarsi.
