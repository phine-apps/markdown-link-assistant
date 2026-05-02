/**
 * Copyright (c) 2026 phine-apps
 *
 * This software is released under the MIT License.
 * https://opensource.org/licenses/MIT
 */

import { getDispatcher } from "./proxy";

export enum ValidationStatus {
  ok = "OK",
  broken = "Broken",
  timeout = "Timeout",
  error = "Error",
}

export interface ValidationResult {
  status: ValidationStatus;
  statusCode?: number;
  message?: string;
  contentType?: string;
}

const validationCache = new Map<string, { result: ValidationResult; timestamp: number }>();
const pendingRequests = new Map<string, Promise<ValidationResult>>();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

export function clearValidationCache() {
  validationCache.clear();
  pendingRequests.clear();
}

export function getCachedValidationResult(url: string): ValidationResult | undefined {
  const cached = validationCache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.result;
  }
  return undefined;
}

export async function validateUrl(url: string, timeoutMs: number = 5000): Promise<ValidationResult> {
  const cached = validationCache.get(url);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.result;
  }

  // Request Collapsing: Reuse existing promise if already fetching
  const pending = pendingRequests.get(url);
  if (pending) {
    return pending;
  }

  const fetchPromise = (async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      let response = await fetch(url, {
        method: "HEAD",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        dispatcher: getDispatcher() as any,
        signal: controller.signal,
        headers: {
          // eslint-disable-next-line @typescript-eslint/naming-convention
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          // eslint-disable-next-line @typescript-eslint/naming-convention
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
          // eslint-disable-next-line @typescript-eslint/naming-convention
          "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
          // eslint-disable-next-line @typescript-eslint/naming-convention
          "Referer": "https://www.google.com/",
        },
      });

      // Some servers block HEAD or return 405 Method Not Allowed, fallback to GET
      if (response.status === 404 || response.status === 405 || response.status === 403 || response.status === 501) {
        response = await fetch(url, {
          method: "GET",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          dispatcher: getDispatcher() as any,
          signal: controller.signal,
          headers: {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            // eslint-disable-next-line @typescript-eslint/naming-convention
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
            // eslint-disable-next-line @typescript-eslint/naming-convention
            "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
            // eslint-disable-next-line @typescript-eslint/naming-convention
            "Referer": "https://www.google.com/",
          },
        });
      }

      clearTimeout(timeoutId);

      const result: ValidationResult = response.ok
        ? {
            status: ValidationStatus.ok,
            statusCode: response.status,
            contentType: response.headers.get("content-type") || undefined,
          }
        : {
            status: ValidationStatus.broken,
            statusCode: response.status,
            message: response.statusText,
          };

      if (result.status === ValidationStatus.ok || result.statusCode === 404) {
        validationCache.set(url, { result, timestamp: Date.now() });
      }
      return result;
    } catch (e: unknown) {
      clearTimeout(timeoutId);
      let result: ValidationResult;

      if (e instanceof Error && e.name === "AbortError") {
        result = { status: ValidationStatus.timeout, message: "Request timed out" };
      } else {
        result = { status: ValidationStatus.error, message: e instanceof Error ? e.message : String(e) };
      }

      // Do not cache transient errors or timeouts long-term
      return result;
    } finally {
      pendingRequests.delete(url);
    }
  })();

  pendingRequests.set(url, fetchPromise);
  return fetchPromise;
}
