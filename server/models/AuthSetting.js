import mongoose from "mongoose";

// How people sign up and sign in — all set from the admin panel, no code
// changes needed. One document.
//
//   registrationOpen  master switch: off = nobody can create an account
//   phone / email     for each: may it be used to sign up, to sign in, and
//                     must the number / address be confirmed with a code
//                     (OTP) first?
//   sms               o-sms.com API key, for phone codes
//   smtp              a mail server, for email codes
//
// A method whose code is required but whose service isn't set up can't be
// used to sign up — it fails closed, so bots can't slip through.

const methodSchema = new mongoose.Schema(
  {
    register: { type: Boolean, default: false },
    login: { type: Boolean, default: true },
    otp: { type: Boolean, default: true },
  },
  { _id: false },
);

const authSettingSchema = new mongoose.Schema(
  {
    registrationOpen: { type: Boolean, default: true },
    phone: { type: methodSchema, default: () => ({ register: true, login: true, otp: true }) },
    email: { type: methodSchema, default: () => ({ register: false, login: true, otp: true }) },

    sms: {
      apiKey: { type: String, default: "", trim: true, select: false },
      lastTestedAt: { type: Date, default: null },
      lastTestError: { type: String, default: "" },
    },
    smtp: {
      host: { type: String, default: "", trim: true },
      port: { type: Number, default: 587 },
      secure: { type: Boolean, default: false },
      user: { type: String, default: "", trim: true },
      pass: { type: String, default: "", select: false },
      from: { type: String, default: "", trim: true },
      lastTestedAt: { type: Date, default: null },
      lastTestError: { type: String, default: "" },
    },

    // Most codes sent in one day (SMS cost guard against floods).
    dailyOtpLimit: { type: Number, default: 1000 },
  },
  { timestamps: true },
);

const AuthSetting = mongoose.model("AuthSetting", authSettingSchema);

let cache = null;
let cachedAt = 0;

// The settings, with the secrets. Cached for a few seconds — every sign-up
// and sign-in reads them.
export const getAuthSetting = async ({ fresh = false } = {}) => {
  if (!fresh && cache && Date.now() - cachedAt < 5000) return cache;
  cache = (await AuthSetting.findOne().select("+sms.apiKey +smtp.pass")) || (await AuthSetting.create({}));
  cachedAt = Date.now();
  return cache;
};

export const forgetAuthSetting = () => {
  cache = null;
};

export const smsReady = (s) => Boolean(s?.sms?.apiKey);
export const smtpReady = (s) => Boolean(s?.smtp?.host && s?.smtp?.from);

// Is a code needed for this method, and can one be sent?
const codeState = (s, method) => {
  const otp = Boolean(s[method]?.otp);
  const ready = method === "phone" ? smsReady(s) : smtpReady(s);
  return { otp, ready };
};

// What the sign-up / sign-in forms may offer. A method that needs a code
// it can't send isn't offered for sign-up.
export const publicAuthOptions = (s) => {
  const shape = (method) => {
    const { otp, ready } = codeState(s, method);
    return {
      register: Boolean(s.registrationOpen && s[method]?.register && (!otp || ready)),
      login: Boolean(s[method]?.login),
      otp: otp && ready,
    };
  };
  return { registrationOpen: Boolean(s.registrationOpen), phone: shape("phone"), email: shape("email") };
};

// For the admin panel — secrets only as "set / not set".
export const adminAuthSetting = (s) => ({
  registrationOpen: s.registrationOpen,
  phone: { register: s.phone.register, login: s.phone.login, otp: s.phone.otp },
  email: { register: s.email.register, login: s.email.login, otp: s.email.otp },
  sms: { hasKey: smsReady(s), keyPreview: s.sms?.apiKey ? `••••${s.sms.apiKey.slice(-4)}` : "", lastTestedAt: s.sms?.lastTestedAt, lastTestError: s.sms?.lastTestError },
  smtp: {
    host: s.smtp?.host || "",
    port: s.smtp?.port || 587,
    secure: Boolean(s.smtp?.secure),
    user: s.smtp?.user || "",
    hasPass: Boolean(s.smtp?.pass),
    from: s.smtp?.from || "",
    ready: smtpReady(s),
    lastTestedAt: s.smtp?.lastTestedAt,
    lastTestError: s.smtp?.lastTestError,
  },
  dailyOtpLimit: s.dailyOtpLimit,
  options: publicAuthOptions(s),
});

export default AuthSetting;
