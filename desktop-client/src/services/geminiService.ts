import { GoogleGenerativeAI } from '@google/generative-ai';
import { Message } from '../../../shared/types';

export const generateMessageSuggestion = async (
  apiKeys: string | string[],
  chatMessages: Message[],
  currentUserUid: string,
  currentInput: string = '',
  systemContext?: string
): Promise<{ suggestions: string[]; usedIndex: number; exhaustedIndices: number[] }> => {
  const keys = Array.isArray(apiKeys) ? apiKeys : [apiKeys];
  const activeKeys = keys.map(k => (k || '').trim()).filter(Boolean);
  
  if (activeKeys.length === 0) throw new Error('Gemini API Key is empty or missing');

  let lastError: Error | null = null;
  const exhaustedIndices: number[] = [];

  for (let i = 0; i < activeKeys.length; i++) {
    const apiKey = activeKeys[i];
    try {
      const suggestions = await _generateWithSingleKey(apiKey, chatMessages, currentUserUid, currentInput, systemContext);
      return { suggestions, usedIndex: i, exhaustedIndices };
    } catch (error: any) {
      lastError = error;
      const msg = error?.message || '';
      
      // If quota exceeded, auth error, or model not found, try the next key
      if (msg === 'GEMINI_QUOTA_EXCEEDED' || msg === 'GEMINI_AUTH_ERROR' || msg === 'GEMINI_MODEL_NOT_FOUND') {
        console.warn(`[Gemini] Key ...${apiKey.slice(-4)} failed (${msg}). Trying next key...`);
        if (msg === 'GEMINI_QUOTA_EXCEEDED') {
          exhaustedIndices.push(i);
        }
        continue;
      }
      
      // For other generic errors, stop and throw
      const err = error;
      (err as any).exhaustedIndices = exhaustedIndices;
      throw err;
    }
  }

  const baseErr = lastError || new Error('GEMINI_GENERIC_ERROR');
  (baseErr as any).exhaustedIndices = exhaustedIndices;
  throw baseErr;
};

const _generateWithSingleKey = async (
  apiKey: string,
  chatMessages: Message[],
  currentUserUid: string,
  currentInput: string = '',
  systemContext?: string
): Promise<string[]> => {
  const trimmedKey = apiKey.trim();
  const genAI = new GoogleGenerativeAI(trimmedKey);
  
  const findPreferredModel = (models: any[]): string => {
    const availableModels = models.filter((m: any) => 
      !m.supportedMethods || m.supportedMethods.includes('generateContent')
    );
    
    const preferredKeywords = [
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-1.5-flash-latest',
      'gemini-1.5-flash',
      'flash-latest',
      'gemini-pro'
    ];

    for (const keyword of preferredKeywords) {
      const found = availableModels.find((m: any) => m.name.includes(keyword));
      if (found) return found.name.replace('models/', '');
    }

    if (availableModels.length > 0) {
      return availableModels[0].name.replace('models/', '');
    }
    return 'gemini-2.0-flash';
  };

  const getBestModel = async (): Promise<string> => {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${trimmedKey}`;
      const res = await fetch(url);
      
      if (res.status === 403 || res.status === 404) {
        const v1Url = `https://generativelanguage.googleapis.com/v1/models?key=${trimmedKey}`;
        const v1Res = await fetch(v1Url);
        if (v1Res.ok) {
          const v1Data = await v1Res.json();
          return findPreferredModel(v1Data.models || []);
        }
      }

      if (res.ok) {
        const data = await res.json();
        return findPreferredModel(data.models || []);
      }
    } catch (err) {
      console.warn('[Gemini] Model discovery failed:', err);
    }
    return 'gemini-2.0-flash';
  };

  const bestModel = await getBestModel();
  const modelsToTry = [bestModel, 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-flash-latest'];
  // Deduplicate and keep order
  const uniqueModels = Array.from(new Set(modelsToTry));

  let lastGenError: Error | null = null;

  for (const modelId of uniqueModels) {
    try {
      const model = genAI.getGenerativeModel(
        { 
          model: modelId,
          systemInstruction: systemContext || undefined 
        },
        { apiVersion: 'v1beta' }
      );

      const recentMessages = chatMessages.slice(-10);
      const contextText = recentMessages.map(msg => {
        const role = msg.senderId === currentUserUid ? 'Me' : 'Other Person';
        const content = msg.content || `[${msg.type}]`;
        return `${role}: ${content}`;
      }).join('\n');

      let prompt = "";
      if (systemContext) {
        // Chatbot mode (Lumina)
        prompt = `Conversation history:\n${contextText || "No previous messages."}\n\nUser asked: "${currentInput.trim()}"\nPlease provide a helpful, natural response.`;
      } else {
        // Suggestion chips mode
        let draftInfo = "";
        if (currentInput.trim()) {
          draftInfo = `\n\nUSER DRAFT: "${currentInput.trim()}"\nThe suggestions MUST be direct completions or logical extensions of this draft.`;
        }

        prompt = `Recent conversation:\n${contextText || "No previous messages."}${draftInfo}

Generate exactly 3 diverse response options for "Me".
Response MUST be a valid JSON array of strings: ["suggestion1", "suggestion2", "suggestion3"]. Return ONLY JSON.`;
      }

      const result = await model.generateContent(prompt);
      const text = result.response.text();
      // Find the first [ or { and the last ] or } to extract the most likely JSON block
      const startIdx = Math.min(
        text.indexOf('[') === -1 ? Infinity : text.indexOf('['),
        text.indexOf('{') === -1 ? Infinity : text.indexOf('{')
      );
      const endIdx = Math.max(text.lastIndexOf(']'), text.lastIndexOf('}'));

      if (startIdx !== Infinity && endIdx > startIdx) {
        const jsonCandidate = text.substring(startIdx, endIdx + 1);
        try {
          const parsed = JSON.parse(jsonCandidate);
          if (Array.isArray(parsed)) {
            return parsed.slice(0, 3).map(s => {
              if (typeof s === 'string') return s.trim();
              if (s && typeof s === 'object') return (s.text || s.content || JSON.stringify(s)).trim();
              return String(s).trim();
            });
          } else if (parsed && typeof parsed === 'object') {
            const suggestion = parsed.text || parsed.message || parsed.content || parsed.response || parsed.reply || 
                             (Array.isArray(parsed.suggestions) ? parsed.suggestions[0] : null);
            if (suggestion) return [String(suggestion).trim()];
          }
        } catch (e) {
          // If JSON.parse fails, try a desperation regex for several common keys
          const propertyMatch = jsonCandidate.match(/"(?:text|message|content|response|reply)"\s*:\s*"((?:\\.|[^"\\])*)"/i);
          if (propertyMatch && propertyMatch[1]) {
            return [propertyMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').trim()];
          }
        }
      }
      const lines = text.split('\n').filter(l => l.trim().length > 0 && !l.startsWith('[')).slice(0, 3);
      return lines.length > 0 ? lines : [text.trim()];
    } catch (error: any) {
      const status = error?.status;
      const message = error?.message || '';
      
      // If the model is not found, try the next model for the SAME key
      if (status === 404 || message.includes('404') || message.includes('not found')) {
        console.warn(`[Gemini] Model ${modelId} not found for key ...${apiKey.slice(-4)}. Trying next fallback model...`);
        lastGenError = new Error('GEMINI_MODEL_NOT_FOUND');
        continue;
      }

      // Check for other specific errors to re-throw and trigger KEY failover
      if (status === 429 || message.includes('quota') || message.includes('429')) {
        throw new Error('GEMINI_QUOTA_EXCEEDED');
      }
      if (status === 401 || status === 403 || message.includes('401') || message.includes('403')) {
        throw new Error('GEMINI_AUTH_ERROR');
      }
      
      throw new Error('GEMINI_GENERIC_ERROR');
    }
  }

  throw lastGenError || new Error('GEMINI_GENERIC_ERROR');
};
