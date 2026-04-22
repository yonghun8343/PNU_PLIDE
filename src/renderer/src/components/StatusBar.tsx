import { useMemo } from 'react';
import type { AppVersionInfo, SysMetrics } from '@shared/types';

/**
 * 하단 상태바 — 버전 · OS · CPU 사용량 · MEM 사용량.
 *
 * CPU/MEM 값은 main process 가 1Hz 로 push 하며 (SYS_METRICS),
 * 첫 tick 도착 전까지는 placeholder 를 표시한다.
 */
export interface StatusBarProps {
  version: AppVersionInfo | null;
  metrics: SysMetrics | null;
}

function prettyOs(platform: NodeJS.Platform | undefined, arch: string | undefined): string {
  if (!platform) return '—';
  const name =
    platform === 'darwin'
      ? 'macOS'
      : platform === 'win32'
        ? 'Windows'
        : platform === 'linux'
          ? 'Linux'
          : platform;
  return arch ? `${name} ${arch}` : name;
}

function fmtGiB(bytes: number): string {
  return (bytes / (1024 * 1024 * 1024)).toFixed(1);
}

export function StatusBar({ version, metrics }: StatusBarProps): JSX.Element {
  const osLabel = useMemo(
    () => prettyOs(version?.platform, version?.arch),
    [version?.platform, version?.arch],
  );

  const cpuLabel = metrics ? `${metrics.cpuPercent.toFixed(1)}%` : '—';
  const memLabel = metrics
    ? `${metrics.memPercent.toFixed(1)}% (${fmtGiB(
        (metrics.totalMemBytes * metrics.memPercent) / 100,
      )} / ${fmtGiB(metrics.totalMemBytes)} GiB)`
    : '—';

  return (
    <span className="status-bar">
      <span className="status-bar__item" title="애플리케이션 버전">
        v{version?.appVersion ?? '…'}
      </span>
      <span className="status-bar__sep">·</span>
      <span className="status-bar__item" title="운영체제 / 아키텍처">
        {osLabel}
      </span>
      <span className="status-bar__sep">·</span>
      <span className="status-bar__item" title="IDE 프로세스 CPU 사용률 (코어 정규화)">
        CPU {cpuLabel}
      </span>
      <span className="status-bar__sep">·</span>
      <span className="status-bar__item" title="시스템 메모리 사용률">
        MEM {memLabel}
      </span>
    </span>
  );
}
