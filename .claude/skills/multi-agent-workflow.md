---
name: multi-agent-workflow
description: Standard per la critica pre-merge e la validazione QA di un ticket prima di segnarlo pronto — usala come riferimento rapido della pipeline sviluppatore/tester/critico-avversariale già descritta per esteso in CLAUDE.md e negli agenti in .claude/agents/.
---

# Multi-agent workflow

Riferimento rapido alla pipeline completa (la fonte di verità resta `CLAUDE.md` e i singoli
agenti in `.claude/agents/`: questa skill distilla solo le regole che è facile dimenticare o
aggirare sotto pressione).

## Ordine, senza saltare passaggi

`pianificatore` → `sviluppatore` (branch + PR in bozza) → CI verde → `tester` (QA) →
`critico-avversariale` (red team) → `gh pr ready`. Se tester o critico respingono, si torna allo
sviluppatore e si riparte dal controllo CI. **Dopo 2 respinte del critico-avversariale sulla stessa PR ci si
ferma e si chiede a Daniele** (si contano le respinte del critico, non i ritorni allo
sviluppatore: decisione di Daniele del 2026-11-12), anche se il problema del giro scoped è nuovo (non uno dei
punti già approvati) — vale lo stesso limite.

## Il critico va invocato DAVVERO

Il modo più facile di barare, anche senza volerlo: dichiarare "critico: APPROVATO" dopo una
revisione manuale del diff fatta dalla sessione stessa, senza aver mai lanciato il sottoagente
`critico-avversariale` tramite il tool Agent. È già successo in questo progetto (ticket #10): il
report finale diceva "approvato" ma il sottoagente non era mai partito, e il giro vero (lanciato
davvero, su `opus`) ha trovato un bloccante reale che la revisione manuale aveva perso.

**Prima di accettare un "APPROVATO"**, verificare che il report dichiari esplicitamente di aver
invocato il sottoagente via tool Agent (non "ho rivisto il diff io stesso"). Un giro mancato è
peggio di nessun giro: dà falsa sicurezza.

## Modello del critico

`opus` di default. `sonnet` solo su un ticket esplicitamente a basso rischio (una story, un
testo, una rifinitura visiva senza stato/accessibilità coinvolta) — chi invoca il critico lo
decide e lo scrive nel ticket ("critico: sonnet (basso rischio)", con il motivo). In caso di
dubbio resta `opus`.

## QA prima della chiusura

Il tester verifica **ogni criterio di accettazione** con un test che lo copre nominato
esplicitamente (non "ho controllato a occhio"); se Playwright non parte per limiti
dell'ambiente/permessi, lo dichiara esplicitamente invece di fingere un esito locale — per la
parte e2e fa fede la CI. Una PR non va segnata pronta con QA incompleto taciuto.
