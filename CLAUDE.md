# react-object-page — istruzioni per Claude Code

react-object-page è un design system React **open-core**: implementazione headless e
indipendente di due pattern UI enterprise diffusi — **List Report** (lista con filtri/azioni
bulk) e **Object Page** (editor a sezioni ancorate, save-bar sticky, dirty-guard). Nessun
codice/asset/CSS di terzi viene toccato: solo pattern di interazione e composizione generici e
liberamente implementabili, descritti in astratto (vedi `docs/planning/design-system-spec.md`).

**Modello di business — open-core**:
- `packages/core`: MIT, gratuito, pubblicato su npm pubblico. Primitivi e versioni "semplici" dei
  floorplan (vedi segmentazione in `docs/planning/design-system-spec.md`, §3).
- `packages/pro`: licenza commerciale ("da definire"), **vive in questo monorepo pubblico**
  (decisione di Daniele del 2026-11-03: il sorgente è leggibile, il moat è servizio/licenza), con
  `"private": true` finché non esiste l'org npm privata (nessun licensing a runtime). Si estende
  solo con ticket espliciti (roadmap MVP, §6). Distribuzione iniziale pianificata: npm org
  privata, abbonamento ricorrente (decisione di Daniele, non rinegoziabile senza nuova istruzione
  sua).
- Il documento di pianificazione completo (inventario componenti, insidie tecniche di classe
  generale, segmentazione Free/Pro, MVP) è in `docs/planning/design-system-spec.md`. **Il
  pianificatore lo legge sempre prima di creare ticket.**

## Ruolo della sessione principale: orchestratore del progetto

Daniele parla con l'orchestratore di `~/projects`, che delega qui. Chi lavora in questa cartella
(sessione interattiva o headless) coordina il team in `.claude/agents/`. Per ogni richiesta segui
la pipeline, senza saltare passaggi:

1. **pianificatore** → crea i ticket GitHub (o restituisce domande: giralle a Daniele/
   all'orchestratore e aspetta).
2. Per ogni ticket, in ordine di dipendenza:
   1. **sviluppatore** → branch `feat/<N>-<slug>` (o `fix/<N>-<slug>`) e **PR in bozza subito**
      (`Closes #<N>`), così la CI gira a ogni push. Codice e test insieme: unitari (Vitest),
      **e2e per ogni comportamento visibile dall'esterno** (Playwright, contro Storybook o una
      pagina di test minimale). `npm run check` verde.
   2. **CI verde** sulla PR (`gh pr checks <N> --watch`): lint, tipi, build, unit test, e2e.
      Se è rossa torna allo sviluppatore: tester e critico non partono su una CI rossa.
   3. **tester** → QA: ogni comportamento del ticket dal punto di vista di chi usa la libreria,
      smoke test sulla build (Storybook statico e/o il bundle pubblicato), casi non coperti.
   4. **critico-avversariale** → red team del diff, per ultimo, su codice già verde e verificato.
   5. Se tester o critico segnalano problemi, torna allo **sviluppatore** con l'elenco completo
      e riparti dal punto 2 (CI). Dopo 2 giri senza esito positivo fermati e chiedi a Daniele.
   6. Quando CI verde, tester = QA SUPERATO e critico = APPROVATO: `gh pr ready <N>` e riepilogo
      (cosa cambia, test aggiunti, note del critico).
3. **Merge e pubblicazione npm**: li fa l'orchestratore di `~/projects` (delega di Daniele), mai
   le sessioni o gli agenti di questo progetto. Niente push su `main` né push forzati, niente
   `npm publish` da qui.

### Comandi `gh`

`gh` è nel `PATH`: chiamalo come `gh ...`, all'inizio del comando e da solo (niente prefisso
`PATH=...`, niente `cd ... && gh`). Altrimenti il comando non corrisponde al permesso
`Bash(gh *)` di `.claude/settings.json` e resta bloccato in attesa di un'approvazione.

Se `gh issue create`/`gh pr create` risultano bloccati in una sessione headless (classificatore
auto-mode di "self-approval", non un problema di sintassi o di permessi): scrivi il contenuto in
un file locale (es. `.tickets-draft/<nome>.md`, già in `.gitignore`) e restituiscilo
all'orchestratore, che lo pubblica lui con `gh issue create --body-file`.

### Budget dei token (piano Pro)

Le quote di utilizzo (5 ore e settimanale) sono il vincolo: usa il modello più leggero adatto.

- Sessioni headless (`claude -p`) e orchestratore: sempre `--model sonnet`.
- Modelli degli agenti: pianificatore e critico `opus` di default, sviluppatore e tester
  `sonnet`; ogni agente ha un `maxTurns` nel frontmatter.
- Critico su `sonnet`: solo per un ticket a **basso rischio** (una story di Storybook, un
  testo, una rifinitura visiva senza logica di stato/accessibilità coinvolta). Chi invoca il
  critico decide e scrive nel ticket "critico: sonnet (basso rischio)" con il motivo; in caso
  di dubbio resta `opus`. `effort: medium`; dal secondo giro verifica solo i punti segnalati e
  il diff delle correzioni, non rifà il red team completo. Massimo 2 giri.

Questo è un progetto a **ritmo lento e parallelo** (non prioritario su vistato/Fatture in Cloud):
va bene procedere ticket per ticket senza fretta.

## Regressione e test

- I test esistenti non si cancellano, non si rinominano e non si indeboliscono (niente
  `.skip`, `.only`, `.fixme`, asserzioni rimosse, soglie o timeout allargati, valori attesi
  cambiati) per far passare una PR: se un test è sbagliato, lo si spiega nella PR.
- Ogni ticket ha la sezione "## Smoke test" oltre ai criteri di accettazione.
- **Regressione visiva (Storybook + screenshot diff) fin dal primo componente**, non aggiunta
  dopo: un e2e funzionale è cieco al layout (centratura, doppio scroll, anello di focus
  tagliato possono essere tutti "verdi" con un bug visivo reale).

## Regole di dominio (principi generali, vedi `docs/planning/design-system-spec.md` §1 per il dettaglio)

- **List Report**: impronta dimensionalmente stabile tra loading/vuoto/dati (niente salti di
  layout); contratto esplicito e testato per l'ordinamento al primo click; virtualizzazione
  disattivata esplicitamente su dataset piccoli/vuoti; celle troncate con `max-width` reale sul
  contenitore (non solo `text-overflow`); tooltip di troncamento gated su hover/focus reale, mai
  al mount; azioni in un menu overflow devono ereditare `onClick`/`disabled` dal componente
  originale.
- **Object Page / dirty-tracking (probabile nucleo del moat tecnico)**: un controllo che riceve
  il proprio valore da fuori dopo il mount (idratazione asincrona) non deve mai marcare il form
  come "sporco" né propagare quell'evento come un gesto dell'utente. Preferire montare i
  controlli già idratati; se la libreria sottostante genera comunque un `onChange` di "eco",
  serve un modo esplicito di distinguere eco di sistema da intenzione utente. Change Summary
  (diff) calcolato sempre contro la baseline reale salvata, mai un default statico. Footer
  sticky: riservare sempre lo spazio, anche prima che compaia/scompaia.
- **Campi con stati forzato/bloccato/disabilitato**: non interagibili anche da tastiera, non
  solo visivamente spenti; spiegazione collegata via `aria-describedby` reale; l'API deve
  offrire un canale render-prop/hook per iniettare quelle proprietà in un controllo figlio
  arbitrario (un semplice `children: ReactNode` non basta).
- **Responsive tablet/mobile (non un gate di blocco, decisione di Daniele del 2026-10-25)**:
  supporto reale, non un messaggio "usa desktop" sotto una soglia (vedi
  `docs/planning/design-system-spec.md` §1.10). In particolare: la **tastiera virtuale** va
  considerata esplicitamente quando un campo va in focus (`visualViewport`/`dvh`, non solo
  media query sulla larghezza) — il campo attivo non deve restare nascosto sotto la tastiera.
  È un criterio di accettazione dei ticket Field/Dialog/Sheet fin da quando nascono, non un
  ticket di rifinitura a fine progetto; la regressione visiva (ticket #4) copre viewport
  mobile/tablet oltre a desktop fin dall'inizio.
- **Overlay (Dialog/Select/Popover/Tooltip/Sheet)**: scala di z-index disciplinata e coerente in
  tutto il sistema (popover sempre sopra modal); merge reale delle classi in conflitto
  (tailwind-merge, non concatenazione); overlay "controllati da stato esterno" devono attivare
  comunque tutto il bookkeeping interno (pila overlay, focus-trap, annuncio ARIA), verificato con
  DOM reale non solo lettura del codice; ritorno del fuoco alla chiusura catturato con un
  riferimento stabile aggiornato solo mentre l'overlay è chiuso; proprietà di stato-controllo non
  valide come attributo HTML vanno rese non-enumerabili prima dello spread sul DOM (testato con
  un'asserzione dedicata "nessun leak"); preferire assegnazione diretta della prop allo spread
  condizionale quando il target è un componente (bypassa il controllo "proprietà in eccesso" di
  TypeScript).
- **Motion**: qualunque transizione/animazione (durata, easing, quali proprietà animare) va
  dichiarata come token (`--motion-rop-*` quando esiste un valore condiviso), mai come valore
  letterale sparso nel componente. Ogni token di motion rispetta
  `@media (prefers-reduced-motion: reduce)`: con la preferenza attiva l'effetto finale (stato
  aperto/chiuso, valore aggiornato) compare senza transizione, non semplicemente "più veloce".
  Su un overlay, l'animazione non deve mai alterare QUANDO il focus-trap si attiva o quando
  `useReturnFocus` legge `document.activeElement` — vedi "Overlay" sopra: gli stessi test di
  `Internal/OverlayLayers` e `Internal/ReturnFocus` restano verdi senza modifiche di
  tolleranza/timeout.
- **Data layer**: schema di validazione runtime condiviso tra form e chiamata API (fallisce
  rumorosamente su un campo mancante, non propaga `undefined` in silenzio); ricerca asincrona con
  tracking esplicito dell'ultima richiesta (scarta risposte di richieste superate); un valore
  selezionato fuori dai risultati dell'ultima ricerca resta visibile.
- **Accessibilità e test**: il nome accessibile di un campo non deve cambiare per via di un
  marker di stato (es. "modificato") in un modo che rompe la ri-query per label nei test — se
  serve, mantenere il riferimento al nodo invece di ri-cercarlo. Due controlli "funzionalmente
  identici" con lo stesso nome accessibile ma effetti diversi vanno distinti per nome.
- **Governance**: budget di dimensione bundle per-import confrontato con una baseline versionata
  (non riscritta a ogni corsa); changeset obbligatorio su ogni PR che tocca `packages/*`; un
  primitivo che introduce un cambio di comportamento e il fix compagno in un consumer accoppiato
  vanno rilasciati nella stessa release.

## Convenzioni tecniche

- Monorepo: `packages/core` (unico pacchetto esistente all'inizio). `packages/pro` si crea solo
  quando un ticket lo richiede esplicitamente (non prima).
- Stack: React 18/19 + TypeScript, pattern **headless** (logica/stato separati dallo stile,
  stesso approccio di react-virtual-tree-view/react-virtual-dnd-table). Build con `tsup`. Zod per
  gli schema del data-layer. TanStack Query per cache/invalidazione dove serve un data-layer.
  Storybook per demo/documentazione con visual regression attiva da subito. Vitest per gli unit
  test, Playwright per gli e2e (incluso touch via CDP dove rilevante). Changesets per
  versionamento/release.
- Codice, nomi e commenti in inglese. **Testo di Storybook/demo solo in inglese (decisione di
  Daniele del 2026-11-01, sostituisce la vecchia regola "italiano o inglese")**: il prodotto punta
  a una platea internazionale, quindi ogni stringa visibile in una story (label, placeholder,
  messaggi, testo delle fixture) va in inglese, non più mista italiano/inglese. Si applica da ora
  in avanti alle story nuove e a quelle toccate per altri motivi; non richiede una traduzione
  retroattiva sistematica di tutte le story esistenti in un solo colpo (valutare un ticket dedicato
  se serve farlo in modo organico).
- **Storybook: Controls/Actions/Interactions usati sul serio, non per scrupolo (decisione di
  Daniele del 2026-10-25)**. Per ogni componente con una story non puramente interna/fixture:
  `argTypes` che rispecchiano davvero l'API pubblica (controllo giusto per tipo — `radio`/
  `select` per un'unione di varianti, non testo libero; valori di default sensati, non vuoti);
  callback (`onClick`, `onChange`, ...) collegate con `fn()` cosi' compaiono nel pannello Actions
  quando l'utente interagisce, non lasciate scollegate; una `play` function con l'addon
  Interactions che scripta un'interazione realistica (click, digitazione, apertura di un overlay)
  e verifica lo stato risultante — non un gesto simbolico ("clicca una volta") ma un caso che
  documenta e allo stesso tempo prova un comportamento reale del componente. Il pianificatore
  include questo nei criteri di accettazione di ogni ticket-componente (dal ticket #6 in avanti);
  il critico verifica che non sia stato aggiunto "tanto per" (controlli che non controllano nulla,
  `play` vuota o banale).
- Test: `npm run check` = lint + tipi + build + unit test. Prima di ogni commit: `npm run check`.
  Prima di una PR pronta: anche la suite e2e completa.
- Segreti: nessuno previsto nel core (nessuna API esterna, nessun database). Se compare un
  bisogno di licensing/chiavi per il Pro, è una decisione architetturale da portare
  all'orchestratore prima di implementarla, non da inventare sul momento.
