import { File } from "expo-file-system";
import { fileUri } from "./measure";

// Newest stable Flash model as of Nov 2026; falls back to Google's moving alias if a key can't use it.
export const MODELS = ["gemini-3.8-flash", "gemini-flash-latest"];

export class GeminiError extends Error {
  constructor(message: string, readonly kind: "key" | "quota" | "network" | "other") {
    super(message);
  }
}

/** Send one camera frame plus a prompt; returns the model's text (JSON requested). */
export async function askGemini(apiKey: string, imagePath: string, prompt: string): Promise<string> {
  const data = await new File(fileUri(imagePath)).base64();
  const body = JSON.stringify({
    contents: [{ parts: [{ inline_data: { mime_type: "image/jpeg", data } }, { text: prompt }] }],
    generationConfig: { response_mime_type: "application/json", temperature: 0.2 },
  });
  let last: GeminiError | null = null;
  for (const model of MODELS) {
    let res: Response;
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body,
      });
    } catch {
      throw new GeminiError("No internet connection. Check Wi-Fi or data and try again.", "network");
    }
    if (res.ok) {
      const json = await res.json();
      const text = json?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
      if (!text) throw new GeminiError("The AI didn’t answer. Try again.", "other");
      return text;
    }
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      const t = await res.text();
      if (/API key|API_KEY|permission/i.test(t)) throw new GeminiError("That Gemini key didn’t work. Check it and paste it again.", "key");
      last = new GeminiError(`The AI request failed (${res.status}).`, "other");
    } else if (res.status === 429) {
      throw new GeminiError("The free Gemini limit is used up for now. Wait a minute and try again.", "quota");
    } else {
      last = new GeminiError(`The AI request failed (${res.status}).`, "other"); // e.g. 404: try the next model
    }
  }
  throw last ?? new GeminiError("The AI request failed.", "other");
}
