import { exec } from "node:child_process";
import { promisify } from "node:util";
const execAsync = promisify(exec);
const ENV_NAME = "[A-Za-z_][A-Za-z0-9_]*";
/**
 * True when the stored value references the environment or a command and must
 * be resolved before it can be used as an actual secret. Used to skip
 * "empty key" warnings and to decide whether HTTP calls need resolution.
 */
export function isReferenceValue(value) {
    if (!value)
        return false;
    if (value.startsWith("!"))
        return true; // command (note: "$!" is not "!")
    // contains an unescaped $ followed by NAME or {
    return /(^|[^$])\$(?:\{|[A-Za-z_])/.test(value);
}
/** Interpolate `$VAR` / `${VAR}` / `$$` / `$!` escapes against `env`. */
export function interpolateEnv(value, env = process.env) {
    let out = "";
    let i = 0;
    while (i < value.length) {
        const ch = value[i];
        if (ch !== "$") {
            out += ch;
            i++;
            continue;
        }
        const next = value[i + 1];
        if (next === "$") {
            out += "$";
            i += 2;
            continue;
        }
        if (next === "!") {
            out += "!";
            i += 2;
            continue;
        }
        if (next === "{") {
            const end = value.indexOf("}", i + 2);
            if (end === -1) {
                out += ch;
                i++;
                continue;
            }
            const name = value.slice(i + 2, end);
            if (!new RegExp(`^${ENV_NAME}$`).test(name)) {
                out += ch;
                i++;
                continue;
            }
            const v = env[name];
            if (v === undefined) {
                return { ok: false, error: `Environment variable "${name}" is not set` };
            }
            out += v;
            i = end + 1;
            continue;
        }
        const rest = value.slice(i + 1);
        const m = new RegExp(`^(${ENV_NAME})`).exec(rest);
        if (m) {
            const v = env[m[1]];
            if (v === undefined) {
                return {
                    ok: false,
                    error: `Environment variable "${m[1]}" is not set`,
                };
            }
            out += v;
            i += 1 + m[1].length;
            continue;
        }
        // lone "$" — literal
        out += ch;
        i++;
    }
    return { ok: true, value: out };
}
/**
 * Resolve a header map's values ($VAR / !command references).
 * Fails fast with the offending header named.
 */
export async function resolveHeaders(headers) {
    if (!headers)
        return { ok: true, value: {} };
    const out = {};
    for (const [k, v] of Object.entries(headers)) {
        const res = await resolveValue(String(v));
        if (!res.ok)
            return { ok: false, error: `header "${k}": ${res.error}` };
        out[k] = res.value;
    }
    return { ok: true, value: out };
}
const defaultRunner = (timeoutMs) => async (command) => {
    try {
        const { stdout } = await execAsync(command, {
            timeout: timeoutMs,
            windowsHide: true,
        });
        return { ok: true, stdout };
    }
    catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { ok: false, error: `Command failed: ${msg.trim()}` };
    }
};
/**
 * Resolve one configured value per pi semantics.
 * Commands are executed with the caller's environment.
 */
export async function resolveValue(value, opts = {}) {
    if (value.startsWith("!")) {
        const run = opts.execImpl ?? defaultRunner(opts.timeoutMs ?? 10_000);
        const res = await run(value.slice(1));
        if (!res.ok)
            return { ok: false, error: res.error };
        return { ok: true, value: res.stdout.trim() };
    }
    return interpolateEnv(value, opts.env);
}
