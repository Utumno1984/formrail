---
name: storybook-and-wcag-review
description: Checklist WCAG e QA per le story di Storybook (Primitives, Forms, Floorplans) — usala ogni volta che scrivi o modifichi una story, prima di aprire o aggiornare una PR.
---

# Storybook and WCAG review

Applicabile a ogni story in `Primitives/*`, `Forms/*`, `Floorplans/*` (non alle fixture interne di
`Internal/Harness`, che non sono pubblicate e non seguono questa checklist).

## Check WCAG

Ogni volta che lavori su un componente o sulla sua story, verifica:

- **Regioni `aria-live`**: annunci di caricamento, errori e cambi di conteggio dinamici (es. il
  conteggio risultati di `ListReportTable`) sono davvero dentro una regione live, con
  `role`/`aria-live` coerenti con l'urgenza (`polite` per i conteggi, `assertive`/`alert` per gli
  errori bloccanti) — e scattano una sola volta per cambiamento osservabile, non ad ogni render.
- **`:focus-visible`**: ogni elemento interattivo nuovo ha un indicatore di fuoco visibile solo da
  tastiera (mai al click, stessa convenzione `focus-visible:` già in uso su `Button`/`Field`), con
  contrasto non-testuale ≥3:1 (WCAG 1.4.11) contro lo sfondo su cui può effettivamente cadere.
- Nessuna violazione axe sulla story (il harness e2e la verifica già via
  `expectNoA11yViolations`): una story nuova ci deve passare attraverso, non esserne esclusa.

## QA ottico

Un controllo "a occhio" o una baseline visiva già verde non bastano a intercettare un difetto di
rifinitura: la regressione visiva confronta solo con uno screenshot precedente, che può già
contenere il difetto. Per ogni componente con testo in un box ad altezza fissa (bottoni, pillole/
chip, badge, tab) o con elementi contigui (etichetta/controllo, bordo/contenuto, due controlli
affiancati), misura con uno script Playwright contro Storybook (`getBoundingClientRect`, mai una
lettura visiva o uno screenshot):

- **Centratura verticale del testo** nel suo box (scarto ≤ 1px tra lo spazio sopra e sotto il
  testo misurato, salvo un valore diverso dichiarato nel design — non "sembra centrato").
- **Distanza minima tra elementi contigui** rispetto a quella dichiarata nel design (nessun
  overlap reale misurato) — l'anello di `:focus-visible` di un controllo conta come elemento che
  può toccare quello sopra/accanto, verificalo anche a fuoco attivo.

Tre casi reali che questa regola avrebbe dovuto intercettare prima che arrivassero a Daniele:
cornice demo di una story senza padding che si accavalla al contenuto; il focus ring di `Input`
che tocca l'etichetta sovrastante (gap misurato: 0px); il testo di una pillola di
`ListReportFilterBar` non centrato otticamente, perché il trattamento già applicato a `Button`
(wrapper `TextLabel`, line-height 1 + offset ottico di 1px, commit `5cb1df1`) non era stato esteso
alla pillola.

Lo script di misura può restare temporaneo (fuori dal repository, o cancellato a fine lavoro); se
il controllo deve restare permanente, promuovilo a un test e2e vero in `e2e/`.

## Test e QA

Prima di aprire o aggiornare una PR:

- `npm run check` verde (lint + tipi + build + unit).
- Suite e2e verde in locale (non solo "dovrebbe passare in CI"); se il componente è ad alto
  raggio d'impatto (overlay, List Report, Object Page), anche la suite visiva.
- Nessun file temporaneo di debug (script ad-hoc, screenshot di prova, branch/PR di test) resta
  nel repo o su GitHub a fine lavoro: pulisci prima di consegnare, coerente con la convenzione già
  in uso per gli smoke test dal vivo in `CLAUDE.md`.
