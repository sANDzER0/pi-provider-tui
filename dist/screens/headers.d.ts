/**
 * Edit a provider's custom request headers. Values are stored verbatim —
 * $VAR / !command references are resolved by pi (and this tool) at request time.
 * Returns the updated map, or null on cancel.
 */
export declare function editHeadersScreen(existing: Record<string, string> | undefined): Promise<Record<string, string> | null>;
