import { type ModelsFile } from "./types.js";
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
export declare function examineDoc(doc: ModelsFile): DoctorIssue[];
