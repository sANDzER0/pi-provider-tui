import { isCancel as clackIsCancel, cancel } from "@clack/prompts";

export function isCancel(value: unknown): boolean {
  return clackIsCancel(value);
}

/** If cancel, print message and return true. */
export function handleCancel(value: unknown, message = "Cancelled."): boolean {
  if (!clackIsCancel(value)) return false;
  cancel(message);
  return true;
}
