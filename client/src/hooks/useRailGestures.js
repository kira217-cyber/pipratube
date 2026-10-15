import { useEffect } from "react";

// Sideways rows (video rows, Shorts, channel circles) must never trap the
// page's own scrolling. Browsers hand a whole gesture to the first thing
// that can scroll under the finger, so a slanted swipe could get stuck in
// the row and the page wouldn't move.
//
// Sideways scrolling stays the browser's own (smooth, on the GPU). We only
// step in when it fails the page:
//   • Touch: on a mostly-vertical swipe, if the page hasn't moved after the
//     finger has, we move it with the finger and let it glide at the end.
//   • Mouse wheel: left to the browser (smooth). Trackpad: a mostly-vertical
//     swipe with a little sideways movement goes to the page.
//
// `key` re-attaches when the row element is replaced (e.g. after "Show less").
export const useRailGestures = (ref, key) => {
  useEffect(() => {
    const rail = ref.current;
    if (!rail) return undefined;

    let start = null; // { x, y, axis, lastY, manual, samples, native }
    let fling = 0;
    let ownY = null; // where our own scrollBy put the page, to tell it apart

    // Any page scroll we didn't cause means the browser is handling the
    // swipe itself — then we stay out of it.
    const onScroll = () => {
      if (!start) return;
      if (ownY !== null && Math.abs(window.scrollY - ownY) < 2) return;
      start.native = true;
    };
    const scrollPage = (top) => {
      window.scrollBy({ top, behavior: "instant" });
      ownY = window.scrollY;
    };

    const onTouchStart = (event) => {
      if (event.touches.length !== 1) return;
      window.cancelAnimationFrame(fling);
      const t = event.touches[0];
      ownY = null;
      start = { x: t.clientX, y: t.clientY, axis: null, lastY: t.clientY, manual: false, samples: [], native: false };
    };

    const onTouchMove = (event) => {
      if (!start || event.touches.length !== 1) return;
      const t = event.touches[0];
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      if (!start.axis) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        start.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      }
      if (start.axis !== "y") return; // sideways: the browser scrolls the row
      const step = t.clientY - start.lastY;
      start.lastY = t.clientY;
      if (start.native) {
        start.manual = false;
        return;
      }
      if (!start.manual && Math.abs(dy) > 40) start.manual = true;
      if (start.manual) {
        scrollPage(-step);
        start.samples.push({ y: t.clientY, time: event.timeStamp });
        if (start.samples.length > 5) start.samples.shift();
      }
    };

    const onTouchEnd = () => {
      const s = start?.samples || [];
      if (start?.manual && !start.native && s.length >= 2) {
        // A glide for the page, slowing down like native scrolling.
        let velocity = -(s[s.length - 1].y - s[0].y) / Math.max(1, s[s.length - 1].time - s[0].time); // px per ms
        let last = performance.now();
        const glide = (now) => {
          const dt = now - last;
          last = now;
          scrollPage(velocity * dt);
          velocity *= Math.pow(0.995, dt);
          if (Math.abs(velocity) > 0.02) fling = window.requestAnimationFrame(glide);
        };
        fling = window.requestAnimationFrame(glide);
      }
      start = null;
    };

    const onWheel = (event) => {
      if (event.ctrlKey) return; // pinch-zoom
      // A plain mouse wheel (no sideways part) already scrolls the page,
      // smoothly, by itself — never touch it.
      if (event.deltaX === 0) return;
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY) || event.shiftKey) return; // the row scrolls itself
      // A trackpad swipe that is mostly vertical but a little sideways would
      // get stuck in the row: give it to the page (trackpads send many small
      // steps, so moving the page with them stays smooth).
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
      window.scrollBy({ top: event.deltaY * unit, left: 0, behavior: "instant" });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    rail.addEventListener("touchstart", onTouchStart, { passive: true });
    rail.addEventListener("touchmove", onTouchMove, { passive: true });
    rail.addEventListener("touchend", onTouchEnd, { passive: true });
    rail.addEventListener("touchcancel", onTouchEnd, { passive: true });
    rail.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      window.cancelAnimationFrame(fling);
      window.removeEventListener("scroll", onScroll);
      rail.removeEventListener("touchstart", onTouchStart);
      rail.removeEventListener("touchmove", onTouchMove);
      rail.removeEventListener("touchend", onTouchEnd);
      rail.removeEventListener("touchcancel", onTouchEnd);
      rail.removeEventListener("wheel", onWheel);
    };
  }, [ref, key]);
};

export default useRailGestures;
