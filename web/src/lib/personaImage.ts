/**
 * personaImage.ts — Generate model portrait image via Gemini API
 */
import { GoogleGenAI } from "@google/genai";

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "";
const GEMINI_IMAGE_MODEL =
  process.env.GEMINI_IMAGE_MODEL ?? "gemini-3.1-flash-image-preview";

/**
 * Generate a single model portrait image using Gemini.
 * Returns base64-encoded PNG string.
 */
export async function generatePersonaImage(prompt: string): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error(
      "GEMINI_API_KEY or GOOGLE_API_KEY is required for model image generation.",
    );
  }

  const fullPrompt =
    `${prompt} ` +
    "Close-up headshot, shoulders-up only, centered composition, single subject. " +
    "The subject may be human, animal, robot, fantasy creature, personified object, or any other character type — match the concept. " +
    "Expressive face and posture that convey personality. " +
    "Clean background that complements the subject. No text, no logos, no watermarks, no UI elements.";

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: GEMINI_IMAGE_MODEL,
        contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
        config: {
          responseModalities: ["TEXT", "IMAGE"],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          imageConfig: { aspectRatio: "1:1" } as any,
        },
      });

      const parts = response.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = (part as any).inlineData?.data;
        if (typeof data === "string" && data.length > 0) {
          return data;
        }
      }
      throw new Error("Gemini returned no image in response");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const isTransient = /rate_limit|overloaded|503|529|timeout/i.test(msg);
      if (isTransient && attempt < 2) {
        await new Promise((r) => setTimeout(r, 2 ** (attempt + 1) * 1000));
        continue;
      }
      throw e;
    }
  }
  throw new Error("Model image generation failed after 3 attempts");
}
