// ESM consumer fixture: resolves the *built* package through its `exports` map.
import { composeRefs } from '@formrail/core';
import * as ns from '@formrail/core';

const ref = { current: null };
const node = { id: 'node' };
const composed = composeRefs(ref);
composed(node);
if (ref.current !== node) throw new Error('composeRefs did not assign the node');
composed(null);
if (ref.current !== null) throw new Error('composeRefs did not clear the ref');

if (ns.cn('px-2', 'px-4') !== 'px-4') throw new Error('cn did not merge conflicting classes');

console.log(JSON.stringify(Object.keys(ns)));
