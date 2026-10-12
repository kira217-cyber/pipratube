import { PipraChannel } from "../models/Site.js";
import { resolveAllTimeVideo, resolveNowPlaying, resolveUpcoming } from "./liveTvSchedule.js";

// Shapes PipraTV's own channel for the public Live TV lists and works out
// what it's playing right now.

const playable = (video) => video && video.status === "published" && video.file?.url && video.durationSeconds > 0;

export const loadPipraChannel = async () => {
  const channel = await PipraChannel.findOne().populate("loop").populate("schedule.video");
  return channel && channel.enabled ? channel : null;
};

export const pipraListing = (channel) => ({
  _id: channel._id,
  id: channel._id,
  name: channel.name,
  logo: channel.logo?.url || null,
  categories: channel.categories,
  showOnList: true,
  pinned: channel.pinned,
  homeFeatured: channel.homeFeatured,
  enabled: channel.enabled,
  order: -1,
  channelType: "scheduled",
});

export const pipraNowPlaying = (channel, now = new Date()) => {
  const loop = channel.loop.filter(playable).map((v) => ({ video: { url: v.file.url, title: v.title }, durationSeconds: v.durationSeconds }));
  const schedule = channel.schedule
    .filter((slot) => playable(slot.video))
    .map((slot) => ({ video: { url: slot.video.file.url, title: slot.video.title }, startTime: slot.startTime, date: slot.date, durationSeconds: slot.video.durationSeconds }));

  const scheduled = resolveNowPlaying({ schedule }, now);
  const result = scheduled || resolveAllTimeVideo(loop, now);
  if (!result?.video?.url) return null;
  const upcoming = resolveUpcoming({ schedule }, now, 5);
  return {
    video: { url: result.video.url, title: result.video.title },
    offsetSeconds: result.offsetSeconds,
    isFallback: !scheduled,
    upcoming: upcoming?.video?.url ? { video: { url: upcoming.video.url }, startsInSeconds: upcoming.startsInSeconds } : null,
  };
};
