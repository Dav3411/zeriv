"use client";

import { Poppins } from "next/font/google";
import Image from "next/image";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export function Logo({
  width = 140,
  height = 30,
  textOnly = false,
  iconOnly = false,
  forceWhite = false,
  forceColor,
}: {
  width?: number;
  height?: number;
  textOnly?: boolean;
  iconOnly?: boolean;
  forceWhite?: boolean;
  /** CSS color 값을 직접 지정해 var(--text-primary)를 override한다. */
  forceColor?: string;
}) {
  const baseSize = Math.min(width, height);
  const iconSize = iconOnly ? baseSize : baseSize * 1.1;
  const fontSize = baseSize * 0.8;

  if (iconOnly) {
    return (
      <Image
        src="/logo.png"
        alt="Zeriv"
        width={iconSize}
        height={iconSize}
        className="rounded-md"
        style={{ display: "block" }}
        priority
      />
    );
  }

  return (
    <span className="inline-flex items-center gap-3" style={{ height }}>
      {!textOnly && (
        <Image
          src="/logo.png"
          alt="Zeriv"
          width={iconSize}
          height={iconSize}
          className="rounded-md"
          style={{ display: "block" }}
          priority
        />
      )}
      <span
        className="font-medium tracking-tight"
        suppressHydrationWarning
        style={{ fontSize, fontFamily: poppins.style.fontFamily }}
      >
        <span style={{ color: forceWhite ? "#ffffff" : (forceColor ?? "var(--text-primary)") }}>Ze</span>
        <span style={{ color: forceWhite ? "#ffffff" : (forceColor ?? "var(--text-primary)") }}>riv</span>
      </span>
    </span>
  );
}
