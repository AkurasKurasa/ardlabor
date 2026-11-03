import * as SecureStore from "expo-secure-store";

const KEY = "gemini_api_key";

/** The user's own Gemini key, kept in the phone's encrypted storage (never in the code). */
export async function getApiKey(): Promise<string | null> {
  try {
    return (await SecureStore.getItemAsync(KEY)) || null;
  } catch {
    return null;
  }
}

export async function setApiKey(v: string): Promise<void> {
  await SecureStore.setItemAsync(KEY, v.trim());
}

export async function clearApiKey(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
}
