/**
 * Channel Response Formatter
 *
 * Each channel has its own text constraints:
 *  - telegram  : Plain text (no parse_mode). MarkdownV2 would require escaping
 *                every special char in arbitrary LLM output — too fragile.
 *                We strip markdown syntax and keep clean prose.
 *  - whatsapp  : Supports a limited *bold* / _italic_ subset but LLM output
 *                often contains Markdown that confuses the WA parser.  Strip
 *                to plain text and shorten long URLs.
 *  - webchat   : Full pass-through — the React renderer handles Markdown.
 *  - default   : Plain text strip, safe for any unknown channel.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Strip the most common Markdown constructs so the result is plain prose.
 * Order matters: process fenced code blocks before inline code, etc.
 */
function stripMarkdown(text: string): string {
  return (
    text
      // Fenced code blocks  ```lang\n...\n```
      .replace(/```[\s\S]*?```/g, (match) => {
        // Keep the code content, just remove the fence markers
        return match.replace(/```[^\n]*\n?/g, "").replace(/\n?```/g, "");
      })
      // Inline code  `code`
      .replace(/`([^`]+)`/g, "$1")
      // Headers  # / ## / ###
      .replace(/^#{1,6}\s+/gm, "")
      // Bold  **text** or __text__
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/__(.+?)__/g, "$1")
      // Italic  *text* or _text_
      .replace(/\*(.+?)\*/g, "$1")
      .replace(/_(.+?)_/g, "$1")
      // Strikethrough  ~~text~~
      .replace(/~~(.+?)~~/g, "$1")
      // Markdown links  [label](url)  → "label (url)" or just "label"
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
      // Bare reference links  [label][ref]
      .replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1")
      // Horizontal rules  --- or ***
      .replace(/^[-*]{3,}\s*$/gm, "")
      // Blockquotes  > text
      .replace(/^>\s?/gm, "")
      // Unordered list bullets  - / * / +
      .replace(/^[\s]*[-*+]\s+/gm, "• ")
      // Ordered list  1. / 2.
      .replace(/^[\s]*\d+\.\s+/gm, (m) => m.replace(/^\s+/, ""))
      // Trailing whitespace on lines
      .replace(/[ \t]+$/gm, "")
      // Collapse 3+ newlines → 2
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

/**
 * Truncate text to `maxLen` characters, appending "…" if cut.
 */
function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + "…";
}

// ---------------------------------------------------------------------------
// Per-channel formatters
// ---------------------------------------------------------------------------

function formatTelegram(text: string): string {
  // Telegram plain-text mode — strip markdown, cap at 4096 chars (TG API limit)
  return truncate(stripMarkdown(text), 4096);
}

function formatWhatsApp(text: string): string {
  // WhatsApp plain-text mode — strip markdown, cap at 4000 chars
  return truncate(stripMarkdown(text), 4000);
}

function formatWebChat(text: string): string {
  // Web chat renders Markdown natively — pass through, just cap very long responses
  return truncate(text, 8000);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Format `text` for delivery over `channelId`.
 *
 * @param text      Raw LLM / tool response text
 * @param channelId Channel identifier (e.g. "telegram", "whatsapp", "webchat")
 * @returns         Channel-safe string ready for delivery
 */
export function formatForChannel(text: string, channelId: string): string {
  switch (channelId.toLowerCase()) {
    case "telegram":
      return formatTelegram(text);
    case "whatsapp":
      return formatWhatsApp(text);
    case "webchat":
      return formatWebChat(text);
    default:
      return truncate(stripMarkdown(text), 4000);
  }
}
