# Motori Pro senza `@formrail/core`: studio dei confini (ticket #489)

Origine: decisione 2 di Daniele del 13/11/2026 (`design-system-spec.md` §8): i motori **Change
Summary** e **Form Rebase** devono funzionare senza `@formrail/core`, per chi usa React Hook Form
(RHF) o TanStack Form. I componenti visivi Pro restano legati al core. Distribuzione invariata:
org npm privata, nessun licensing a runtime (§2.4).

Ogni sezione numerata risponde a una delle domande del ticket. Per ciascuna riporta l'opzione
scelta, le alternative scartate e il motivo. Le tre scelte che spettavano a Daniele (Q1, Q2, Q3)
sono raccolte in "Decisioni di Daniele": le ha prese il 14/11/2026 (1a, 2a, 3a), registrate sul
ticket #489.

Versioni verificate:
- `react-hook-form` 7.92.0: righe citate da `node_modules/react-hook-form/dist/index.esm.mjs`;
- `@tanstack/react-form` / `@tanstack/form-core` 1.33.5: righe citate da
  `node_modules/@tanstack/form-core/dist/esm/FormApi.js` e `utils.js`.

Le righe del repo si riferiscono al branch `feat/489-pro-engines-without-core`.

## Stato di partenza

- I motori puri non importano niente dal core:
  - `packages/pro/src/change-summary/compute-change-summary.ts:1-2`;
  - `packages/pro/src/form-rebase/compute-rebase.ts:1-17`;
  - `packages/pro/src/internal/structural-diff.ts`;
  - `packages/pro/src/change-summary/use-change-summary.ts:1-3`, che importa solo `react`.
- L'unico legame di un motore con il core era un `import type`: in `use-form-rebase.ts:3` (su main
  45f2a59) il tipo `UseObjectPageFormReturn`, definito in
  `packages/core/src/object-page/use-object-page-form.ts:61`. A runtime l'import spariva, ma il
  `.d.ts` pubblicato referenziava `@formrail/core`.
- I componenti visivi usano il core e restano dove sono:
  - `packages/pro/src/change-summary/ChangeSummary.tsx:2` (`cn`, `Text`);
  - `packages/pro/src/form-rebase/RebaseNotice.tsx:13` (`Button`, `MessageStrip`, `cn`, `composeRefs`).
- `@formrail/core` era una peer **obbligatoria** (`packages/pro/package.json:47` su main 45f2a59): npm
  7+ la installava comunque, anche a chi usa solo RHF. Con la decisione 1a ora è opzionale.

## 1. Confine

**Scelta: (a), subpath `@formrail/pro/engine` nello stesso pacchetto.** Implementato in questa PR:
- `packages/pro/src/engine.ts`;
- `exports["./engine"]` in `packages/pro/package.json`;
- seconda entry in `packages/pro/tsup.config.ts`.

Alternativa scartata, (b): un pacchetto separato `@formrail/pro-engine` da cui `@formrail/pro`
dipende. Il risultato tecnico è lo stesso, ma cambia ciò che il cliente riceve dall'org npm (due
pacchetti, due versioni da allineare, accessi da concedere su due nomi) senza un vantaggio per chi
installa: con (a) chi usa solo RHF installa un pacchetto e importa un subpath.

**Deciso (Q1 = 1a, Daniele, 14/11/2026)**: `@formrail/core` è peer **opzionale**
(`peerDependenciesMeta` in `packages/pro/package.json`), applicato in questa PR. Chi usa solo
`@formrail/pro/engine` non lo installa: `tests/pro-engine-no-core/no-core.test.ts` fa `npm install`
offline del pacchetto impacchettato e verifica che `npm ls @formrail/core` lo dia assente. Come
controllo negativo, senza `peerDependenciesMeta` npm lo vuole. Il README Pro spiega chi deve
installarlo.

Chi importa `@formrail/pro`, l'entry principale, senza core installato riceve un errore, ma il punto
in cui arriva dipende da `skipLibCheck`:
- **`skipLibCheck: false`**: `tsc` segnala `Cannot find module '@formrail/core'` nei `.d.ts` di
  `@formrail/pro`.
- **`skipLibCheck: true`**, il default dei template Vite e Next: `tsc` **passa** e i tipi del core
  diventano `any`, quindi passa anche un argomento sbagliato. L'errore arriva solo dal bundler o al
  caricamento: `ERR_MODULE_NOT_FOUND` (`Cannot find package '@formrail/core'`) in ESM,
  `Cannot find module '@formrail/core'` in CJS.

Per non dipendere dal core si importa **solo** `@formrail/pro/engine`. La fixture copre entrambi i
casi: il consumer con `skipLibCheck: false` fallisce ai tipi; quello con `skipLibCheck: true` passa
`tsc` e fallisce al caricamento con l'errore esplicito.

Il subpath richiede `moduleResolution` `bundler`, `node16` o `nodenext`: con `node`/`node10` la mappa
`exports` è ignorata e `@formrail/pro/engine` non si risolve. È lo stesso limite di
`@formrail/core/internal`.

Garanzie verificabili del confine:
- **Sorgenti**: `packages/pro/test/engine-boundary.test.ts` percorre il grafo degli import da
  `src/engine.ts`, con l'AST di TypeScript: `import`, `import type`, `export … from`, `import()`
  anche in posizione di tipo, `require`, `/// <reference types>`. Nessun modulo raggiunto nomina
  `@formrail/core` o un suo subpath. I 9 casi negativi dimostrano che il controllo scatta su un
  import aggiunto a due moduli di distanza.
- **Build**: `packages/pro/test/dist.engine.test.ts` legge `dist/engine.{js,cjs,d.ts,d.cts}` e i
  file che raggiungono. Nessuno contiene la stringa `@formrail/core`. Ci sono casi negativi su una
  `dist` sintetica.
- **Consumer senza core**: la fixture `tests/pro-engine-no-core/` costruisce, fuori dal monorepo,
  un progetto con `react`, `react-dom`, `react-hook-form` e la `@formrail/pro` buildata, ma senza
  core. `tsc --noEmit` (con `skipLibCheck: false`) passa e l'entry si carica in ESM e in CJS. Come
  controllo negativo, nello stesso progetto l'entry principale fallisce sia ai tipi sia al
  caricamento.

Come si evita la duplicazione con l'entry principale: `src/index.ts` riesporta i motori da
`./engine`, e un plugin esbuild (`tsup.config.ts:14`) trasforma quell'import in un import esterno
di `./engine.js` / `./engine.cjs`. Così un'app che importa entrambe le entry carica i motori una
volta sola. Lo stato di modulo, cioè i warning di sviluppo una volta per path
(`structural-diff.ts:39`), non si duplica: lo verifica `dist.engine.test.ts` ("a development
warning is emitted once for both entries").

Lo split in chunk condivisi (`splitting`) è stato scartato. Spostava fuori da `dist/index.*` anche
il codice dei componenti condiviso, e il test esistente `test/dist.smoke.test.ts` ("no runtime
licensing", che legge `dist/index.*`) non avrebbe più visto quel codice.

## 2. Cosa entra nell'entry dei motori

**Scelta**:
- funzioni: `computeChangeSummary`, `useChangeSummary`, `inferSegmentLabel`, `formatChangeValue`,
  `computeRebase`, `useFormRebase`;
- tipi: tutti quelli dei motori, più il nuovo `RebaseFormBinding`.

Vedi `packages/pro/src/engine.ts`.

- `formatChangeValue` entra. È puro, restituisce una stringa e non usa token né `cn`, quindi serve
  a chi disegna il proprio riepilogo con RHF.
- `ChangeSummary` e `RebaseNotice` restano fuori (fuori scope nel ticket): usano token e `cn` del
  core.
- L'entry principale `@formrail/pro` mantiene esattamente gli stessi nomi, più il tipo
  `RebaseFormBinding`. Lo verifica `packages/pro/test/public-api.test.tsx`, con l'elenco fissato
  di main 45f2a59 e un `import type` di tutti i tipi.

## 3. `useFormRebase` generico

**Scelta: un contratto strutturale minimo**, `RebaseFormBinding<Values>`
(`packages/pro/src/form-rebase/types.ts:156`). Campi: `baseline`, `values`, `isSaving`,
`saveError`, `reset`, `setValues`.

Il contratto documentato:
- `baseline` e `values` sono istantanee: un oggetto nuovo quando il contenuto cambia, mai mutate
  sul posto;
- `reset(b)` rende `baseline === values === b`;
- `setValues` subito dopo `reset` nello stesso batch si applica sopra il reset.

`UseObjectPageFormReturn` è assegnabile al contratto senza cast.

- L'entry dei motori esporta `useFormRebase(form: RebaseFormBinding<Values>)`
  (`use-form-rebase.ts:185`).
- L'entry principale esporta un wrapper con la firma **identica a prima**,
  `useFormRebase(form: UseObjectPageFormReturn<Values>)` (`use-form-rebase-core.ts:48`).

Alternativa scartata: allargare la firma dell'entry principale. Sarebbe compatibile per chi
chiama, ma il test esistente `packages/pro/test/scaffold.test.ts:103` fissa il tipo esatto con
`toEqualTypeOf`, e il ticket chiede che i test esistenti restino invariati. Inoltre cambierebbe la
forma pubblica di un'API esistente, decisione che non spetta allo sviluppatore. Il TSDoc delle due
firme è lo stesso testo, tenuto allineato da un test.

Due vincoli del contratto vengono dal codice del hook e sono il motivo per cui un adattatore non è
banale:
- **Riconoscimento del proprio reset per identità**: `ownBaselineRef` (`use-form-rebase.ts:204`) e
  `byOwnReset = own.baseline === form.baseline` (`:229`). Se la libreria clona la baseline passata
  a `reset`, il binding deve esporre l'oggetto passato, non il clone, altrimenti il hook scambia il
  proprio reset per una reidratazione e azzera i conflitti.
- **Rilevamento di "scartato"**: `form.values === form.baseline` (`:231`). Dopo un `reset()` il
  binding deve restituire come `values` lo stesso oggetto della baseline.
- In più, `useChangeSummary` memoizza per identità di `values`/`baseline`
  (`use-change-summary.ts:37-40`): un oggetto mutato sul posto produrrebbe un riepilogo stantio.

## 4. Adattatori vs guida

**Deciso (Q2 = 2a, Daniele, 14/11/2026)**: adattatori, implementati nei ticket figli A3 (RHF) e
A4 (TanStack), non in questa PR. Forma prevista: adattatori
`useReactHookFormBinding(form)` / `useTanStackFormBinding(form)` in subpath dedicati
(`@formrail/pro/react-hook-form`, `@formrail/pro/tanstack-form`). Le due librerie entrerebbero
come peer **opzionali**, usate solo per i tipi: gli adattatori chiamano solo i metodi dell'oggetto
form, senza import a runtime dalla libreria.

Motivo: le sezioni 5 e 6 mostrano che il binding corretto richiede tre cose:
- tenere l'identità della baseline, perché RHF la clona;
- produrre istantanee nuove da valori mutati sul posto;
- applicare il rebase senza eco.

È proprio la parte difficile che il Pro vende (§3: "dirty-tracking robusto con idratazione
asincrona"). Lasciarla a una ricetta copiata nel codice del cliente la rende fragile e non
aggiornabile.

Alternativa scartata (2b): solo una guida con ricetta copiabile (file example con story). Non
servono peer, ma la correttezza ricade sul cliente.

In entrambi i casi `react-hook-form` e `@tanstack/react-form` sono già `devDependencies` di
`packages/pro`, per esempi e test. `scripts/pro-package.test.mjs` verifica che non compaiano mai
in `dependencies` e che, se diventano peer, siano opzionali.

## 5. Baseline

**React Hook Form 7.92**:
- `defaultValues` è **clonato** all'avvio: `cloneObject` (`index.esm.mjs:57`) applicato in
  `:2140-2142`. Anche `reset(values)` lo clona (`_reset`, `:3623-3632`). Quindi
  `formState.defaultValues` non è mai l'oggetto passato, e il binding deve tenere un proprio
  riferimento alla baseline ricevuta.
- I valori correnti `_formValues` sono **mutati sul posto** a ogni modifica.
  - `getValues()` restituisce una copia **superficiale**, `{ ..._formValues }` (`:3170-3173`): gli
    oggetti annidati sono condivisi e mutati dopo.
  - `subscribe`/`watch(callback)` ricevono a volte `values` clonati (`:3003`, `:3347`), a volte la
    copia superficiale (`:3276`).
  - Il binding deve quindi costruire istantanee profonde (o per path), altrimenti
    `useChangeSummary` resta stantio e `useFormRebase` confronta storie già mutate.
- La prop `values` di `useForm` e `reset` asincrono sono i due modi di idratare dopo il mount.
  Entrambi passano da `_reset`.

**TanStack Form 1.33.5**:
- `reset(values)` **non clona**: `options.defaultValues = values` e `state.values = values`
  (`FormApi.js:127-137`).
- `setFieldValue` usa `setBy` (`utils.js:16-41`): aggiornamenti immutabili con condivisione
  strutturale, quindi l'identità cambia solo sul percorso modificato.
- `update({ defaultValues })` riallinea i valori **solo se il form non è touched**
  (`FormApi.js:94`). Non è adatto al rebase: va usato `reset`.

## 6. Applicare il rebase senza falsi dirty

Requisiti, dagli stessi test di `useObjectPageForm`:
- dopo il rebase il form è dirty solo per le modifiche dell'utente rispetto a `incoming`;
- nessun render intermedio con `values === incoming`;
- nessuna eco trattata come gesto dell'utente.

Il hook chiama `form.reset(incoming)` e poi `form.setValues(merged)` in un unico
`unstable_batchedUpdates` (`use-form-rebase.ts:254-257`).

- **RHF**: dentro il binding, `reset(incoming)` seguito da
  `reset(merged, { keepDefaultValues: true })` (`index.esm.mjs:3680`, ramo `keepDefaultValues`).
  - Il secondo `reset` ricalcola `dirtyFields` contro `_defaultValues`, cioè `incoming`, e quindi
    marca dirty solo i campi dell'utente (`:3730-3745`).
  - Evitare `setValue` per path con `shouldDirty`: genera un evento per campo e passa per la
    validazione.
  - Lo stato `isDirty` di RHF va comunque letto con la cautela della sezione 7.
- **TanStack**: `reset(incoming)` seguito da `setFieldValue` per ogni chiave di primo livello
  cambiata, dentro `batch` della store. In alternativa `reset(merged, { keepDefaultValues: true })`
  dopo aver impostato `options.defaultValues = incoming`. Da verificare con un contatore dei render
  nel ticket figlio.
- **Durante un salvataggio**: il hook mette il rebase in coda finché `isSaving`.
  - RHF espone `formState.isSubmitting`, che per esempio il binding può mappare su `isSaving`, e
    TanStack `state.isSubmitting` (`FormApi.js:519-521`).
  - `saveError` va mappato a `null` su un submit riuscito, per esempio `isSubmitSuccessful` in RHF.
    Altrimenti il hook non chiude i conflitti dopo il salvataggio.

## 7. Semantica di "dirty"

I motori usano le regole Livello 1 (§1.13.1): `''`, `null`, `undefined` e chiave mancante sono
quattro valori distinti, senza modificarle. Le librerie calcolano `isDirty` con regole proprie.
Divergenze note:
- **RHF** confronta con un proprio `deepEqual` e con `dirtyFields` aggiornato per campo
  registrato.
  - Un campo non registrato o smontato con `shouldUnregister` sparisce dai valori: per i motori è
    "chiave mancante", diverso da `undefined`.
  - Un input HTML restituisce sempre stringhe: un campo numerico idratato con `10` e riscritto
    dall'utente come `"10"` è dirty per i motori (tipi diversi) e, secondo come è registrato,
    pulito o sporco per RHF.
- **TanStack** usa `isDefaultValue` per campo e `isDirty` "persistente" (resta vero dopo un
  ritorno al valore originale, a differenza di `isDefaultValue`).
- **Cosa vede l'utente quando divergono**: un form "dirty" per la libreria con il riepilogo vuoto,
  o viceversa. La regola per la UI: il footer e il dirty-guard si basano su
  `useChangeSummary().isEmpty`, non sull'`isDirty` della libreria. Così il riepilogo e il pulsante
  "Salva" non si contraddicono mai. Va documentato nella guida degli adattatori.
- **Chiavi interne della libreria**: `useFieldArray` di RHF aggiunge un `id` solo alla lista
  `fields` restituita al render, non ai valori (`getValues`/`watch`). Quindi non compare nel
  riepilogo e non rompe `arrayIdKeys`, purché il binding legga i valori e non `fields`. Da coprire
  con un test nel ticket figlio.

## Casi limite del ticket: stato

| Caso | Stato |
|---|---|
| Valori mutati sul posto | Vincolo del contratto (§3); per RHF richiede istantanee nel binding (§5); test nel ticket figlio A3 |
| Baseline clonata dalla libreria | Vincolo del contratto (§3: il binding espone l'oggetto passato a `reset`); test in A3 |
| `incoming` durante il salvataggio | Coda del hook invariata; mappatura `isSubmitting` → `isSaving` (§6); test in A3/A4 |
| `useFieldArray` e `id` interni | §7; test in A3 |
| Chiave di primo livello rimossa dal server | Il hook passa da `reset(baseline)` + `setValues` (`use-form-rebase.ts:322-328`); con RHF `reset` rimuove la chiave, con TanStack anche; test in A3/A4 |
| Campo non registrato / `shouldUnregister` | §7 (chiave mancante ≠ `undefined`); test in A3 |
| Doppio import delle due entry | Fatto: un'unica copia dei motori, verificata in `dist.engine.test.ts` |
| SSR | Fatto: `renderToString` in ambiente node in `dist.engine.test.ts`; l'unico accesso a `window` è il `typeof` di `use-isomorphic-layout-effect.ts:4` |

## Ticket figli proposti

Deciso con Q3 = 3a (Daniele, 14/11/2026); i ticket figli A3 e A4 li crea il pianificatore:
- **A1 + A2 (questa PR)**: entry dei motori, guard sorgenti e dist, budget del subpath
  (`packages/pro/bundle-budget.engine.json`, `scripts/bundle-budget.mjs`), contratto
  `RebaseFormBinding`, fixture senza core, `@formrail/core` peer opzionale.
- **A3, integrazione RHF (#507).** Dipende da A1+A2.
  - Adattatore `useReactHookFormBinding` in `@formrail/pro/react-hook-form` (RHF peer opzionale,
    solo tipi) e story `Pro/Integrations/React Hook Form`, con `argTypes`, `fn()` e
    `play`.
  - E2e e baseline visive desktop/tablet/mobile.
  - Unit test con contatore dei render: due campi modificati danno due entry, il ritorno al valore
    originale toglie l'entry, l'aggiornamento del server su un altro campo, conflitto con
    `keepMine`/`acceptTheirs`, baseline asincrona senza eco.
  - I casi limite della tabella marcati A3.
- **A4, integrazione TanStack Form (#508).** Dipende da A3 (stesso schema): gli stessi criteri.

## Decisioni di Daniele

Prese il 14/11/2026 sulle opzioni proposte dallo studio, registrate sul ticket #489.

- **Q1, `@formrail/core` peer opzionale: deciso 1a.**
  - **1a (scelta)**: `peerDependenciesMeta: { "@formrail/core": { optional: true } }`. Un solo
    pacchetto, distribuzione invariata. Chi importa l'entry principale senza core riceve un errore:
    da `tsc` solo con `skipLibCheck: false`, altrimenti dal bundler o al caricamento (§1). La
    fixture verifica entrambi i casi.
    Applicata in questa PR.
  - **1b (scartata)**: pacchetto separato `@formrail/pro-engine` (§1, alternativa (b)).
- **Q2, integrazione con le librerie di form: deciso 2a.**
  - **2a (scelta)**: adattatori in subpath dedicati, con RHF e TanStack come peer opzionali
    usate solo per i tipi (§4). Implementazione nei ticket figli A3 e A4.
  - **2b (scartata)**: solo una ricetta copiabile, senza nuove peer.
- **Q3, divisione del lavoro: deciso 3a.**
  - **3a (scelta)**: questa PR porta studio + A1 + A2 + peer opzionale; A3 e A4 diventano
    ticket figli, creati dal pianificatore.
  - **3b (scartata)**: tutto in un'unica PR.
