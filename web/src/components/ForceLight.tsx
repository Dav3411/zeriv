"use client";
import { useEffect } from "react";

export function ForceLight() {
  useEffect(() => {
    const html = document.documentElement;
    const had = {
      light: html.classList.contains("light"),
      dark: html.classList.contains("dark"),
    };
    html.classList.remove("dark");
    html.classList.add("light");
    return () => {
      html.classList.remove("light");
      if (had.dark) html.classList.add("dark");
      else if (had.light) html.classList.add("light");
    };
  }, []);
  return null;
}
