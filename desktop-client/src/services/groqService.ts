import { Message } from '../../../shared/types';

export const generateGroqMessageSuggestion = async (
  apiKeys: string | string[],
  chatMessages: Message[],
  currentUserUid: string,
  currentInput: string = ''
): Promise<{ suggestions: string[]; usedIndex: number; exhaustedIndices: number[] }> => {
  const keys = Array.isArray(apiKeys) ? apiKeys : [apiKeys];
  const activeKeys = keys.map(k => (k || '').trim()).filter(Boolean);
  
  if (activeKeys.length === 0) throw new Error('Groq API Key is empty or missing');

  let lastError: Error | null = null;
  const exhaustedIndices: number[] = [];

  for (let i = 0; i < activeKeys.length; i++) {
    const apiKey = activeKeys[i];
    try {
      const suggestions = await _generateWithSingleGroqKey(apiKey, chatMessages, currentUserUid, currentInput);
      return { suggestions, usedIndex: i, exhaustedIndices };
    } catch (error: any) {
      lastError = error;
      const msg = error?.message || '';
      
      // If quota exceeded or auth error, try the next key
      if (msg === 'GROQ_QUOTA_EXCEEDED' || msg === 'GROQ_AUTH_ERROR' || msg === 'GROQ_MODEL_NOT_FOUND') {
        console.warn(`[Groq] Key ...${apiKey.slice(-4)} failed (${msg}). Trying next key...`);
        if (msg === 'GROQ_QUOTA_EXCEEDED') {
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

  const baseErr = lastError || new Error('GROQ_GENERIC_ERROR');
  (baseErr as any).exhaustedIndices = exhaustedIndices;
  throw baseErr;
};

const _generateWithSingleGroqKey = async (
  apiKey: string,
  chatMessages: Message[],
  currentUserUid: string,
  currentInput: string
): Promise<string[]> => {
  const modelsToTry = [
    'llama-3.1-8b-instant', 
    'llama-3.1-70b-versatile', 
    'llama3-8b-8192', 
    'llama3-70b-8192', 
    'mixtral-8x7b-32768'
  ];
  
  let lastGenError: Error | null = null;

  for (const modelId of modelsToTry) {
    try {
      const recentMessages = chatMessages.slice(-10);
      const contextText = recentMessages.map(msg => {
        const role = msg.senderId === currentUserUid ? 'Me' : 'Other Person';
        const content = msg.content || `[${msg.type}]`;
        return `${role}: ${content}`;
      }).join('\n');

      let prompt = `You are an AI assistant helping a user write a reply.
Recent conversation:
${contextText || "No previous messages."}

Generate exactly 3 diverse response options for "Me". 
Response MUST be a valid JSON array of strings: ["s1", "s2", "s3"].`;

      if (currentInput.trim()) {
        prompt += `\n\nUSER DRAFT: "${currentInput.trim()}"
Suggestions MUST be direct completions or logical extensions.`;
      }

      prompt += `\n\nReturn ONLY the JSON array.`;

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: modelId,
          messages: [
            { role: 'system', content: 'You are a helpful assistant that generates message suggestions in JSON format.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.7,
        })
      });

      if (!response.ok) {
        const status = response.status;
        let errorMessage = `GROQ_API_ERROR: ${status}`;
        try {
          const errorData = await response.json();
          if (errorData.error?.message) {
            errorMessage = errorData.error.message;
            console.error(`[Groq] API Error (${status}):`, errorMessage);
          }
        } catch (e) {}

        if (status === 429) {
          throw new Error('GROQ_QUOTA_EXCEEDED');
        } else if (status === 401 || status === 403) {
          throw new Error('GROQ_AUTH_ERROR');
        } else if (status === 404) {
          console.warn(`[Groq] Model ${modelId} not found for key ...${apiKey.slice(-4)}. Trying fallback...`);
          throw new Error('GROQ_MODEL_NOT_FOUND');
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content || '';
      
      const jsonMatch = text.match(/\[.*\]/s);
      if (jsonMatch) {
        try {
          const suggestions = JSON.parse(jsonMatch[0]);
          if (Array.isArray(suggestions)) return suggestions.slice(0, 3).map((s: any) => String(s).trim());
        } catch (e) {}
      }
      
      const lines = text.split('\n').filter((l: string) => l.trim().length > 0 && !l.startsWith('[')).slice(0, 3);
      return lines.length > 0 ? lines : [text.trim()];
      
    } catch (error: any) {
      lastGenError = error;
      const msg = error?.message || '';
      if (msg === 'GROQ_MODEL_NOT_FOUND') {
        continue;
      }
      throw error; // Bubble up quota, auth, or other failures to trigger key failover
    }
  }

  throw lastGenError || new Error('GROQ_ALL_MODELS_FAILED');
};
