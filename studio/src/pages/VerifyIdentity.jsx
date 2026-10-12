import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Camera,
  CheckCircle2,
  CircleDollarSign,
  FileText,
  Globe,
  Headphones,
  HelpCircle,
  IdCard,
  Info,
  Landmark,
  ShieldCheck,
  ShieldPlus,
  UploadCloud,
  UserRound,
  Users,
} from "lucide-react";

import { Card, Field, GhostButton, PageHeader, PrimaryButton, inputClass } from "../components/ui/ui";
import { useAuth } from "../context/AuthContext";
import { toast } from "../utils/alerts";
import { IMAGE_ACCEPT } from "../utils/media";

const STEPS = [
  { title: "Personal Info", sub: "Basic Information" },
  { title: "Identity Document", sub: "Upload Document" },
  { title: "Face Verification", sub: "Take a Selfie" },
  { title: "Review", sub: "Under Verification" },
];

const ID_TYPES = ["National ID Card", "Passport", "Driving License"];
const COUNTRIES = ["Bangladesh", "India", "Nepal", "Pakistan", "Saudi Arabia", "United Arab Emirates", "United Kingdom", "United States", "Other"];

const WHY = [
  { icon: CircleDollarSign, color: "#22c55e", title: "Earn Money", text: "Enable monetization" },
  { icon: Landmark, color: "#2f86e6", title: "Receive Payouts", text: "Withdraw your earnings" },
  { icon: ShieldPlus, color: "#a855f7", title: "More Features", text: "Access creator tools" },
  { icon: Users, color: "#f59e0b", title: "Build Trust", text: "A safer community" },
];

const storageKey = (id) => `pipra_verification_${id}`;

const Stepper = ({ step }) => (
  <div className="relative grid grid-cols-4">
    <div className="absolute left-[12.5%] right-[12.5%] top-5 h-0.5 bg-white/15" />
    <div
      className="absolute left-[12.5%] top-5 h-0.5 bg-brand transition-all"
      style={{ width: `${(Math.min(step, 3) / 3) * 75}%` }}
    />
    {STEPS.map((item, index) => {
      const state = index < step ? "done" : index === step ? "current" : "todo";
      return (
        <div key={item.title} className="relative flex flex-col items-center text-center">
          <span
            className={`flex h-10 w-10 items-center justify-center rounded-full border-2 text-base font-bold ${
              state === "current"
                ? "border-brand bg-brand text-white ring-4 ring-brand/25"
                : state === "done"
                  ? "border-[#22c55e] bg-[#22c55e] text-white"
                  : "border-white/40 bg-page text-white"
            }`}
          >
            {state === "done" ? <CheckCircle2 className="h-5 w-5" /> : index + 1}
          </span>
          <span className="mt-2 text-xs font-semibold leading-tight sm:text-sm">{item.title}</span>
          <span className="hidden text-xs text-muted sm:block">{item.sub}</span>
        </div>
      );
    })}
  </div>
);

const FilePick = ({ label, hint, value, onChange, capture }) => {
  const preview = useMemo(() => (value ? URL.createObjectURL(value) : null), [value]);
  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  return (
    <label className="flex cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border-2 border-dashed border-white/15 bg-black/20 p-4 text-center transition hover:border-brand/60">
      {preview ? (
        <img src={preview} alt={label} className="max-h-40 rounded-lg object-contain" />
      ) : (
        <UploadCloud className="h-9 w-9 text-brand" />
      )}
      <span className="text-sm font-semibold">{label}</span>
      <span className="text-xs text-muted">{value ? value.name : hint}</span>
      <input
        type="file"
        accept={IMAGE_ACCEPT}
        capture={capture}
        className="hidden"
        onChange={(event) => onChange(event.target.files?.[0] || null)}
      />
    </label>
  );
};

const VerifyIdentity = () => {
  const { user } = useAuth();
  const [submitted, setSubmitted] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(storageKey(user.id)) || "null");
    } catch {
      return null;
    }
  });
  const [step, setStep] = useState(submitted ? 3 : 0);
  const [info, setInfo] = useState({ fullName: user.name, dob: "", country: "Bangladesh", idType: "" });
  const [front, setFront] = useState(null);
  const [back, setBack] = useState(null);
  const [selfie, setSelfie] = useState(null);

  const set = (key) => (event) => setInfo((previous) => ({ ...previous, [key]: event.target.value }));

  const next = () => {
    if (step === 0 && (!info.fullName.trim() || !info.dob || !info.country || !info.idType)) {
      toast.error("Please fill in every field marked *");
      return;
    }
    if (step === 1 && (!front || (info.idType !== "Passport" && !back))) {
      toast.error(info.idType === "Passport" ? "Upload your passport photo page" : "Upload both sides of your document");
      return;
    }
    if (step === 2 && !selfie) {
      toast.error("Take or upload a selfie to continue");
      return;
    }
    if (step === 2) {
      // No verification endpoint on the server yet — remember the
      // submission on this device so the status survives a reload.
      const record = { ...info, submittedAt: new Date().toISOString() };
      try {
        localStorage.setItem(storageKey(user.id), JSON.stringify(record));
      } catch {
        // Storage blocked — the status just won't persist.
      }
      setSubmitted(record);
      toast.success("Submitted for verification");
    }
    setStep((value) => value + 1);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader title="Verified Identity" subtitle="Verify your identity to unlock monetization, payouts and more features." />
        <div className="hidden items-center gap-3 rounded-2xl border border-[#2f86e6]/40 bg-[#2f86e6]/10 px-4 py-3 sm:flex">
          <ShieldCheck className="h-12 w-12 fill-[#2f86e6]/40 text-[#60a5fa]" />
          <p className="text-sm leading-snug text-slate-200">
            Your identity
            <br />
            Your security
            <br />
            Our priority
          </p>
        </div>
      </div>

      <Stepper step={step} />

      <Card className="p-4 sm:p-5">
        <div className="flex gap-3">
          <CheckCircle2 className="h-11 w-11 shrink-0 fill-[#22c55e] text-card" />
          <div>
            <p className="text-lg font-bold">Why Verify Your Identity?</p>
            <p className="text-sm text-muted">Identity verification helps us keep the platform safe and enables you to:</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4 sm:divide-x sm:divide-line">
          {WHY.map(({ icon: Icon, color, title, text }) => (
            <div key={title} className="flex flex-col items-center text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full text-white" style={{ background: color }}>
                <Icon className="h-6 w-6" />
              </span>
              <p className="mt-2 text-sm font-semibold">{title}</p>
              <p className="text-xs text-muted">{text}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-4 sm:p-5">
        {step === 0 && (
          <>
            <div className="mb-4 flex gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand">
                <UserRound className="h-6 w-6" />
              </span>
              <div>
                <p className="text-lg font-bold">Personal Information</p>
                <p className="text-sm text-muted">Please provide your legal information as per your government ID.</p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full Name (as per ID)" icon={UserRound} required>
                <input value={info.fullName} onChange={set("fullName")} className={inputClass} />
              </Field>
              <Field label="Date of Birth" icon={Calendar} required>
                <input type="date" value={info.dob} onChange={set("dob")} className={inputClass} />
              </Field>
              <Field label="Country / Region" icon={Globe} required>
                <select value={info.country} onChange={set("country")} className={`${inputClass} cursor-pointer`}>
                  {COUNTRIES.map((country) => (
                    <option key={country}>{country}</option>
                  ))}
                </select>
              </Field>
              <Field label="ID Type" icon={FileText} required>
                <select value={info.idType} onChange={set("idType")} className={`${inputClass} cursor-pointer`}>
                  <option value="">Select ID Type</option>
                  {ID_TYPES.map((type) => (
                    <option key={type}>{type}</option>
                  ))}
                </select>
              </Field>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <div className="mb-4 flex gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#2f86e6]">
                <IdCard className="h-6 w-6" />
              </span>
              <div>
                <p className="text-lg font-bold">Identity Document</p>
                <p className="text-sm text-muted">Upload a clear photo of your {info.idType || "ID"}. All corners must be visible.</p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FilePick label={info.idType === "Passport" ? "Photo page" : "Front side"} hint="Any image format" value={front} onChange={setFront} />
              {info.idType !== "Passport" && <FilePick label="Back side" hint="Any image format" value={back} onChange={setBack} />}
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="mb-4 flex gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#a855f7]">
                <Camera className="h-6 w-6" />
              </span>
              <div>
                <p className="text-lg font-bold">Face Verification</p>
                <p className="text-sm text-muted">Take a selfie in good light, looking straight at the camera, without glasses or a cap.</p>
              </div>
            </div>
            <div className="sm:max-w-sm">
              <FilePick label="Take a selfie" hint="Opens your camera on a phone" value={selfie} onChange={setSelfie} capture="user" />
            </div>
          </>
        )}

        {step === 3 && (
          <div className="flex flex-col items-center py-6 text-center">
            <ShieldCheck className="h-16 w-16 fill-[#2f86e6]/30 text-[#60a5fa]" />
            <p className="mt-3 text-xl font-bold">Under Verification</p>
            <p className="mt-1 max-w-md text-sm text-muted">
              Thanks, {submitted?.fullName || user.name}! We've received your {submitted?.idType || "documents"}.
              Verification usually takes 1–3 business days.
            </p>
            {submitted?.submittedAt && (
              <p className="mt-3 text-xs text-slate-500">Submitted {new Date(submitted.submittedAt).toLocaleString()}</p>
            )}
          </div>
        )}

        {step < 3 && (
          <div className="mt-5 flex gap-3">
            {step > 0 && (
              <GhostButton onClick={() => setStep((value) => value - 1)} className="px-5">
                <ArrowLeft className="h-4 w-4" /> Back
              </GhostButton>
            )}
            <PrimaryButton onClick={next} className="flex-1">
              {step === 2 ? "Submit for Review" : "Continue"} <ArrowRight className="h-5 w-5" />
            </PrimaryButton>
          </div>
        )}
      </Card>

      <Card className="flex gap-3 p-4 sm:p-5">
        <Info className="h-11 w-11 shrink-0 fill-[#2f86e6] text-card" />
        <div>
          <p className="font-semibold text-[#60a5fa]">Important Information</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-300 marker:text-[#2f86e6]">
            <li>Your information must match your government-issued ID.</li>
            <li>We accept National ID Card, Passport or Driving License.</li>
            <li>All data is encrypted and kept secure.</li>
            <li>Verification usually takes 1–3 business days.</li>
          </ul>
        </div>
      </Card>

      <Card className="flex flex-wrap items-center gap-3 p-4 sm:p-5">
        <HelpCircle className="h-11 w-11 shrink-0 fill-[#a855f7] text-card" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-[#c084fc]">Need Help?</p>
          <p className="text-sm text-slate-300">If you face any problem, please contact our support team.</p>
        </div>
        <GhostButton onClick={() => toast.info("Support chat is coming soon.")}>
          <Headphones className="h-4 w-4" /> Contact Support
        </GhostButton>
      </Card>
    </div>
  );
};

export default VerifyIdentity;
