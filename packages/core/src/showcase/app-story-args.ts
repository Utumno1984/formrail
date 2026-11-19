// Story-only (#525, not exported by the package): the Storybook args and controls of the app stories
// (`Showcase/Record editing`, the main story and the navigation ones), in a file of their own so the stories file
// reads as the stories.
import { fn } from 'storybook/test';
import { storyControls } from '../internal/story-docs';
import { APP_MODULES, type RecordAppProps } from './RecordApp';

/** The args of the app stories: the props of `RecordApp`. */
export type AppStoryArgs = RecordAppProps;

const DELAY_RANGE = { type: 'range', min: 0, max: 3000, step: 100 } as const;

// Every arg is a knob of the demo: filed under "Story controls", not as a prop of a component.
export const APP_ARGTYPES = storyControls({
  module: {
    control: 'select',
    options: APP_MODULES.map((m) => m.name),
    description:
      'The module shown at the start (the URL wins when it names one, so a link to a customer opens it): `sales-orders` or `customers`. Changing it brings that module back to its list.',
  },
  history: {
    control: 'radio',
    options: ['replace', 'push'],
    description: 'How a list gesture (pill, search, sort) writes the URL. Opening a record or another module is always a `push`.',
  },
  listLoadDelayMs: { control: DELAY_RANGE, description: 'How long a list takes to arrive, every time it mounts (also when coming back to a module).' },
  recordLoadDelayMs: { control: DELAY_RANGE, description: 'How long an order or a customer takes to arrive.' },
  saveDelayMs: {
    control: DELAY_RANGE,
    description:
      'How long a save, a create or a delete takes. Changing module while a save is in flight asks first ("Leave anyway"); the save still completes in its module.',
  },
  saveOutcome: {
    control: 'radio',
    options: ['success', 'error'],
    description: '`error`: a save fails, the form stays dirty with the message in the footer and the store is unchanged.',
  },
  onNavigate: {
    control: false,
    description: 'Called on the navigations the app starts: a link of the "Modules" bar, or the order\'s customer. Never on browser Back/Forward.',
  },
});

export const APP_ARGS = {
  module: 'sales-orders',
  history: 'replace',
  listLoadDelayMs: 300,
  recordLoadDelayMs: 300,
  saveDelayMs: 400,
  saveOutcome: 'success',
  onNavigate: fn(),
} satisfies AppStoryArgs;

/** Deterministic picture of the visual stories: nothing is mid-load when the screenshot is taken. */
export const APP_VISUAL_ARGS = { ...APP_ARGS, listLoadDelayMs: 0, recordLoadDelayMs: 0, saveDelayMs: 0 } satisfies AppStoryArgs;

/** The names of the list's own parameters in the URL, per module (the module's name is the prefix). */
export const APP_LIST_PARAMS = {
  'sales-orders': { filter: 'sales-orders.filter', search: 'sales-orders.q', sort: 'sales-orders.sort' },
  customers: { filter: 'customers.filter', search: 'customers.q', sort: 'customers.sort' },
} as const;
