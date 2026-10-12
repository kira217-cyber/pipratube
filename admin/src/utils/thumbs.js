// Recommended thumbnail sizes: Shorts are vertical, other videos 16:9.
export const THUMB_SPEC = {
  short: { width: 1080, height: 1920, ratio: "9:16", label: "Shorts thumbnail", shape: "aspect-[9/16]" },
  video: { width: 1280, height: 720, ratio: "16:9", label: "Video thumbnail", shape: "aspect-video" },
};

export const thumbSpec = (isShort) => (isShort ? THUMB_SPEC.short : THUMB_SPEC.video);

// "" when the image fits the recommended shape, otherwise a short warning.
export const thumbWarning = (file, spec) =>
  new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    const done = (message) => {
      URL.revokeObjectURL(url);
      resolve(message);
    };
    img.onload = () =>
      done(
        Math.abs(img.naturalWidth / img.naturalHeight - spec.width / spec.height) > 0.08
          ? `This image is ${img.naturalWidth} × ${img.naturalHeight}. ${spec.ratio} (${spec.width} × ${spec.height}) fits best — other shapes get cropped.`
          : "",
      );
    img.onerror = () => done("");
    img.src = url;
  });
