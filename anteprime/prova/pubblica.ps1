# pubblica.ps1 - pubblica CANTIERI su GitHub nell'ordine giusto.
#
# Il push viene respinto quando su GitHub c'e' del lavoro che sul PC non c'e'
# ancora: succede perche' due chat lavorano sullo stesso ramo. La cura e'
# sempre la stessa, ed e' l'ordine: prima si salva quello che si ha in mano,
# poi si scarica quello che e' arrivato, poi si pubblica.
#
# Si lancia dalla cartella dell'app:   .\pubblica.ps1 "cosa ho cambiato"

param([string]$messaggio = "aggiornamento")

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "1/4  salvo quello che c'e' sul PC" -ForegroundColor Cyan
git add -A
# Se non c'e' niente da salvare, git si lamenta: non e' un errore.
git commit -m $messaggio 2>$null
if ($LASTEXITCODE -ne 0) { Write-Host "     niente di nuovo da salvare" -ForegroundColor DarkGray }

Write-Host ""
Write-Host "2/4  scarico quello che e' arrivato su GitHub" -ForegroundColor Cyan
git pull --rebase
if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "FERMO QUI." -ForegroundColor Red
  Write-Host "Le stesse righe sono state cambiate in due posti e vanno sistemate a mano." -ForegroundColor Red
  Write-Host "Copia quello che c'e' scritto qui sopra e mandalo in chat." -ForegroundColor Red
  Write-Host "Per tornare com'era prima del tentativo:  git rebase --abort" -ForegroundColor DarkGray
  exit 1
}

Write-Host ""
Write-Host "3/4  pubblico" -ForegroundColor Cyan
git push
if ($LASTEXITCODE -ne 0) {
  Write-Host ""
  Write-Host "Il push non e' passato. Rilancia lo script: nel frattempo e' arrivata altra roba." -ForegroundColor Yellow
  exit 1
}

Write-Host ""
Write-Host "4/4  fatto." -ForegroundColor Green
Write-Host "     Il sito ci mette un minuto a ricostruirsi." -ForegroundColor DarkGray
Write-Host ""
