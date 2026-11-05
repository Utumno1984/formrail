# Design system React enterprise-admin — specifica di ripartenza (open-core)

> Documento di pianificazione. Nessun codice, nessuna struttura di file, nessun nome di classe o
> variabile di una codebase altrui è riportato qui: ogni idea è riformulata in termini generici di
> progettazione UI enterprise diffusi nel settore. Obiettivo:
> ripartire con un design system React indipendente, usato per primo da Daniele nei suoi progetti
> (vistato, agent-scout, sniper-trading-bot, react-virtual-tree-view, react-virtual-dnd-table) e
> messo a reddito con un modello **open-core** (core MIT gratuito + pacchetto Pro a pagamento).

## 0. Posizionamento: pattern UI enterprise generici

Il pattern architetturale scelto (lista con filtri → pannello di preview → editor a sezioni con
save-bar/dirty-guard) **non è un'invenzione proprietaria**: è un pattern di composizione diffuso
in tutto il software enterprise/admin, implementato in forme molto simili da decine di design
system e librerie indipendenti:

- **List Report** — vista lista con barra filtri (filtri a pillole/segmented + ricerca), tabella
  con colonne configurabili, selezione multipla e azioni bulk, stati vuoto/caricamento.
- **Object Page** — editor a sezioni con navigazione ancorata alle sezioni, **header** con
  identità dell'oggetto e azioni, **footer/save-bar** sticky, gestione dello stato "sporco"
  (dirty) prima di uscire.

Questo è un'**ottima notizia strategica**, non solo una curiosità: sono pattern di interazione e
composizione generici, liberi da copyright sull'implementazione, documentabili e implementabili
da chiunque senza bisogno di ancorarsi a un prodotto specifico. Da qui in avanti:

- I nomi dei componenti restano generici e descrittivi (**List Report**, **Object Page**,
  **Object Page Header**, **Anchor Bar**, **Filter Bar**, **Message Strip** per i banner di
  stato/errore, **Status Badge** per i badge di stato record), senza citare né implicare
  l'affiliazione con un prodotto commerciale specifico.
- La legittimità del progetto non dipende dal "mi sono ispirato a un lavoro precedente": dipende
  dal fatto che è un'implementazione React, libera e indipendente, di pattern enterprise già
  diffusi e descritti in astratto. Questo va scritto chiaramente nel README/positioning del
  progetto finale, senza nominare prodotti o aziende specifiche.
- Vedi §5 per la valutazione del positioning commerciale.

---

## 1. Inventario componenti/pattern

Per ciascuno: funzione, perché è utile, difficoltà tecnica reale, insidie di classe generale note
(riformulate come principi di progettazione, non come bug di un codebase specifico).

### 1.1 List Report (lista con filtri) — **difficoltà: media-alta**

Tabella/grid con: colonne configurabili (allineamento, larghezza, troncamento con tooltip),
ordinamento, selezione multipla + barra azioni bulk, paginazione (client-side e server-side come
varianti dello stesso componente), ricerca testuale, filtri a pillole/segmented (Smart Filter Bar),
stati vuoto/caricamento/errore con **footprint dimensionalmente stabile** (stessa larghezza/altezza
in loading, vuoto e con dati, per evitare salti di layout), opzionalmente **virtualizzazione** per
dataset grandi.

**Insidie di classe generale note:**
- Un placeholder di caricamento che non rispetta la stessa impronta (`width`/`height`) del
  contenuto finale produce un salto visibile di layout al primo render coi dati.
- L'ordinamento al primo click deve seguire un contratto esplicito e testato (crescente vs
  decrescente di default), non l'ordine "naturale" del tipo di dato.
- La virtualizzazione va disattivata esplicitamente quando il dataset è piccolo/vuoto: un
  virtualizzatore che resta "osservante" su un contenitore a zero righe spreca cicli e può
  produrre comportamenti a bordo (scroll, altezza) incoerenti.
- Una cella con testo troncato deve avere un `max-width` reale sul contenitore, non solo
  `text-overflow`: senza vincolo di larghezza la cella si espande e rompe il contenimento
  orizzontale dell'intera tabella.
- Un tooltip di troncamento che si apre al **mount** (invece che su hover/focus reale) copre
  contenuto non richiesto e deve essere gated sull'evento utente, non sul render.
- Un'azione in un **menu overflow ("…")** che avvolge un componente custom deve ereditare
  `onClick`/`disabled` da quel componente: un pattern comune di bug è "funziona come bottone
  diretto, non funziona dall'overflow" perché l'estrazione label+icona per il menu scarta
  l'handler.

### 1.2 Smart Filter Bar — **difficoltà: media**

Barra filtri con ricerca + filtri a pillole/segmented, sincronizzata con lo stato URL. Insidie:
mantenere la posizione di scroll e i filtri quando si annulla un'azione (es. "Nuovo" → "Annulla"
non deve perdere pagina/filtri correnti); un filtro che cambia mentre l'utente sta ancora scrivendo
nell'URL/history non deve "tornare indietro" da solo (serve un valore "committed" distinto dal
valore digitato in tempo reale).

### 1.3 Preview panel (pannello intermedio, L2) — **difficoltà: media**

Pannello di anteprima mostrato alla selezione di una riga, prima di aprire l'editor completo.
Contiene una **Description List** (coppie chiave-valore in sola lettura) con due modalità di
layout: inline (valore a destra) e stacked/responsive (valore sotto, su contenitore stretto via
container query), più righe di riepilogo (summary rows) e un badge di stato (**Object Status**,
es. "Archiviato").

**Insidie di classe generale note:**
- Le due modalità di layout (inline/stacked) devono allineare il **valore stringa** e il
  **valore custom (nodo React)** con la stessa regola di allineamento: trattarli con regole CSS
  diverse produce disallineamenti visibili solo quando compaiono entrambi i tipi di valore nella
  stessa vista.
- Un badge di stato/audit (es. "Archiviato il... da...") non è garantito disponibile su ogni
  entità: il contratto dati per-entità va verificato individualmente, non assunto uniforme "su
  tutte le procedure" solo perché è vero sulla maggioranza.
- Riservare sempre lo spazio della riga di stato anche quando non è presente, per evitare un salto
  verticale quando lo stato appare/scompare.

### 1.4 Object Page (editor a sezioni, L3) — **difficoltà: alta**

Editor con **Anchor Bar** (sezioni ancorate, navigabili), **header** con azioni primarie/secondarie
(anche qui vale l'insidia §1.1 sull'overflow menu), **footer sticky con save-bar**, **dirty-guard**
(avviso prima di uscire con modifiche non salvate), **Change Summary** (riepilogo leggibile dei
campi effettivamente modificati rispetto al valore originale).

**Insidie di classe generale note — queste sono probabilmente il nucleo di moat tecnico reale:**
- **Dirty-tracking corretto** richiede distinguere "il form è stato idratato con un nuovo valore
  esterno" da "l'utente ha digitato qualcosa": un campo che riceve il proprio valore da fuori dopo
  il mount (es. dati arrivati in modo asincrono) non deve marcare il form come sporco, né deve
  **sovrascrivere** il valore appena arrivato con un "eco" del valore precedente. Questa è una
  classe di bug sottile e ricorrente nei componenti controllati a libreria: quando il valore
  esterno di un controllo cambia dopo il mount, il controllo stesso richiama il proprio handler
  `onChange`, e se quell'handler scrive nello stato del form, il dato fresco viene silenziosamente
  rimpiazzato da un valore vecchio.
  **Principio di progettazione da applicare nel nuovo DS**: un controllo che riceve il proprio
  valore da fuori (idratazione) non deve mai propagare quell'evento come se fosse un gesto
  dell'utente; se la libreria sottostante lo fa per conto suo, serve un modo esplicito di
  distinguere "eco di sistema" da "intenzione dell'utente" (es. valori sentinella distinti per "la
  libreria ha svuotato" vs "l'opzione non è più nel catalogo" vs "nessun cambiamento reale").
  Il modo più robusto per evitarlo in radice è montare i controlli **già idratati** (il form nasce
  con i valori definitivi, non li riceve dopo), ma questo richiede disciplina architetturale
  (separare "fetch in corso" da "editor montato") non sempre applicabile a cuor leggero.
- **Change Summary** affidabile richiede calcolare il diff sul valore effettivo salvato lato
  server (baseline), non su un default statico, e deve gestire bene stringhe vuote vs valori
  assenti vs `null` (regola canonica: **Regola dei valori assenti**, §1.13.1).
- **Campi con stati "forzato/bloccato/disabilitato"** (il valore è determinato da una regola di
  business, non dall'utente) devono: (a) essere realmente non interagibili anche da tastiera (non
  solo visivamente "spenti" col mouse), (b) esporre una spiegazione collegata via
  `aria-describedby` reale, non un testo visivo scollegato. Per farlo bene l'API del campo deve
  offrire un canale di **render-prop/hook** che inietta `disabled`/`aria-disabled`/
  `aria-describedby` nel controllo figlio arbitrario — un semplice `children: ReactNode` non basta,
  perché non c'è modo di "passare dentro" quelle proprietà a un controllo generico.
- **Save-bar sticky**: va garantito che l'altezza occupata dal footer sia riservata anche prima che
  compaia/scompaia (dirty → non-dirty), per non far saltare il contenuto scrollabile sopra.

### 1.5 Data layer — **difficoltà: alta (è infrastruttura, non UI)**

Combinazione di: schema di validazione runtime (tipo Zod) condiviso tra form e chiamata API (fa da
"contract check" FE↔BE: un campo mancante nella risposta reale fa fallire rumorosamente il parse
invece di propagare `undefined` in silenzio), hook di query/cache (tipo TanStack Query) con
aggiornamento della cache "in place" dopo una scrittura (senza richiedere un intero refetch),
gestione esplicita degli errori di duplicato/validazione lato server mappati su messaggi di campo.

**Insidie di classe generale note:**
- Una ricerca asincrona con digitazione rapida deve garantire che la risposta di un termine
  **superato** non sovrascriva quella del termine più recente (race condition classica su
  richieste concorrenti: va tracciato quale richiesta è "l'ultima" e scartare le altre all'arrivo).
- Un valore selezionato che non è tra i risultati dell'ultima ricerca (perché l'utente ha
  continuato a digitare dopo aver scelto) deve restare visibile: la UI non deve "perdere" la
  selezione solo perché non compare nella lista filtrata corrente.
- Durante una composizione IME il testo è provvisorio: nessuna ricerca né commit finché non arriva
  `compositionend`, ed Enter non seleziona (**Composizione IME**, §1.13.5).

### 1.6 Primitivi di overlay: Dialog, Select/Combobox, Popover, Tooltip, Sheet — **difficoltà: alta**

Sono i primitivi col **raggio di impatto più ampio** nel sistema (ogni consumer li usa): qualunque
regressione qui si propaga a tutte le schermate. Insidie di classe generale note, tutte reali e
ricorrenti nei design system costruiti su primitivi headless (es. Radix):

- **Scala di z-index disciplinata**: i contenuti "a portale" (popover di Select/Combobox dentro un
  Dialog) devono rispettare una scala di z-index coerente con l'intero sistema (popover sempre
  sopra modal, modal sempre sopra overlay di sfondo). Usare lo z-index di default della libreria di
  base senza armonizzarlo con la propria scala produce popover "invisibili ai click" perché finiscono
  sotto l'overlay del dialog che li contiene — un bug che non si vede nel caso semplice (si vede solo
  componendo Select dentro Dialog).
- **Override di stile via className devono davvero vincere**: un meccanismo di composizione classi
  che fa semplice concatenazione (senza un vero "merge" delle utility CSS in conflitto) lascia che le
  classi di default del componente (es. dimensioni) continuino a vincere sulle classi passate
  dal consumer. Serve un vero merge delle classi in conflitto (stile Tailwind-merge), non solo la
  concatenazione.
- **Stacking/accessibilità dei dialog pilotati da stato applicativo** (apertura non originata da un
  trigger diretto del primitivo, ma da una variabile di stato esterna): il meccanismo interno che una
  libreria headless usa per "sapere quando aprire/chiudere" può non attivarsi affatto se l'apertura
  non passa dal suo canale previsto, con effetti di accessibilità sottili (es. l'elemento aperto non
  viene annunciato come dialog agli screen reader, pur essendo visivamente corretto e pur passando i
  test funzionali). **Principio**: se il DS offre un modo "controllato da stato" di aprire un overlay,
  deve garantire che tutto il bookkeeping interno (pila di overlay, focus-trap, annuncio ARIA) si
  attivi comunque, non solo nel percorso "trigger diretto". È un'area dove serve verifica misurata
  (DOM reale, non solo lettura del codice), perché l'effetto visibile e l'effetto sull'albero di
  accessibilità possono divergere in modi non intuitivi.
- **Ritorno del fuoco (focus) alla chiusura**: va catturato un riferimento stabile all'elemento che
  aveva il fuoco *prima* dell'apertura, aggiornato solo mentre l'overlay è chiuso — non dedotto
  dentro un effetto che gira all'apertura, perché l'ordine di esecuzione degli effetti (figli prima
  del genitore) può far leggere come "elemento con il fuoco" un nodo già dentro l'overlay stesso.
  Due limiti noti e da dichiarare esplicitamente: un opener disabilitato al momento del ritorno non
  può ricevere il fuoco; un opener smontato nel frattempo nemmeno.
- **Leak di proprietà non-DOM sul DOM**: quando un oggetto di "stato di controllo" viene passato con
  spread diretto a un elemento DOM o a un componente che fa spread al DOM, ogni proprietà non valida
  come attributo HTML genera un warning ed è comunque visibile nel markup. La protezione pulita è
  rendere quelle proprietà non-enumerabili (così lo spread le salta ma restano leggibili
  esplicitamente) — va testato con un'asserzione dedicata di "nessun leak", perché un test unitario
  che verifica solo il comportamento funzionale può passare comunque.
- **Lo spread condizionale in JSX bypassa il controllo "proprietà in eccesso" di TypeScript**: un
  pattern come spread condizionale di una prop opzionale su un componente che non la dichiara viene
  scartato in silenzio a runtime, con `tsc` verde. Va preferita l'assegnazione diretta della prop
  (dichiarata opzionale nel tipo) invece dello spread condizionale quando il target è un componente
  (va bene invece su elementi HTML nativi, dove ogni attributo è lecito).
- **Dimensioni/varianti dei dialog** (size scale, tipo `sm/md/lg/xl`) e varianti di conferma
  "type-to-confirm" per azioni distruttive sono estensioni naturali, moderata difficoltà.

### 1.7 Primitivi di base: Typography, Button, Icon scale, Input, Message Strip — **difficoltà: bassa-media**

Scala tipografica condivisa (incluso un token "monospace" dedicato a codici/identificativi, non
applicato a mano in ogni punto), scala icone coerente (xs→xl con passi dichiarati), varianti bottone
(dimensione `inline`/`icon-xs` per usi compatti dentro testo o celle), **Message Strip** (banner di
errore/successo/informazione, lo stesso concetto generico di "alert" inline) con un unico
meccanismo condiviso di messaggio sotto-campo per tutti i controlli di form (stessa spaziatura/
dimensione testo per errore e per testo d'aiuto).

**Insidia nota**: due bottoni "funzionalmente identici" (es. due "Annulla selezione" in punti
diversi dello schermo) con lo stesso nome accessibile ma effetti diversi vanno distinti per nome,
altrimenti sono indistinguibili per uno screen reader.

### 1.8 Dialog con griglia incorporata (Picker/Assignment dialog) — **difficoltà: alta**

Un dialog che incorpora una List Report in miniatura per scegliere/assegnare record (es. "sposta
elementi", assegnazione N:M). Combina tutte le insidie di §1.1 e §1.6, più: contenimento orizzontale
del contenuto dentro i limiti del dialog (il contenuto deve scrollare *dentro* il dialog, non farlo
sforare), impronta stabile tra stato di caricamento e stato con dati (altrimenti il dialog "si
allarga" visibilmente non appena arrivano i dati).

### 1.9 Soft-delete / Archivia e ripristina — **difficoltà: media**

Pattern transversale: sostituire la cancellazione fisica con uno stato "archiviato", con vista
filtrabile degli archiviati e azione di ripristino. Implica rivedere ogni controllo di
"usage/riferimenti" che prima bloccava la cancellazione (con soft-delete spesso non serve più, dato
che il record resta e i riferimenti restano validi) e gestire lo stato "in volo" del ripristino
(es. opacità ridotta + `aria-disabled` finché l'operazione non è confermata dal server).

### 1.10 Responsive reale su tablet/mobile, non un gate di blocco — **difficoltà: media, decisione di prodotto alta**

**Decisione di Daniele del 2026-10-25, sostituisce la versione precedente di questa sezione**
(che proponeva un gate "non supportato sotto una soglia di larghezza" per un prodotto
desktop-first con utenza minoritaria su mobile): tablet e mobile vanno supportati davvero, non
bloccati con un messaggio. Il punto concreto citato esplicitamente: **lo spazio della tastiera
virtuale** quando un campo va in focus — un Field, un Dialog o uno Sheet non devono lasciare il
campo attivo nascosto sotto la tastiera (serve gestione basata su `visualViewport`/unità `dvh`,
non solo media query sulla larghezza statica).

Approccio scelto: il comportamento keyboard-safe **non è rimandato a un ticket finale** per i
primitivi strutturali (Field, Dialog, Sheet) — un recupero a posteriori su quei componenti
costerebbe un rifacimento, non una patch. È invece parte dei criteri di accettazione dei ticket
che li introducono, fin da quando nascono. La regressione visiva (§1.11, ticket #4) copre più
viewport (mobile/tablet/desktop) fin dalla sua introduzione, non solo desktop. Un gate di
risoluzione resta un'opzione legittima in futuro per pattern molto specifici dove il responsive
non avrebbe senso (es. una List Report con tabella a molte colonne su schermo stretto), ma non è
più il default per il progetto nel suo complesso.

### 1.11 Governance tecnica del pacchetto (CI/qualità) — **difficoltà: media, ma a forte leva**

- **Budget di dimensione bundle per-import** (non solo peso totale del pacchetto): avvisa quando un
  singolo import supera una soglia dichiarata, confrontato con una baseline versionata (non
  riscritta ad ogni corsa, altrimenti il gate non misura nulla).
- **Regressione visiva** (Storybook + screenshot diff) per i primitivi ad alto raggio d'impatto:
  un E2E funzionale (click, focus, valore atteso) è **cieco al layout** — titolo presente, bottone
  cliccabile, selezione corretta possono tutti essere verdi anche con centratura sbagliata, doppio
  scroll o un anello di focus tagliato. Serve una categoria di test dedicata con asserzioni
  geometriche reali (`getBoundingClientRect`/`getComputedStyle`: un solo scroller, nessun overflow
  orizzontale, spazio sufficiente per l'anello di focus).
- **Versionamento a changeset obbligatorio**, con un controllo CI che guarda i file effettivamente
  toccati dalla PR (non lo stato globale del repo).
- **Sequenziamento release per i primitivi**: una causa (es. un cambio di layout del primitivo) e
  il suo fix compagno (in un consumer che si affida a quel comportamento) vanno rilasciati nella
  stessa release quando sono accoppiati — un primitivo "che rompe" pubblicato senza il fix compagno
  crea una finestra di versione "avvelenata" che i consumer possono installare per sbaglio.
- **Mutation testing mirato sui motori** (diff, parsing, validazione, uguaglianza): giro manuale
  del critico su ogni PR che ne tocca la logica, senza dipendenze aggiuntive (§1.13.2).

### 1.12 Primitivi Free di completamento (gap rispetto alle librerie open source generaliste) — **difficoltà: bassa-media, DatePicker media-alta**

**Decisione di Daniele del 2026-11-03.** Dal confronto con le librerie di componenti React open source
generaliste mancano alcuni primitivi che un consumer si aspetta di trovare in qualunque DS. Sono
tutti **Free** (§3): standard, ampiamente disponibili altrove, servono per l'adozione. Ognuno è un
ticket indipendente, sviluppabile in un proprio branch/worktree (unica eccezione: DatePicker
dipende da Calendar).

Verifica anti-duplicati sul codice esistente (2026-11-03) — nessuno esiste già come primitivo
esportato, ma alcuni hanno un parente interno da tenere presente:

| Componente | Sovrapposizione esistente | Esito |
|---|---|---|
| **Toast / notifica** | `MessageStrip` è un messaggio *inline* persistente, non transitorio né a portale | nuovo primitivo |
| **Tabs** | `ObjectPageAnchorBar` è navigazione ancorata con scroll-spy (link a sezioni sempre montate), non pannelli alternativi | nuovo primitivo |
| **Accordion / Collapse** | nessuna (le sezioni dell'Object Page non sono collassabili) | nuovo primitivo |
| **Avatar** | nessuna | nuovo primitivo |
| **Breadcrumb** | nessuna | nuovo primitivo |
| **Pagination** | citata in §1.1 come variante della List Report ma **mai implementata** | nuovo primitivo standalone; l'integrazione nella List Report è un ticket separato futuro |
| **Progress bar** | nessuna | nuovo primitivo |
| **Skeleton** | `SkeletonRows`/`skeletonBarClass` interni a `ListReportTable` (non esportati) | nuovo primitivo; la migrazione della tabella sul primitivo è fuori scope (eviterebbe churn delle baseline visive) |
| **Spinner** | nessuna | nuovo primitivo |
| **Checkbox** | nessuna (`Input` è solo testuale) | nuovo primitivo, integrato con `Field` |
| **RadioGroup** | le pillole di `ListReportFilterBar` sono un `radiogroup` segmented di dominio, non un controllo di form | nuovo primitivo, integrato con `Field` |
| **Switch** | nessuna | nuovo primitivo, integrato con `Field` |
| **Card** | nessuna | nuovo primitivo |
| **Divider** | nessuna | nuovo primitivo |
| **Menu / Dropdown** | nessuna; è la base del menu overflow citato in §1.1/§1.4 | nuovo primitivo |
| **Calendar** | nessuna (lo showcase usa `<Input type="date">` nativo) | nuovo primitivo |
| **DatePicker** | idem | nuovo primitivo, **dipende da Calendar** |
| Badge generico | già coperto da `StatusBadge` (#86) e dalla pillola conteggio della List Report (#82) | **scartato**, non è un gap |

**Insidie di classe generale da portare nei ticket** (oltre a quelle di §1.6/§1.7 che valgono per
ogni primitivo):
- I controlli booleani/a scelta (Checkbox, RadioGroup, Switch) devono passare dallo stesso cablaggio
  di `Field` degli altri controlli (`useFieldControlProps`: `aria-describedby`, `aria-invalid`,
  stati forced/locked **non interagibili anche da tastiera e da click sulla label**) e non generare
  un `onChange` di eco quando il valore cambia dall'esterno (§1.4).
- Overlay nuovi (Menu/Dropdown, popover del DatePicker) si appoggiano a `overlayLayer`: niente
  z-index letterali, ritorno del fuoco al trigger, corretti anche dentro Dialog/Sheet. Il Toast è il
  primo overlay *non modale e persistente mentre l'utente lavora*: il suo livello nella scala
  z-index va deciso esplicitamente (e un Toast non deve mai rubare il fuoco).
- Una voce di Menu deve ereditare `onClick`/`disabled` da ciò che rappresenta (insidia §1.1).
- Annunci: Toast e Progress/Spinner annunciano tramite una regione live **già montata** (una regione
  creata insieme al messaggio non viene letta), senza ripetere lo stesso annuncio a ogni render.
- Motion (Toast, Accordion, Spinner, Skeleton) dichiarata come token e disattivata con
  `prefers-reduced-motion` (regola "Motion" di CLAUDE.md).
- Impronta stabile: Skeleton/Avatar (fallback → immagine caricata), Pagination (cambio di numero
  di pagine) e Tabs (cambio di pannello) non devono produrre salti di layout evitabili.
- Checkbox, RadioGroup, Switch, Calendar e DatePicker rispettano la **Regola dei valori assenti**
  (§1.13.1: valore vuoto dichiarato, nessuna conversione di eco); Calendar e DatePicker sono
  vincolati a **Locale e i18n** (§1.13.3); tutti usano proprietà CSS logiche (**RTL**, §1.13.4),
  senza garanzia RTL; il typeahead del Menu segue la **Composizione IME** (§1.13.5).

**Nota futura — Toast avanzato (Pro), non pianificato.** Stesso schema già usato per List Report e
Object Page (base Free, estensione avanzata Pro): il Toast Free copre il singolo messaggio
transitorio accessibile; un eventuale **Toast avanzato** Pro aggiungerebbe coda multi-toast con
priorità e limite di visibili, pausa del timer su hover/focus e su finestra non attiva, persistenza
tra navigazioni/ricariche, hook di analytics (mostrato/chiuso/azione). Nessun ticket finché Daniele
non lo chiede esplicitamente; il Toast Free va disegnato in modo che questa estensione non richieda
una rottura della sua API.

### 1.13 Regole trasversali di robustezza — **difficoltà: bassa da applicare, alta da recuperare dopo**

**Decisione di Daniele del 2026-11-03.** Cinque regole che valgono per più componenti, ognuna con un
nome citabile. Il pianificatore le richiama **per nome** nei criteri di accettazione dei ticket
interessati e il critico le verifica. Le sezioni dei singoli componenti rimandano qui invece di
ripeterle (una sola fonte, nessun testo copiato che poi diverge).

#### 1.13.1 Regola dei valori assenti

**Problema.** `''`, `null`, `undefined` e, dentro un oggetto, la chiave mancante sono rappresentazioni
diverse di "nessun valore". Se ogni modulo decide da sé quando sono "la stessa cosa" nascono falsi
dirty, voci fantasma nel Change Summary e payload diversi da quelli attesi.

**Livello 1, identità del dato (default ovunque).** I quattro stati sono **distinti**: `''` ≠ `null`
≠ `undefined`, e una chiave con valore `undefined` ≠ una chiave mancante. Valgono così: lo stato del
form, `isDirty` (`deepEqual` in `packages/core/src/object-page/equal.ts`, regola scritta nel suo
TSDoc), gli schema di validazione (§1.5) e il payload verso l'API. Motivo: sul filo sono davvero
diversi (in JSON `undefined` fa sparire la chiave, `null` resta, `''` è una stringa) e un backend può
legittimamente distinguere "svuotato" da "non inviato".

**Livello 2, collassi voluti (solo presentazione, elenco chiuso).**
1. **Ordinamento della List Report**: `toSortKey` in `packages/core/src/list-report/compare.ts`
   tratta `null`/`undefined`/`''` (più `NaN` e `Date` invalida) come "vuoto", sempre in fondo. È un
   criterio di visualizzazione, non un'affermazione che i valori siano uguali.
2. **Rendering di un controllo**: mostrare un valore assente come testo vuoto (`value ?? ''`) è
   lecito **in lettura**; non deve mai diventare una scrittura nello stato (sarebbe un'eco, §1.4).

Qualunque altro collasso è un bug, finché non viene aggiunto a questo elenco con data e motivo.

**Change Summary: non è più un collasso ammesso (decisione di Daniele del 2026-11-03, fix in #202).**
Il motore di #174 (`packages/pro/src/change-summary/compute-change-summary.ts`) collassava i valori in
classi **Assente** (`undefined`, `null`, chiave mancante) e **Vuoto** (Assente ∪ `''` ∪ `[]` ∪
oggetto semplice con soli valori Vuoto) e non generava entry tra due lati Vuoti; era il punto 2 di
questo elenco. Da #202 segue il **Livello 1** come `isDirty`: invariante "nessuna entry ⇔ `isDirty
=== false`" (senza `isEqual` personalizzato e senza `arrayIdKeys`: dichiarando un `idKey` restano due
differenze volute, il riordino senza modifiche, che è dirty ma non dà entry, e gli elementi il cui id
non è abbinato da `Object.is`, che danno `added` + `removed` anche su array uguali: elementi senza id,
id oggetto confrontati per riferimento (una `Date` o un oggetto clonati sono un altro id), `0` contro
`-0`). La leggibilità ("da (vuoto) a (vuoto)") si risolve nella **resa**: `ChangeEntry` ha `beforeMissing`/`afterMissing` per distinguere
la chiave mancante da `undefined`, e il componente usa testi distinti nella resa precisa (`nullValue`,
`undefinedValue`, `missingValue` in `ChangeSummaryValueLabels`, default `Null`, `Undefined`,
`Missing`); la resa compatta resta `No value`. Regola nel TSDoc "No value rule" di
`change-summary/types.ts`.

**Divergenza "form dirty con Change Summary vuoto": non più accettata, risolta da #202.** Era la
conseguenza del vecchio collasso. Casi concreti: baseline `{ note: null }`, l'utente scrive e poi
cancella in un `Input` (che emette `''`); un `Combobox` con `clearOnEmpty` che emette `undefined` su
una baseline `null`. In entrambi i casi il form è dirty **e** il riepilogo mostra la voce. Resta valido, come buona pratica e non più come rimedio a un difetto,
costruire la baseline con la stessa rappresentazione di "vuoto" che il controllo emette
(normalizzando al confine idratazione/schema), così che svuotare un campo già vuoto non renda il
form dirty.

**Contratto per ogni controllo di form**, nuovo o toccato (Input, Select, Combobox, Checkbox #188,
RadioGroup #189, Switch #190, Calendar #194, DatePicker #195, ticket Zod):
- Il TSDoc dichiara il **valore vuoto emesso quando l'utente svuota**. Esistenti: `Input` → `''`;
  `Select`/`Combobox` → `undefined` (`'value' in props` distingue "controllato e vuoto" da "non
  controllato"). Controlli di selezione nuovi → `undefined`, coerente con Select/Combobox, salvo
  diversa decisione (§5 punto 7). Checkbox/Switch emettono sempre un booleano; "indeterminato" è una
  prop separata, mai `null` come valore.
- Un valore assente in ingresso (`null` compreso) viene mostrato come vuoto **senza** nessun
  `onChange`/`onValueChange` che lo converta in un'altra rappresentazione di assente (eco, §1.4).
- Test obbligatori: matrice ingresso {`undefined`, `null`, `''` dove il tipo lo ammette, prop/chiave
  mancante} × {al mount, cambiato dopo il mount} → zero callback; svuotamento da parte dell'utente →
  esattamente il valore vuoto dichiarato.
- Schema Zod: nessuna coercizione implicita. `.nullable()`/`.optional()` sono espliciti; un
  `preprocess` `'' → null` è dichiarato nello schema e testato; un campo obbligatorio mancante
  fallisce rumorosamente (§1.5).

#### 1.13.2 Mutation testing mirato sui motori

**Problema.** Sui moduli di logica pura (diff, parsing, validazione, uguaglianza, ordinamento) una
suite verde ed "esaustiva" può passare comunque con un confronto invertito o una guardia tolta: è il
punto dove un difetto costa di più e si vede di meno. Un test che non fallisce quando il codice è
sbagliato non protegge nulla. Finora è stato fatto solo per iniziativa del critico (#174).

**Regola.** Ogni PR che aggiunge o modifica la logica di un **motore** passa da un giro di mutation
testing **manuale e mirato**, fatto dal critico (procedura in `.claude/agents/critico-avversariale.md`):
muta a mano le condizioni e i confronti introdotti o toccati dal diff, una mutazione alla volta, e
verifica che almeno un test esistente fallisca. Una mutazione sopravvissuta e non equivalente vale
come test mancante: PR respinta.

**Ambito.** Sono motori oggi: `object-page/equal.ts`, `object-page/field-errors.ts`,
`list-report/compare.ts`, la logica di ordinamento/filtro/commit della ricerca in
`list-report/use-list-report.ts`, il parsing in `list-report/use-list-report-url-state.ts` e
`use-list-report-scroll-restoration.ts`, `combobox/filter.ts` con `internal/normalize-text.ts`, la
macchina a stati di `combobox/use-combobox.ts`, `internal/keyboard-navigation.ts` e, in Pro,
`change-summary/{compute-change-summary,infer-label,format-change-value}.ts`. In arrivo:
`calendar/date-math.ts` (#194), `date-picker/date-format.ts` (#195), gli schema Zod. **Esclusi**: i
componenti di sola presentazione, i file di stile, le story. La regola si applica ai diff, non a una
campagna retroattiva sui moduli già uniti.

**Perché manuale e non Stryker (decisione 2026-11-03).** Uno strumento automatico (Stryker con
runner Vitest) aggiungerebbe una dipendenza di sviluppo pesante ed eseguirebbe la suite del file per
ogni mutante: sui motori con matrici parametriche (i 36 casi di #174) sono minuti per file, un costo
fisso a ogni PR su CI condivisa con il vincolo hardware già noto, più molto rumore di mutanti
equivalenti su codice difensivo. Le mutazioni che contano sono poche e prevedibili (confini,
operatori di confronto, guardie, lati scambiati) e il critico legge comunque il diff riga per riga.
Da rivedere se un difetto arrivato su `main` si rivela catturabile da una mutazione che il giro
manuale aveva saltato, o quando i motori diventano troppi per un giro manuale per PR.

#### 1.13.3 Locale e i18n

**Decisione del 2026-11-03, vincolante per #194 (Calendar), #195 (DatePicker) e per ogni componente
che formatta date, numeri o testi interni.** Principio: iniziare semplice, evolvere se serve.

- **Nessuna libreria di i18n o di date nel bundle** (né core né Pro): la formattazione usa `Intl`
  nativo (`DateTimeFormat`, `NumberFormat`, `Collator`, `Locale`). Motivo: il budget per-import
  (§1.11), e `Intl` copre già quello che serve. Un locale o un fuso non validi degradano ai default
  del runtime senza eccezioni (precedente: `change-summary/format-change-value.ts`).
- **Risoluzione del locale**: prop `locale` del componente → (in futuro) un provider di contesto del
  core → default del runtime (si passa `undefined` a `Intl`, che nel browser equivale alla lingua
  dell'utente). La libreria non legge mai `navigator.language` direttamente: `undefined` dà lo stesso
  risultato nel browser e funziona lato server senza guardie su `navigator`. È lo stesso default già
  in uso in `useListReport({ locale })` e in `ChangeSummary` (`locale`, `timeZone`). Il provider non
  si introduce ora: i componenti passano da un unico helper interno di risoluzione, così aggiungerlo
  più avanti non rompe l'API.
- **SSR, rischio dichiarato**: lato server il default è il locale del processo (spesso `en-US`), lato
  client quello del browser. Senza `locale` esplicito il testo formattato può differire e React
  segnala un mismatch di idratazione (con ri-render client del sottoalbero). Contratto: chi fa SSR
  passa `locale` e, dove serve, `timeZone` e `today`. Ogni componente localizzato ha un test
  `renderToString` + `hydrateRoot` con locale esplicito, senza errori di idratazione. Story, e2e e
  baseline visive passano sempre un locale fisso.
- **Valori di data**: stringa ISO `YYYY-MM-DD` (tipo `IsoDate`), indipendente dal locale di
  visualizzazione. Mai `Date` come valore: rappresenta un istante e slitta di un giorno tra fusi e
  ora legale. L'aritmetica si fa su `Date.UTC`. Il locale incide solo sulla visualizzazione e sul
  parsing del testo digitato. Se `locale` cambia dopo il mount, il testo viene riformattato senza
  `onValueChange` (eco, §1.4).
- **Primo giorno della settimana**, in ordine: (1) prop `weekStartsOn`; (2)
  `Intl.Locale(locale).getWeekInfo()` o l'accessor `weekInfo` dove esiste (non in tutti i motori);
  (3) una piccola tabella interna per regione (`Intl.Locale(locale).maximize().region`) derivata da
  CLDR `weekData.firstDay`, poche decine di codici e qualche centinaio di byte; (4) lunedì (ISO
  8601). Motivo della tabella: con il solo "domenica per `en-US`, lunedì per gli altri", `ja-JP`,
  `pt-BR`, `en-CA` (domenica) o `ar-EG` (sabato) risulterebbero sbagliati e, soprattutto, il
  risultato cambierebbe tra un browser con `weekInfo` e uno senza: due baseline visive diverse per lo
  stesso locale.
- **Testi interni della libreria** ("Previous month", "Clear", "Choose date", ...): default inglesi.
  Un componente nuovo con due o più testi interni, o con testi che contengono valori, espone
  `labels?: Partial<XLabels>` con il tipo `XLabels` esportato e unito ai default. I testi con un
  valore sono funzioni (`chooseDateSelected: (date: string) => string`), non segnaposto in una
  stringa: niente formato ICU; plurali solo con funzioni (precedente: `items` in
  `format-change-value.ts`). Le prop `*Label` singole già esistenti (`emptyLabel`, `dismissLabel`,
  `searchLabel`, ...) restano: nessuna migrazione retroattiva. Eccezione dichiarata: `ChangeSummary`
  usa `valueLabels` perché `labels` è già preso dalle etichette dei path di `useChangeSummary`.

#### 1.13.4 RTL: non garantito per ora, porta aperta a basso costo

**Decisione del 2026-11-03.** Il layout da destra a sinistra **non è supportato né garantito**: è una
scelta consapevole, non una dimenticanza. Nessun test, nessuna baseline visiva RTL, nessuna promessa
nella documentazione. Per tenere basso il costo di un recupero futuro, i componenti nuovi o toccati
usano **proprietà logiche**: `margin-inline`, `padding-inline`, `inset-inline-start/end`,
`text-align: start` e, con Tailwind v4 (lo stack in uso), le utility
`ms-/me-/ps-/pe-/start-/end-/text-start/text-end`, non `ml-/mr-/pl-/pr-/left-/right-/text-left`.
Il codice esistente è già quasi tutto logico (listbox, Field, Select, Description List, List Report);
le eccezioni fisiche censite il 2026-11-03 sono `StatusBadge` e il bottone di chiusura di
`MessageStrip`, da convertire solo quando quei file vengono toccati per altri motivi.

**Cosa il solo CSS logico NON copre** (da sapere al momento del recupero, così la stima resta onesta):
- icone direzionali (chevron mese precedente/successivo, separatore di Breadcrumb, frecce di
  Pagination);
- **tasti freccia sinistra/destra** nella navigazione da tastiera custom (Calendar, Tabs, Menu): va
  letta la `direction` calcolata, come fa già `isRtl` in `ListReportFilterBar.tsx`;
- traslazioni e animazioni di ingresso (`--rop-modal-from-translate` e l'offset di `box-shadow` dello
  Sheet);
- API con lati fisici (`side: 'left' | 'right'` di Sheet e Tooltip);
- `scrollLeft`, che in RTL è negativo nei browser moderni: oggi il parsing della posizione in
  `use-list-report-scroll-restoration.ts` scarta i valori negativi;
- isolamento bidi dei valori utente dentro testo composto (`<bdi>` / `unicode-bidi: isolate`, es.
  "from X to Y" nel Change Summary);
- il provider di direzione delle primitive Radix.

Il comportamento RTL già esistente (frecce invertite nelle pillole della Filter Bar) resta com'è, con
i suoi test, ma non è una garanzia di prodotto. Lo stesso vale per un componente nuovo che decida di
gestire `direction` a costo quasi nullo (es. le frecce del Calendar): ammesso, senza baseline visive
RTL dedicate.

#### 1.13.5 Composizione IME nella ricerca e nel filtro

Stessa famiglia della race su digitazione rapida (§1.5). Durante una composizione IME (input CJK, tra
`compositionstart` e `compositionend`, o keydown con `isComposing` / `keyCode === 229`) il testo
nell'input è provvisorio: candidati non ancora confermati, kana non ancora convertiti. Regole per
ogni controllo con ricerca o filtro innescato dalla digitazione:
- **Durante la composizione** non parte nessuna ricerca asincrona e nessun commit ritardato
  (debounce, sincronizzazione con l'URL, callback di "query confermata"). Un filtro locale sincrono
  può seguire il testo: è economico e reversibile.
- **A `compositionend`** il testo finale vale come una sola modifica, da cui partono debounce o
  ricerca. Va letto da `event.currentTarget.value` nel gestore stesso, senza contare su un
  `onChange` successivo: l'ordine `input`/`compositionend` cambia tra i motori.
- **Enter, Escape, frecce e Tab durante la composizione appartengono all'IME**: nessuna selezione,
  chiusura o commit. Si ignora anche il keydown con `keyCode 229` che Safari invia dopo
  `compositionend`. Se il fuoco esce durante la composizione, lo stato di composizione si azzera.
  Precedente corretto: `onKeyDown`/`onBlur` di `combobox/use-combobox.ts`.
- **Test**: unit con `compositionStart` → `change`... → `compositionEnd`: zero ricerche e commit
  durante la composizione, esattamente uno dopo, col testo finale; Enter con `isComposing` non
  seleziona. In e2e Chromium si può usare CDP `Input.imeSetComposition` dove serve.
- **Si applica a**: Combobox con ricerca asincrona (Pro, §3; il Combobox sincrono del Free ignora
  già i tasti durante la composizione, ma `onInputValueChange` scatta anche sul testo provvisorio:
  il contratto asincrono non può appoggiarsi lì così com'è), typeahead del Menu (#193), ricerca della
  `ListReportFilterBar` (**difetto latente censito il 2026-11-03**: Enter in composizione è già
  ignorato, ma `setSearchDraft` in `use-list-report.ts` fa partire il commit ritardato di 300 ms a
  ogni `change`, quindi una pausa sulla scelta del candidato conferma la ricerca col testo
  provvisorio, aggiorna URL e righe e poi ripete tutto col testo convertito; nessun ticket aperto).

---

## 2. Architettura proposta

### 2.1 Riferimento architetturale primario

**List Report e Object Page come pattern di composizione enterprise generici** (vedi §0) come
riferimento per composizione e naming di alto livello. Il nuovo design system si presenta, in
parte, come: *"un'implementazione React headless, indipendente e open-source, dei pattern List
Report / Object Page — per chi vuole quella UX enterprise senza un framework proprietario"*.
Nessun asset, CSS o codice di terzi viene toccato: solo il pattern di interazione generico.

### 2.2 Stack tecnico

- **React 18/19 + TypeScript**, pattern **headless** (logica/stato separata dallo stile) già
  validato con successo in react-virtual-tree-view e react-virtual-dnd-table.
- **Build**: tsup (consistente con i progetti esistenti di Daniele).
- **Storybook** come ambiente di sviluppo/demo/documentazione, con **visual regression** attiva fin
  dal primo componente (non aggiunta a posteriori come scaffold morto, lezione imparata dal
  materiale: una visual-regression esistente solo come script orfano non protegge nulla).
- **Vitest** per gli unit test, **Playwright** per gli e2e (incluso test touch reali via CDP dove
  serve, pattern già usato su react-virtual-tree-view).
- **Zod** per gli schema (riuso diretto del pattern "contract check" FE↔dati).
- **TanStack Query** per il data-layer (cache, invalidazione, aggiornamento in-place).
- **Changesets** per versionamento/release, come già fatto sugli altri pacchetti pubblici.

### 2.3 Struttura monorepo

```
packages/
  core/        # MIT, gratuito, su npm pubblico
  pro/         # licenza commerciale, pacchetto separato
  docs/        # Storybook pubblico (core) + area Pro separata/gated
```

**Core (MIT)**: primitivi di base (§1.7), Dialog/Select/Tooltip/Sheet "semplici" (§1.6 senza le
estensioni avanzate), List Report semplice (client-side, senza virtualizzazione pesante), Object
Page semplice (sezioni + save-bar, senza Change Summary avanzato), Message Strip, Description List,
data-layer di base (schema+hook).

**Pro (a pagamento)**: tutto ciò che in §3 risulta "moat reale" — virtualizzazione su List
Report/Object Page per dataset grandi, Picker/Assignment dialog con griglia incorporata, Change
Summary avanzato con diff intelligente, BulkActionsBar con varianti avanzate, dirty-tracking
robusto su form complessi con idratazione asincrona, soft-delete/archivia-ripristina come pattern
pronto all'uso (non solo la UI del singolo componente, ma l'intero flusso), eventualmente una
variante avanzata basata sui pacchetti già esistenti react-virtual-tree-view/react-virtual-dnd-table
(vedi §4).

### 2.4 Licensing e distribuzione Pro

Tre opzioni, da decidere (vedi §5):

1. **npm org privata a pagamento** (es. tramite GitHub Packages o npm con accesso a pagamento):
   semplice da implementare, ma lega l'accesso all'account npm del cliente — serve gestione
   manuale degli accessi/revoche.
2. **Licenza con chiave (license key) verificata a build-time**: il pacchetto Pro è pubblicabile
   anche su registry pubblico ma richiede una chiave valida per buildare/avviare (controllata
   contro un piccolo servizio di licenze, anche minimale). Più lavoro iniziale, ma modello più
   standard per "component library Pro" (è quello che usano la maggior parte dei design system Pro
   del mercato React, es. librerie di tabelle/admin commerciali).
3. **Pacchetto Pro come codice "source-available" scaricabile dopo pagamento** (no npm pubblico,
   distribuzione via link/zip + repo privato con accesso concesso all'acquisto): minimo sforzo
   infrastrutturale, meno professionale, meno adatto ad aggiornamenti continui.

**Raccomandazione preliminare**: iniziare con l'opzione 1 (npm org privata) per l'MVP — è lo sforzo
minimo per validare che qualcuno sia disposto a pagare, prima di investire in un sistema di
licensing più sofisticato (opzione 2) quando i volumi lo giustificano.

---

## 3. Segmentazione Free vs Pro

Criterio esplicito: **in Pro se ha un moat tecnico reale e/o un costo di ingegnerizzazione alto
(difficile da clonare con un prompt in un weekend)**; **in Free se è relativamente standard** (serve
per adozione/community, bassa difficoltà o ampiamente disponibile in altre librerie open source).

| Componente/pattern | Free | Pro | Motivazione |
|---|---|---|---|
| Typography, Button, Icon scale, Message Strip | ✅ | | Standard, bassa difficoltà, serve per adozione |
| Input/Select/Combobox "semplici" (sync, no async search) | ✅ | | Pattern comune, ampiamente disponibile altrove |
| Dialog/Sheet/Tooltip base (size, focus-trap base) | ✅ | | Radix-equivalenti esistono già gratis altrove: il valore è nell'integrazione coerente, non nel primitivo isolato |
| Description List (inline/stacked) | ✅ | | Difficoltà media, ma componente "vetrina" per mostrare la qualità del DS e attirare adozione |
| List Report client-side semplice (no virtualizzazione) | ✅ | | Buona come showcase, ma senza il pezzo difficile |
| Object Page base (sezioni + save-bar semplice) | ✅ | | Idem: mostra il pattern, senza il dirty-tracking avanzato |
| Primitivi di completamento (§1.12): Toast singolo, Tabs, Accordion, Avatar, Breadcrumb, Pagination standalone, Progress bar, Skeleton, Spinner, Checkbox, RadioGroup, Switch, Card, Divider, Menu/Dropdown, Calendar, DatePicker | ✅ | | Attesi in qualunque DS, ampiamente disponibili altrove: servono per l'adozione (decisione di Daniele del 2026-11-03) |
| Toast avanzato (coda multi-toast, pausa su hover/focus, persistenza, analytics) | | ✅ (nota futura, non pianificato) | Stesso schema Free base / Pro avanzato di List Report e Object Page; vedi §1.12 |
| **List Report virtualizzata per dataset grandi** | | ✅ | Virtualizzazione + scroll/selection/drag coerenti è lavoro ingegneristico alto, moat reale (già provato su react-virtual-tree-view/dnd-table) |
| **Dirty-tracking robusto con idratazione asincrona** (niente "eco" su valore esterno, niente falsi dirty) | | ✅ | Insidia sottile e ricorrente (§1.4), risolverla bene è anni di esperienza concentrati, difficile da replicare al volo |
| **Change Summary avanzato** (diff per-campo affidabile su dati annidati/array) | | ✅ | Logica non banale, alto valore percepito per i clienti enterprise |
| **Picker/Assignment dialog con griglia incorporata** | | ✅ | Combina tutte le insidie di overlay+grid, componente notoriamente fragile (§1.8) |
| **BulkActionsBar avanzata** (varianti embedded/static, gestione focus su azzeramento selezione coerente con Escape multi-livello) | | ✅ | Gestione eventi/focus cross-livello non banale |
| **Soft-delete/Archivia-Ripristina come pattern pronto** (non solo UI, ma hook+stato+contratto dati) | | ✅ | È un intero flusso applicativo, non un widget — alto valore, alta difficoltà |
| **Combobox con ricerca asincrona production-grade** (race condition su digitazione rapida, valore fuori catalogo) | | ✅ | Bug di classe sottile già documentati, moat da esperienza diretta |
| Governance CI (budget bundle, visual regression, changeset gate) | ✅ (template) | ✅ (gestito/pre-configurato) | Il template è utile gratis per adozione; una versione "pronta all'uso e mantenuta" è un servizio Pro |

---

## 4. Riuso con i progetti esistenti di Daniele

- **vistato**: oggi usa tabelle/form "custom" per l'approvazione fatture; la UI di approvazione è
  concettualmente un **Object Page** (fattura = oggetto, sezioni = dati fattura/fornitore/storico
  approvazioni, azioni = approva/rifiuta) con una **List Report** per la coda fatture da approvare.
  Migrarlo sul nuovo DS non è solo riuso interno: è il **primo banco di prova reale** per il DS (se
  non regge vistato, non regge niente).
- **react-virtual-tree-view / react-virtual-dnd-table**: candidati naturali come **fondamenta del
  livello Pro "tabelle avanzate"** (virtualizzazione + drag&drop già maturi, testati, con
  community/traction iniziale) invece di restare pacchetti satellite separati. Da **discutere, non
  deciso**: tenerli standalone (continuano ad avere vita propria, citabili come "usati anche dentro
  il DS Pro") vs. assorbirli come dipendenza interna del pacchetto Pro. La prima opzione preserva
  la loro visibilità/community già costruita; la seconda semplifica la manutenzione. Probabilmente
  la risposta giusta è "entrambi": restano pacchetti pubblici standalone, e il DS Pro li usa come
  dipendenza (stesso principio delle librerie headless che compongono pezzi riusabili).
- **agent-scout / sniper-trading-bot**: hanno bisogno di dashboard interne (liste di lead/trade,
  pannelli di dettaglio) — buon secondo/terzo banco di prova per il DS Free (lista + preview, senza
  bisogno delle feature Pro), utile per validare che il Free regga da solo su casi reali prima di
  spingere sul Pro.

---

## 5. Rischi e domande aperte per Daniele

1. **Nome del progetto/pacchetto**: deciso, `react-object-page` (coerente col naming `react-virtual-*`
   già usato da Daniele).
2. **Mecanismo di licensing Pro**: npm org privata (minimo sforzo, meno standard) vs license-key
   (più standard di mercato, più sforzo iniziale) vs source-available a pagamento. Raccomandazione
   preliminare in §2.4: iniziare semplice (npm org privata), evolvere se c'è trazione.
3. **Positioning: deciso neutro, nessun riferimento a prodotti/marchi terzi** (2026-10-30, revisione
   della scelta iniziale). Il progetto si presenta solo come implementazione React headless e
   indipendente di pattern UI enterprise generici (List Report, Object Page), senza nominare né
   evocare alcun prodotto commerciale specifico — né nel nome, né nel README, né nella
   documentazione pubblica. Motivo: evitare qualunque superficie che possa essere letta come un
   collegamento con l'esperienza lavorativa pregressa di Daniele, al di là di quanto già
   strettamente necessario a descrivere pattern UI generici e di pubblico dominio.
4. **Abbonamento ricorrente vs licenza perpetua per il Pro**: coerente con l'indicazione "sempre
   nell'ottica di monetizzare" di Daniele, un **abbonamento ricorrente per-seat o per-progetto**
   (tipico di questo mercato: molte "admin template"/"component Pro" commerciali React vendono a
   licenza perpetua per progetto con upgrade opzionali — ma un abbonamento con aggiornamenti
   continui + supporto si allinea meglio alla richiesta esplicita di reddito ricorrente, ed è anche
   il modello già scelto per l'altro filone di monetizzazione in corso, l'add-on Fatture in Cloud).
   Da decidere con Daniele.
5. **Target di clienti Pro**: freelance/piccoli team React che costruiscono backoffice/admin
   enterprise (stesso target implicito dei competitor noti in questo spazio: librerie di
   admin-template/dashboard Pro React). Da validare se è lo stesso target o diverso da quello della
   fascia Free (probabile: Free attira adozione/community ampia, Pro converte chi ha davvero un
   backoffice complesso da costruire in produzione).
6. **Rischio di diluizione dell'attenzione**: Daniele ha già 2 pacchetti pubblici attivi
   (react-virtual-tree-view, react-virtual-dnd-table) più 3 prodotti in corso (vistato, agent-scout,
   sniper-trading-bot) più il filone Fatture in Cloud. Questo è un **quinto/sesto fronte**. Va
   deciso consapevolmente se ha priorità più alta del completamento di vistato/FiC o se procede in
   parallelo a ritmo più lento (sezione MVP sotto assume ritmo "lento ma con moat", non uno sprint).
7. **Valori assenti tra form e Change Summary** (aperta il 2026-11-03, vedi §1.13.1).
   (a) **Decisa il 2026-11-03, risolta da #202.** `isDirty` (core) resta rigoroso e invariato
   (riflette il payload reale; nessuna modifica al Free); è il Change Summary (Pro) ad allinearsi al
   Livello 1, distinguendo `''`/`null`/`undefined`/chiave mancante come `isDirty`. "Dirty ma nessuna
   modifica nel riepilogo" resta possibile solo per il riordino dichiarato con `idKey`. Un'eventuale opzione di equivalenza
   dei valori assenti resta materia del futuro **dirty-tracking robusto Pro** (§3), da applicare a
   form e riepilogo insieme, mai a uno solo dei due.
   (b) Valore vuoto emesso dai controlli di selezione: `undefined` come Select/Combobox oggi
   (raccomandato: coerenza, con mappatura a `null` nello schema se il backend la vuole) oppure
   `null` come proposto dal default di #195. Da decidere prima dello sviluppo di #195.

---

## 6. Proposta di primo MVP

Obiettivo: arrivare rapidamente a qualcosa che (a) Daniele può già usare lui stesso su vistato, (b)
è presentabile pubblicamente come design system React headless, indipendente e open-source, (c) ha
già un primo componente Pro vendibile per validare la domanda, senza costruire tutto il resto prima.

**Ordine proposto:**

1. **Free — fondamenta**: Typography, Button, Icon scale, Message Strip, Input/Select "semplici",
   Dialog/Sheet/Tooltip base. (Sono gli stessi mattoni di qualunque DS: necessari ma a basso
   differenziale — farli bene e in fretta, non sovra-investire.)
2. **Free — List Report semplice** (client-side, filtri a pillole, colonne configurabili,
   empty/loading stabili) + **Object Page semplice** (sezioni ancorate + save-bar base). Questo è
   il primo momento in cui il posizionamento del progetto diventa visibile e dimostrabile in
   Storybook — vale la pena investire qui su qualità visiva e demo, è il "biglietto da visita".
3. **Validazione su vistato**: migrare la coda fatture di vistato su List Report + Object Page
   Free. Se emergono limiti reali (non estetici) qui, è il segnale più onesto di cosa manca prima
   di vendere qualcosa.
4. **Primo componente Pro**: **dirty-tracking robusto + Change Summary** sull'Object Page (§1.4,
   §3) — è il pattern con l'insidia più sottile e documentata in questo spec (vedi §1.4), quindi il
   moat è reale e verificabile, e si collega direttamente al dolore di qualunque editor di record
   enterprise (non solo il caso di Daniele). Secondo componente Pro a ruota:
   **List Report virtualizzata** per dataset grandi, riusando direttamente
   react-virtual-tree-view/react-virtual-dnd-table come motore (vedi §4) — tempo di sviluppo basso
   perché il grosso del lavoro è già fatto e pubblico.
5. **Primo canale di vendita**: npm org privata (§2.4 opzione 1) per il pacchetto Pro, pagina di
   landing con demo Storybook pubblica del Free + demo "a tempo/watermark" del Pro, prezzo iniziale
   semplice (per-progetto, non per-seat, per abbassare la frizione del primo acquisto).

**Non fare subito** (rischio di sovra-ingegnerizzare prima di validare): sistema di license-key,
soft-delete come pattern Pro completo, Picker/Assignment dialog (è notoriamente il componente più
fragile di questa classe, §1.8 — rifarlo bene richiede aver già consolidato Dialog+Select+DataGrid,
altrimenti si eredita la stessa classe di bug fin dall'inizio).

---

## 7. Change Summary Pro — decisioni di API (brainstorming con Daniele, 2026-11-03)

Primo componente Pro del progetto (§6 punto 4). Non esiste ancora nulla: `useObjectPageForm` (Free)
espone già `values`/`baseline`/`isDirty` (confronto strutturale profondo), ma nessun diff per campo.
Il Change Summary consuma `values`/`baseline` come un hook separato — **nessuna modifica all'API
Free esistente**.

### Decisioni prese (approvate da Daniele, 2026-11-03)

- **Due ticket separati per l'implementazione**: uno per il motore/hook `useChangeSummary` (unit
  test esaustivi su edge-case e regole di uguaglianza — i tre stati "nessun valore", identity degli
  array, riordino senza modifiche, algoritmo etichette), uno separato per il componente visivo
  `<ChangeSummary />`. Non un solo ticket monolitico: il motore è il moat tecnico e va potuto
  validare/testare a fondo da solo, prima e indipendentemente dalla presentazione.
- **Il `renderValue` di default gestisce bene booleani e date**, non solo stringhe/numeri grezzi:
  un booleano non deve apparire come "true"/"false" letterale, una data non come l'output grezzo di
  `Date.prototype.toString()`. Dettaglio implementativo (formato esatto, locale) da ticket, ma il
  criterio di accettazione del componente lo richiede esplicitamente fin dal primo giro, non come
  rifinitura successiva.
- **Diff su array: per-elemento, con `idKey` dichiarato dal consumer** per ogni campo array che lo
  richiede (es. righe fattura identificate da `id`). Un array senza `idKey` dichiarato fa diff "a
  blocco" (vecchio vs nuovo intero), non per-elemento — degrado esplicito, non un errore silenzioso.
- **Etichette: inferenza automatica dal path** (`amount` → "Amount", camelCase/snake_case spezzato e
  capitalizzato), **con mappa di override** per i path dove l'inferenza non basta (es. acronimi,
  terminologia di dominio). Nessuna dipendenza dal lavoro Zod non ancora pianificato.
- **Forma dell'API: hook + componente.** `useChangeSummary` è il motore (il vero moat: diff
  strutturato, gestisce annidamento/array/identity), `ChangeSummary` è un componente opinionato che
  lo rende leggibile di default ma resta sostituibile (stesso principio di Field/FieldMessage: motore
  riusabile + presentazione pronta).
- **Sequenza: si parte subito**, il blocco Zod/uniformità validazione (confermato 2026-11-01, mai
  pianificato) resta il prossimo dopo questo, non un prerequisito.

### Schizzo dell'API (da rifinire in ticket, non vincolante sui nomi)

```ts
interface ChangeSummaryOptions<Values extends object> {
  values: Values;
  baseline: Values;
  /** Per-path array identity key, e.g. { 'lineItems': 'id' }. An array with no entry here diffs as
   *  a whole block (old vs new), not per-item — explicit degrade, not a silent one. */
  arrayIdKeys?: Record<string, string>;
  /** Override the auto-inferred label for specific paths, e.g. { 'supplier.vatNumber': 'VAT number' }. */
  labels?: Record<string, string>;
  /** Custom equality per path/value; falls back to the same deep structural comparison as `isDirty`. */
  isEqual?: (a: unknown, b: unknown, path: string) => boolean;
}

interface ChangeEntry {
  path: string;   // e.g. 'lineItems[2].price'
  label: string;  // auto-inferred or overridden, e.g. 'Line Items > Item 3 > Price'
  kind: 'added' | 'removed' | 'changed';
  before: unknown; // undefined when kind === 'added'
  after: unknown;  // undefined when kind === 'removed'
  beforeMissing: boolean; // no own key in the baseline, or no counterpart for an array item
  afterMissing: boolean;  // same, for values
}

function useChangeSummary<Values extends object>(
  options: ChangeSummaryOptions<Values>,
): { entries: ChangeEntry[]; isEmpty: boolean };

function ChangeSummary(props: {
  entries: ChangeEntry[];
  /** Per-value formatting hook (currency, custom domain types...); overrides the built-in default,
   *  which already renders booleans and dates sensibly (not `String(value)`), not just strings/numbers. */
  renderValue?: (value: unknown, entry: ChangeEntry) => ReactNode;
  emptyLabel?: string;
}): JSX.Element;
```

### Rischi tecnici noti da affrontare nei ticket (non insidie generiche, specifiche di questo componente)

- **Tre stati di "nessun valore" distinti** (stringa vuota vs `undefined` vs `null`, vincolo già
  fissato in §1.4): #174 li aveva collassati nelle classi Assente/Vuoto (assente ↔ `''` senza
  entry); **la decisione del 2026-11-03 lo inverte** e #202 li rende distinti come in `isDirty`
  (Livello 1, §1.13.1), con `beforeMissing`/`afterMissing` su `ChangeEntry` e resa distinta nel
  componente. La regola canonica è in §1.13.1.
- **Identity degli array**: un `id` presente nella baseline ma non nei `values` → `removed`; un `id`
  nuovo nei `values` → `added`; stesso `id` con contenuto diverso → `changed`, con un
  `ChangeEntry` per ciascun campo del singolo elemento cambiato (non un unico entry "la riga N è
  cambiata"). **Riordinare un array senza cambiarne il contenuto non deve generare nessun
  `ChangeEntry`** — è l'intero motivo per preferire `idKey` al diff posizionale, va testato
  esplicitamente (stesso identity set, ordine diverso → `entries` vuoto).
- **Algoritmo di inferenza etichette**: va fissato e testato in modo deterministico (split su
  confini camelCase/`_`/`-`, capitalizzazione, segmenti di array resi come "Item N" o simile) prima
  di scrivere il componente, non improvvisato caso per caso.
- **Performance**: il diff va ricalcolato con `useMemo` tenuto stabile su `values`/`baseline` per
  identità (stesso pattern già in uso per `isDirty` in `useObjectPageForm`), non ricalcolato ad ogni
  render per valore.
