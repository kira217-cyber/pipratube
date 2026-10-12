// Figures for creator features the server doesn't track yet (daily
// curves, watch time, revenue, audience, traffic). Until it does, they are
// all zero — no made-up numbers are ever shown. Replace with API data once
// the endpoints exist.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const dayLabels = (days) => {
  const labels = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    labels.push(`${MONTHS[d.getMonth()]} ${String(d.getDate()).padStart(2, "0")}`);
  }
  return labels;
};

// Day-by-day series (not recorded yet): every day is 0.
export const demoSeries = (seed, days) => dayLabels(days).map((label) => ({ label, value: 0 }));

const NO_GROWTH = { views: 0, subscribers: 0, likes: 0, comments: 0, watch: 0, revenue: 0, total: 0, available: 0, pending: 0 };

export const demoChannel = () => ({
  subscribers: 0,
  likes: 0,
  comments: 0,
  watchHours: 0,
  revenue: 0,
  growth: NO_GROWTH,
});

export const DEMO_AUDIENCE = {
  male: 0,
  female: 0,
  ages: [
    { label: "13–17", value: 0 },
    { label: "18–24", value: 0 },
    { label: "25–34", value: 0 },
    { label: "35–44", value: 0 },
    { label: "45+", value: 0 },
  ],
};

export const DEMO_TRAFFIC = [
  { label: "PipraTube Search", value: 0, color: "#ff3d7f" },
  { label: "Browse Features", value: 0, color: "#2f86e6" },
  { label: "External", value: 0, color: "#d97706" },
  { label: "Suggested Videos", value: 0, color: "#a855f7" },
  { label: "Other", value: 0, color: "#6b7280" },
];

// Monetization isn't live: no earnings, no payouts.
export const demoEarning = () => ({
  total: 0,
  available: 0,
  pending: 0,
  paidOut: 0,
  lastPayment: null,
  growth: NO_GROWTH,
});

export const demoVideoEarning = () => 0;

// The video's real likes and comments; no growth figure yet.
export const demoVideoEngagement = (video) => ({
  likes: video?.likes || 0,
  comments: video?.commentCount || 0,
  growth: 0,
});
