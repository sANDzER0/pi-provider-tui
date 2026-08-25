import * as p from "@clack/prompts";
import { isReferenceValue } from "../env-resolve.js";
import { handleCancel } from "../ui-cancel.js";

/**
 * Edit a provider's custom request headers. Values are stored verbatim —
 * $VAR / !command references are resolved by pi (and this tool) at request time.
 * Returns the updated map, or null on cancel.
 */
export async function editHeadersScreen(
  existing: Record<string, string> | undefined,
): Promise<Record<string, string> | null> {
  let headers: Record<string, string> = { ...(existing ?? {}) };

  for (;;) {
    const keys = Object.keys(headers);
    const options: Array<{ value: string; label: string; hint?: string }> = [
      { value: "add", label: "Add header" },
    ];
    if (keys.length > 0) {
      options.push(
        { value: "edit", label: "Edit value" },
        { value: "remove", label: "Remove header" },
        {
          value: "done",
          label: `Done (${keys.length} header${keys.length === 1 ? "" : "s"})`,
        },
      );
    } else {
      options.push({ value: "done", label: "Done (no custom headers)" });
    }

    if (keys.length > 0) {
      p.note(
        keys
          .map((k) => {
            const v = headers[k];
            return `${k}: ${isReferenceValue(v) ? v : "***"}`;
          })
          .join("\n"),
        "Headers (reference values shown as-is)",
      );
    }

    const action = await p.select({
      message: "Custom headers",
      options,
    });
    if (handleCancel(action)) return null;

    switch (action) {
      case "done":
        return headers;

      case "add": {
        const name = await p.text({
          message: "Header name",
          placeholder: "x-custom-auth",
          validate: (v) =>
            v && /^[A-Za-z0-9-]+$/.test(v.trim())
              ? undefined
              : "Required — letters, digits, hyphens",
        });
        if (handleCancel(name)) continue;
        const key = String(name).trim();
        const value = await p.text({
          message: "Header value (literal, $VAR, or !command)",
          placeholder: "$MY_TOKEN",
        });
        if (handleCancel(value)) continue;
        headers[key] = String(value ?? "");
        break;
      }

      case "edit": {
        if (keys.length === 0) break;
        const k = await p.select({
          message: "Edit which header?",
          options: keys.map((key) => ({ value: key, label: key })),
        });
        if (handleCancel(k)) continue;
        const key = String(k);
        const value = await p.text({
          message: `New value for "${key}" (literal, $VAR, or !command)`,
          initialValue: headers[key],
        });
        if (handleCancel(value)) continue;
        headers[key] = String(value ?? "");
        break;
      }

      case "remove": {
        if (keys.length === 0) break;
        const k = await p.multiselect({
          message: "Remove which headers?",
          options: keys.map((key) => ({ value: key, label: key })),
          required: true,
        });
        if (handleCancel(k)) continue;
        for (const key of k as string[]) delete headers[key];
        break;
      }
    }
  }
}
