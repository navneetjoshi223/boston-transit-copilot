export const DAILY_LIMIT_MESSAGE =
  "This assistant has hit its daily usage limit. Please try again tomorrow.";

// For providers whose 429 means a short per-minute rate limit rather than a
// day-long quota (e.g. Groq) — retrying shortly actually helps here, unlike
// the daily case above, so this one keeps the "Try again" button enabled.
export const RATE_LIMIT_MESSAGE =
  "This assistant is getting a lot of requests right now. Please wait a moment and try again.";
