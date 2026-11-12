---
name: verifica-e-merge
description: Procedura che la sessione principale di Formrail segue per verificare dal vivo e mergiare una PR — usala prima di ogni gh pr ready/merge. Agenti e sessioni headless delegate non mergiano mai.
---

# Verifica e merge di una PR (solo sessione principale del progetto)

Il merge lo fa la sessione principale di questo progetto (delega di Daniele del 2026-11-12, vedi
CLAUDE.md, punto 3 "Merge"); gli agenti di `.claude/agents/` e le sessioni headless delegate non
mergiano mai. Questa procedura si segue quando una PR è pronta per la revisione finale, prima di
`gh pr ready`/`gh pr merge`.

## 1. Worktree isolato, mai il checkout condiviso

```bash
cd ~/projects/formrail && git fetch origin <branch> --quiet
rm -rf /tmp/rop-verify-<N>
git worktree add --detach /tmp/rop-verify-<N> origin/<branch>
```

Mai nel checkout condiviso `~/projects/formrail`: potrebbe avere una sessione headless
attiva sullo stesso o un altro branch.

## 2. `node_modules` via hardlink

```bash
for d in node_modules packages/core/node_modules tests/react-18/node_modules; do
  rm -rf "/tmp/rop-verify-<N>/$d"
  mkdir -p "$(dirname "/tmp/rop-verify-<N>/$d")"
  cp -al "$d" "/tmp/rop-verify-<N>/$d"
done
```

**Gotcha**: `rm -rf` della destinazione PRIMA della copia è obbligatorio — se la destinazione
esiste già, `cp -al src dst` crea `dst/basename(src)` annidato invece di fondere il contenuto
(capitato due volte sui sotto-workspace `tests/react-18`).

## 3. Check statici

```bash
cd /tmp/rop-verify-<N>
npm run check          # lint + tipi + build + unit
npm run bundle:check
npm run changeset:check
```

Tutti verdi prima di proseguire.

## 4. e2e e visual

```bash
npm run test:e2e     # in background, aspettare la notifica
npm run test:visual  # richiede Docker; l'hook globale SessionStart lo avvia da solo se giù,
                      # ma l'avvio reale richiede 30-60s — se appena lanciato, aspettare prima
```

**Prima di lanciarle insieme ad altro lavoro pesante sulla stessa macchina**, controllare
`uptime`: due suite Playwright complete (726 test ciascuna) in parallelo hanno impiegato ~7x il
tempo normale per pura contesa CPU/Chromium, non per un problema di codice. Load molto sopra il
numero di core → aspettare che scenda o accettare consapevolmente il rallentamento, mai scartare
un risultato anomalo (troppo lento, numero di test molto più basso del solito) senza controllare
il carico.

**Un singolo test fallito di timing/animazione** (es. una transizione CSS con `waitForFunction`
a timeout breve) sotto carico alto è spesso un falso negativo: rilanciarlo isolato
(`npx playwright test <file> -g "<nome>"`) quando il carico è sceso prima di giudicare se è un
bug reale.

**Flake noto, non bloccante**: qualunque story `*-inside-dialog` nel visual (listbox/combobox/
select dentro un Dialog) può fallire con un diff ~1% di pixel (rendering testo/bordo) e passare al
tentativo successivo senza nessun cambio di codice — non blocca mai un merge da solo, ma va
ticketato se ricorre (vedi issue #90, #111).

## 5. Verificare che il critico sia stato DAVVERO invocato

"APPROVATO" nel report non basta. Controllare nel log/transcript della sessione headless (o nel
transcript completo in `~/.claude/projects/-home-utumno-projects-formrail/<session-id>.jsonl` —
`-home-utumno-projects-react-object-page*/` per le sessioni precedenti al 12/11/2026 —
se il worktree che l'ha generato è già stato rimosso) che il sottoagente `critico-avversariale`
sia stato lanciato per davvero via tool Agent con `model: opus` quando il ticket lo richiede — una
revisione manuale del diff fatta dalla sessione stessa su sonnet non è un giro critico, anche se
il verdetto riportato è corretto.

Se una sessione headless è terminata a metà subito dopo aver avviato un sottoagente in background
senza aspettarlo (il processo padre esce con `end_turn`, il sottoagente viene ucciso): riprenderla
con `--resume <session-id>` istruendola a invocare il critico sul codice/PR già esistente, senza
rifare lo sviluppo né apire una nuova PR.

## 6. Commento di verifica e merge

Commento sull'issue (non sulla PR) nello stile standard: cosa verificato, risultati numerici
(unit/e2e/visual), le note basse del critico riportate per esteso (non riassunte) — se una nota
indica un possibile bug reale (non solo uno stile/testo), dirlo esplicitamente, non seppellirlo
tra le note minori.

```bash
gh pr ready <N>
gh pr merge <N> --merge --delete-branch   # merge commit, mai squash
```

Provare diretto: spesso passa senza bisogno del prefisso `!`. Se il classificatore auto-mode lo
blocca come "Merge Without Review", chiedere a Daniele lo stesso comando con `!` davanti.

## 7. Pulizia

```bash
git worktree remove /tmp/rop-verify-<N> --force
```

Se il path non esiste più (es. dopo un riavvio della macchina, `/tmp` è tmpfs e si svuota):
`git worktree prune -v` dal checkout principale per pulire i riferimenti amministrativi residui.
