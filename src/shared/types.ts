/**
 * 공통 타입 정의 — main / preload / renderer 에서 모두 import.
 *
 * Phase 0 조사 결과(interpreter/README 및 main entry 분석)를 바탕으로
 * 세 인터프리터(Mowkow / Kobasic / K-Prolog) 공통 추상화를 정의한다.
 *
 * Phase 4-R 리비전:
 *   - 자체 HTTPS 호스팅(centralized manifest) → AWS S3 per-interpreter manifest 로 교체.
 *   - kobasic 은 windows.h 호환 문제가 해결될 때까지 dormant.
 *     타입·adapter·monarch 파일은 보존하되 `INTERPRETERS` 배열과 S3 manifest 에서 제외.
 */

/**
 * 현재 등록된 인터프리터 ID.
 * - `kobasic` 은 windows.h 호환 문제가 해결될 때까지 dormant (S3 manifest 미제공,
 *   `INTERPRETERS` 배열에서도 제외). adapter/monarch 모듈은 `*.ts` 자체로 보존.
 */
export type InterpreterId = 'mowkow' | 'kobasic' | 'kprolog';

export interface InterpreterMeta {
  readonly id: InterpreterId;
  readonly displayName: string;
  readonly fileExtensions: readonly string[];
  readonly replExitHint: string;
  readonly needsPty: boolean;
}

/**
 * UI/Updater 에 노출되는 "활성" 인터프리터 목록.
 * kobasic 은 의도적으로 제외되어 있으며, 재활성화 시 이 배열에만 추가하면 된다.
 */
export const INTERPRETERS: readonly InterpreterMeta[] = [
  {
    id: 'mowkow',
    displayName: '머꼬 (Mowkow)',
    fileExtensions: ['.mk'],
    replExitHint: '빈 줄 입력',
    needsPty: false,
  },
  {
    id: 'kprolog',
    displayName: 'K-Prolog',
    fileExtensions: ['.kpl'],
    replExitHint: "'종료.' 입력",
    needsPty: true,
  },
];

export interface Diagnostic {
  file: string;
  line: number;
  column?: number;
  severity: 'error' | 'warning';
  message: string;
}

export interface AppVersionInfo {
  appVersion: string;
  electronVersion: string;
  nodeVersion: string;
  chromeVersion: string;
  platform: NodeJS.Platform;
  arch: string;
}

/* ============================================================
 * System Metrics — 상태바 실시간 표시용 (1Hz main push)
 * ============================================================ */

export interface SysMetrics {
  /** Electron main process 가 관찰한 IDE 전체 CPU 사용률 (0~100, 소수 1자리) */
  cpuPercent: number;
  /** 시스템 전체 메모리 사용률 (0~100, 소수 1자리) */
  memPercent: number;
  /** IDE 프로세스(main + renderer)의 RSS 합 (bytes) */
  processRssBytes: number;
  /** 시스템 총 메모리 (bytes) */
  totalMemBytes: number;
  /** ISO-8601 */
  sampledAt: string;
}

/* ============================================================
 * Phase 3 — Interpreter Runner 공통 타입
 * ============================================================ */

/** Session 은 한 child_process.spawn() 에 대응. */
export type SessionId = string;

export type RunMode = 'file' | 'repl';

/**
 * BinaryResolver 해석 결과.
 *   - 실행 커맨드 + 인자 + 작업 디렉토리(cwd) + 환경변수(env)
 *   - origin 은 UI 표시용 (`config.json` 우선, 없으면 `default-bin`)
 */
export interface ResolvedBinary {
  command: string;
  args: readonly string[];
  cwd?: string;
  env?: Readonly<Record<string, string>>;
  /** 해석 경로 출처 — UI/로그용 */
  origin: 'config' | 'default-bin' | 'builtin';
}

/** 인터프리터 실행 요청 */
export interface RunFileRequest {
  interpreterId: InterpreterId;
  filePath: string;
}

export interface StartReplRequest {
  interpreterId: InterpreterId;
}

/** 실행 시작 응답 — 세션을 식별하고, 실제 실행될 커맨드를 디버그용으로 동봉 */
export interface StartSessionResult {
  sessionId: SessionId;
  resolved: ResolvedBinary;
  mode: RunMode;
  interpreterId: InterpreterId;
}

/** main → renderer 푸시 payload */
export interface StdoutChunk {
  sessionId: SessionId;
  data: string;
}

export interface StderrChunk {
  sessionId: SessionId;
  data: string;
}

export interface ExitInfo {
  sessionId: SessionId;
  code: number | null;
  /** kill 시그널 또는 spawn 자체 실패 메시지 */
  signal: NodeJS.Signals | null;
  /** 비정상 종료 시 메인 프로세스가 수집한 부가 설명 (예: ENOENT) */
  errorMessage?: string;
}

/** 스폰 전 사전 해석(미리보기) — 에러 메시지는 ResolverError 로 별도 구분 */
export interface ResolveBinaryResult {
  ok: true;
  resolved: ResolvedBinary;
}
export interface ResolveBinaryError {
  ok: false;
  code: 'CONFIG_PARSE_ERROR' | 'BINARY_NOT_FOUND' | 'BINARY_NOT_EXECUTABLE' | 'UNKNOWN';
  message: string;
  /** 사용자에게 안내할 경로 (bin 기본 위치, config.json 위치 등) */
  hints?: readonly string[];
}
export type ResolveBinaryResponse = ResolveBinaryResult | ResolveBinaryError;

/* ============================================================
 * Phase 4 — Interpreter Auto-Updater (S3 per-interpreter manifest)
 * ============================================================
 *
 * 실제 배포 인프라:
 *
 *   s3BaseUrl = https://<bucket>.s3.<region>.amazonaws.com/
 *
 *   <base>/<slug>/manifest.json                — per-interpreter manifest
 *   <base>/<slug>/versions/<ver>/<artifact>.zip — PyInstaller --onefile zip
 *
 * slug 는 S3 폴더명이며 대소문자를 보존한다:
 *   mowkow  → "mowkow"
 *   kprolog → "K-Prolog"
 *
 * 각 manifest.json 은 해당 인터프리터 하나의 최신 릴리즈를 기술한다.
 * 여러 버전을 한꺼번에 기술하지 않으며 IDE 는 항상 "현재 최신" 만 본다.
 */

export type UpdaterPlatform = 'win32' | 'darwin' | 'linux';
export type UpdaterArch = 'x64' | 'arm64' | 'ia32';

/**
 * manifest.platforms 의 key.
 *   현 시점에서 빌드되는 조합:
 *     darwin-x64   (macos-15-intel 빌드)
 *     darwin-arm64 (macos-latest 빌드, Apple Silicon)
 *     linux-x64
 *     win32-x64
 */
export type PlatformKey = `${UpdaterPlatform}-${UpdaterArch}`;

/** manifest.platforms[<key>] 한 엔트리. */
export interface InterpreterManifestPlatform {
  /** zip 아티팩트 절대 URL (S3) */
  url: string;
  /** 아티팩트 전체의 SHA-256 hex (소문자). 대소문자 무시 비교. */
  checksum: string;
}

/**
 * `<base>/<slug>/manifest.json` 의 스키마.
 *
 * 주의: GitHub Actions 로 생성되는 실제 manifest 는 `name`/`latest_version`
 * 필드명을 snake_case 로 사용한다 (build.yml + manifest 생성 스크립트 convention).
 */
export interface InterpreterManifest {
  /** S3 slug 와 일치 — UI 로깅·진단용 */
  name: string;
  /** semver. `0.0.1` 수준도 허용 (semver.ts 가 패치 차이만 비교). */
  latest_version: string;
  /** ISO-8601 또는 YYYY-MM-DD — 표시용 */
  release_date?: string;
  changelog?: string;
  platforms: Partial<Record<PlatformKey, InterpreterManifestPlatform>>;
}

/** 체크 결과 한 건 */
export interface UpdateCheckEntry {
  interpreterId: InterpreterId;
  /** manifest 의 latest_version */
  latestVersion: string | null;
  /** 로컬에 설치된 버전 (없으면 null) */
  installedVersion: string | null;
  /** true 이면 다운로드 가능 */
  available: boolean;
  /** 현 플랫폼에 맞는 artifact 가 존재하는지 */
  artifactAvailable: boolean;
  reason?: string;
}

export interface UpdateCheckResult {
  fetchedAt: string;
  /** 요약 용도로 s3BaseUrl 을 그대로 노출 */
  s3BaseUrl: string;
  entries: readonly UpdateCheckEntry[];
  /** manifest fetch 자체가 전역적으로 실패했을 때의 사유 (base 미설정 등) */
  error?: string;
}

export type UpdateProgressPhase =
  | 'fetching-manifest'
  | 'downloading'
  | 'verifying'
  | 'extracting'
  | 'installing'
  | 'done'
  | 'error';

export interface UpdateProgress {
  interpreterId: InterpreterId;
  phase: UpdateProgressPhase;
  /** downloading 단계에서만 의미 있는 누적 바이트 수 */
  bytes?: number;
  total?: number;
  message?: string;
}

export interface UpdateApplyResult {
  interpreterId: InterpreterId;
  version: string;
  entrypointPath: string;
}
