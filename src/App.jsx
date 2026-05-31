import { motion } from "framer-motion";
import { Film } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const assetUrl = (path) => `${import.meta.env.BASE_URL}${path}`;
const VIDEO_SRC = assetUrl("teardown-airpod.mp4");
const VIDEO_REVERSE_SRC = assetUrl("teardown-airpod-reverse.mp4");
const POSTER_SRC = assetUrl("teardown-poster.jpg");
const TAIL_POSTER_SRC = assetUrl("teardown-tail.jpg");

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function useScrubProgress() {
  const [progress, setProgress] = useState(0);
  const targetRef = useRef(0);
  const touchYRef = useRef(null);
  const touchTimeRef = useRef(0);
  const touchVelocityRef = useRef(0);
  const inertiaFrameRef = useRef(0);

  useEffect(() => {
    const wheelPixelsForFullVideo = 5200;
    const touchPixelsForFullVideo = 2600;
    const minTouchDelta = 1;
    const inertiaMinVelocity = 0.06; // px/ms
    const inertiaDampingPerFrame = 0.92;
    const inertiaStopVelocity = 0.015; // px/ms

    const applyDelta = (deltaPixels, pixelsForFullVideo) => {
      targetRef.current = clamp(targetRef.current + deltaPixels / pixelsForFullVideo);
      setProgress(targetRef.current);
    };

    const stopInertia = () => {
      if (inertiaFrameRef.current) {
        cancelAnimationFrame(inertiaFrameRef.current);
        inertiaFrameRef.current = 0;
      }
    };

    const startInertia = () => {
      const initialVelocity = touchVelocityRef.current;
      if (Math.abs(initialVelocity) < inertiaMinVelocity) return;

      stopInertia();

      let velocity = initialVelocity;
      let lastTime = performance.now();

      const tick = (now) => {
        const dt = Math.min(48, now - lastTime);
        lastTime = now;

        const frameDelta = velocity * dt;
        applyDelta(frameDelta, touchPixelsForFullVideo);

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

    const onWheel = (event) => {
      event.preventDefault();
      stopInertia();
      const multiplier = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 18 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? window.innerHeight : 1;
      applyDelta(event.deltaY * multiplier, wheelPixelsForFullVideo);
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
      startInertia();
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      stopInertia();
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
  }, []);

  return progress;
}

function ScrollVideo({ targetProgress, onProgress }) {
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
    const catchUpThreshold = 0.055;
    const transitionFadeMs = 110;

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
      if (activeVideoRef.current === nextActive || switchInFlightRef.current) return;

      const outgoingVideo = activeVideoRef.current === "forward" ? forwardVideo : reverseVideo;
      const incomingVideo = nextActive === "forward" ? forwardVideo : reverseVideo;
      const incomingTime = nextActive === "forward" ? clamp(timelineTime, 0, duration) : clamp(duration - timelineTime, 0, duration);

      switchInFlightRef.current = true;
      captureFrame(outgoingVideo);

      forwardVideo.pause();
      reverseVideo.pause();
      playRequestRef.current = null;

      const finishSwitch = () => {
        activeVideoRef.current = nextActive;
        setActiveVideo(nextActive);
        switchInFlightRef.current = false;
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
        const direction = Math.sign(distance);
        const rate = clamp(0.82 + distanceAbs * 0.46, 0.82, 2.25);
        switchDirection(direction, timelineTime);
        play(direction > 0 ? forwardVideo : reverseVideo, rate);
      } else {
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
        src={VIDEO_SRC}
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
        src={VIDEO_REVERSE_SRC}
      />
      <canvas ref={transitionCanvasRef} className={`transition-frame ${transitionHold ? "is-active" : ""}`} />
      <div className="video-shade" />
    </div>
  );
}

export default function App() {
  const targetProgress = useScrubProgress();
  const [playbackProgress, setPlaybackProgress] = useState(0);

  return (
    <main className="page-shell">
      <ScrollVideo targetProgress={targetProgress} onProgress={setPlaybackProgress} />

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
