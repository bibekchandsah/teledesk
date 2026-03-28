import { GoogleGenerativeAI } from '@google/generative-ai';
import { Message } from '../../../shared/types';

export const generateMessageSuggestion = async (
  apiKey: string,
  chatMessages: Message[],
  currentUserUid: string,
  currentInput: string = ''
): Promise<string[]> => {
  const trimmedKey = (apiKey || '').trim();
  if (!trimmedKey) throw new Error('Gemini API Key is empty or missing');
  
  const genAI = new GoogleGenerativeAI(trimmedKey);
  
  const findPreferredModel = (models: any[]): string => {
    const availableModels = models.filter((m: any) => 
      !m.supportedMethods || m.supportedMethods.includes('generateContent')
    );
    
    const preferredKeywords = [
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
    return 'gemini-1.5-flash-latest';
  };

  const getBestModel = async (): Promise<string> => {
    try {
      // Try v1beta first
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${trimmedKey}`;
      const res = await fetch(url);
      
      if (res.status === 403 || res.status === 404) {
        // Fallback to v1 list if v1beta is restricted or 404
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
      console.warn('[Gemini] Model discovery failed, using safe fallback:', err);
    }
    // Safe hardcoded fallbacks that usually exist in v1beta
    return 'gemini-1.5-flash-latest';
  };

  const modelName = await getBestModel();
  const model = genAI.getGenerativeModel(
    { model: modelName },
    { apiVersion: 'v1beta' }
  );

  const recentMessages = chatMessages.slice(-10);
  
  const contextText = recentMessages.map(msg => {
    const role = msg.senderId === currentUserUid ? 'Me' : 'Other Person';
    const content = msg.content || `[${msg.type}]`;
    return `${role}: ${content}`;
  }).join('\n');

  let prompt = `You are an AI assistant helping a user write a reply in a chat application.
Here is the recent conversation history:
${contextText || "No previous messages."}

Generate exactly 3 diverse, natural, helpful, and concise single-message response options that the user ("Me") could send next. 
Your response must be a valid JSON array of strings, like this: ["suggestion 1", "suggestion 2", "suggestion 3"].
Maintain the tone of the conversation. If the user was asked a question, suggest appropriate varied answers.`;

  if (currentInput.trim()) {
    prompt += `\n\nCRITICAL: The user has already started typing: "${currentInput.trim()}". 
Your suggestions MUST be direct completions or logical extensions of this exact text. 
For example, if the user typed "I am", suggest things like "I am on my way", "I am looking into it", etc.
Ensure the suggestions flow naturally from the user's current draft.`;
  }

  prompt += `\n\nOnly return the JSON array string. No other text or markdown.`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    
    // Attempt to extract JSON from the response
    const jsonMatch = text.match(/\[.*\]/s);
    if (jsonMatch) {
      try {
        const suggestions = JSON.parse(jsonMatch[0]);
        if (Array.isArray(suggestions)) {
          return suggestions.slice(0, 3).map(s => String(s).trim());
        }
      } catch (e) {
        console.error('Failed to parse Gemini JSON:', text);
      }
    }
    
    // Fallback: split by newlines if it's not JSON
    const lines = text.split('\n').filter(l => l.trim().length > 0 && !l.startsWith('[')).slice(0, 3);
    return lines.length > 0 ? lines : [text.trim()];
  } catch (error: any) {
    const status = error?.status;
    const message = error?.message || '';
    
    console.error(`[Gemini] Error [${status}]:`, message);

    if (status === 429 || message.includes('quota') || message.includes('429')) {
      throw new Error('GEMINI_QUOTA_EXCEEDED');
    }
    if (status === 401 || status === 403 || message.includes('401') || message.includes('403')) {
      throw new Error('GEMINI_AUTH_ERROR');
    }
    if (status === 404 || message.includes('404')) {
      throw new Error('GEMINI_MODEL_NOT_FOUND');
    }
    
    throw new Error('GEMINI_GENERIC_ERROR');
  }
};
