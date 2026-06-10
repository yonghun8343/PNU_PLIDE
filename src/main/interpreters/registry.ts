/**
 * InterpreterId → Adapter dispatch.
 */
import type { InterpreterId } from '@shared/types';
import type { InterpreterAdapter } from './types';
import { MowkowAdapter } from './mowkow';
import { KobasicAdapter } from './kobasic';
import { KPrologAdapter } from './kprolog';

const REGISTRY: Partial<Record<InterpreterId, InterpreterAdapter>> = {
  mowkow: MowkowAdapter,
  kobasic: KobasicAdapter,
  kprolog: KPrologAdapter,
};

export function getAdapter(id: InterpreterId): InterpreterAdapter {
  const a = REGISTRY[id];
  if (!a) throw new Error(`Unknown interpreter id: ${id}`);
  return a;
}
