import { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Zeriv",
    short_name: "Zeriv",
    description:
      "Turn your product into stunning images with AI — no studio needed.",
    start_url: "/",
    display: "standalone",
    background_color: "#111113",
    theme_color: "#000000",
    icons: [{ src: "/icon.png", sizes: "any", type: "image/png" }],
  };
}
