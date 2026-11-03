# react-object-page

Design system React **open-core**: implementazione headless e indipendente di due pattern UI
enterprise diffusi — **List Report** (lista con filtri, selezione, azioni bulk) e **Object Page**
(editor a sezioni ancorate, save-bar sticky, dirty-tracking) — per chi vuole quella UX senza
uno stack proprietario.

## Stato

Progetto in fase di avvio. Il piano completo (inventario componenti, segmentazione
Free/Pro, architettura, roadmap) è in [`docs/planning/design-system-spec.md`](docs/planning/design-system-spec.md).

## Modello

- **Free** (`packages/core`, MIT): primitivi di base e versioni semplici dei floorplan.
- **Pro** (`packages/pro`, `@react-object-page/pro`, in sviluppo): componenti con moat tecnico reale
  (virtualizzazione, dirty-tracking avanzato, Change Summary, dialog con griglia incorporata). Il
  pacchetto è privato (`"private": true`, non pubblicato su npm) e ha una **licenza commerciale
  separata** ([`packages/pro/LICENSE`](packages/pro/LICENSE)); il sorgente è leggibile in questo
  repo, ma la licenza MIT della radice copre solo `packages/core`. Primo modulo: il motore del
  Change Summary (`useChangeSummary`), vedi [`packages/pro/README.md`](packages/pro/README.md).

## Sviluppo

Vedi `CLAUDE.md` per la pipeline di sviluppo (pianificatore → sviluppatore → tester →
critico-avversariale) e le regole di dominio.

### Storybook ed e2e

- **Demo pubblica**: https://utumno1984.github.io/react-object-page/ — Storybook del solo core
  (Free), ripubblicato su GitHub Pages a ogni push su `main` con CI verde (job `deploy-pages` in
  `.github/workflows/ci.yml`; esiste anche l'avvio manuale con `workflow_dispatch`).

- `npm run storybook` avvia Storybook; `npm run test:e2e` ricostruisce Storybook e lancia
  Playwright contro la build statica sulla porta 6007.
- In locale `reuseExistingServer` è attivo: se qualcosa ascolta già sulla porta 6007, Playwright
  lo riusa senza ricostruire, quindi si può testare una build **vecchia**. Se i risultati sembrano
  incoerenti, ferma il processo sulla 6007 e rilancia.
- In CI `retries: 1`: un test instabile che passa al secondo tentativo risulta **flaky ma verde**.
  Controlla il report per i test marcati flaky, non fidarti solo del colore.
- I test marcati `@touch` girano solo nel progetto `chromium-touch`.
