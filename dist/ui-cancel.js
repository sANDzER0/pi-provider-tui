import { isCancel as clackIsCancel, cancel } from "@clack/prompts";
export function isCancel(value) {
    return clackIsCancel(value);
}
/** If cancel, print message and return true. */
export function handleCancel(value, message = "Cancelled.") {
    if (!clackIsCancel(value))
        return false;
    cancel(message);
    return true;
}
