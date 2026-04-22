/**
 * IDE 가 사용하는 사용자 로컬 경로 상수.
 *
 *   ~/.pnu-pl-ide/
 *     ├─ config.json          (Hybrid resolver override)
 *     └─ bin/
 *         ├─ mowkow/
 *         ├─ kobasic/
 *         └─ kprolog/
 *
 * 모든 경로는 런타임에 os.homedir() 로 계산하여 Windows / macOS / Linux 를 모두 커버.
 */
import { homedir } from 'node:os';
import { join } from 'node:path';

export const APP_DIR_NAME = '.pnu-pl-ide';

export function appDir(): string {
  return join(homedir(), APP_DIR_NAME);
}

export function configJsonPath(): string {
  return join(appDir(), 'config.json');
}

export function defaultBinRootDir(): string {
  return join(appDir(), 'bin');
}

export function defaultBinDirFor(interpreterId: string): string {
  return join(defaultBinRootDir(), interpreterId);
}
