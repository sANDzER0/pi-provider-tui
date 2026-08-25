/**
 * Value resolution for `apiKey` (and later `headers`) matching pi's documented
 * semantics in https://pi.dev/docs/latest/models#value-resolution:
 *
 * - `"!command"`  → execute the whole value as a shell command, use stdout
 * - `$VAR` / `${VAR}` → interpolate environment variables (also inside literals)
 * - `$$` → literal `$`;  `$!` → literal `!` (no command execution)
 * - anything else → literal value
 *
 * Missing environment variables leave the value unresolved (error).
 */
export interface ResolveOk {
    ok: true;
    value: string;
}
export interface ResolveError {
    ok: false;
    error: string;
}
export type ResolveResult = ResolveOk | ResolveError;
/**
 * True when the stored value references the environment or a command and must
 * be resolved before it can be used as an actual secret. Used to skip
 * "empty key" warnings and to decide whether HTTP calls need resolution.
 */
export declare function isReferenceValue(value: string | undefined): boolean;
/** Interpolate `$VAR` / `${VAR}` / `$$` / `$!` escapes against `env`. */
export declare function interpolateEnv(value: string, env?: Record<string, string | undefined>): ResolveResult;
export type CommandRunner = (command: string) => Promise<{
    ok: true;
    stdout: string;
} | {
    ok: false;
    error: string;
}>;
export interface RunCommandOptions {
    timeoutMs?: number;
    /** Test seam. */
    execImpl?: CommandRunner;
}
/**
 * Resolve a header map's values ($VAR / !command references).
 * Fails fast with the offending header named.
 */
export declare function resolveHeaders(headers: Record<string, string> | undefined): Promise<{
    ok: true;
    value: Record<string, string>;
} | {
    ok: false;
    error: string;
}>;
/**
 * Resolve one configured value per pi semantics.
 * Commands are executed with the caller's environment.
 */
export declare function resolveValue(value: string, opts?: RunCommandOptions & {
    env?: Record<string, string | undefined>;
}): Promise<ResolveResult>;
