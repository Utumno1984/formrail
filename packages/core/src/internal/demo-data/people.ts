// Personal names of the demo universe, by language area, written in Latin script and given-name-first
// (the English convention, also for Japanese names). 20 x 20 per area: every pair is a distinct person
// name, which the generators use to keep e-mail addresses unique. The surnames of the legacy invoice
// fixture are deliberately absent (a test enforces it).
import type { DemoLanguageArea } from './geo';
import { toAsciiSlug } from './text';

interface NamePool {
  readonly first: readonly string[];
  readonly last: readonly string[];
}

const POOLS: Readonly<Record<DemoLanguageArea, NamePool>> = {
  en: {
    first: ['Olivia', 'James', 'Sophie', 'Daniel', 'Emily', 'Michael', 'Hannah', 'Ethan', 'Grace', 'Ryan', 'Chloe', 'Nathan', 'Megan', 'Owen', 'Abigail', 'Lucas', 'Charlotte', 'Aaron', 'Isla', 'Patrick'],
    last: ['Thompson', 'Walker', 'Bennett', 'Hughes', 'Carter', 'Mitchell', 'Reed', 'Foster', 'Hayes', 'Brooks', 'Murphy', "O'Connor", 'Fletcher', 'Gallagher', 'Sullivan', 'Holloway', 'Pearson', 'Whitaker', 'Donnelly', 'Ramsey'],
  },
  de: {
    first: ['Jürgen', 'Anna', 'Lukas', 'Lena', 'Matthias', 'Katrin', 'Florian', 'Sabine', 'Tobias', 'Jana', 'Stefan', 'Miriam', 'Andreas', 'Birgit', 'Felix', 'Theresa', 'Moritz', 'Ute', 'Sebastian', 'Sören'],
    last: ['Müller', 'Schröder', 'Weiß', 'Köhler', 'Hoffmann', 'Wagner', 'Becker', 'Schäfer', 'Krüger', 'Neumann', 'Zimmermann', 'Hartmann', 'Brandt', 'Vogel', 'Lehmann', 'Engel', 'Förster', 'Kaiser', 'Gruber', 'Steiner'],
  },
  nl: {
    first: ['Daan', 'Sanne', 'Bram', 'Femke', 'Thijs', 'Lotte', 'Jeroen', 'Anouk', 'Ruben', 'Marloes', 'Sander', 'Eline', 'Joost', 'Ilse', 'Wouter', 'Noor', 'Pieter', 'Esmée', 'Koen', 'Fleur'],
    last: ['de Vries', 'van Dijk', 'Bakker', 'Visser', 'Smit', 'Meijer', 'de Boer', 'Mulder', 'van den Berg', 'Dekker', 'Brouwer', 'de Graaf', 'Vermeulen', 'Peeters', 'Janssens', 'van Leeuwen', 'Kuipers', 'Verhoeven', 'Claes', 'Hendriks'],
  },
  fr: {
    first: ['Hélène', 'Jérôme', 'Camille', 'Julien', 'Élodie', 'Benoît', 'Margaux', 'Antoine', 'Céline', 'Mathieu', 'Chloé', 'Théo', 'Amélie', 'Nicolas', 'Inès', 'Rémi', 'Claire', 'Hugo', 'Léa', 'François'],
    last: ['Lefèvre', 'Martin', 'Bernard', 'Dubois', 'Moreau', 'Laurent', 'Girard', 'Fontaine', 'Rousseau', 'Mercier', 'Blanchard', 'Chevalier', 'Gauthier', 'Perrin', 'Lemaître', 'Roux', 'Fournier', 'Bonnet', 'Lacroix', 'Masson'],
  },
  es: {
    first: ['José', 'Lucía', 'Martín', 'Carmen', 'Javier', 'Elena', 'Álvaro', 'Paula', 'Sergio', 'Marta', 'Diego', 'Nuria', 'Pablo', 'Irene', 'Andrés', 'Raquel', 'Iñigo', 'Sofía', 'Rubén', 'Begoña'],
    last: ['García', 'Núñez', 'Peña', 'Ibáñez', 'Fernández', 'López', 'Martínez', 'Sánchez', 'Gómez', 'Ortega', 'Delgado', 'Castro', 'Navarro', 'Molina', 'Herrera', 'Vázquez', 'Ramos', 'Muñoz', 'Serrano', 'Domínguez'],
  },
  it: {
    first: ['Giulia', 'Lorenzo', 'Chiara', 'Matteo', 'Francesca', 'Davide', 'Martina', 'Simone', 'Elisa', 'Andrea', 'Sara', 'Federico', 'Valentina', 'Niccolò', 'Alessia', 'Tommaso', 'Ilaria', 'Riccardo', 'Beatrice', 'Emanuele'],
    last: ['Bellini', 'Moretti', 'Conti', 'Fontana', 'Caruso', 'Mancini', 'Lombardi', 'Barbieri', 'Galli', 'Leone', 'Costa', 'Rinaldi', 'Gatti', 'Pellegrini', 'Testa', 'Marchetti', 'Ferri', 'Cattaneo', 'Sala', 'Villa'],
  },
  nordic: {
    first: ['Bjørn', 'Åsa', 'Søren', 'Ingrid', 'Mikkel', 'Linnéa', 'Erik', 'Freja', 'Henrik', 'Sigrid', 'Anders', 'Maja', 'Lars', 'Astrid', 'Mads', 'Kristin', 'Johan', 'Ebba', 'Rasmus', 'Tove'],
    last: ['Lindström', 'Jørgensen', 'Ødegaard', 'Andersson', 'Nyberg', 'Halvorsen', 'Sjöberg', 'Christensen', 'Bergqvist', 'Haugen', 'Mortensen', 'Engström', 'Dahl', 'Lund', 'Åberg', 'Nilsen', 'Holm', 'Strand', 'Kjær', 'Ekström'],
  },
  pl: {
    first: ['Łukasz', 'Małgorzata', 'Piotr', 'Agnieszka', 'Tomasz', 'Katarzyna', 'Michał', 'Joanna', 'Paweł', 'Magdalena', 'Krzysztof', 'Ewa', 'Marcin', 'Dorota', 'Grzegorz', 'Monika', 'Wojciech', 'Zofia', 'Jakub', 'Aleksandra'],
    last: ['Wójcik', 'Zieliński', 'Kowalczyk', 'Nowak', 'Lewandowski', 'Kamiński', 'Szymański', 'Woźniak', 'Dąbrowski', 'Kozłowski', 'Jankowski', 'Mazur', 'Krawczyk', 'Piotrowski', 'Grabowski', 'Pawłowski', 'Michalski', 'Król', 'Wieczorek', 'Jabłoński'],
  },
  ja: {
    first: ['Haruto', 'Yui', 'Sota', 'Aoi', 'Ren', 'Hina', 'Kenji', 'Emi', 'Takumi', 'Mei', 'Daiki', 'Sakura', 'Yuto', 'Rina', 'Kaito', 'Naomi', 'Hiroshi', 'Ayaka', 'Shota', 'Misaki'],
    last: ['Sato', 'Suzuki', 'Takahashi', 'Tanaka', 'Watanabe', 'Ito', 'Yamamoto', 'Nakamura', 'Kobayashi', 'Kato', 'Yoshida', 'Yamada', 'Sasaki', 'Matsumoto', 'Inoue', 'Kimura', 'Hayashi', 'Shimizu', 'Mori', 'Ikeda'],
  },
};

/** A personal name with its ASCII e-mail local part (`jurgen.muller`). */
export interface PersonName {
  readonly firstName: string;
  readonly lastName: string;
  readonly fullName: string;
  readonly emailLocal: string;
}

interface PreparedPool {
  readonly first: readonly string[];
  readonly last: readonly string[];
  readonly firstSlug: readonly string[];
  readonly lastSlug: readonly string[];
}

const prepare = (pool: NamePool): PreparedPool => ({
  first: pool.first,
  last: pool.last,
  firstSlug: pool.first.map((name) => toAsciiSlug(name, '')),
  lastSlug: pool.last.map((name) => toAsciiSlug(name, '')),
});

const PREPARED: Readonly<Record<DemoLanguageArea, PreparedPool>> = {
  en: prepare(POOLS.en),
  de: prepare(POOLS.de),
  nl: prepare(POOLS.nl),
  fr: prepare(POOLS.fr),
  es: prepare(POOLS.es),
  it: prepare(POOLS.it),
  nordic: prepare(POOLS.nordic),
  pl: prepare(POOLS.pl),
  ja: prepare(POOLS.ja),
};

/** Number of distinct (first, last) pairs of every area. */
export const PERSON_NAME_SLOTS = 400;

/**
 * The person name of slot `slot` (taken modulo {@link PERSON_NAME_SLOTS}) of `area`: distinct slots
 * below the slot count are distinct names, and distinct e-mail local parts.
 */
export function personName(area: DemoLanguageArea, slot: number): PersonName {
  return NAMES[area][slot % PERSON_NAME_SLOTS]!;
}

/** All {@link PERSON_NAME_SLOTS} names of `area`, by slot (resolve once, then index: a hot path). */
export function personNamesOf(area: DemoLanguageArea): readonly PersonName[] {
  return NAMES[area];
}

/** Every name of every area, built once up front (9 x 400) and shared by all rows and contacts. */
const buildNames = (pool: PreparedPool): readonly PersonName[] =>
  Array.from({ length: PERSON_NAME_SLOTS }, (_, s) => {
    const f = s % pool.first.length;
    const l = Math.floor(s / pool.first.length) % pool.last.length;
    return Object.freeze({
      firstName: pool.first[f]!,
      lastName: pool.last[l]!,
      fullName: `${pool.first[f]} ${pool.last[l]}`,
      emailLocal: `${pool.firstSlug[f]}.${pool.lastSlug[l]}`,
    });
  });

const NAMES: Readonly<Record<DemoLanguageArea, readonly PersonName[]>> = {
  en: buildNames(PREPARED.en),
  de: buildNames(PREPARED.de),
  nl: buildNames(PREPARED.nl),
  fr: buildNames(PREPARED.fr),
  es: buildNames(PREPARED.es),
  it: buildNames(PREPARED.it),
  nordic: buildNames(PREPARED.nordic),
  pl: buildNames(PREPARED.pl),
  ja: buildNames(PREPARED.ja),
};

/** Every given name and surname, for tests (non-ASCII coverage, denylists). */
export const ALL_PERSON_NAMES: readonly string[] = Object.values(POOLS).flatMap((pool) => [...pool.first, ...pool.last]);
