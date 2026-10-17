/**
 * Text direction of a single message.
 *
 * Mirrors the first-strong-character rule from the Unicode bidirectional
 * algorithm: the first letter that carries a direction decides it. So a message
 * that *starts* in Arabic stays right-to-left even when English words, digits
 * or emoji follow, and a message that starts in English stays left-to-right.
 * Weak and neutral characters (spaces, digits, punctuation, emoji) never get a
 * vote — they are skipped until a letter shows up.
 */
export type TextDirection = 'ltr' | 'rtl'

/** Code points written right-to-left; no left-to-right script lives inside these. */
const RTL =
  /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0750-\u077F\u0780-\u07BF\u07C0-\u07FF\u0800-\u083F\u0840-\u085F\u0860-\u089F\u08A0-\u08FF\uFB1D-\uFB4F\uFB50-\uFDFF\uFE70-\uFEFF\u{1E900}-\u{1E95F}]/u

/** Any letter: the only thing allowed to pick a direction. */
const LETTER = /\p{L}/u

/**
 * Resolves the reading direction of `text`.
 *
 * Falls back to `ltr` when the string holds no letter at all (emoji, digits) —
 * the neutral case, so Latin-first UIs keep behaving as before.
 */
export function textDirection(text: string): TextDirection {
  for (const char of text) {
    if (!LETTER.test(char)) continue
    return RTL.test(char) ? 'rtl' : 'ltr'
  }
  return 'ltr'
}
