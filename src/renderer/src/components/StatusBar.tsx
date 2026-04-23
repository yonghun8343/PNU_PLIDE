import { useMemo, type JSX } from 'react';
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

/**
 * 바이트 값을 IEC binary 단위로 포맷.
 *   - 1 GiB 미만이면 MiB 로, 이상이면 GiB 로.
 *   - 상태바 공간이 좁으므로 소수점 1자리만.
 */
function fmtBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MiB';
  const gib = bytes / (1024 * 1024 * 1024);
  if (gib >= 1) return `${gib.toFixed(1)} GiB`;
  const mib = bytes / (1024 * 1024);
  return `${mib.toFixed(0)} MiB`;
}

export function StatusBar({ version, metrics }: StatusBarProps): JSX.Element {
  const osLabel = useMemo(
    () => prettyOs(version?.platform, version?.arch),
    [version?.platform, version?.arch],
  );

  const cpuLabel = metrics ? `${metrics.cpuPercent.toFixed(1)}%` : '—';
  /**
   * MEM 표기는 **IDE 프로세스 RSS 합** 을 기준으로 표시한다.
   *   - `os.freemem()` 은 플랫폼별 의미가 달라(특히 macOS 는 cached 를 free 로 치지 않음)
   *     시스템 비율(%) 로는 "내 IDE 가 메모리를 얼마나 쓰는지" 를 설명하지 못한다.
   *   - 따라서 `app.getAppMetrics()` workingSetSize 합(= processRssBytes) 을
   *     시스템 총 메모리(totalMemBytes) 대비 비율과 절대값으로 함께 표기.
   *   - 표기 예: "412 MiB / 64.0 GiB (0.6%)"
   */
  const memLabel = metrics
    ? (() => {
        const rss = metrics.processRssBytes;
        const total = metrics.totalMemBytes;
        const pct = total > 0 ? (rss / total) * 100 : 0;
        return `${fmtBytes(rss)} / ${fmtBytes(total)} (${pct.toFixed(1)}%)`;
      })()
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
      <span
        className="status-bar__item"
        title="IDE 프로세스 메모리(RSS) / 시스템 총 메모리"
      >
        MEM {memLabel}
      </span>
    </span>
  );
}
