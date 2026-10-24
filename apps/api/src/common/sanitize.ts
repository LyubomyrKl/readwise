/**
 * Simple HTML sanitization utility for user input.
 * Strips dangerous HTML tags and attributes while preserving plain text.
 */

// Tags that are completely removed (along with their content)
const DANGEROUS_TAGS = ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'link', 'meta'];

// Regex patterns for sanitization
const DANGEROUS_TAG_PATTERN = new RegExp(
  `<(${DANGEROUS_TAGS.join('|')})[^>]*>.*?</\\1>|<(${DANGEROUS_TAGS.join('|')})[^>]*\\/?>`,
  'gis'
);
const EVENT_HANDLER_PATTERN = /\s*on\w+\s*=\s*["'][^"']*["']/gi;
const JAVASCRIPT_URI_PATTERN = /\s*href\s*=\s*["']javascript:[^"']*["']/gi;
const DATA_URI_PATTERN = /\s*(?:href|src)\s*=\s*["']data:[^"']*["']/gi;
const HTML_COMMENTS_PATTERN = /<!--[\s\S]*?-->/g;

/**
 * Sanitizes a string by removing dangerous HTML content.
 * Preserves plain text and safe formatting.
 *
 * @param input - The string to sanitize
 * @returns Sanitized string safe for storage
 */
export function sanitizeHtml(input: string | null | undefined): string {
  if (!input) return '';

  let result = input;

  // Remove HTML comments
  result = result.replace(HTML_COMMENTS_PATTERN, '');

  // Remove dangerous tags and their content
  result = result.replace(DANGEROUS_TAG_PATTERN, '');

  // Remove event handlers (onclick, onerror, etc.)
  result = result.replace(EVENT_HANDLER_PATTERN, '');

  // Remove javascript: URLs
  result = result.replace(JAVASCRIPT_URI_PATTERN, '');

  // Remove data: URLs (potential XSS vector)
  result = result.replace(DATA_URI_PATTERN, '');

  // Trim whitespace
  return result.trim();
}

/**
 * Strips all HTML tags from a string, leaving only plain text.
 * Use this for fields that should never contain any HTML.
 *
 * @param input - The string to strip
 * @returns Plain text without any HTML tags
 */
export function stripHtml(input: string | null | undefined): string {
  if (!input) return '';

  return input
    .replace(/<[^>]*>/g, '')  // Remove all HTML tags
    .replace(/&nbsp;/gi, ' ') // Replace HTML entities
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .trim();
}
