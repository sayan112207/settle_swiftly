import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge only knows Tailwind's built-in font sizes, so it reads our
 * `--text-*` size tokens (`text-body`, `text-pill`, …) as text colours and
 * drops them when a colour like `text-fg` follows. Registering them as sizes
 * keeps both. Keep this list in sync with the `--text-*` tokens in the theme.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["metric", "title", "section", "body", "prose", "pill", "eyebrow"],
    },
  },
});

/** Joins class names, letting later Tailwind classes override earlier ones. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
