/** Visible rows for clack select/multiselect viewports and note pages. */
export declare const PAGE_SIZE = 15;
/** Split lines into fixed-size pages (last page may be short). */
export declare function chunkPages(lines: string[], pageSize?: number): string[][];
/**
 * Render long line lists as sequential notes with paging prompts.
 * A single page renders directly; longer lists pause between pages so
 * nothing scrolls off-screen.
 */
export declare function paginatedNote(title: string, lines: string[], pageSize?: number): Promise<void>;
