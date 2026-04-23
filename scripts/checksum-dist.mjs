#!/usr/bin/env node
/**
 * dist/ 산출물의 SHA-256 해시를 계산해 `dist/SHA256SUMS.txt` 로 기록.
 *
 * 동기:
 *   - 무서명 배포이므로 학생이 다운로드한 파일이 진짜 연구실 배포분인지
 *     검증할 수단이 필요하다. 강의자는 전자 공지(학교 메일/LMS)에 해시값을
 *     함께 게시하고, 학생은 `shasum -a 256 <file>` 또는
 *     `Get-FileHash <file> -Algorithm SHA256` 로 대조한다.
 *   - electron-builder 는 publish 플로우에서 latest*.yml 을 만들지만,
 *     현재 프로젝트는 publish: null 이므로 자체적으로 해시를 내야 한다.
 *
 * 실행:
 *   node scripts/checksum-dist.mjs
 *
 * 출력 형식 (GNU coreutils 호환):
 *   <sha256>  <파일명>
 */
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative, resolve } from 'node:path';

// 설치 산출물로 간주할 확장자. latest*.yml / blockmap / .icon 은 제외.
const ARTIFACT_EXT = new Set([
  '.dmg',
  '.zip',
  '.exe',
  '.msi',
  '.appimage',
  '.deb',
  '.rpm',
  '.tar.gz',
  '.snap',
]);

function matchArtifact(name) {
  const lower = name.toLowerCase();
  // tar.gz 은 확장자 2단으로 처리
  if (lower.endsWith('.tar.gz')) return true;
  const dot = lower.lastIndexOf('.');
  if (dot < 0) return false;
  return ARTIFACT_EXT.has(lower.slice(dot));
}

async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      // win-unpacked / mac / linux-unpacked 등 빌더 임시 디렉토리는 건너뜀
      if (/-unpacked$/.test(e.name) || /^mac$/i.test(e.name)) continue;
      yield* walk(full);
    } else if (e.isFile() && matchArtifact(e.name)) {
      yield full;
    }
  }
}

async function sha256(file) {
  const buf = await readFile(file);
  const h = createHash('sha256');
  h.update(buf);
  return h.digest('hex');
}

async function main() {
  const distDir = resolve(process.cwd(), 'dist');
  try {
    await stat(distDir);
  } catch {
    console.error('[checksum] dist/ 가 존재하지 않음. 먼저 `pnpm run build:all` 을 실행하라.');
    process.exit(2);
  }

  const entries = [];
  for await (const f of walk(distDir)) {
    const hex = await sha256(f);
    const rel = relative(distDir, f);
    entries.push({ hex, rel });
    console.log(`${hex}  ${rel}`);
  }

  if (entries.length === 0) {
    console.error('[checksum] dist/ 아래에 배포 산출물이 없음.');
    process.exit(3);
  }

  // GNU shasum 형식 (`<hex>  <relpath>`). 학생은 `shasum -a 256 -c SHA256SUMS.txt` 로 검증.
  const body =
    entries
      .sort((a, b) => a.rel.localeCompare(b.rel))
      .map((e) => `${e.hex}  ${e.rel}`)
      .join('\n') + '\n';
  const outPath = join(distDir, 'SHA256SUMS.txt');
  await writeFile(outPath, body, 'utf8');
  console.log(`\n[checksum] ${entries.length}개 파일 → ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
