import { toast } from "sonner";
import { t } from "@/i18n";
import { RpcError } from "./api/client";

// Known appCode → localized message. Extend as new codes are introduced.
const APP_CODE_MESSAGES: Record<string, string> = {
  conflict: t.errors.conflict,
  "category.in_use": t.errors.categoryInUse,
  "operation.not_found": t.errors.notFound,
};

/**
 * Shows an error toast. RPC errors with a known appCode get a localized
 * message; everything else shows a generic fallback with a copy-detail action.
 */
export function toastError(e: unknown): void {
  if (e instanceof RpcError && e.appCode && APP_CODE_MESSAGES[e.appCode]) {
    toast.error(APP_CODE_MESSAGES[e.appCode]);
    return;
  }

  const detail = e instanceof Error ? e.message : String(e);
  toast.error(t.errors.unexpected, {
    action: {
      label: t.errors.copyDetail,
      onClick: () => void navigator.clipboard.writeText(detail),
    },
  });
}

export { toast };
