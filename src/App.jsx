import { motion } from "framer-motion";
import { Film } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const assetUrl = (path) => `${import.meta.env.BASE_URL}${path}`;
const VIDEO_SRC = assetUrl("teardown-airpod.mp4");
const VIDEO_REVERSE_SRC = assetUrl("teardown-airpod-reverse.mp4");
const POSTER_SRC = assetUrl("teardown-poster.jpg");

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function useWheelScrub() {
  const [progress, setProgress] = useState(0);
  const targetRef = useRef(0);

  useEffect(() => {
    const wheelPixelsForFullVideo = 5200;

    const onWheel = (event) => {
      event.preventDefault();
      const multiplier = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 18 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? window.innerHeight : 1;
      targetRef.current = clamp(targetRef.current + (event.deltaY * multiplier) / wheelPixelsForFullVideo);
      setProgress(targetRef.current);
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, []);

  return progress;
}

function ScrollVideo({ targetProgress, onProgress }) {
  const forwardRef = useRef(null);
  const reverseRef = useRef(null);
  const [duration, setDuration] = useState(0);
  const [activeVideo, setActiveVideo] = useState("forward");
  const targetTimeRef = useRef(0);
  const lastFrameRef = useRef(0);
  const lastProgressRef = useRef(-1);
  const activeVideoRef = useRef("forward");
  const playRequestRef = useRef(null);

  useEffect(() => {
    if (!duration) return;
    targetTimeRef.current = clamp(targetProgress) * duration;
  }, [duration, targetProgress]);

  useEffect(() => {
    const forwardVideo = forwardRef.current;
    const reverseVideo = reverseRef.current;
    if (!forwardVideo || !reverseVideo || !duration) return undefined;

    let frame = 0;
    const catchUpThreshold = 0.055;

    const switchDirection = (direction, timelineTime) => {
      const nextActive = direction > 0 ? "forward" : "reverse";
      if (activeVideoRef.current === nextActive) return;

      forwardVideo.pause();
      reverseVideo.pause();
      playRequestRef.current = null;

      if (nextActive === "forward") {
        forwardVideo.currentTime = clamp(timelineTime, 0, duration);
      } else {
        reverseVideo.currentTime = clamp(duration - timelineTime, 0, duration);
      }

      activeVideoRef.current = nextActive;
      setActiveVideo(nextActive);
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
        poster={POSTER_SRC}
        preload="auto"
        src={VIDEO_REVERSE_SRC}
      />
      <div className="video-shade" />
    </div>
  );
}

export default function App() {
  const targetProgress = useWheelScrub();
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
          滚轮控制拆解进度，快速前进和倒退都会平滑播放过去。
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
