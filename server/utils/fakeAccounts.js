// Email addresses that aren't real mailboxes: the bot flood of October 2026
// (…@pipratestbot99.org, …@gmail.bot, …@submail.io and the like) plus the
// usual throwaway-mail services. Sign-up refuses them, and
// scripts/removeFakeUsers.js clears accounts made with them.
export const FAKE_EMAIL_DOMAIN =
  /@([^@]+\.bot|[^@]*(testbot|fakeauth|nonexistentdomain)[^@]*|mailtest\.dev|submail\.io|mailinator\.com|guerrillamail\.[a-z]+|10minutemail\.[a-z]+|temp-?mail\.[a-z]+|yopmail\.com|sharklasers\.com|trashmail\.[a-z]+)$/i;

export const isFakeEmail = (email) => FAKE_EMAIL_DOMAIN.test(String(email || ""));
