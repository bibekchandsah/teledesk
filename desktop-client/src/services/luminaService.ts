import { Message, User } from '../../../shared/types';
import { generateMessageSuggestion } from './geminiService';
import { generateGroqMessageSuggestion } from './groqService';

export const LUMINA_AI_UID = 'system-lumina-ai';
export const LUMINA_AI_NAME = 'Lumina';
export const LUMINA_AI_AVATAR = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiB2aWV3Qm94PSIwIDAgMTAwIDEwMCI+PGRlZnM+PGxpbmVhckdyYWRpZW50IGlkPSJnIiB4MT0iMCUiIHkxPSIwJSIgeDI9IjEwMCUiIHkyPSIxMDAlIj48c3RvcCBvZmZzZXQ9IjAlIiBzdHlsZT0ic3RvcC1jb2xvcjojNjM2NmYxO3N0b3Atb3BhY2l0eToxIiAvPjxzdG9wIG9mZnNldD0iMTAwJSIgc3R5bGU9InN0b3AtY29sb3I6I2E4NTVmNztzdG9wLW9wYWNpdHk6MSIgLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI1MCIgZmlsbD0idXJsKCNnKSIgLz48ZyB0cmFuc2Zvcm09InRyYW5zbGF0ZSgyNiwgMjYpIHNjYWxlKDIpIj48cGF0aCBkPSJNNCAxNGExIDEgMCAwIDEtLjc4LTEuNjNsOS45LTEwLjJhLjUuNSAwIDAgMSAuODYuNDZsLTEuOTIgNi4wMkExIDEgMCAwIDAgMTMgMTBoN2ExIDEgMCAwIDEgLjc4IDEuNjNsLTkuOSAxMC4yYS41LjUgMCAwIDEtLjg2LS40NmwxLjkyLTYuMDJBMSAxIDAgMCAwIDExIDE0eiIgZmlsbD0iI2ZmZmZmZiIgLz48L2c+PC9zdmc+';

export const LUMINA_PROFILE: User = {
  uid: LUMINA_AI_UID,
  name: LUMINA_AI_NAME,
  avatar: LUMINA_AI_AVATAR,
  email: 'lumina@system.ai',
  username: 'lumina',
  onlineStatus: 'online',
  aiSuggestionsEnabled: true,
  createdAt: new Date().toISOString(),
  lastSeen: new Date().toISOString(),
  aiUsageLimit: 10000,
  aiUsageCounts: [0],
  geminiApiKeys: [],
  groqApiKeys: [],
  pinnedChatIds: [],
  archivedChatIds: [],
  nicknames: {},
  appLockEnabled: false,
};

/**
 * Generates a response from Lumina based on the current context.
 * It will try Gemini first, then fall back to Groq if needed.
 */
export const generateLuminaResponse = async (
  prompt: string,
  chatMessages: Message[],
  currentUserUid: string,
  apiKeys: { gemini?: string[]; groq?: string[] }
): Promise<string> => {
  // We'll use the "suggestion" logic but adapt it for a full reply.
  // We want a single, well-formulated string, not an array.
  
  // Custom system prompt for Lumina
  const systemContext = `You are Lumina, a helpul AI companion integrated into this messaging app.
You are chatting with a user. Be concise, friendly, and helpful. 
Respond naturally as a person would in a chat. 
CRITICAL: DO NOT use JSON formatting, code blocks, or robot-like syntax. Respond with plain, natural text ONLY!`;

  const contextMessages = chatMessages.slice(-15); // Get more context for Lumina

  let rawResult: any = null;

  try {
    // 1. Try Gemini
    if (apiKeys.gemini && apiKeys.gemini.length > 0) {
      const { suggestions } = await generateMessageSuggestion(
        apiKeys.gemini,
        contextMessages,
        currentUserUid,
        prompt,
        systemContext
      );
      if (suggestions && suggestions.length > 0) {
        rawResult = suggestions[0];
      }
    }
  } catch (err) {
    console.warn('[Lumina] Gemini failed, falling back to Groq...', err);
  }

  if (!rawResult) {
    try {
      // 2. Try Groq fallback
      if (apiKeys.groq && apiKeys.groq.length > 0) {
        const { suggestions } = await generateGroqMessageSuggestion(
          apiKeys.groq,
          contextMessages,
          currentUserUid,
          prompt
        );
        if (suggestions && suggestions.length > 0) {
          rawResult = suggestions[0];
        }
      }
    } catch (err) {
      console.error('[Lumina] All AI providers failed:', err);
    }
  }

  // 3. Final safety cleanup helper
  const cleanResponse = (text: string): string => {
    const trimmed = text.trim();
    // Recursive check if it still looks like JSON (some models return double-encoded strings)
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed) && parsed.length > 0) return cleanResponse(String(parsed[0]));
        if (typeof parsed === 'object' && parsed !== null) {
          // Unpack any known text keys
          const val = parsed.text || parsed.message || parsed.content || parsed.response || parsed.reply || 
                      (Array.isArray(parsed.suggestions) ? parsed.suggestions[0] : null);
          return val ? cleanResponse(String(val)) : text;
        }
        return String(parsed);
      } catch (e) {
        return text;
      }
    }
    return text;
  };

  if (!rawResult) {
    return "I'm sorry, I'm having trouble connecting to my brain right now. Please check your API keys in Settings!";
  }

  // Ensure it's not an object with a text prop before sending to cleanResponse string handler
  let resultText = '';
  if (typeof rawResult === 'string') {
    resultText = rawResult;
  } else if (typeof rawResult === 'object' && rawResult !== null) {
    resultText = rawResult.text || rawResult.message || rawResult.content || rawResult.response || rawResult.reply || JSON.stringify(rawResult);
  } else {
    resultText = String(rawResult);
  }

  return cleanResponse(resultText);
}
