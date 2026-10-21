import { useId } from "react";
import type { Mood } from "@/lib/mascot/lines";

/**
 * Placeholder art for James: a burly, mustached silhouette (head and broad
 * shoulders). The mustache and eyebrows are "cut out" in the background
 * gradient, and the eyebrows change with the mood. Swap for real art later:
 * keep the same props.
 */
export function JamesSilhouette({ mood = "neutral", size = 56 }: { mood?: Mood; size?: number }) {
  const id = `james${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const fill = `url(#${id}-bg)`;
  const brows: Record<Mood, string> = {
    neutral: "M42 36.5 L55 35 L55 39 L42 40 Z M65 35 L78 36.5 L78 40 L65 39 Z",
    happy: "M42 36 Q48.5 30.5 55 33.5 L55 37.5 Q48.5 34.5 42 40 Z M65 33.5 Q71.5 30.5 78 36 L78 40 Q71.5 34.5 65 37.5 Z",
    proud: "M42 33.5 Q48.5 28 55 31 L55 35 Q48.5 32 42 37.5 Z M65 36 L78 36 L78 40 L65 40 Z",
    concerned: "M42 39 L55 34 L55 38 L42 43 Z M65 34 L78 39 L78 43 L65 38 Z",
  };
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label="James, your coach" style={{ flex: "none" }}>
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--ring-a, #d7f75b)" />
          <stop offset="100%" stopColor="var(--ring-b, #4c62e8)" />
        </linearGradient>
        <clipPath id={`${id}-clip`}>
          <circle cx="60" cy="60" r="60" />
        </clipPath>
      </defs>
      <circle cx="60" cy="60" r="60" fill={fill} />
      <g clipPath={`url(#${id}-clip)`} fill="#15171c">
        {/* big traps sloping up to the jaw, broad shoulders */}
        <path d="M-10 124 C-8 94 10 82 30 77 C38 75 43 69 45 61 L75 61 C77 69 82 75 90 77 C110 82 128 94 130 124 Z" />
        {/* short, thick neck */}
        <path d="M43 58 L77 58 L80 78 Q60 85 40 78 Z" />
        {/* wide head, heavy square jaw, buzz-cut flat top */}
        <path d="M36 37 C36 21 46 12 60 12 C74 12 84 21 84 37 L84 50 C84 62 77 71 68 74 C63.5 75.5 56.5 75.5 52 74 C43 71 36 62 36 50 Z" />
        {/* ears */}
        <ellipse cx="35.5" cy="45" rx="4.5" ry="7" />
        <ellipse cx="84.5" cy="45" rx="4.5" ry="7" />
      </g>
      {/* eyebrows + handlebar mustache, cut out in the background gradient */}
      <path d={brows[mood]} fill={fill} />
      <path
        d="M60 53 C56 48.5 48 48.5 43.5 52.5 C40.5 55 37 55 34.5 51.5 C35 59.5 43.5 62.5 49.5 59 C54 56.5 57 56 60 58.5 C63 56 66 56.5 70.5 59 C76.5 62.5 85 59.5 85.5 51.5 C83 55 79.5 55 76.5 52.5 C72 48.5 64 48.5 60 53 Z"
        fill={fill}
      />
    </svg>
  );
}
