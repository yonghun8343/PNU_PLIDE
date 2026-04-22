/**
 * Interpreter Auto-Updater 다이얼로그.
 *
 * 기동 시 조용히 check 해서 카운트만 표시하고, 사용자가 툴바 "업데이트" 버튼을
 * 눌렀을 때 모달로 상세 화면을 띄운다. 각 인터프리터 별로 개별 apply.
 */
import { useEffect, useRef, useState } from 'react';
import { X, RefreshCw, Download, CheckCircle2, AlertTriangle } from 'lucide-react';
import {
  type InterpreterId,
  type UpdateCheckEntry,
  type UpdateCheckResult,
  type UpdateProgress,
  type UpdateProgressPhase,
  INTERPRETERS,
} from '@shared/types';

interface UpdateDialogProps {
  open: boolean;
  onClose: () => void;
  /** 최초 check 결과 (또는 refresh 결과). null → 초기 로딩 중. */
  check: UpdateCheckResult | null;
  onRefresh: () => Promise<void>;
  onApply: (id: InterpreterId) => Promise<void>;
}

type ApplyState = {
  phase?: UpdateProgressPhase;
  bytes?: number;
  total?: number;
  message?: string;
  error?: string;
};

export function UpdateDialog(props: UpdateDialogProps): JSX.Element | null {
  const { open, onClose, check, onRefresh, onApply } = props;
  const [apply, setApply] = useState<Record<InterpreterId, ApplyState>>(
    {} as Record<InterpreterId, ApplyState>,
  );
  const [refreshing, setRefreshing] = useState(false);
  const applyRef = useRef(apply);
  applyRef.current = apply;

  // progress 이벤트 구독 — open 여부와 무관하게 마운트 동안 항상 수신
  useEffect(() => {
    const off = window.api.updater.onProgress((p: UpdateProgress) => {
      setApply((prev) => ({
        ...prev,
        [p.interpreterId]: {
          phase: p.phase,
          bytes: p.bytes,
          total: p.total,
          message: p.message,
          error: p.phase === 'error' ? p.message : prev[p.interpreterId]?.error,
        },
      }));
    });
    return off;
  }, []);

  if (!open) return null;

  const byId = new Map<InterpreterId, UpdateCheckEntry>();
  for (const e of check?.entries ?? []) byId.set(e.interpreterId, e);

  const handleRefresh = async (): Promise<void> => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  const handleApply = async (id: InterpreterId): Promise<void> => {
    setApply((prev) => ({ ...prev, [id]: { phase: 'fetching-manifest' } }));
    try {
      await onApply(id);
      await onRefresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setApply((prev) => ({ ...prev, [id]: { phase: 'error', error: msg } }));
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="인터프리터 업데이트"
      >
        <div className="modal-header">
          <h2>인터프리터 업데이트</h2>
          <div className="modal-header-actions">
            <button
              className="toolbar-btn"
              onClick={() => void handleRefresh()}
              disabled={refreshing}
              title="다시 확인"
            >
              <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
              <span>다시 확인</span>
            </button>
            <button className="icon-btn" onClick={onClose} title="닫기" aria-label="닫기">
              <X size={16} />
            </button>
          </div>
        </div>

        {check?.error ? (
          <div className="modal-error">
            <AlertTriangle size={14} /> updater 오류: {check.error}
          </div>
        ) : null}

        <div className="modal-body">
          {INTERPRETERS.map((meta) => {
            const entry = byId.get(meta.id);
            const st = apply[meta.id];
            return (
              <UpdateRow
                key={meta.id}
                displayName={meta.displayName}
                entry={entry}
                state={st}
                onApply={() => void handleApply(meta.id)}
              />
            );
          })}
        </div>

        <div className="modal-footer">
          <small className="muted">
            {/*
              보안/운영상 사유로 S3 base URL 은 렌더러에 노출하지 않는다.
              - 상태만 표기: 설정됨 여부 + 최근 확인 시각.
              - 디버그가 필요하면 main 프로세스 로그에서 확인.
            */}
            업데이트 서버: {check?.s3Configured ? '연결됨' : '(미설정)'}
            {check?.fetchedAt ? ` · ${new Date(check.fetchedAt).toLocaleTimeString()}` : ''}
          </small>
        </div>
      </div>
    </div>
  );
}

interface UpdateRowProps {
  displayName: string;
  entry?: UpdateCheckEntry;
  state?: ApplyState;
  onApply: () => void;
}

function UpdateRow({ displayName, entry, state, onApply }: UpdateRowProps): JSX.Element {
  const phase = state?.phase;
  const running =
    phase === 'fetching-manifest' ||
    phase === 'downloading' ||
    phase === 'verifying' ||
    phase === 'extracting' ||
    phase === 'installing';
  const done = phase === 'done';
  const hasErr = phase === 'error' || !!state?.error;

  let status: string;
  if (!entry) {
    status = '상태 확인 전';
  } else if (!entry.latestVersion) {
    status = entry.reason ?? 'manifest 에 등록되지 않음';
  } else if (!entry.artifactAvailable) {
    status = entry.reason ?? '현재 플랫폼용 바이너리 없음';
  } else if (entry.available) {
    status = `업데이트 가능: ${entry.installedVersion ?? '(미설치)'} → ${entry.latestVersion}`;
  } else {
    status = `최신 (${entry.installedVersion ?? '?'})`;
  }

  return (
    <div className="update-row">
      <div className="update-row-head">
        <div className="update-row-title">
          <span>{displayName}</span>
          {done ? (
            <span className="pill pill-ok">
              <CheckCircle2 size={12} /> 설치 완료
            </span>
          ) : null}
        </div>
        <button
          className="toolbar-btn toolbar-btn-accent"
          disabled={!entry?.available || running}
          onClick={onApply}
          title="업데이트 적용"
        >
          <Download size={14} />
          <span>{running ? '진행 중…' : '업데이트'}</span>
        </button>
      </div>

      <div className="update-row-status">{status}</div>

      {running ? (
        <div className="update-progress">
          <div className="update-progress-label">
            {describePhase(phase)}
            {phase === 'downloading' && state?.total
              ? ` · ${formatBytes(state.bytes ?? 0)} / ${formatBytes(state.total)}`
              : ''}
          </div>
          {phase === 'downloading' && state?.total ? (
            <div className="update-progress-bar">
              <div
                className="update-progress-fill"
                style={{
                  width: `${Math.min(100, ((state.bytes ?? 0) / state.total) * 100)}%`,
                }}
              />
            </div>
          ) : (
            <div className="update-progress-bar update-progress-indeterminate">
              <div className="update-progress-fill" />
            </div>
          )}
        </div>
      ) : null}

      {hasErr ? (
        <div className="update-error">
          <AlertTriangle size={12} /> {state?.error ?? state?.message ?? '알 수 없는 오류'}
        </div>
      ) : null}
    </div>
  );
}

function describePhase(p?: UpdateProgressPhase): string {
  switch (p) {
    case 'fetching-manifest':
      return 'manifest 조회 중';
    case 'downloading':
      return '다운로드 중';
    case 'verifying':
      return 'SHA-256 검증 중';
    case 'extracting':
      return '아카이브 해제 중';
    case 'installing':
      return '설치 중';
    case 'done':
      return '완료';
    case 'error':
      return '오류';
    default:
      return '';
  }
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
