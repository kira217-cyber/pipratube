import { useEffect } from "react";

// Videos uploaded through Bunny Stream play as HLS (an .m3u8 playlist with
// several qualities). hls.js feeds it to the <video> wherever it can (and
// lets us offer a quality menu); iPhone Safari plays it natively. Plain
// MP4s are left to the browser as before.
//
//   <video ref={ref} src={playableSrc(url)} />   +   useHlsSource(ref, url)

export const isHls = (src) => typeof src === "string" && /\.m3u8($|\?)/i.test(src);

// What to put in <video src>: MP4s directly; HLS is attached by the hook.
export const playableSrc = (src) => (isHls(src) ? undefined : src || undefined);

// Attaches an HLS source to the video in `ref`. `onReady(hls)` receives the
// hls.js instance (null on Safari) once it's running, e.g. for qualities.
// Pass `enabled: false` to hold off (previews load only when they start).
export const useHlsSource = (ref, src, { enabled = true, onReady } = {}) => {
  useEffect(() => {
    const video = ref.current;
    if (!video || !enabled || !isHls(src)) return undefined;

    // hls.js first wherever it works (it gives the quality menu); the
    // browser's own HLS only where it doesn't (iPhone Safari).
    let hls = null;
    let cancelled = false;
    let native = false;
    import("hls.js").then(({ default: Hls }) => {
      if (cancelled) return;
      if (!Hls.isSupported()) {
        native = true;
        video.src = src;
        onReady?.(null);
        return;
      }
      hls = new Hls({ capLevelToPlayerSize: true, startLevel: -1 });
      hls.loadSource(src);
      hls.attachMedia(video);
      onReady?.(hls);
    });
    return () => {
      cancelled = true;
      hls?.destroy();
      if (native) {
        video.removeAttribute("src");
        video.load();
      }
    };
    // onReady is read once per source on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, src, enabled]);
};
