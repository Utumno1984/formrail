# Validazione uniforme (Zod) su form, campi e footer — ricognizione e piano

> Documento di pianificazione. Nessuna implementazione. Stato: **decisioni di Daniele ricevute e
> registrate in §5**; i ticket sono stati pubblicati su GitHub (numeri in §6).
> Data ricognizione: 2026-11-01, su `main` @ `68ddd39`. Tutto ciò che è scritto in §1 è stato letto nel
> codice (`packages/core/src`), non ricordato a memoria; dove un'affermazione è un'inferenza dalla
> lettura del codice e non una prova eseguita, è detto.

## 0. Obiettivo e vincolo di metodo

Introdurre la validazione a runtime con Zod su form e footer dell'Object Page (spec
`design-system-spec.md` §1.5: "schema di validazione runtime condiviso tra form e chiamata API, fallisce
rumorosamente su un campo mancante"). **Vincolo di Daniele, regola generale del progetto**: la
soluzione è uniforme su *tutti* i punti che oggi gestiscono errori/stato di validazione, non un
meccanismo aggiunto solo al footer. Quindi il piano ha due metà inseparabili: (a) allineare ciò che è
già frammentato, (b) innestare Zod sul modello allineato — non sopra quello frammentato.

Punti ricognizione: `Field`, `useFieldControl`/`FieldContext`, `FieldMessage`, `Input`, `Select`,
`Combobox`, `useObjectPageForm`, `useFocusFirstInvalidField`, `useDirtyGuard`, più `ObjectPageFooter`
e le story che oggi fanno da "documentazione" del flusso.

Stato del pacchetto: `@react-object-page/core` è `0.0.0`, mai pubblicato: un cambio di API pubblica
oggi non è un breaking change verso utenti reali, ma resta una scelta di API che spetta a Daniele.

---

## 1. Ricognizione: com'è oggi (e dove è già frammentato)

### 1.1 Modello attuale in una pagina

| Pezzo | Cosa produce/consuma | Tipo dell'errore |
|---|---|---|
| `useObjectPageForm` | `validate?: (values) => Partial<Record<keyof Values, string>>`; `fieldErrors` (stesso tipo); `saveError: unknown` | `string` per chiave **top-level** |
| `Field` | prop `error?: ReactNode`; se non vuoto → `aria-invalid` sul controllo + `FieldMessage tone="error"` + id in `aria-describedby` | `ReactNode` |
| `FieldContext`/`useFieldControl` | `FieldControlProps`: `id`, `aria-labelledby`, `aria-describedby`, `aria-invalid`, `aria-required`, `disabled`, `readOnly`, `aria-readonly`; `state`/`interactionBlocked` non enumerabili | — |
| `Input`/`Select`/`Combobox` | leggono `FieldContext` e applicano gli attributi sopra | — |
| `useFocusFirstInvalidField` | `fieldErrors: Partial<Record<string,string>>`; trova i controlli con `[name="<chiave>"]` nel contenitore | chiavi stringa |
| `ObjectPageFooter` | `message?: ReactNode` + `messageTone`; `role="status"` `aria-live="polite"` sempre montato | `ReactNode` |
| `useDirtyGuard` | `when: boolean` | — |

**Nessun pezzo di codice collega il form al `Field`**: il consumatore scrive a mano
`<Field error={form.fieldErrors.x}>` e `<Input name="x">` per ogni campo (lo si vede nella story
`ObjectPageFooter` e nella fixture `UseObjectPageFormFixture`).

### 1.2 Frammentazioni e incoerenze trovate (già presenti, prima di Zod)

**F1 — Due "lingue" per lo stesso errore: `string` nel form, `ReactNode` nel Field.**
`fieldErrors` è `Partial<Record<keyof Values, string>>` (`use-object-page-form.ts`), `Field.error` è
`ReactNode` (`Field.tsx`). Funziona perché una `string` è un `ReactNode`, ma non esiste un tipo
condiviso "errore di campo" né un posto dove stia più di un messaggio o un codice stabile (utile per
i18n e per i test). Zod produce `issues[]` con `code`, `path`, `message`: oggi non c'è dove metterli.

**F2 — Il legame form→campo passa solo per un attributo DOM `name` che il `Field` non conosce.**
`useFocusFirstInvalidField` cerca `[name]`. `Field` non ha prop `name` e non la propaga al controllo
(`FieldControlProps` non la contiene): spetta al consumatore ricordarsi `name` su ogni controllo *e*
la stessa chiave su `error=`. Due chiavi indipendenti da tenere allineate a mano.

**F3 — `Select` non può essere raggiunto da `useFocusFirstInvalidField` (difetto reale, per lettura
del codice).** `SelectProps` esclude `name` (`Omit<..., 'name' | 'form' ...>`, scelta voluta per
non far passare l'eco del `<select>` nativo di Radix). Il trigger è un `<button>` senza `name`, quindi
un errore su un campo `Select` non trova nessun elemento: nessun focus, e in dev un `console.error`.
`Combobox` invece accetta `name` (estende `InputHTMLAttributes`); `Input` pure. Tre controlli, due
comportamenti. Non verificato con un test eseguito: da riprodurre nel primo ticket che lo tocca.

**F4 — Il cablaggio `FieldContext` è copiato tre volte.** `Input.tsx`, `Select.tsx`, `Combobox.tsx`
ripetono lo stesso blocco (merge di `aria-describedby`, `control?.x ?? rest.x` per `id`,
`aria-labelledby`, `aria-invalid`, `aria-required`, `aria-readonly`, `disabled`, `readOnly`). Ogni
nuova proprietà di validazione (es. `name`, `aria-errormessage`, `data-*`) andrebbe aggiunta in tre
punti: è il modo in cui le incoerenze nascono. Le classi di stile invalido sono pure triplicate
(`aria-invalid:border-rop-error` in `Input.tsx`, `Select.tsx`, `internal/combobox-styles.ts`).

**F5 — Doppio produttore di `aria-invalid`.** Dentro un `Field` lo produce il `Field` (solo `true` o
assente); fuori, o in una story, lo scrive il consumatore. La fixture `UseObjectPageFormFixture`
usa `<input aria-invalid={k in form.fieldErrors}>` + `aria-describedby` scritto a mano: `k in` conta
anche una chiave con valore `undefined`, mentre il form e l'hook trattano `undefined` come "nessun
errore" (`invalidKeys`/filtro in `save`). Tre punti che definiscono "è invalido" con tre regole
leggermente diverse (`hasContent(error)` nel Field, `!== undefined` nel form e nell'hook, `k in` nella
fixture).

**F6 — Due percorsi paralleli al medesimo stato di errore.** Lo story `ObjectPageFooter` ("Fornitore
obbligatorio") tiene un proprio `useState` `fieldErrors` e un proprio controllo, ignorando
`useObjectPageForm({ validate })`/`form.fieldErrors` introdotti dopo (#77/#81). Le story sono la
documentazione de facto: mostrano due modi diversi di fare la stessa cosa.

**F7 — Semantica di annuncio diversa per "errore", tre volte.** Errore di campo: `FieldMessage` non è
live (annunciato tramite `aria-describedby` + `aria-invalid` quando il fuoco arriva sul campo).
`MessageStrip` `tone="error"`: `role="alert"`. `ObjectPageFooter` con `messageTone="error"`:
`role="status"` + `aria-live="polite"`. Non è per forza sbagliato (sono livelli diversi: campo,
pagina, azione), ma non è scritto da nessuna parte *quale livello usa quale*, e Zod aggiunge un
quarto caso ("validazione fallita, N campi invalidi") senza una regola di dove annunciarlo.

**F8 — `validate` che lancia finisce in `saveError`, cioè nel footer, mischiando due categorie.**
Contratto documentato (`use-object-page-form.ts`): se `validate` lancia, `saveError` è impostato.
Con Zod il caso naturale è `schema.parse(values)`, che lancia una `ZodError` il cui `message` è un
JSON di issues: finirebbe come testo nel footer invece che come errori di campo. Il contratto attuale
spinge verso l'uso sbagliato (parse invece di safeParse).

**F9 — `fieldErrors` solo a chiavi top-level; Zod produce percorsi.** `setValue`/`setValues` sono
top-level (`keyof Values`), `fieldErrors` idem, l'hook cerca `[name="a"]`. Una issue Zod ha
`path: ['address','city']` o `['lines', 0, 'qty']`. Manca una convenzione di serializzazione del
percorso, condivisa da form, `Field`/`name` e hook.

**F10 — Pulizia degli errori "tutto o niente".** Qualsiasi `setValue`/`setValues`/`reset` azzera *tutti*
i `fieldErrors` (documentato, "per-field clearing is not supported", e coperto da una story-test
"Typing after a failure clears every field error at once"). Scrivere in un campo fa sparire
`aria-invalid` e il messaggio di tutti gli altri campi ancora invalidi. Con la validazione guidata da
schema (dove un errore dipende da più campi) il comportamento tutto-o-niente diventa più visibile.

**F11 — Stato invalido sui campi bloccati/disabilitati non definito.** Un `Field` `forced`/`locked`
con errore mostra messaggio e `aria-invalid`, ma l'hook salta i controlli non focalizzabili
(`disabled`, inert) e, se sono gli unici invalidi, non fa nulla (solo `console.error` in dev). Nessuna
regola dice se un valore forzato/bloccato va validato.

**F12 — Testi di default italiani sparsi con meccanismi diversi.** `DirtyGuardLabels` (oggetto
`labels`), `ObjectPageFooter` (`toneLabel`, `label` come prop piatte), `Select` (`emptyLabel`,
`unknownValueLabel`). I messaggi Zod sono in inglese di default. Non esiste una politica: il
consumatore passa i testi, la libreria non traduce errori di validazione (da dichiarare, non da
costruire).

**F13 — Piccola duplicazione tecnica:** `isDev()` è definito identico in
`use-object-page-form.ts`, `use-focus-first-invalid-field.ts` e `object-page/ObjectPageContext.ts`.

**`useDirtyGuard`: nessuna frammentazione di errori trovata.** Dipende solo da `when: boolean` e non
legge né `fieldErrors` né validità. Dirty e invalido sono ortogonali *per costruzione* (un form invalido
è tipicamente sporco; `save` fallito per validazione non pulisce né sporca). Non serve cambiarlo; serve
**fissare con un test e2e** che una validazione fallita non cambia `isDirty`, non rimuove il
`beforeunload` e non apre il dialog del guard (vedi T9). L'unico punto di contatto con F12 è il
meccanismo `labels`.

### 1.3 Cosa è già buono e va conservato (non rifare)

- `FieldMessage`: un solo componente per help/errore, geometria identica (`tone`), niente live region,
  id referenziato solo se il messaggio esiste.
- Regola "una chiave `undefined` = nessun errore" nel form e nell'hook.
- Identità nuova di `fieldErrors` a ogni `save` fallito (l'hook rifocalizza anche con errori uguali).
- `Field` come unico posto che calcola `aria-describedby` (reason → error → help) e il contratto
  `interactionBlocked`.
- Validazione sincrona prima di ogni lavoro async: `isSaving` non viene toccato su fallimento.

---

## 2. Disegno unificato proposto

Principio: **un solo modello di "errore di campo", un solo produttore di stato invalido (il `Field`),
un solo modo di collegare form e campo, un solo cablaggio dei controlli; Zod è un adattatore che
produce quel modello, non un percorso parallelo.**

### 2.1 Modello dati condiviso

- Un tipo pubblico `FieldErrors` = mappa `percorso → messaggio (string)`; il percorso è una stringa
  con notazione a punti (`supplier`, `address.city`, `lines.0.qty`). Valore `undefined` = nessun
  errore (regola già in vigore, ora in un solo helper interno `invalidPaths()` usato da form, hook e
  `Field`/fixture — chiude F5).
- Per ogni percorso vale il **primo** messaggio di Zod (issue meno specifica ignorata in v1).
  Estendibile in futuro a `{ message, code }` senza rompere (`string` resta valido) — non in v1.
- `Field.error` resta `ReactNode` (può avere markup); il form produce `string`. Il legame è una prop
  del Field, non una conversione manuale (§2.3). Chiude F1 senza forzare un tipo unico.

### 2.2 Cablaggio dei controlli (chiude F2, F3, F4, F5)

- Hook interno unico `useFieldControlProps(rest)` (non esportato) che restituisce gli attributi finali
  da spargere sul controllo: merge di `aria-describedby`, precedenza del Field, `id`, `aria-*`,
  `disabled`, `readOnly`, **`data-rop-name`**. `Input`, `Select`, `Combobox` lo usano; nessun
  `control?.x ?? rest.x` rimane nei tre file.
- Stile di invalido in un solo token/costante condivisa (oggi tripla).
- `Field` guadagna `name?: string`: lo mette nei `FieldControlProps` come attributo `data-rop-name`
  (non `name`, che per `Select` è escluso di proposito — F3) e anche come `name` nativo per i controlli
  nativi dove è sicuro (`Input`, `Combobox`).
- `useFocusFirstInvalidField` cerca prima `[data-rop-name]`, poi ricade su `[name]` (compatibilità: i
  consumatori che usano controlli propri con `name` continuano a funzionare, e il comportamento
  documentato oggi non cambia).

### 2.3 Collegamento form → campo (§5 Q2)

**Deciso (Q2):** esplicito più contesto opzionale.
1. Base: `<Field name="supplier" error={form.fieldErrors.supplier}>` — esplicito, headless, nessuna magia.
2. In più, un contesto sottile `ValidationProvider fieldErrors={form.fieldErrors}` (o equivalente):
   un `Field` con `name` legge da lì l'errore se `error` non è passato; `error` esplicito vince.
   Elimina il doppio nome (F2) e le story divergenti (F6) senza imporre un provider a chi non lo vuole.

### 2.4 Zod (§5 Q1, Q3)

- Il core oggi "non dipende da nessuna libreria di schemi" (docstring di `validate`) e il bundle ha un
  budget per-import: Zod **non** deve entrare nel bundle di chi non lo usa.
- **Deciso (Q1):** opzione `schema` su `useObjectPageForm`, tipizzata sull'interfaccia **Standard
  Schema** (`~standard.validate`), che Zod (≥ 3.24 / 4) implementa, più Valibot/ArkType, senza che il
  core importi `zod`. Nessun adattatore `zodValidator` e nessun peer opzionale (scartati da Daniele).
- Tradotto in errori: issue → percorso a punti → primo messaggio → stesso `fieldErrors` (nessun
  percorso parallelo). Un fallimento di schema **non** lancia: chiude F8. `validate` manuale resta
  supportato (stesso output), e `schema` + `validate` insieme: `schema` prima, `validate` per le regole
  cross-field aggiuntive (da confermare, Q5).
- Parsing: `save` passa al handler i valori *grezzi* come oggi, oppure l'output parsato dello schema
  (trasformazioni/coerce)? Raccomandazione: i valori grezzi in v1 (nessun cambio di tipo `Values`),
  output parsato come opzione futura — Q4.
- Sincrono in v1: uno schema con `refine` async deve dare errore chiaro in dev. Mantiene la proprietà
  "isSaving mai toccato su fallimento di validazione".

### 2.5 Footer e annunci (chiude F7)

Regola scritta una volta (nella doc del form e di `ObjectPageFooter`):

| Livello | Dove | Annuncio |
|---|---|---|
| Campo | `FieldMessage` + `aria-invalid` + `aria-describedby` | non live; dopo un save fallito il fuoco va al primo campo invalido (`useFocusFirstInvalidField`), quindi lo screen reader lo legge lì |
| Riepilogo form | `ObjectPageFooter message` (tono `error`) | `role="status"` polite, una riga: "N campi non validi" (**solo il conteggio**, mai i messaggi per-campo, in linea con la doc attuale del footer) |
| Errore di salvataggio (rete/server) | `ObjectPageFooter` `saveError` | idem, testo dell'errore |
| Errore di pagina bloccante | `MessageStrip` | `alert` |

Un helper (es. `formatFieldErrorsSummary`/`useObjectPageForm().summary`) fornisce la stringa del
riepilogo, con testo sostituibile dal consumatore (nessuna traduzione nel core — chiude F12 per la
parte validazione). Il footer **resta presentazionale** (non legge il form): riceve `message`.

### 2.6 Pulizia errori (§5 Q6, chiude F10)

Raccomandazione: `setValue(name)` cancella solo l'errore del percorso toccato (e dei suoi
discendenti/antenati); `reset` e `save` riuscito azzerano tutto; un nuovo `save` ricalcola tutto.
*Implementato in #102 (ticket prevale sul piano):* solo il percorso e i **discendenti**, mai gli antenati
(un errore su `address` resta finché non si scrive `address` o si ripete il `save`). Questo
**cambia un comportamento documentato e una story-test esistente** ("clears every field error at
once"): per la regola di regressione del progetto (nessun test indebolito) va approvato da Daniele e
spiegato nella PR, non fatto di nascosto.

### 2.7 Campi bloccati (chiude F11, non bloccante)

Raccomandazione: un campo `forced`/`locked`/`disabled` **è validato come gli altri** (la regola di
business che ha forzato il valore può produrre un valore invalido); il messaggio resta visibile sul
Field; l'hook, se tutti gli invalidi sono non focalizzabili, non fa nulla (come oggi) ma il riepilogo nel
footer ne dà comunque il conteggio. Documentato e coperto da test; nessuna decisione API.

### 2.8 `useDirtyGuard`

Nessuna modifica di API. Test e2e di non-interferenza (T9) e un esempio nella doc del form che unisce
`useObjectPageForm` + `useDirtyGuard` + validazione.

---

## 3. Impatto API pubblica (riepilogo)

Aggiunte: `Field.name`; tipo `FieldErrors`; `useObjectPageForm({ schema })`; opzionale
`ValidationProvider`; helper riepilogo. Modifiche compatibili: lookup hook con fallback `[name]`.
Possibile cambio di comportamento: pulizia per-campo (Q6). Possibile cambio di tipo:
`fieldErrors` da `Partial<Record<keyof Values,string>>` a `FieldErrors` a percorsi (Q2/Q-percorsi: per i
valori piatti i tipi restano compatibili, l'autocompletamento delle chiavi si perde su percorsi annidati).

## 4. Rischi

- **Bundle budget** (governance): ogni nuovo export va misurato; niente import di `zod` nel core.
- **Regressione visiva**: lo stato invalido deve apparire identico su Input/Select/Combobox (oggi la
  coerenza dipende da tre copie di classi); la matrice visiva va estesa (ticket #4 la copre per i
  viewport).
- **Tastiera virtuale** (`useKeyboardSafe` nel Field): il focus programmatico dell'hook su un campo
  invalido deve rispettare lo stesso margine di scroll; da verificare nell'e2e mobile.
- **Test esistenti** da non indebolire: `Field.test`, `use-object-page-form.validate.test`,
  `use-focus-first-invalid-field.test`, e2e `field.spec` e `use-focus-first-invalid-field.spec`.

## 5. Decisioni di Daniele (ex domande aperte)

Tutte confermate il 2026-11-01. Dove non c'era una risposta esplicita ("procedi con la tua
raccomandazione") vale la raccomandazione del documento precedente.

| # | Decisione | Risposta | Origine |
|---|---|---|---|
| Q1 | Come entra Zod | **Interfaccia Standard Schema** nel core (solo tipi strutturali, nessun import di `zod`). **Non** dipendenza diretta, **non** peer opzionale + adattatore: l'adattatore `zodValidator` previsto come comodità nella versione precedente di questo piano è quindi **scartato** | esplicita |
| Q2 | Legame form → Field | **Contesto opzionale `ValidationProvider`** (con `error` esplicito che vince, se ha contenuto). Non solo `name` + `error=` | esplicita |
| Q3 | Convenzione dei percorsi | **Percorsi annidati a notazione puntata** (`a.b.0.c`). Costo accettato: tipizzazione stretta delle chiavi persa sui percorsi annidati | esplicita |
| Q4 | `save`: valori grezzi o parsati | **Grezzi in v1**; parsati eventualmente più avanti | raccomandazione |
| Q5 | `schema` e `validate` insieme | **Entrambi**. Dettaglio fissato in fase di ticket: lo schema gira per primo e, se fallisce, `validate` non viene chiamato (riceve solo valori già validi per lo schema) | raccomandazione |
| Q6 | Pulizia errori | **Per campo/percorso al `setValue`**, non più tutto-o-niente; la story-test che documenta il vecchio comportamento si aggiorna e si rinomina | esplicita |
| Q7 | Riepilogo nel footer | **Helper opzionale** col conteggio (`getErrorSummary`); il footer resta presentazionale | raccomandazione |
| Q8 | Errori server mappati a campo | **Fuori scope**; ticket separato dopo (`setFieldErrors` pubblico). Non pubblicato ora | raccomandazione |
| Q9 | Free o Pro | **Free** | esplicita |

### Punti emersi scrivendo i ticket (non erano nel piano, nessuno richiede nuove decisioni)

- **Rischio di refocus con la pulizia per percorso.** `useFocusFirstInvalidField` si attiva
  sull'identità di `fieldErrors`; una pulizia parziale produce un nuovo oggetto non vuoto, quindi
  digitare in un campo sposterebbe il fuoco sul primo invalido. Il ticket #102 impone la correzione
  (il trigger deve essere "un `save` fallito", non "un nuovo oggetto") e lascia allo sviluppatore la
  forma minima, da segnalare in PR come aggiunta di API.
- **Errori a livello di radice** (`refine` sull'intero oggetto, percorso vuoto) non hanno un campo:
  il ticket #100 li espone come `formErrors` e li conta nel riepilogo (#103).
- **Schema asincrono**: in v1 la validazione resta sincrona; uno schema asincrono dà un errore
  esplicito (`saveError` + `console.error` in sviluppo), non attende.

## 6. Ticket pubblicati

Ordine di dipendenza. Ogni ticket ha il formato standard (Contesto / Obiettivo / Criteri di
accettazione / Smoke test / Note tecniche / Casi limite / Critico) e i requisiti Storybook di
`CLAUDE.md` (Controls, Actions con `fn()`, `play` reale).

| Ordine | Issue | Titolo | Dipende da | Critico | Frammentazioni chiuse |
|---|---|---|---|---|---|
| 1 | #97 | Controlli del Field: un solo cablaggio interno (`useFieldControlProps`), un solo stile invalido, un solo `isDev` — refactor senza cambi di comportamento | — | opus | F4, F5 (stile), F13 |
| 2 | #98 | `Field name` → `data-rop-name`: `useFocusFirstInvalidField` raggiunge anche il `Select`; story/fixture migrate a `Field` | #97 | opus | F2, F3, F5, F6 (parz.) |
| 3 | #99 | `FieldErrors` a percorsi con notazione puntata: tipo condiviso, `invalidPaths()` unico, form e hook allineati | #98 | opus | F1, F5, F9 |
| 4 | #100 | `useObjectPageForm({ schema })`: validazione con Standard Schema (compatibile Zod), issue → `fieldErrors`, nessuna dipendenza nel core | #99 | opus | F8 |
| 5 | #101 | `ValidationProvider`: il `Field` con `name` legge il proprio errore dal form (`error` esplicito vince), story del footer migrate | #99 | opus | F2, F6 |
| 6 | #102 | `fieldErrors`: pulizia per percorso al `setValue`/`setValues`, senza spostare il fuoco (aggiorna la story-test del tutto-o-niente) | #99 | opus | F10 |
| 7 | #103 | Regola degli annunci di errore (campo / riepilogo / save) e `getErrorSummary` per il footer, senza accoppiare il footer al form | #100, #101 (e #102 per un passo dell'e2e) | opus | F7, F12 |
| 8 | #104 | Story ricetta, e2e di non-interferenza con `useDirtyGuard` e campi bloccati, matrice visiva degli stati invalidi | #100, #101, #102, #103 | sonnet (basso rischio: nessun codice di libreria) | F11 |

I ticket #100, #101 e #102 dipendono tutti da #99 e sono indipendenti tra loro: si sviluppano uno
alla volta nell'ordine indicato (ritmo del progetto: lento, ticket per ticket).

**Non pubblicato, da pianificare dopo il blocco:** `setFieldErrors` pubblico nel form per mappare
gli errori di validazione lato server su messaggi di campo (Q8, spec §1.5).
