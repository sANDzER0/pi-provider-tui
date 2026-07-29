export declare const DEFAULT_FETCH_TIMEOUT_MS = 15000;
export declare function fetchWithTimeout(url: string, init: RequestInit | undefined, timeoutMs?: number, fetchImpl?: typeof fetch): Promise<Response>;
