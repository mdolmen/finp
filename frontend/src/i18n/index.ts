// Locale detection: reads navigator.language and localStorage override.
// All UI strings are accessed through `t` so switching locale is a single
// import change.

import { en } from "./en";
import { fr } from "./fr";

type Locale = "fr" | "en";

function detectLocale(): Locale {
  // 1. localStorage override (set by the language toggle)
  const stored = localStorage.getItem("finp-locale");
  if (stored === "fr" || stored === "en") return stored;

  // 2. Browser preference — strip region suffix (e.g. "fr-FR" → "fr")
  const nav = navigator.language.slice(0, 2);
  if (nav === "en") return "en";
  // Default to French for anything else
  return "fr";
}

function resolveMessages(locale: Locale): typeof fr {
  return locale === "en" ? (en as unknown as typeof fr) : fr;
}

// The UI reads `t.*` — a plain object, same shape as the old `fr`.
// No runtime t() function needed as long as both locales share the same keys.
export const t: typeof fr = resolveMessages(detectLocale());