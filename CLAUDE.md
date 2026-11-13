# Formrail — istruzioni per Claude Code

Formrail (fino all'11/11/2026 `react-object-page`: repo GitHub, npm `@react-object-page/core`,
Storybook; rebrand nel ticket #428) è un design system React **open-core**: implementazione headless e
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
  solo con ticket espliciti (roadmap MVP, §6). **Piano commerciale (decisioni di Daniele del
  2026-11-13, sostituiscono "abbonamento ricorrente"; non rinegoziabili senza nuova istruzione
  sua, dettaglio in `docs/planning/design-system-spec.md` §8)**: target team aziendali (ERP,
  gestionali, portali amministrativi); licenza annuale per sviluppatore con 12 mesi di
  aggiornamenti inclusi, venduta tramite un Merchant of Record (es. Lemon Squeezy) che gestisce
  IVA UE e fatturazione. Prima di spingere sulle vendite: landing page con lista
  d'attesa/pre-ordine (validazione della domanda), ticket #490. Ticket di studio/refactoring #489
  per rendere i motori Pro (Change Summary, Form Rebase) disaccoppiabili da `@formrail/core`, per chi
  usa React Hook Form o TanStack Form. La distribuzione resta come da §2.4 della spec (org npm
  privata, nessun licensing a runtime): non è toccata dalle decisioni.
- Il documento di pianificazione completo (inventario componenti, insidie tecniche di classe
  generale, segmentazione Free/Pro, MVP) è in `docs/planning/design-system-spec.md`. **Il
  pianificatore lo legge sempre prima di creare ticket.**

## Ruolo della sessione principale: coordinare il team del progetto

Daniele parla direttamente con la sessione aperta in questa cartella (decisione del 2026-11-12:
per Formrail l'orchestratore di `~/projects` non si usa più). Chi lavora in questa cartella
(sessione interattiva o headless) coordina il team in `.claude/agents/`. Per ogni richiesta segui
la pipeline, senza saltare passaggi:

1. **pianificatore** → crea i ticket GitHub (o restituisce domande: girale a Daniele e
   aspetta).
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
      e riparti dal punto 2 (CI). **Limite (decisione di Daniele del 2026-11-12)**: dopo
      **2 respinte del critico-avversariale**, oppure dopo **2 respinte del tester**, sullo stesso
      ticket, fermati e chiedi a Daniele; si riprende solo su sua istruzione. Come si conta:
      - i due conteggi sono separati (2 del critico, 2 del tester) e non si sommano;
      - si contano le respinte, non i ritorni allo sviluppatore: è un metro oggettivo;
      - una CI rossa non è una respinta: torna allo sviluppatore senza entrare nel conteggio;
      - il conteggio è per ticket, non per PR: chiudere una PR e aprirne un'altra sullo stesso
        ticket non lo azzera;
      - conta anche la respinta di un giro ristretto ai soli punti segnalati nel giro precedente,
        e anche se il problema trovato è nuovo.
   6. Quando CI verde, tester = QA SUPERATO e critico = APPROVATO: `gh pr ready <N>` e riepilogo
      (cosa cambia, test aggiunti, note del critico).
3. **Merge**: lo fa la sessione principale di questo progetto, in autonomia (delega di Daniele del
   2026-11-12, sostituisce "li fa l'orchestratore di `~/projects`"), solo se: CI verde, tester =
   QA SUPERATO, critico = APPROVATO, nessuna domanda aperta per Daniele. Merge commit (non
   squash); PR impilate in ordine, con la base della successiva riportata su `main`. Gli agenti
   (`.claude/agents/`) e le sessioni headless delegate non uniscono mai. Niente push diretti su
   `main` né push forzati.
4. **Versione e pubblicazione npm**: il bump di versione di una PR che tocca `package.json` lo
   decide la sessione che coordina la pipeline (decisione di Daniele del 2026-11-12), mai uno
   degli agenti di `.claude/agents/`. La pubblicazione non rientra nella delega del merge:
   niente `npm publish` senza un'istruzione esplicita di Daniele.

### Comandi `gh`

`gh` è nel `PATH`: chiamalo come `gh ...`, all'inizio del comando e da solo (niente prefisso
`PATH=...`, niente `cd ... && gh`). Altrimenti il comando non corrisponde al permesso
`Bash(gh *)` di `.claude/settings.json` e resta bloccato in attesa di un'approvazione.

Se `gh issue create`/`gh pr create` risultano bloccati in una sessione headless (classificatore
auto-mode di "self-approval", non un problema di sintassi o di permessi): scrivi il contenuto in
un file locale (es. `.tickets-draft/<nome>.md`, già in `.gitignore`) e restituiscilo alla
sessione principale, che lo pubblica lei con `gh issue create --body-file`.

### Modello per carico intellettuale del task (Piano Max dal 01/11/2026)

Niente più vincolo stretto di quota: col piano Max non si sceglie il modello per risparmiare
token, ma per il carico intellettuale del singolo task (istruzione di Daniele del 01/11/2026,
generalizzata a tutti i progetti in `~/projects/CLAUDE.md`, "Come delegare"). `sonnet` e `opus`
restano punti di partenza per ruolo (sviluppatore/tester `sonnet`, pianificatore/critico `opus`),
ma sono priorità non regole rigide:

- **Alza a opus** quando il task tocca gestione del focus/accessibilità, logica di stato non
  banale, ambiguità reale, o un red team serio — anche per lo sviluppatore o il tester se il
  ticket lo richiede.
- **Scendi a sonnet** quando il task è meccanico, ben specificato, basso rischio (rifinitura
  visiva, una story, un fix isolato già diagnosticato) — il pattern già in uso per il critico
  ("critico: sonnet, basso rischio", motivato nel ticket) si applica così a qualunque agente.
- Sessioni headless (`claude -p`): `--model sonnet` di default (l'orchestrazione/rebase/CI-watch
  è meccanica), ma valuta `opus` se il ticket stesso è ad alto rischio.
- Documenta la scelta non ovvia nel prompt di lancio o sul ticket (una riga: modello e motivo).
- Lavoro in parallelo (più worktree, più ticket indipendenti) ok di default — resta il vincolo
  reale dell'hardware (CPU/Chromium in parallelo), non più la quota: vedi `~/projects/CLAUDE.md`.

**Priorità e ritmo (decisione di Daniele del 2026-11-04, sostituisce "ritmo lento/non
prioritario")**: Formrail è ora **prioritario**, non più un progetto a ritmo lento in
parallelo sul SaaS di approvazione fatture/Fatture in Cloud. Procedere ticket per ticket senza fermarsi ad ogni singolo
step salvo una vera decisione da chiedere a Daniele (vedi anche la nota sulla pipeline ad
oltranza nella memoria dell'orchestratore di `~/projects`, scritta quando il coordinamento era
suo).

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
  a Daniele (tramite la sessione principale) prima di implementarla, non da inventare sul momento.
