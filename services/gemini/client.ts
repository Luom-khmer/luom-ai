/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { GoogleGenAI } from "@google/genai";

// This creates a single, shared instance of the GoogleGenAI client.
// We use a fallback to prevent the app from crashing on load if the API key is missing (e.g. during build or initial Vercel deploy without env vars).
// We also safely check for 'process' to avoid ReferenceError in browser environments where it's not polyfilled.
let apiKey = 'AI_KEY_PLACEHOLDER';

try {
    // Safely access process.env.API_KEY
    // @ts-ignore
    if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
        // @ts-ignore
        apiKey = process.env.API_KEY;
    }
} catch (e) {
    // Ignore ReferenceError if process is not defined
    console.warn("Could not access process.env.API_KEY, using placeholder.");
}

const ai = new GoogleGenAI({ apiKey });

export default ai;