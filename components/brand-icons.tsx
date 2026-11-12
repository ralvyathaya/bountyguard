import React from "react";

export interface BrandIconProps {
  size?: number;
  className?: string;
}

/**
 * Official PayPal Monogram (Double "P")
 * Uses official PayPal Blue (#003087) and Cyan Blue (#0079C1) with overlap shading.
 */
export function PayPalIcon({
  size = 16,
  className = "",
  variant = "default",
  monochrome = false,
}: BrandIconProps & { variant?: "default" | "light" | "monochrome"; monochrome?: boolean }) {
  const isMono = monochrome || variant === "monochrome";
  const isLight = variant === "light";

  const backColor = isMono ? "currentColor" : isLight ? "#38bdf8" : "#003087";
  const frontColor = isMono ? "currentColor" : isLight ? "#ffffff" : "#0079C1";
  const overlapColor = isMono ? "currentColor" : isLight ? "#0284c7" : "#00457C";

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
      {/* Back P */}
      <path
        d="M6.9 21.2H3.1a.6.6 0 0 1-.6-.7L5.5 3.7a.8.8 0 0 1 .8-.7h6.6c2.6 0 4.6.6 5.5 1.7.9 1 1.2 2.4.8 4-.8 3.6-3.2 5.5-7.2 5.5H9.4L8.3 20.6a.6.6 0 0 1-.6.6z"
        fill={backColor}
      />
      {/* Front P */}
      <path
        d="M19.7 8.6c-.8 3.6-3.2 5.5-7.2 5.5H9.8l-1.3 8.3a.6.6 0 0 1-.6.6H4.7a.4.4 0 0 1-.4-.5l.4-2.3 1.1-6.8h2.5c4 0 6.4-2 7.2-5.5.3-1.6 0-3-.8-4 2.1.4 3.7 1.9 4.2 4.9z"
        fill={frontColor}
      />
      {/* Overlapping intersection */}
      <path
        d="M18 8.6c-.7 3.2-2.8 4.9-6.3 4.9H9.2l1.4-8.7h2c2.3 0 4 .5 4.8 1.5.6.7.8 1.7.5 2.3z"
        fill={overlapColor}
        opacity={isMono ? 0.35 : 0.75}
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
