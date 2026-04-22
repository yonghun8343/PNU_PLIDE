/**
 * 시스템 메트릭 샘플러 — 상태바에 실시간 표시할 값을 1Hz 로 push 한다.
 *
 * 측정 대상:
 *   - cpuPercent      : IDE 전체 프로세스(main/renderer/gpu/utility) CPU 사용률을
 *                       시스템 총 코어 수로 정규화한 값 (0~100).
 *   - memPercent      : 시스템 전체 메모리 사용률. IDE 단독 사용이 아니라
 *                       "현재 기기가 얼마나 타이트한지" 를 보여주기 위함.
 *   - processRssBytes : IDE 프로세스들의 workingSetSize 합 (bytes).
 *   - totalMemBytes   : os.totalmem().
 *
 * 구현 메모:
 *   - Electron 의 `app.getAppMetrics()` 는 `memory.workingSetSize` 을
 *     **KiB 단위**로 반환한다 (Chromium 의 MemoryInfoKB). bytes 환산 필요.
 *   - `cpu.percentCPUUsage` 는 **단일 코어 기준** 퍼센트(0~100) 이므로,
 *     멀티코어 시스템에서 합산 시 100 을 초과할 수 있다.
 *     → `os.cpus().length` 로 나눠 정규화한다.
 *   - 첫 샘플은 "직전 sampling 이후의 평균" 이 없어 0 으로 나올 수 있으나,
 *     1Hz 주기이므로 1 tick 후 정상화된다.
 */
import { app } from 'electron';
import * as os from 'node:os';
import type { SysMetrics } from '@shared/types';

export type SysMetricsListener = (m: SysMetrics) => void;

let timer: NodeJS.Timeout | null = null;

function sampleOnce(): SysMetrics {
  const metrics = app.getAppMetrics();

  let cpuSum = 0;
  let rssSum = 0;
  for (const m of metrics) {
    // cpu.percentCPUUsage 는 Electron 환경에서 항상 존재하지만, 안전을 위해 guard.
    cpuSum += m.cpu?.percentCPUUsage ?? 0;
    // memory.workingSetSize 단위는 KiB.
    rssSum += (m.memory?.workingSetSize ?? 0) * 1024;
  }

  const cpuCount = Math.max(1, os.cpus().length);
  const cpuPercent = Math.max(0, Math.min(100, cpuSum / cpuCount));

  const total = os.totalmem();
  const free = os.freemem();
  const memPercent = total > 0 ? ((total - free) / total) * 100 : 0;

  return {
    cpuPercent: Number(cpuPercent.toFixed(1)),
    memPercent: Number(memPercent.toFixed(1)),
    processRssBytes: rssSum,
    totalMemBytes: total,
    sampledAt: new Date().toISOString(),
  };
}

/**
 * 1Hz 주기로 메트릭을 샘플링해 listener 에 전달한다.
 * 이미 샘플러가 돌고 있다면 no-op.
 */
export function startSysMetricsSampler(listener: SysMetricsListener): void {
  if (timer) return;
  // 첫 tick 은 즉시 한 번 보내서 상태바가 비어보이지 않도록.
  try {
    listener(sampleOnce());
  } catch {
    /* listener 예외는 샘플러를 죽이지 않는다 */
  }
  timer = setInterval(() => {
    try {
      listener(sampleOnce());
    } catch {
      /* ignore */
    }
  }, 1000);
  // Node 가 샘플러 때문에 종료를 미루지 않도록 unref.
  timer.unref?.();
}

export function stopSysMetricsSampler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
