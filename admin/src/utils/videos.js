// Can anyone open this video's page on the site right now? (Held for
// review, removed, private or unfinished videos play in the admin instead.)
export const isOnSite = (video) => video.status === "published" && video.visibility !== "private";
