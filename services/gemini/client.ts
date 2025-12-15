/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { GoogleGenAI } from "@google/genai";

// Helper to get the API Key safely
const getApiKey = (): string => {
    // 1. Check Local Storage (User override)
    if (typeof window !== 'undefined') {
        const storedKey = localStorage.getItem('GEMINI_API_KEY');
        if (storedKey && storedKey.trim().length > 0) {
            return storedKey;
        }
    }

    // 2. Check Environment Variable
    // @ts-ignore
    if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
        // @ts-ignore
        return process.env.API_KEY;
    }

    // 3. Return a placeholder to prevent immediate crash during initialization.
    // The API call will fail later, but the UI will render, allowing the user to input a key.
    return 'MISSING_API_KEY_PLACEHOLDER';
};

const apiKey = getApiKey();

// Initialize the client. If the key is the placeholder, calls will fail, 
// but the app won't crash on white screen.
const ai = new GoogleGenAI({ apiKey });

export const hasValidApiKey = (): boolean => {
    return apiKey !== 'MISSING_API_KEY_PLACEHOLDER';
};

export default ai;