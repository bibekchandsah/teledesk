import { GoogleGenerativeAI } from '@google/generative-ai';
import { Message } from '../../../shared/types';

export const generateMessageSuggestion = async (
  apiKey: string,
  chatMessages: Message[],
  currentUserUid: string
): Promise<string[]> => {
  const trimmedKey = (apiKey || '').trim();
  if (!trimmedKey) throw new Error('Gemini API Key is empty or missing');
  
  const genAI = new GoogleGenerativeAI(trimmedKey);
  
  const getBestModel = async (): Promise<string> => {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${trimmedKey}`;
      const res = await fetch(url);
      const data = await res.json();
      
      const rawModels = data.models || [];
      const availableModels = rawModels.filter((m: any) => 
        !m.supportedMethods || m.supportedMethods.includes('generateContent')
      );
      
      const preferredKeywords = [
        'gemini-3.1-flash',
        'gemini-3-flash',
        'gemini-2.5-flash',
        'gemini-2.0-flash',
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
    } catch (err) {
      console.warn('[Gemini] Failed to list models via fetch:', err);
    }
    return 'gemini-1.5-flash';
  };

  const modelName = await getBestModel();
  // Using v1beta for everything since it is more reliable for JSON mode in many cases
  const model = genAI.getGenerativeModel(
    { model: modelName },
    { apiVersion: 'v1beta' }
  );

  const recentMessages = chatMessages.slice(-10);
  if (recentMessages.length === 0) return ['Hello! How can I help you today?', 'Hi there!', 'Greetings!'];
  
  const contextText = recentMessages.map(msg => {
    const role = msg.senderId === currentUserUid ? 'Me' : 'Other Person';
    const content = msg.content || `[${msg.type}]`;
    return `${role}: ${content}`;
  }).join('\n');

  const prompt = `You are an AI assistant helping a user write a reply in a chat application.
Here is the recent conversation history:
${contextText}

Generate exactly 3 diverse, natural, helpful, and concise single-message replies that the user ("Me") could send next. 
Your response must be a valid JSON array of strings, like this: ["suggestion 1", "suggestion 2", "suggestion 3"].
Do not include any other text, markdown blocks, or formatting. Only return the JSON array string.
Maintain the tone of the conversation. If the user was asked a question, suggest appropriate varied answers.`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    
    // Attempt to extract JSON from the response (sometimes AI wraps it in code blocks)
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
  } catch (error) {
    console.error('Error generating AI suggestion:', error);
    throw new Error('Failed to generate suggestion');
  }
};
