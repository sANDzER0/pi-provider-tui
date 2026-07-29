export const DEFAULT_FETCH_TIMEOUT_MS = 15_000;
export async function fetchWithTimeout(url, init, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS, fetchImpl = fetch) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const userSignal = init?.signal;
        if (userSignal) {
            if (userSignal.aborted) {
                controller.abort();
            }
            else {
                userSignal.addEventListener("abort", () => controller.abort(), {
                    once: true,
                });
            }
        }
        return await fetchImpl(url, { ...init, signal: controller.signal });
    }
    catch (err) {
        if (err instanceof Error &&
            (err.name === "AbortError" || err.message.includes("aborted"))) {
            throw new Error(`Request timed out after ${timeoutMs}ms`);
        }
        throw err;
    }
    finally {
        clearTimeout(timer);
    }
}
