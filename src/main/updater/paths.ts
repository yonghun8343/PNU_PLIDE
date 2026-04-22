/**
 * Updater 전용 경로 유틸.
 *
 *   ~/.pnu-pl-ide/
 *     ├─ bin/<id>/                   ← 해제된 인터프리터 설치 위치
 *     │   ├─ <entrypoint>
 *     │   └─ version.txt             ← 설치된 버전 (UTF-8, 1줄)
 *     ├─ cache/                      ← 다운로드 임시 파일
 *     └─ config.json
 */
import { join } from 'node:path';
import { appDir } from '../interpreters/paths';
import type { InterpreterId } from '@shared/types';

export function cacheDir(): string {
  return join(appDir(), 'cache');
}

export function versionFilePath(id: InterpreterId): string {
  return join(appDir(), 'bin', id, 'version.txt');
}
