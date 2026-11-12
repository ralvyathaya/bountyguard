import React from "react";

export interface BrandIconProps {
  size?: number;
  className?: string;
}

/**
 * Authentic PayPal Monogram (Double "P")
 * Vector geometry from official PayPal Brand Assets (Adobe Illustrator / paypalobjects.com)
 * ViewBox: 0 0 24.5 30
 */
export function PayPalIcon({
  size = 16,
  className = "",
  variant = "default",
  monochrome = false,
}: BrandIconProps & { variant?: "default" | "light" | "monochrome"; monochrome?: boolean }) {
  const isMono = monochrome || variant === "monochrome";
  const isLight = variant === "light";

  const backColor = isMono ? "currentColor" : isLight ? "#0079c1" : "#003087";
  const overlapColor = isMono ? "currentColor" : isLight ? "#00457c" : "#1e2d64";
  const frontColor = isMono ? "currentColor" : isLight ? "#38bdf8" : "#0079C1";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24.5 30"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0 }}
      aria-hidden="true"
    >
      {/* Back P (Deep Navy) */}
      <path
        fill={backColor}
        d="M9.614,7.699c0.061-0.393,0.313-0.714,0.652-0.876c0.155-0.074,0.326-0.115,0.507-0.115h7.352c0.871,0,1.684,0.057,2.426,0.177c0.212,0.034,0.418,0.073,0.619,0.117c0.2,0.045,0.395,0.095,0.584,0.15c0.094,0.028,0.187,0.057,0.278,0.086c0.365,0.121,0.704,0.264,1.017,0.429c0.368-2.347-0.003-3.945-1.272-5.392C20.378,0.682,17.853,0,14.622,0h-9.38c-0.66,0-1.223,0.48-1.325,1.133L0.01,25.898c-0.077,0.49,0.301,0.932,0.795,0.932h5.791l1.454-9.225L9.614,7.699z"
      />
      {/* Overlap Shadow */}
      <path
        fill={overlapColor}
        opacity={isMono ? 0.35 : 1}
        d="M21.754,7.151c-0.189-0.055-0.384-0.105-0.584-0.15c-0.201-0.044-0.407-0.083-0.619-0.117c-0.742-0.12-1.555-0.177-2.426-0.177h-7.352c-0.181,0-0.353,0.041-0.507,0.115C9.927,6.985,9.675,7.306,9.614,7.699L8.05,17.605l-0.045,0.289c0.103-0.652,0.66-1.132,1.321-1.132h2.752c5.405,0,9.637-2.195,10.874-8.545c0.037-0.188,0.068-0.371,0.096-0.55c-0.313-0.166-0.652-0.308-1.017-0.429C21.941,7.208,21.848,7.179,21.754,7.151z"
      />
      {/* Front P (Cyan Blue) */}
      <path
        fill={frontColor}
        d="M23.048,7.667c-0.028,0.179-0.06,0.362-0.096,0.55c-1.237,6.351-5.469,8.545-10.874,8.545H9.326c-0.661,0-1.218,0.48-1.321,1.132L6.596,26.83l-0.399,2.533c-0.067,0.428,0.263,0.814,0.695,0.814h4.881c0.578,0,1.069-0.42,1.16-0.99l0.048-0.248l0.919-5.832l0.059-0.32c0.09-0.572,0.582-0.992,1.16-0.992h0.73c4.729,0,8.431-1.92,9.513-7.476c0.452-2.321,0.218-4.259-0.978-5.622C24.022,8.286,23.573,7.945,23.048,7.667z"
      />
    </svg>
  );
}

/**
 * Official GitHub Octocat Silhouette
 */
export function GitHubIcon({
  size = 16,
  className = "",
}: BrandIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0 }}
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
      />
    </svg>
  );
}

/**
 * Official AG Grid Isometric Mark
 * Featuring the iconic isometric cube grid structure and red highlight (#EE3424).
 */
export function AgGridIcon({
  size = 16,
  className = "",
}: BrandIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0 }}
      aria-hidden="true"
    >
      <path d="M12 2L21 7.2V16.8L12 22L3 16.8V7.2L12 2Z" fill="#1e293b" />
      <path d="M12 2L21 7.2L12 12.4L3 7.2L12 2Z" fill="#334155" />
      <path d="M12 12.4V22L3 16.8V7.2L12 12.4Z" fill="#0f172a" />
      <path d="M21 7.2V16.8L12 22V12.4L21 7.2Z" fill="#1e293b" />
      {/* Signature Red Accent Tile */}
      <path d="M12 12.4L16.5 9.8L12 7.2L7.5 9.8L12 12.4Z" fill="#EE3424" />
      {/* Precision isometric grid lines */}
      <path
        d="M12 7.2V2M3 7.2L7.5 9.8M21 7.2L16.5 9.8M12 12.4V22M7.5 9.8V19.4M16.5 9.8V19.4"
        stroke="#64748b"
        strokeWidth="0.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Claude/ChatGPT-Style AI Sparkle Icon
 */
export function SparkleAIIcon({
  size = 16,
  className = "",
}: BrandIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0 }}
      aria-hidden="true"
    >
      <path d="M12 2C12 7.523 7.523 12 2 12C7.523 12 12 16.477 12 22C12 16.477 16.477 12 22 12C16.477 12 12 7.523 12 2Z" />
    </svg>
  );
}
