import { Notification, Subscription } from "../models/Engagement.js";

// Creating notifications must never break the action that caused them,
// so every helper here swallows (and logs) its own failures.

const safe = (promise) =>
  promise.catch((error) => {
    console.error("notification failed:", error.message);
  });

export const notifyUser = (fields) => {
  if (!fields.user || (fields.actor && String(fields.actor) === String(fields.user))) return Promise.resolve();
  return safe(Notification.create(fields));
};

// A channel published a video — tell every subscriber who rang the bell.
export const notifySubscribers = (channel, video) =>
  safe(
    (async () => {
      const subs = await Subscription.find({ channel: channel._id, notify: "all" }).select("subscriber").lean();
      if (subs.length === 0) return;
      const docs = subs.map((sub) => ({
        user: sub.subscriber,
        type: "new_video",
        actor: channel.owner,
        channel: channel._id,
        video: video._id,
        text: video.title,
      }));
      // In batches so a channel with many subscribers can't make one huge write.
      for (let i = 0; i < docs.length; i += 1000) {
        await Notification.insertMany(docs.slice(i, i + 1000), { ordered: false });
      }
    })(),
  );
