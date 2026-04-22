/**
 * `~/.pnu-pl-ide/bin/<id>/version.txt` 읽기/쓰기 유틸.
 *
 * - UTF-8, 1줄, trailing newline 허용.
 * - 파일이 없거나 읽기 실패 → null 반환 (업데이트 가능 상태로 판정).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { InterpreterId } from '@shared/types';
import { versionFilePath } from './paths';

export async function readInstalledVersion(id: InterpreterId): Promise<string | null> {
  try {
    const raw = await readFile(versionFilePath(id), 'utf-8');
    const v = raw.trim();
    return v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

export async function writeInstalledVersion(id: InterpreterId, version: string): Promise<void> {
  const p = versionFilePath(id);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, version.trim() + '\n', { encoding: 'utf-8' });
}
