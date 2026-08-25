import { interpolateEnv, isReferenceValue } from "./env-resolve.js";
import {
  API_TYPES,
  THINKING_LEVELS,
  type ModelsFile,
} from "./types.js";

/**
 * Static health checks for a parsed models.json. Pure function — no I/O — so
 * results are unit-testable and reusable by the CLI mode later.
 */

export interface DoctorIssue {
  provider?: string;
  model?: string;
  level: "error" | "warn" | "info";
  message: string;
}

/** APIs pi itself understands (superset of what this TUI edits). */
const PI_KNOWN_APIS = new Set<string>([
  ...API_TYPES,
  "azure-openai-responses",
]);

const MAX_PLAUSIBLE_CONTEXT = 100_000_000;

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

export function examineDoc(doc: ModelsFile): DoctorIssue[] {
  const issues: DoctorIssue[] = [];
  const ids = Object.keys(doc.providers ?? {});

  // Duplicate endpoints across providers (usually a copy-paste mistake).
  const byUrl = new Map<string, string[]>();
  for (const id of ids) {
    const url = doc.providers[id]?.baseUrl?.toLowerCase();
    if (!url) continue;
    byUrl.set(url, [...(byUrl.get(url) ?? []), id]);
  }
  for (const [url, dupIds] of byUrl) {
    if (dupIds.length > 1) {
      issues.push({
        level: "warn",
        message: `${dupIds.length} providers share baseUrl ${url}: ${dupIds.join(", ")}`,
      });
    }
  }

  for (const id of ids) {
    const pr = doc.providers[id];
    const models = Array.isArray(pr.models) ? pr.models : [];

    // --- Provider-level ---
    if (!pr.baseUrl) {
      // No baseUrl and no models usually means a built-in-provider override,
      // which legitimately omits both.
      if (models.length > 0) {
        issues.push({
          provider: id,
          level: "error",
          message: "missing baseUrl — custom models cannot reach an endpoint",
        });
      }
    }

    if (!pr.api) {
      if (models.length > 0 || pr.baseUrl) {
        issues.push({
          provider: id,
          level: "error",
          message:
            "missing api — custom providers need one of: " +
            API_TYPES.join(", "),
        });
      }
    } else if (!PI_KNOWN_APIS.has(pr.api)) {
      issues.push({
        provider: id,
        level: "error",
        message: `unknown api "${pr.api}"`,
      });
    }

    if (pr.api === "anthropic-messages" && /\/v1$/i.test(pr.baseUrl ?? "")) {
      issues.push({
        provider: id,
        level: "error",
        message: `baseUrl ends with /v1 — pi appends /v1 itself, so requests would go to ${pr.baseUrl}/v1/... (remove the trailing /v1)`,
      });
    }

    if (!pr.apiKey) {
      issues.push({
        provider: id,
        level: "info",
        message:
          "no apiKey — models stay unavailable in /model until auth is set (/login, --api-key, or auth.json)",
      });
    } else if (isReferenceValue(pr.apiKey)) {
      if (pr.apiKey.startsWith("!")) {
        issues.push({
          provider: id,
          level: "info",
          message: "apiKey uses a !command reference — executed at request time",
        });
      } else {
        const res = interpolateEnv(pr.apiKey);
        if (!res.ok) {
          issues.push({
            provider: id,
            level: "warn",
            message: `apiKey ${res.error} (checked now; pi re-resolves at request time)`,
          });
        }
      }
    }

    if (
      pr.authHeader === true &&
      (pr.api === "anthropic-messages" || pr.api === "google-generative-ai")
    ) {
      issues.push({
        provider: id,
        level: "info",
        message: `authHeader=true is unusual for ${pr.api} (native auth headers are sent regardless)`,
      });
    }

    // Empty models only matters for clearly-custom providers (baseUrl + api).
    if (
      Array.isArray(pr.models) &&
      pr.models.length === 0 &&
      pr.baseUrl &&
      pr.api
    ) {
      issues.push({
        provider: id,
        level: "warn",
        message: "models array is empty",
      });
    }

    // --- Model-level ---
    const seenIds = new Set<string>();
    for (const [idx, m] of models.entries()) {
      if (m && typeof m.id === "string" && m.id) {
        if (seenIds.has(m.id)) {
          issues.push({
            provider: id,
            model: m.id,
            level: "error",
            message: "duplicate model id within provider",
          });
        }
        seenIds.add(m.id);
      } else {
        issues.push({
          provider: id,
          level: "error",
          message: `model at index ${idx} has no valid id`,
        });
      }

      const ctx = num(m?.contextWindow);
      if (ctx === undefined || ctx <= 0) {
        issues.push({
          provider: id,
          model: m?.id,
          level: "error",
          message: `invalid contextWindow (${String(m?.contextWindow)})`,
        });
      } else if (ctx > MAX_PLAUSIBLE_CONTEXT) {
        issues.push({
          provider: id,
          model: m?.id,
          level: "warn",
          message: `contextWindow ${ctx} looks unrealistic (> ${MAX_PLAUSIBLE_CONTEXT})`,
        });
      }

      const out = num(m?.maxTokens);
      if (out === undefined || out <= 0) {
        issues.push({
          provider: id,
          model: m?.id,
          level: "error",
          message: `invalid maxTokens (${String(m?.maxTokens)})`,
        });
      }

      const cost = m?.cost;
      if (cost) {
        const rates: Array<[string, number | undefined]> = [
          ["input", cost.input],
          ["output", cost.output],
          ["cacheRead", cost.cacheRead],
          ["cacheWrite", cost.cacheWrite],
        ];
        for (const [key, v] of rates) {
          if (v !== undefined && v < 0) {
            issues.push({
              provider: id,
              model: m?.id,
              level: "error",
              message: `negative cost.${key} (${v})`,
            });
          }
        }
      }

      if (!m?.reasoning && m?.thinkingLevelMap !== undefined) {
        issues.push({
          provider: id,
          model: m.id,
          level: "warn",
          message: "thinkingLevelMap set but reasoning=false — map is ignored",
        });
      }
      if (m?.thinkingLevelMap && typeof m.thinkingLevelMap === "object") {
        for (const key of Object.keys(m.thinkingLevelMap)) {
          if (!(THINKING_LEVELS as readonly string[]).includes(key)) {
            issues.push({
              provider: id,
              model: m.id,
              level: "warn",
              message: `unknown thinkingLevelMap key "${key}"`,
            });
          }
        }
      }

      if (Array.isArray(m?.input)) {
        for (const mod of m.input) {
          if (mod !== "text" && mod !== "image") {
            issues.push({
              provider: id,
              model: m?.id,
              level: "warn",
              message: `unknown input modality "${String(mod)}" (expected text/image)`,
            });
          }
        }
      }
    }
  }

  return issues;
}
