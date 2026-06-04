/* Sitecorex — the Arcade mascot as a React/SVG component.
 * Brand: cube body (#DA291C), bone outline, parchment "S" face, expressive eyes,
 * stubby stone legs. The S face is constant; eyes + arms express the mood.
 * Outline uses currentColor so it inverts with the arcade theme (set color on a parent).
 */
import type { ReactElement } from "react";

export type Mood = "idle" | "host" | "happy" | "sad" | "think";

const RED = "#DA291C";
const PARCH = "#F5EBD8";

function Eyes({ mood }: { mood: Mood }): ReactElement {
  if (mood === "happy" || mood === "host") {
    return (
      <>
        <path d="M18 22 l3 -3 l3 3" stroke="currentColor" strokeWidth={2.4} fill="none" strokeLinecap="round" />
        <path d="M40 22 l3 -3 l3 3" stroke="currentColor" strokeWidth={2.4} fill="none" strokeLinecap="round" />
      </>
    );
  }
  if (mood === "sad") {
    return (
      <>
        <rect x={18} y={22} width={5} height={3} fill="currentColor" />
        <rect x={41} y={22} width={5} height={3} fill="currentColor" />
        <path d="M17 19 l6 2 M47 19 l-6 2" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
      </>
    );
  }
  if (mood === "think") {
    return (
      <>
        <rect x={17} y={19} width={4} height={4} fill="currentColor" />
        <rect x={40} y={19} width={4} height={4} fill="currentColor" />
      </>
    );
  }
  return (
    <>
      <rect x={18} y={20} width={4} height={4} fill="currentColor" />
      <rect x={42} y={20} width={4} height={4} fill="currentColor" />
    </>
  );
}

function Arms({ mood }: { mood: Mood }): ReactElement {
  if (mood === "happy") {
    return (
      <>
        <rect x={6} y={6} width={6} height={16} rx={2} fill={RED} stroke="currentColor" strokeWidth={2} transform="rotate(-18 9 22)" />
        <rect x={52} y={6} width={6} height={16} rx={2} fill={RED} stroke="currentColor" strokeWidth={2} transform="rotate(18 55 22)" />
      </>
    );
  }
  if (mood === "host") {
    return (
      <>
        <rect x={6} y={30} width={6} height={14} rx={2} fill={RED} stroke="currentColor" strokeWidth={2} />
        <rect x={52} y={26} width={16} height={6} rx={2} fill={RED} stroke="currentColor" strokeWidth={2} transform="rotate(-12 60 29)" />
      </>
    );
  }
  if (mood === "sad") {
    return (
      <>
        <rect x={7} y={34} width={6} height={14} rx={2} fill={RED} stroke="currentColor" strokeWidth={2} />
        <rect x={51} y={34} width={6} height={14} rx={2} fill={RED} stroke="currentColor" strokeWidth={2} />
      </>
    );
  }
  return (
    <>
      <rect x={7} y={30} width={6} height={14} rx={2} fill={RED} stroke="currentColor" strokeWidth={2} />
      <rect x={51} y={30} width={6} height={14} rx={2} fill={RED} stroke="currentColor" strokeWidth={2} />
    </>
  );
}

export function Mascot({ mood = "idle" }: { mood?: Mood }): ReactElement {
  return (
    <svg
      viewBox="-3 -3 76 76"
      shapeRendering="crispEdges"
      role="img"
      aria-label={`Sitecorex (${mood})`}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* legs */}
      <rect x={22} y={54} width={6} height={9} fill="var(--arcade-stone)" stroke="currentColor" strokeWidth={2} />
      <rect x={36} y={54} width={6} height={9} fill="var(--arcade-stone)" stroke="currentColor" strokeWidth={2} />
      <Arms mood={mood} />
      {/* body cube */}
      <rect x={14} y={12} width={36} height={42} rx={3} fill={RED} stroke="currentColor" strokeWidth={2.5} />
      <Eyes mood={mood} />
      {/* the constant S face */}
      <g fill={PARCH}>
        <rect x={22} y={30} width={20} height={4} />
        <rect x={22} y={30} width={4} height={7} />
        <rect x={22} y={37} width={20} height={4} />
        <rect x={38} y={40} width={4} height={7} />
        <rect x={22} y={44} width={20} height={4} />
      </g>
    </svg>
  );
}
