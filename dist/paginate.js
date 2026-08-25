import * as p from "@clack/prompts";
import { handleCancel } from "./ui-cancel.js";
/** Visible rows for clack select/multiselect viewports and note pages. */
export const PAGE_SIZE = 15;
/** Split lines into fixed-size pages (last page may be short). */
export function chunkPages(lines, pageSize = PAGE_SIZE) {
    const pages = [];
    for (let i = 0; i < lines.length; i += pageSize) {
        pages.push(lines.slice(i, i + pageSize));
    }
    return pages.length > 0 ? pages : [[]];
}
/**
 * Render long line lists as sequential notes with paging prompts.
 * A single page renders directly; longer lists pause between pages so
 * nothing scrolls off-screen.
 */
export async function paginatedNote(title, lines, pageSize = PAGE_SIZE) {
    if (lines.length === 0) {
        p.note("(none)", title);
        return;
    }
    const pages = chunkPages(lines, pageSize);
    for (let page = 0; page < pages.length; page++) {
        const heading = pages.length === 1 ? title : `${title} — page ${page + 1}/${pages.length}`;
        p.note(pages[page].join("\n"), heading);
        if (page === pages.length - 1)
            return;
        const more = await p.confirm({
            message: `Show next page (${page + 2}/${pages.length})?`,
            initialValue: true,
        });
        if (handleCancel(more) || !more)
            return;
    }
}
