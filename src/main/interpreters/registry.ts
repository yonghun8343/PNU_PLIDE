/**
 * InterpreterId → Adapter dispatch.
 *
 * kobasic 은 windows.h 호환 이슈가 해결될 때까지 REGISTRY 에서 제외.
 * Adapter 소스(`./kobasic.ts`)는 재활성화에 대비해 import 상태로 보존하되,
 * 런타임 dispatch 에서는 의도적으로 배제한다.
 */
import type { InterpreterId } from '@shared/types';
import type { InterpreterAdapter } from './types';
import { MowkowAdapter } from './mowkow';
// 의도적으로 유지 (dormant): import 만 해두고 REGISTRY 에는 등록하지 않음.
import { KobasicAdapter as _KobasicAdapter } from './kobasic';
import { KPrologAdapter } from './kprolog';

void _KobasicAdapter; // 'unused import' 경고 방지 + dormant 상태 명시

const REGISTRY: Partial<Record<InterpreterId, InterpreterAdapter>> = {
  mowkow: MowkowAdapter,
  kprolog: KPrologAdapter,
};

export function getAdapter(id: InterpreterId): InterpreterAdapter {
  const a = REGISTRY[id];
  if (!a) throw new Error(`Unknown or dormant interpreter id: ${id}`);
  return a;
}
