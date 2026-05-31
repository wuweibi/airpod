import { motion } from "framer-motion";
import { Film } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

const assetUrl = (path) => `${import.meta.env.BASE_URL}${path}`;
const VIDEO_SRC = assetUrl(import.meta.env.VITE_AIRPOD_VIDEO_FORWARD || "teardown-airpod.mp4");
const VIDEO_REVERSE_SRC = assetUrl(import.meta.env.VITE_AIRPOD_VIDEO_REVERSE || "teardown-airpod-reverse.mp4");
const POSTER_SRC = assetUrl("teardown-poster.jpg");
const TAIL_POSTER_SRC = assetUrl("teardown-tail.jpg");

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function formatPercent(value) {
  return `${Math.round(clamp(value) * 100)}%`;
}

function useVideoPreload(videoSources) {
  const [state, setState] = useState({
    isReady: false,
    hasError: false,
    totalProgress: 0,
    items: videoSources.map((item) => ({ key: item.key, label: item.label, progress: 0 })),
    resolvedSources: {},
  });

  useEffect(() => {
    let cancelled = false;
    const abortController = new AbortController();
    const objectUrls = [];

    const updateItemProgress = (index, progress) => {
      if (cancelled) return;
      setState((previous) => {
        const items = previous.items.map((item, itemIndex) =>
          itemIndex === index ? { ...item, progress: clamp(progress) } : item,
        );
        const totalProgress = items.reduce((sum, item) => sum + item.progress, 0) / items.length;
        return { ...previous, items, totalProgress };
      });
    };

    const preloadOne = async (source, index) => {
      const response = await fetch(source.src, { signal: abortController.signal });
      if (!response.ok) {
        throw new Error(`Failed to preload "${source.src}" (${response.status})`);
      }

      const contentLengthHeader = response.headers.get("content-length");
      const contentLength = contentLengthHeader ? Number(contentLengthHeader) : 0;
      if (!response.body || !Number.isFinite(contentLength) || contentLength <= 0) {
        const fallbackBlob = await response.blob();
        updateItemProgress(index, 1);
        return URL.createObjectURL(fallbackBlob);
      }

      const reader = response.body.getReader();
      const chunks = [];
      let loaded = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          loaded += value.byteLength;
          updateItemProgress(index, loaded / contentLength);
        }
      }

      const blob = new Blob(chunks, { type: "video/mp4" });
      updateItemProgress(index, 1);
      return URL.createObjectURL(blob);
    };

    const run = async () => {
      try {
        const sources = {};
        const results = await Promise.all(
          videoSources.map(async (item, index) => {
            const blobUrl = await preloadOne(item, index);
            return { key: item.key, blobUrl };
          }),
        );

        for (const item of results) {
          sources[item.key] = item.blobUrl;
          objectUrls.push(item.blobUrl);
        }

        if (cancelled) return;
        setState((previous) => ({
          ...previous,
          isReady: true,
          totalProgress: 1,
          items: previous.items.map((item) => ({ ...item, progress: 1 })),
          resolvedSources: sources,
        }));
      } catch (error) {
        if (cancelled || abortController.signal.aborted) return;
        console.error(error);
        setState((previous) => ({
          ...previous,
          isReady: true,
          hasError: true,
          totalProgress: 1,
          items: previous.items.map((item) => ({ ...item, progress: 1 })),
          resolvedSources: {
            forward: videoSources.find((item) => item.key === "forward")?.src,
            reverse: videoSources.find((item) => item.key === "reverse")?.src,
          },
        }));
      }
    };

    run();

    return () => {
      cancelled = true;
      abortController.abort();
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [videoSources]);

  return state;
}

function useScrubProgress() {
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(0);
  const targetRef = useRef(0);
  const renderedRef = useRef(0);
  const lastInputDirectionRef = useRef(0);
  const smoothingBoostRef = useRef(0);
  const touchYRef = useRef(null);
  const touchTimeRef = useRef(0);
  const touchVelocityRef = useRef(0);
  const wheelVelocityRef = useRef(0);
  const wheelReleaseTimerRef = useRef(0);
  const lastWheelSampleAtRef = useRef(0);
  const inertiaFrameRef = useRef(0);
  const renderFrameRef = useRef(0);

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  useEffect(() => {
    const wheelPixelsForFullVideo = 5200;
    const touchPixelsForFullVideo = 2600;
    const minTouchDelta = 1;
    const touchInertiaMinVelocity = 0.06; // px/ms
    const wheelInertiaMinVelocity = 0.03; // px/ms
    const inertiaDampingPerFrame = 0.92;
    const inertiaStopVelocity = 0.015; // px/ms
    const baseSmoothing = 0.24;
    const emitEpsilon = 0.0007;

    const applyDelta = (deltaPixels, pixelsForFullVideo, source = "input") => {
      const direction = Math.sign(deltaPixels);
      if (direction && lastInputDirectionRef.current && direction !== lastInputDirectionRef.current) {
        // Direction changed abruptly: temporarily increase follow speed to reduce reverse lag.
        smoothingBoostRef.current = 0.22;
        if (source === "touch") {
          touchVelocityRef.current = 0;
        }
        if (source === "wheel") {
          wheelVelocityRef.current = 0;
        }
      }
      if (direction) {
        lastInputDirectionRef.current = direction;
      }
      targetRef.current = clamp(targetRef.current + deltaPixels / pixelsForFullVideo);
    };

    const stopInertia = () => {
      if (inertiaFrameRef.current) {
        cancelAnimationFrame(inertiaFrameRef.current);
        inertiaFrameRef.current = 0;
      }
    };

    const startInertia = (initialVelocity, pixelsForFullVideo, minVelocity) => {
      if (Math.abs(initialVelocity) < minVelocity) return;
      stopInertia();

      let velocity = initialVelocity;
      let lastTime = performance.now();

      const tick = (now) => {
        const dt = Math.min(48, now - lastTime);
        lastTime = now;

        const frameDelta = velocity * dt;
        applyDelta(frameDelta, pixelsForFullVideo, "inertia");

        const decay = Math.pow(inertiaDampingPerFrame, dt / 16.67);
        velocity *= decay;

        const hitBoundary = targetRef.current <= 0 || targetRef.current >= 1;
        if (hitBoundary || Math.abs(velocity) < inertiaStopVelocity) {
          inertiaFrameRef.current = 0;
          return;
        }

        inertiaFrameRef.current = requestAnimationFrame(tick);
      };

      inertiaFrameRef.current = requestAnimationFrame(tick);
    };

    const renderProgress = () => {
      const smoothing = clamp(baseSmoothing + smoothingBoostRef.current, baseSmoothing, 0.52);
      const next = renderedRef.current + (targetRef.current - renderedRef.current) * smoothing;
      renderedRef.current = next;
      smoothingBoostRef.current *= 0.86;
      if (Math.abs(progressRef.current - next) > emitEpsilon) {
        setProgress(next);
      }
      renderFrameRef.current = requestAnimationFrame(renderProgress);
    };

    const onWheel = (event) => {
      event.preventDefault();
      stopInertia();
      if (wheelReleaseTimerRef.current) {
        clearTimeout(wheelReleaseTimerRef.current);
        wheelReleaseTimerRef.current = 0;
      }
      const multiplier = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 18 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? window.innerHeight : 1;
      const deltaPixels = event.deltaY * multiplier;
      applyDelta(deltaPixels, wheelPixelsForFullVideo, "wheel");
      const now = performance.now();
      const dt = Math.max(8, now - (lastWheelSampleAtRef.current || now - 16));
      const instantVelocity = deltaPixels / dt;
      wheelVelocityRef.current = wheelVelocityRef.current * 0.42 + instantVelocity * 0.58;
      lastWheelSampleAtRef.current = now;
      wheelReleaseTimerRef.current = setTimeout(() => {
        startInertia(wheelVelocityRef.current, wheelPixelsForFullVideo, wheelInertiaMinVelocity);
      }, 56);
    };

    const onTouchStart = (event) => {
      if (!event.touches || event.touches.length === 0) return;
      stopInertia();
      touchYRef.current = event.touches[0].clientY;
      touchTimeRef.current = performance.now();
      touchVelocityRef.current = 0;
    };

    const onTouchMove = (event) => {
      if (!event.touches || event.touches.length === 0) return;
      const currentY = event.touches[0].clientY;
      const now = performance.now();
      if (touchYRef.current == null) {
        touchYRef.current = currentY;
        touchTimeRef.current = now;
        return;
      }

      const delta = touchYRef.current - currentY;
      if (Math.abs(delta) >= minTouchDelta) {
        event.preventDefault();
        applyDelta(delta, touchPixelsForFullVideo);
        const dt = Math.max(8, now - touchTimeRef.current);
        // Smoothed velocity sample in px/ms.
        const instantVelocity = delta / dt;
        touchVelocityRef.current = touchVelocityRef.current * 0.45 + instantVelocity * 0.55;
        touchYRef.current = currentY;
        touchTimeRef.current = now;
      }
    };

    const onTouchEnd = () => {
      touchYRef.current = null;
      startInertia(touchVelocityRef.current, touchPixelsForFullVideo, touchInertiaMinVelocity);
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchEnd, { passive: true });
    renderFrameRef.current = requestAnimationFrame(renderProgress);

    return () => {
      stopInertia();
      if (wheelReleaseTimerRef.current) {
        clearTimeout(wheelReleaseTimerRef.current);
        wheelReleaseTimerRef.current = 0;
      }
      if (renderFrameRef.current) {
        cancelAnimationFrame(renderFrameRef.current);
        renderFrameRef.current = 0;
      }
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
  }, []);

  return progress;
}

function ScrollVideo({ targetProgress, onProgress, forwardSrc, reverseSrc }) {
  const forwardRef = useRef(null);
  const reverseRef = useRef(null);
  const transitionCanvasRef = useRef(null);
  const [duration, setDuration] = useState(0);
  const [activeVideo, setActiveVideo] = useState("forward");
  const [transitionHold, setTransitionHold] = useState(false);
  const targetTimeRef = useRef(0);
  const lastFrameRef = useRef(0);
  const lastProgressRef = useRef(-1);
  const activeVideoRef = useRef("forward");
  const playRequestRef = useRef(null);
  const switchInFlightRef = useRef(false);
  const holdTimerRef = useRef(0);
  const lastSwitchAtRef = useRef(0);
  const lastIdleSyncAtRef = useRef(0);

  useEffect(() => {
    if (!duration) return;
    targetTimeRef.current = clamp(targetProgress) * duration;
  }, [duration, targetProgress]);

  useEffect(() => {
    const forwardVideo = forwardRef.current;
    const reverseVideo = reverseRef.current;
    const transitionCanvas = transitionCanvasRef.current;
    if (!forwardVideo || !reverseVideo || !transitionCanvas || !duration) return undefined;

    let frame = 0;
    const catchUpThreshold = 0.032;
    const minSwitchDistance = 0.028;
    const switchLockMs = 90;
    const transitionFadeMs = 110;

    const syncIdleVideo = (timelineTime, now, force = false) => {
      if (!force && now - lastIdleSyncAtRef.current < 120) return;
      lastIdleSyncAtRef.current = now;

      const mappedForward = clamp(timelineTime, 0, duration);
      const mappedReverse = clamp(duration - timelineTime, 0, duration);
      const hardSyncGap = 0.12;

      if (activeVideoRef.current === "forward") {
        const reverseGap = mappedReverse - reverseVideo.currentTime;
        if (Math.abs(reverseGap) > hardSyncGap) {
          reverseVideo.currentTime = mappedReverse;
        }
      } else {
        const forwardGap = mappedForward - forwardVideo.currentTime;
        if (Math.abs(forwardGap) > hardSyncGap) {
          forwardVideo.currentTime = mappedForward;
        }
      }
    };

    const clearHold = () => {
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
        holdTimerRef.current = 0;
      }
      holdTimerRef.current = setTimeout(() => {
        setTransitionHold(false);
      }, transitionFadeMs);
    };

    const captureFrame = (video) => {
      if (!video.videoWidth || !video.videoHeight) return;
      const context = transitionCanvas.getContext("2d");
      if (!context) return;

      const width = video.videoWidth;
      const height = video.videoHeight;
      if (transitionCanvas.width !== width || transitionCanvas.height !== height) {
        transitionCanvas.width = width;
        transitionCanvas.height = height;
      }
      context.drawImage(video, 0, 0, width, height);
      setTransitionHold(true);
    };

    const switchDirection = (direction, timelineTime) => {
      const nextActive = direction > 0 ? "forward" : "reverse";
      const now = performance.now();
      if (activeVideoRef.current === nextActive || switchInFlightRef.current) return;
      if (now - lastSwitchAtRef.current < switchLockMs) return;

      const outgoingVideo = activeVideoRef.current === "forward" ? forwardVideo : reverseVideo;
      const incomingVideo = nextActive === "forward" ? forwardVideo : reverseVideo;
      const incomingTime = nextActive === "forward" ? clamp(timelineTime, 0, duration) : clamp(duration - timelineTime, 0, duration);

      switchInFlightRef.current = true;
      syncIdleVideo(timelineTime, now, true);
      captureFrame(outgoingVideo);

      forwardVideo.pause();
      reverseVideo.pause();
      playRequestRef.current = null;

      const finishSwitch = () => {
        activeVideoRef.current = nextActive;
        setActiveVideo(nextActive);
        switchInFlightRef.current = false;
        lastSwitchAtRef.current = performance.now();
        clearHold();
      };

      if (Math.abs(incomingVideo.currentTime - incomingTime) < 0.01) {
        finishSwitch();
        return;
      }

      const onSeeked = () => {
        finishSwitch();
      };
      incomingVideo.addEventListener("seeked", onSeeked, { once: true });
      incomingVideo.currentTime = incomingTime;
      setTimeout(() => {
        if (switchInFlightRef.current) {
          finishSwitch();
        }
      }, 120);
    };

    const play = (video, rate) => {
      if (Math.abs(video.playbackRate - rate) > 0.05) {
        video.playbackRate = rate;
      }
      if (video.paused && !playRequestRef.current) {
        playRequestRef.current = video.play().catch(() => undefined).finally(() => {
          playRequestRef.current = null;
        });
      }
    };

    const tick = (now) => {
      lastFrameRef.current = lastFrameRef.current || now;
      lastFrameRef.current = now;

      const timelineTime = activeVideoRef.current === "reverse" ? duration - reverseVideo.currentTime : forwardVideo.currentTime;
      const targetTime = targetTimeRef.current;
      const distance = targetTime - timelineTime;
      const distanceAbs = Math.abs(distance);
      const direction = Math.sign(distance);
      const actualProgress = duration ? timelineTime / duration : 0;

      if (Math.abs(actualProgress - lastProgressRef.current) > 0.002) {
        lastProgressRef.current = actualProgress;
        onProgress(clamp(actualProgress));
      }

      if (switchInFlightRef.current) {
        frame = requestAnimationFrame(tick);
        return;
      }

      if (distanceAbs > catchUpThreshold) {
        const rate = clamp(0.82 + distanceAbs * 0.52, 0.82, 2.4);
        const needsSwitch =
          (direction > 0 && activeVideoRef.current === "reverse") ||
          (direction < 0 && activeVideoRef.current === "forward");

        if (needsSwitch) {
          if (distanceAbs > minSwitchDistance) {
            switchDirection(direction, timelineTime);
          } else {
            forwardVideo.pause();
            reverseVideo.pause();
            if (activeVideoRef.current === "forward") {
              forwardVideo.currentTime += (targetTime - forwardVideo.currentTime) * 0.26;
            } else {
              reverseVideo.currentTime += (duration - targetTime - reverseVideo.currentTime) * 0.26;
            }
            frame = requestAnimationFrame(tick);
            return;
          }
        }

        const currentActiveVideo = activeVideoRef.current === "forward" ? forwardVideo : reverseVideo;
        play(currentActiveVideo, rate);
      } else {
        syncIdleVideo(timelineTime, now);
        forwardVideo.pause();
        reverseVideo.pause();
        forwardVideo.playbackRate = 1;
        reverseVideo.playbackRate = 1;

        if (activeVideoRef.current === "forward") {
          forwardVideo.currentTime += (targetTime - forwardVideo.currentTime) * 0.18;
        } else {
          reverseVideo.currentTime += (duration - targetTime - reverseVideo.currentTime) * 0.18;
        }
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
        holdTimerRef.current = 0;
      }
      switchInFlightRef.current = false;
      forwardVideo.pause();
      reverseVideo.pause();
      forwardVideo.playbackRate = 1;
      reverseVideo.playbackRate = 1;
    };
  }, [duration, onProgress]);

  return (
    <div className="video-stage" style={{ "--poster-url": `url("${POSTER_SRC}")` }} aria-label="AirPod 拆解视频演示">
      <video
        ref={forwardRef}
        className={`stage-video ${activeVideo === "forward" ? "is-active" : ""}`}
        muted
        playsInline
        poster={POSTER_SRC}
        preload="auto"
        src={forwardSrc}
        onLoadedMetadata={(event) => {
          const nextDuration = event.currentTarget.duration || 0;
          setDuration(nextDuration);
          targetTimeRef.current = clamp(targetProgress) * nextDuration;
          event.currentTarget.currentTime = 0.001;
          event.currentTarget.pause();
          onProgress(0);
        }}
      />
      <video
        ref={reverseRef}
        className={`stage-video ${activeVideo === "reverse" ? "is-active" : ""}`}
        muted
        playsInline
        poster={TAIL_POSTER_SRC}
        preload="auto"
        src={reverseSrc}
      />
      <canvas ref={transitionCanvasRef} className={`transition-frame ${transitionHold ? "is-active" : ""}`} />
      <div className="video-shade" />
    </div>
  );
}

export default function App() {
  const preloadTargets = useMemo(
    () => [
      { key: "forward", label: "Forward Video", src: VIDEO_SRC },
      { key: "reverse", label: "Reverse Video", src: VIDEO_REVERSE_SRC },
    ],
    [],
  );
  const preload = useVideoPreload(preloadTargets);
  const targetProgress = useScrubProgress();
  const [playbackProgress, setPlaybackProgress] = useState(0);

  return (
    <main className="page-shell">
      {preload.isReady ? (
        <ScrollVideo
          targetProgress={targetProgress}
          onProgress={setPlaybackProgress}
          forwardSrc={preload.resolvedSources.forward}
          reverseSrc={preload.resolvedSources.reverse}
        />
      ) : (
        <div className="video-stage preload-placeholder" style={{ "--poster-url": `url("${POSTER_SRC}")` }} />
      )}

      <div className={`loading-screen ${preload.isReady ? "is-hidden" : ""}`} aria-live="polite">
        <div className="loading-panel">
          <p className="loading-kicker">Preparing Experience</p>
          <h2>AirPod Teardown</h2>
          <p className="loading-text">
            {preload.hasError
              ? "Network fallback enabled. Entering direct stream mode."
              : "Dual-video assets are loading for smooth forward and reverse scrubbing."}
          </p>
          <div className="loading-track">
            <b style={{ width: formatPercent(preload.totalProgress) }} />
          </div>
          <div className="loading-meta">
            <span>{formatPercent(preload.totalProgress)}</span>
            <Film size={14} />
          </div>
          <div className="loading-items">
            {preload.items.map((item) => (
              <div key={item.key} className="loading-item">
                <span>{item.label}</span>
                <span>{formatPercent(item.progress)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <header className="topbar">
        <a className="brand" href="#top" aria-label="AirPod Teardown Study">
          <span className="brand-mark" />
          AirPod Teardown Study
        </a>
      </header>

      <section className="hero-copy" id="top">
        <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="eyebrow">
          Scroll teardown video
        </motion.p>
        <motion.h1 initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}>
          AirPod 拆解
        </motion.h1>
        <motion.p initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
          滑动或滚轮控制拆解进度，快速前进和倒退都会平滑播放过去。
        </motion.p>
      </section>

      <div className="progress-hud" aria-label={`视频进度 ${Math.round(playbackProgress * 100)}%`}>
        <i aria-hidden="true">
          <b style={{ height: `${Math.round(playbackProgress * 100)}%` }} />
        </i>
        <strong>{Math.round(playbackProgress * 100)}%</strong>
      </div>
    </main>
  );
}
