import React from "react";

export interface BrandIconProps {
  size?: number;
  className?: string;
}

/**
 * Official PayPal Monogram (Double "P")
 * Sourced from https://www.svgrepo.com/svg/303385/paypal-icon-logo
 * ViewBox 0 0 384.971 384.971
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

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 384.971 384.971"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0 }}
      aria-hidden="true"
    >
      {/* Back P */}
      <path
        d="M362.485,50.781C341.258,19.347,301.996,0,244.629,0H71.865C53.303,0,38.169,14.86,37.387,33.374L1.758,296.883c-1.127,8.423,5.291,15.892,13.784,15.892h74.966c8.535,0,15.981-6.529,17.079-15.025l18.435-142.147c1.378-10.635,10.364-18.665,21.096-18.665h26.471c69.184,0,123.366-28.093,138.834-100.082C355.204,91.879,368.149,69.57,362.485,50.781z"
        fill={backColor}
      />
      {/* Front P */}
      <path
        d="M312.446,128.847c-13.684,59.397-64.846,90.957-135.088,90.957h-33.003c-10.732,0-19.718,8.03-21.096,18.665l-19.539,150.672c-1.1,8.496,5.345,15.025,13.881,15.025h65.852c8.535,0,15.981-6.529,17.079-15.025l3.871-29.872c1.1-8.496,8.535-15.025,17.079-15.025h12.593c61.428,0,109.529-24.939,123.27-88.859c6.452-29.839,3.582-53.774-8.775-71.18C328.055,107.039,319.467,117.165,312.446,128.847z"
        fill={frontColor}
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
