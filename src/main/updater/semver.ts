/**
 * 경량 semver 비교기.
 *
 * 외부 패키지 의존 없이 `MAJOR.MINOR.PATCH(-prerelease)` 의 대소만 판별한다.
 * 업데이터가 "설치된 버전 < manifest 버전" 을 체크하는 용도로만 사용.
 *
 * 지원:
 *   - `1.2.3`, `v1.2.3`
 *   - pre-release: `1.2.3-alpha`, `1.2.3-rc.1` (SemVer 2.0.0 규칙대로 release > prerelease)
 * 미지원 (이 프로젝트에는 불필요):
 *   - build metadata (+sha)
 *   - range matching (^, ~, > 등)
 */

export interface ParsedSemver {
  major: number;
  minor: number;
  patch: number;
  prerelease: readonly (string | number)[];
  raw: string;
}

const SEMVER_RE = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

export function parseSemver(input: string): ParsedSemver | null {
  const trimmed = input.trim();
  const m = SEMVER_RE.exec(trimmed);
  if (!m) return null;
  const [, maj, min, pat, pre] = m;
  const prerelease: (string | number)[] = [];
  if (pre) {
    for (const part of pre.split('.')) {
      prerelease.push(/^\d+$/.test(part) ? Number(part) : part);
    }
  }
  return {
    major: Number(maj),
    minor: Number(min),
    patch: Number(pat),
    prerelease,
    raw: trimmed,
  };
}

function comparePrerelease(
  a: readonly (string | number)[],
  b: readonly (string | number)[],
): number {
  // SemVer 2.0.0: release (empty) > prerelease (non-empty)
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0) return 1;
  if (b.length === 0) return -1;

  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i];
    const y = b[i];
    if (typeof x === 'number' && typeof y === 'number') {
      if (x !== y) return x < y ? -1 : 1;
    } else if (typeof x === 'number') {
      return -1; // numeric < alphanumeric
    } else if (typeof y === 'number') {
      return 1;
    } else {
      if (x !== y) return x < y ? -1 : 1;
    }
  }
  if (a.length !== b.length) return a.length < b.length ? -1 : 1;
  return 0;
}

/** `a < b` → 음수, `a === b` → 0, `a > b` → 양수. 파싱 실패 시 string 비교 fallback. */
export function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) {
    if (a === b) return 0;
    return a < b ? -1 : 1;
  }
  if (pa.major !== pb.major) return pa.major - pb.major;
  if (pa.minor !== pb.minor) return pa.minor - pb.minor;
  if (pa.patch !== pb.patch) return pa.patch - pb.patch;
  return comparePrerelease(pa.prerelease, pb.prerelease);
}

/** installed 가 latest 보다 "엄격하게 낮을 때" true. installed 가 null 이면 true. */
export function isUpdateAvailable(installed: string | null, latest: string): boolean {
  if (!installed) return true;
  return compareSemver(installed, latest) < 0;
}
