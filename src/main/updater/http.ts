/**
 * HTTPS 클라이언트 — manifest JSON fetch 및 파일 다운로드.
 *
 * - node:https 를 사용해 redirect 수동 처리 (3xx up to 5 hops).
 * - `insecureTLS` 옵션으로 자기서명 인증서 허용 (연구실 내부 서버 대응).
 * - 다운로드 시 SHA-256 streaming 해시 동시 계산 + onProgress 콜백.
 */
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { URL } from 'node:url';
import https from 'node:https';
import http from 'node:http';
import type { IncomingMessage, RequestOptions } from 'node:http';

export interface HttpOptions {
  insecureTLS?: boolean;
  /** 사용자 식별용 UA — 로그·트래픽 통계용 */
  userAgent?: string;
}

const MAX_REDIRECTS = 5;

function pickTransport(url: URL): typeof https | typeof http {
  return url.protocol === 'http:' ? http : https;
}

function requestWithRedirects(
  url: string,
  opts: HttpOptions,
  hops = 0,
): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch (err) {
      reject(err);
      return;
    }

    const reqOpts: RequestOptions = {
      method: 'GET',
      headers: {
        'user-agent': opts.userAgent ?? 'pnu-pl-ide-updater/1.0',
        accept: '*/*',
      },
    };
    if (parsed.protocol === 'https:' && opts.insecureTLS) {
      (reqOpts as RequestOptions & { rejectUnauthorized?: boolean }).rejectUnauthorized = false;
    }

    const req = pickTransport(parsed).request(parsed, reqOpts, (res) => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        if (hops >= MAX_REDIRECTS) {
          res.resume();
          reject(new Error(`too many redirects (> ${MAX_REDIRECTS})`));
          return;
        }
        res.resume();
        const next = new URL(res.headers.location, parsed).toString();
        requestWithRedirects(next, opts, hops + 1).then(resolve, reject);
        return;
      }
      if (status < 200 || status >= 300) {
        res.resume();
        reject(new Error(`HTTP ${status} ${res.statusMessage ?? ''} (${parsed.toString()})`));
        return;
      }
      resolve(res);
    });
    req.on('error', reject);
    req.end();
  });
}

/** JSON GET. 응답 크기 제한 2MB. */
export async function fetchJson<T>(url: string, opts: HttpOptions = {}): Promise<T> {
  const res = await requestWithRedirects(url, opts);
  const chunks: Buffer[] = [];
  let total = 0;
  const MAX = 2 * 1024 * 1024;
  return new Promise<T>((resolve, reject) => {
    res.on('data', (c: Buffer) => {
      total += c.length;
      if (total > MAX) {
        res.destroy(new Error(`manifest too large (> ${MAX} bytes)`));
        return;
      }
      chunks.push(c);
    });
    res.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf-8');
        resolve(JSON.parse(text) as T);
      } catch (err) {
        reject(err);
      }
    });
    res.on('error', reject);
  });
}

export interface DownloadOptions extends HttpOptions {
  onProgress?: (bytes: number, total: number | undefined) => void;
}

/**
 * URL 의 내용을 `destPath` 에 저장하면서 SHA-256 을 계산한다.
 * 반환값은 hex 소문자 해시 + 총 바이트.
 */
export async function downloadFile(
  url: string,
  destPath: string,
  opts: DownloadOptions = {},
): Promise<{ sha256: string; bytes: number }> {
  const res = await requestWithRedirects(url, opts);
  const total = Number(res.headers['content-length']) || undefined;
  const hash = createHash('sha256');
  const out = createWriteStream(destPath);
  let written = 0;

  return new Promise((resolve, reject) => {
    res.on('data', (chunk: Buffer) => {
      hash.update(chunk);
      written += chunk.length;
      opts.onProgress?.(written, total);
    });
    res.pipe(out);
    out.on('finish', () => {
      resolve({ sha256: hash.digest('hex'), bytes: written });
    });
    out.on('error', reject);
    res.on('error', reject);
  });
}
