import * as p from "@clack/prompts";
import { examineDoc, type DoctorIssue } from "../doctor.js";
import type { ModelsFile } from "../types.js";

function formatIssue(issue: DoctorIssue): string {
  const scope = [issue.provider, issue.model]
    .filter(Boolean)
    .join(" › ");
  const icon =
    issue.level === "error" ? "✖" : issue.level === "warn" ? "▲" : "ℹ";
  return `${icon} ${scope ? `${scope} — ` : ""}${issue.message}`;
}

export function runDoctorScreen(doc: ModelsFile): void {
  const ids = Object.keys(doc.providers ?? {});
  if (ids.length === 0) {
    p.log.warn("No providers configured — nothing to check.");
    return;
  }

  const issues = examineDoc(doc);
  const errors = issues.filter((i) => i.level === "error");
  const warns = issues.filter((i) => i.level === "warn");
  const infos = issues.filter((i) => i.level === "info");

  if (issues.length === 0) {
    p.log.success(`All checks passed (${ids.length} provider(s), no issues).`);
    return;
  }

  p.note(issues.map(formatIssue).join("\n"), "Health check results");

  const parts: string[] = [];
  if (errors.length) parts.push(`${errors.length} error(s)`);
  if (warns.length) parts.push(`${warns.length} warning(s)`);
  if (infos.length) parts.push(`${infos.length} info`);
  const summary = parts.join(", ");

  if (errors.length > 0) {
    p.log.error(`Found ${summary}. Fix errors before relying on this config.`);
  } else if (warns.length > 0) {
    p.log.warn(`Found ${summary}.`);
  } else {
    p.log.info(`Found ${summary}. Config should work.`);
  }
}
