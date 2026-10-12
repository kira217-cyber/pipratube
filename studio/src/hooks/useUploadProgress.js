import { useCallback, useEffect, useRef, useState } from "react";

// Tracks a video upload and reports how much longer it will actually take.
//
// An upload runs in two sequential legs, and the server buffers the whole
// file before starting the second, so they never overlap:
//
//   leg 1  browser -> our server        (the uploader's connection)
//   leg 2  our server -> Bunny storage  (a data centre link)
//
// Getting an honest number out of that needs three things:
//
//   • Measure in bytes against a known total. Both legs have an exact byte
//     count, so "remaining bytes / speed" is a real answer rather than an
//     extrapolation from a percentage.
//
//   • Use each leg's average speed since it started, not its speed right
//     now. The server pushes storage in 1MB steps and is polled every
//     400ms, so the instantaneous rate swings between nothing and a burst —
//     feeding that into the estimate is what makes a countdown jitter up
//     and down. A running average settles within a couple of seconds and
//     then barely moves.
//
//   • Remember how fast each leg ran last time. Leg 2's speed is genuinely
//     unknowable until it starts, so a first upload has to assume something
//     about it; every upload after that starts from a real measurement.

const TICK_MS = 1000;

// A speed is only worth trusting once its leg has been running a moment.
const MIN_MEASURE_MS = 1200;

// Blend of last-known and just-measured speed when storing the prior, so
// one unusual network moment doesn't skew the next upload's estimate.
const PRIOR_BLEND = 0.5;

// Safety net for the one correction that can't be designed away — the
// handover to leg 2 on a first upload, before any prior exists. The
// countdown holds still for a few seconds rather than jumping, then walks
// up a second at a time.
const HOLD_TICKS = 4;
const CATCH_DOWN = 0.25;

const PRIOR_KEY = "pipratv_upload_speeds";

const readPrior = () => {
  try {
    const raw = JSON.parse(window.localStorage.getItem(PRIOR_KEY) || "{}");
    return {
      send: Number(raw.send) > 0 ? Number(raw.send) : 0,
      store: Number(raw.store) > 0 ? Number(raw.store) : 0,
    };
  } catch {
    return { send: 0, store: 0 };
  }
};

const writePrior = (next) => {
  try {
    window.localStorage.setItem(PRIOR_KEY, JSON.stringify(next));
  } catch {
    // Storage disabled — the next upload measures from scratch again.
  }
};

const IDLE = {
  active: false,
  status: "idle", // idle | uploading | cancelling | done | error
  phase: "send", // send | prepare | store
  percent: 0,
  remaining: null, // seconds, or null until there is a measurement to use
  speed: 0, // bytes per second of whichever leg is running
  fileName: "",
  fileSize: 0,
  error: "",
};

const freshMeter = (storedBytes) => ({
  storedBytes, // bytes leg 2 will push to storage (0 when no media file)
  sendTotal: 0, // bytes leg 1 will send, learned from the first reading
  sendDone: 0,
  storeDone: 0,
  sendStartedAt: 0,
  storeStartedAt: 0,
  sendSpeed: 0,
  storeSpeed: 0,
  leg: 1,
  weight: null, // share of the bar leg 1 owns, frozen once it is known
  target: null, // the honest estimate, float seconds
  shown: null, // what the countdown displays, float seconds
  holds: 0,
  percent: 0,
  goal: 0, // whole percent the counter is allowed to reach right now
  shownFloat: 0, // the counter's exact position, between whole numbers
  finishing: false, // set by complete(): the counter may now reach 100
  onFull: null, // resolves complete()'s promise once 100 is on screen
});

// True for the error axios raises when an upload is deliberately aborted,
// so a cancel is never reported to the user as a failure.
export const isUploadCancelled = (error) =>
  error?.code === "ERR_CANCELED" ||
  error?.name === "CanceledError" ||
  error?.name === "AbortError";

export const useUploadProgress = () => {
  const [state, setState] = useState(IDLE);
  const meter = useRef(freshMeter(0));
  const prior = useRef(readPrior());
  const aborter = useRef(null);

  const publish = useCallback(() => {
    const m = meter.current;
    // The number on screen counts up to this one step at a time (see the
    // counter below); 100 waits for the server to confirm.
    m.goal = Math.max(m.goal, Math.min(99, Math.floor(m.percent)));

    setState((previous) => {
      if (previous.status !== "uploading") return previous;

      const next = {
        phase:
          m.leg === 2
            ? "store"
            : m.sendTotal > 0 && m.sendDone >= m.sendTotal
              ? "prepare"
              : "send",
        remaining: m.shown === null ? null : Math.max(0, Math.round(m.shown)),
        speed: Math.round(m.leg === 2 ? m.storeSpeed : m.sendSpeed),
      };

      // Progress fires many times a second; returning the same object when
      // nothing on screen moved lets React skip the render entirely.
      if (
        previous.phase === next.phase &&
        previous.remaining === next.remaining &&
        previous.speed === next.speed
      ) {
        return previous;
      }

      return { ...previous, ...next };
    });
  }, []);

  // Recomputes the estimate and the bar from everything measured so far.
  // Runs after every reading from either leg.
  const recalculate = useCallback(() => {
    const m = meter.current;
    const now = Date.now();

    if (m.leg === 1 && m.sendStartedAt) {
      const elapsed = now - m.sendStartedAt;
      if (elapsed >= MIN_MEASURE_MS) m.sendSpeed = m.sendDone / (elapsed / 1000);
    }

    if (m.leg === 2 && m.storeStartedAt) {
      const elapsed = now - m.storeStartedAt;
      if (elapsed >= MIN_MEASURE_MS) m.storeSpeed = m.storeDone / (elapsed / 1000);
    }

    // Best speed available for each leg: measured first, then whatever this
    // browser measured on a previous upload, then the other leg's speed.
    const sendSpeed = m.sendSpeed || prior.current.send;
    const storeSpeed = m.storeSpeed || prior.current.store || sendSpeed;

    // Freeze how the bar splits between the two legs as soon as both speeds
    // are known, so it advances at a steady rate instead of racing through
    // one half and crawling through the other. Re-weighting later would
    // make the bar lurch, so it is only ever decided once.
    if (m.weight === null && sendSpeed > 0 && storeSpeed > 0 && m.sendTotal > 0) {
      const sendTime = m.sendTotal / sendSpeed;
      const storeTime = m.storedBytes > 0 ? m.storedBytes / storeSpeed : 0;
      const totalTime = sendTime + storeTime;
      if (totalTime > 0) m.weight = sendTime / totalTime;
    }

    const weight = m.weight === null ? (m.storedBytes > 0 ? 0.5 : 1) : m.weight;

    const sentFraction = m.sendTotal > 0 ? Math.min(1, m.sendDone / m.sendTotal) : 0;
    const storedFraction = m.storedBytes > 0 ? Math.min(1, m.storeDone / m.storedBytes) : 0;

    // Never let the bar walk backwards, whatever the two legs report.
    m.percent = Math.max(
      m.percent,
      (sentFraction * weight + storedFraction * (1 - weight)) * 100,
    );

    const sendLeft =
      sendSpeed > 0 ? Math.max(0, m.sendTotal - m.sendDone) / sendSpeed : null;

    const storeLeft =
      m.storedBytes === 0
        ? 0
        : storeSpeed > 0
          ? Math.max(0, m.storedBytes - m.storeDone) / storeSpeed
          : null;

    if (sendLeft !== null && storeLeft !== null) {
      m.target = sendLeft + storeLeft;
      if (m.shown === null) m.shown = m.target;
    }

    publish();
  }, [publish]);

  // Returns the AbortSignal to hand to the request, so the modal's cancel
  // button can stop an upload that is already in flight.
  const start = useCallback(({ fileName = "", fileSize = 0, storedBytes = 0 } = {}) => {
    meter.current = freshMeter(storedBytes);
    meter.current.sendStartedAt = Date.now();
    prior.current = readPrior();
    aborter.current = new AbortController();
    setState({ ...IDLE, active: true, status: "uploading", fileName, fileSize });
    return aborter.current.signal;
  }, []);

  // Aborting is not instant — the request has to unwind and the server has
  // to notice — so the modal stays up in a "cancelling" state until the
  // page catches the resulting error and closes it.
  const cancel = useCallback(() => {
    aborter.current?.abort();
    setState((previous) =>
      previous.status === "uploading" ? { ...previous, status: "cancelling" } : previous,
    );
  }, []);

  // Leg 1 — byte counts straight from the browser's own upload progress.
  const reportSent = useCallback(
    (loaded, total) => {
      const m = meter.current;
      if (m.leg !== 1) return;

      m.sendTotal = total;
      m.sendDone = Math.max(m.sendDone, loaded);
      recalculate();
    },
    [recalculate],
  );

  // Leg 2 — the server's own progress pushing the file to storage.
  const reportStored = useCallback(
    (percent) => {
      const m = meter.current;
      if (!m.storedBytes || percent <= 0) return;

      if (m.leg === 1) {
        m.leg = 2;
        m.storeStartedAt = Date.now();
        m.sendDone = m.sendTotal; // leg 1 is finished by definition now
      }

      m.storeDone = Math.max(
        m.storeDone,
        (m.storedBytes * Math.min(100, percent)) / 100,
      );
      recalculate();
    },
    [recalculate],
  );

  // The upload is confirmed. Counts the last few numbers up to 100, marks
  // it done, and resolves once 100% is actually on screen.
  const complete = useCallback(() => {
    const m = meter.current;
    m.shown = 0;

    // Remember what this connection actually managed, so the next upload
    // predicts both legs from the first second instead of guessing.
    const next = { ...prior.current };

    if (m.sendSpeed > 0) {
      next.send = next.send
        ? next.send * PRIOR_BLEND + m.sendSpeed * (1 - PRIOR_BLEND)
        : m.sendSpeed;
    }

    if (m.storeSpeed > 0) {
      next.store = next.store
        ? next.store * PRIOR_BLEND + m.storeSpeed * (1 - PRIOR_BLEND)
        : m.storeSpeed;
    }

    prior.current = next;
    writePrior(next);

    return new Promise((resolve) => {
      m.finishing = true;
      m.onFull = resolve;
      // A hidden tab pauses the counter — don't keep the caller waiting.
      window.setTimeout(() => {
        if (m.onFull !== resolve) return;
        m.onFull = null;
        setState((previous) => (previous.active ? { ...previous, status: "done", percent: 100, remaining: 0 } : previous));
        resolve();
      }, 4000);
    });
  }, []);

  const fail = useCallback((message = "Upload failed") => {
    setState((previous) =>
      previous.active ? { ...previous, status: "error", error: message } : previous,
    );
  }, []);

  const reset = useCallback(() => setState(IDLE), []);

  // The percentage counter. It moves at the upload's real average pace, so
  // the numbers tick 1, 2, 3… evenly instead of racing ahead and stopping;
  // when it falls behind the real figure it speeds up to catch up. It never
  // moves more than one number per frame (nothing is skipped), never passes
  // what has really been sent, and only reaches 100 after complete().
  useEffect(() => {
    if (!state.active || state.status === "error" || state.status === "done") return undefined;
    let frame = 0;
    let last = performance.now();
    const step = (now) => {
      const m = meter.current;
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      const goal = m.finishing ? 100 : m.goal;
      const gap = goal - m.shownFloat;
      if (gap > 0) {
        const elapsed = m.sendStartedAt ? (Date.now() - m.sendStartedAt) / 1000 : 0;
        const pace = elapsed > 1 ? m.percent / elapsed : 0; // % per second, on average
        const speed = m.finishing ? Math.max(30, gap * 3) : Math.max(pace, gap * 0.6, 0.5);
        m.shownFloat = Math.min(goal, m.shownFloat + Math.min(1, speed * dt));
      }
      const shown = Math.floor(m.shownFloat);
      setState((previous) => {
        if (previous.status !== "uploading" && previous.status !== "cancelling") return previous;
        if (shown <= previous.percent) return previous;
        const percent = previous.percent + 1;
        if (percent >= 100) return { ...previous, percent: 100, status: "done", remaining: 0 };
        return { ...previous, percent };
      });
      frame = window.requestAnimationFrame(step);
    };
    frame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frame);
  }, [state.active, state.status]);

  // Tell complete()'s caller once 100% is showing.
  useEffect(() => {
    const m = meter.current;
    if (state.status === "done" && m.onFull) {
      const resolve = m.onFull;
      m.onFull = null;
      resolve();
    }
  }, [state.status]);

  // The countdown itself — one tick a second, so the number reads like a
  // clock between readings. It stops at 0 without claiming success; the
  // modal shows "Finishing up..." there until the server confirms.
  useEffect(() => {
    if (state.status !== "uploading") return undefined;

    const timer = window.setInterval(() => {
      const m = meter.current;
      if (m.shown === null || m.target === null) return;

      if (m.target > m.shown + 1) {
        // Slower than it looked. Hold, then walk up a second at a time — a
        // countdown that leaps upward reads as broken.
        m.holds += 1;
        if (m.holds > HOLD_TICKS) m.shown += 1;
      } else {
        m.holds = 0;
        m.shown = Math.max(0, m.shown - Math.max(1, (m.shown - m.target) * CATCH_DOWN));
      }

      setState((previous) =>
        previous.status === "uploading"
          ? { ...previous, remaining: Math.max(0, Math.round(m.shown)) }
          : previous,
      );
    }, TICK_MS);

    return () => window.clearInterval(timer);
  }, [state.status]);

  // Closing the tab mid-upload loses the whole file, so warn first.
  useEffect(() => {
    if (state.status !== "uploading") return undefined;

    const warn = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [state.status]);

  // The modal covers the page — don't let the page scroll behind it.
  useEffect(() => {
    if (!state.active) return undefined;

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previous;
    };
  }, [state.active]);

  return {
    upload: state,
    start,
    reportSent,
    reportStored,
    complete,
    fail,
    cancel,
    reset,
  };
};

export default useUploadProgress;
