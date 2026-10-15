import { publicUrl } from "./localFiles.js";

// The shapes the API sends out. Kept in one place so every endpoint
// describes a user, channel or video the same way.

export const formatDuration = (seconds) => {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
};

export const publicUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email || null,
  phone: user.phone || null,
  avatar: publicUrl(user.avatar?.url) || null,
  phoneVerified: Boolean(user.phoneVerified),
  emailVerified: Boolean(user.emailVerified),
  status: user.status,
  createdAt: user.createdAt,
});

export const channelSummary = (channel) =>
  channel?._id
    ? {
        id: channel._id,
        name: channel.name,
        handle: channel.handle,
        avatar: publicUrl(channel.avatar?.url) || null,
        verified: Boolean(channel.verified),
        subscriberCount: channel.subscriberCount || 0,
      }
    : null;

export const publicChannel = (channel) => ({
  ...channelSummary(channel),
  description: channel.description,
  banner: publicUrl(channel.banner?.url) || null,
  links: channel.links || [],
  category: channel.category,
  language: channel.language,
  country: channel.country,
  contactEmail: channel.contactEmail || "",
  videoCount: channel.videoCount || 0,
  totalViews: channel.totalViews || 0,
  status: channel.status,
  createdAt: channel.createdAt,
});

// `owner: true` adds the creator-only fields (visibility, status, file info).
export const publicVideo = (video, { owner = false } = {}) => {
  const channel = channelSummary(video.channel);
  // publicUrl again here: aggregate results (random / trending lists) are
  // plain objects, so the model getter never ran on them.
  const thumb = publicUrl(video.thumbnail?.url) || null;

  const base = {
    id: video._id,
    title: video.title,
    description: video.description,
    tags: video.tags || [],
    category: video.category,
    thumbnail: thumb,
    // A plain MP4 every <video> plays (Bunny Stream's MP4 copy when there is
    // one); hlsUrl is the adaptive stream the main players use for quality.
    videoUrl: video.file?.fallbackUrl || video.file?.url || null,
    hlsUrl: video.file?.provider === "stream" && /\.m3u8($|\?)/.test(video.file?.url || "") ? video.file.url : null,
    durationSeconds: video.durationSeconds,
    duration: formatDuration(video.durationSeconds),
    isShort: Boolean(video.isShort),
    width: video.width || 0,
    height: video.height || 0,
    orientation: video.height > video.width ? "portrait" : "landscape",
    views: video.views || 0,
    likes: video.likes || 0,
    commentCount: video.commentCount || 0,
    shares: video.shares || 0,
    allowComments: video.allowComments !== false,
    publishedAt: video.publishedAt,
    createdAt: video.createdAt,
    channel,
  };

  if (owner) {
    Object.assign(base, {
      visibility: video.visibility,
      status: video.status,
      removedReason: video.removedReason || null,
      dislikes: video.dislikes || 0,
      madeForKids: Boolean(video.madeForKids),
      processing: ["processing", "failed"].includes(video.status)
        ? { stage: video.processing?.stage || "checking", percent: video.processing?.percent || 0, error: video.processing?.error || null }
        : null,
      file: { provider: video.file?.provider, size: video.file?.size || 0, mimeType: video.file?.mimeType || null },
      moderation:
        video.status === "review" || ["flagged", "rejected"].includes(video.moderation?.status)
          ? { status: video.moderation.status, reason: video.moderation.reason || null, flaggedAt: video.moderation.flaggedAt || null }
          : null,
      updatedAt: video.updatedAt,
    });
  }

  return base;
};
