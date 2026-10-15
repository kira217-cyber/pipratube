import crypto from "node:crypto";
import nodemailer from "nodemailer";

import { getAuthSetting, smsReady, smtpReady } from "../models/AuthSetting.js";

// One-time codes for confirming a phone number (SMS through o-sms.com, the
// same service TBAJEE38 uses) or an email address (our own mail server).
//
// Codes live in memory, never in the database: each works for 5 minutes,
// 5 wrong tries kill it, a new one can be asked for once a minute, and the
// whole site sends at most `dailyOtpLimit` a day so a flood can't run up the
// SMS bill. One API process (see ecosystem.config.cjs), so memory is enough.

const SMS_URL = "https://api.o-sms.com/api/service/send-otp";
const EXPIRE_MS = 5 * 60 * 1000;
const RESEND_GAP_MS = 60 * 1000;
const MAX_TRIES = 5;

const codes = new Map(); // "purpose:channel:target" → { code, expiresAt, lastSentAt, tries }
let today = { day: "", sent: 0 };

const keyOf = (purpose, channel, target) => `${purpose}:${channel}:${target}`;

const sweep = () => {
  const now = Date.now();
  for (const [key, entry] of codes) if (entry.expiresAt < now) codes.delete(key);
};
setInterval(sweep, 60 * 1000).unref();

const countToday = (limit) => {
  const day = new Date().toISOString().slice(0, 10);
  if (today.day !== day) today = { day, sent: 0 };
  if (today.sent >= limit) return false;
  today.sent += 1;
  return true;
};

const fail = (message, code) => ({ ok: false, message, code });

// "01712345678" → "8801712345678" (what o-sms wants).
const smsNumber = (phone) => `88${phone}`;

const sendSms = async (setting, phone) => {
  const response = await fetch(SMS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${setting.sms.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ phoneNumber: smsNumber(phone) }),
    signal: AbortSignal.timeout(20000),
  });
  const data = await response.json().catch(() => null);
  // o-sms makes the code itself and tells us what it sent.
  if (!data?.success || !data?.otp) throw new Error(data?.message || "Couldn't send the SMS");
  return String(data.otp).trim();
};

let transport = null;
let transportKey = "";
const mailer = (smtp) => {
  const key = JSON.stringify([smtp.host, smtp.port, smtp.secure, smtp.user, smtp.pass]);
  if (!transport || transportKey !== key) {
    transport = nodemailer.createTransport({
      host: smtp.host,
      port: Number(smtp.port) || 587,
      secure: Boolean(smtp.secure),
      auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
      connectionTimeout: 15000,
    });
    transportKey = key;
  }
  return transport;
};

export const sendMail = async (setting, to, subject, text) => {
  await mailer(setting.smtp).sendMail({ from: setting.smtp.from, to, subject, text });
};

const sendEmailCode = async (setting, email) => {
  const code = String(crypto.randomInt(100000, 1000000));
  await sendMail(setting, email, `${code} is your PipraTube code`, `Your PipraTube verification code is ${code}.\n\nIt works for 5 minutes. If you didn't ask for it, ignore this email.`);
  return code;
};

// Sends a code to `target` (a normalised phone number or email address).
// Resolves with { ok, message, code? }.
export const sendCode = async ({ purpose, channel, target }) => {
  const setting = await getAuthSetting();
  if (channel === "phone" && !smsReady(setting)) return fail("Phone codes aren't set up yet", "otpNotConfigured");
  if (channel === "email" && !smtpReady(setting)) return fail("Email codes aren't set up yet", "otpNotConfigured");

  const key = keyOf(purpose, channel, target);
  const existing = codes.get(key);
  if (existing && Date.now() - existing.lastSentAt < RESEND_GAP_MS) {
    const wait = Math.ceil((RESEND_GAP_MS - (Date.now() - existing.lastSentAt)) / 1000);
    return fail(`Please wait ${wait}s before asking for a new code`, "otpWait");
  }
  if (!countToday(Math.max(1, setting.dailyOtpLimit || 1000))) return fail("We can't send more codes today. Please try again tomorrow.", "otpDailyLimit");

  try {
    const code = channel === "phone" ? await sendSms(setting, target) : await sendEmailCode(setting, target);
    codes.set(key, { code, expiresAt: Date.now() + EXPIRE_MS, lastSentAt: Date.now(), tries: 0 });
    return { ok: true, message: channel === "phone" ? "Code sent by SMS" : "Code sent by email" };
  } catch (error) {
    today.sent = Math.max(0, today.sent - 1);
    return fail(error.message || "Couldn't send the code", "otpSendFailed");
  }
};

// Checks a code; a right one is used up.
export const checkCode = ({ purpose, channel, target, code }) => {
  const key = keyOf(purpose, channel, target);
  const entry = codes.get(key);
  if (!entry) return fail("Ask for a code first", "otpNotAsked");
  if (Date.now() > entry.expiresAt) {
    codes.delete(key);
    return fail("This code has expired — ask for a new one", "otpExpired");
  }
  entry.tries += 1;
  if (entry.tries > MAX_TRIES) {
    codes.delete(key);
    return fail("Too many wrong tries — ask for a new code", "otpTooManyTries");
  }
  if (String(code || "").trim() !== entry.code) return fail("That code isn't right", "otpWrong");
  codes.delete(key);
  return { ok: true };
};

// Admin "send a test" buttons.
export const testSms = async (phone) => {
  const setting = await getAuthSetting({ fresh: true });
  if (!smsReady(setting)) throw new Error("Add the o-sms API key first");
  await sendSms(setting, phone);
};
export const testEmail = async (email) => {
  const setting = await getAuthSetting({ fresh: true });
  if (!smtpReady(setting)) throw new Error("Fill in the mail server first");
  await sendMail(setting, email, "PipraTube test email", "Email codes are working.");
};
