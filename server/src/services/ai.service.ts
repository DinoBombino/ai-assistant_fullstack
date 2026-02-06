// server/src/services/ai.service.ts
import 'dotenv/config';
import { generateText, streamText } from 'ai';
import { fireworks } from '@ai-sdk/fireworks';

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIResponse {
  content: string;
  tokens?: number;
  provider?: string;
  finishReason?: string;
}

export interface AIConfig {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  stream?: boolean;
}

export class AIService {
  private providers: string[];
  private currentProviderIndex = 0;

  constructor() {
    this.providers = this.detectAvailableProviders();
    console.log(`🤖 Available AI providers: ${this.providers.join(', ')}`);
  }

  private detectAvailableProviders(): string[] {
    const available: string[] = [];
    
    // Проверяем Fireworks
    if (process.env.FIREWORKS_API_KEY) {
      available.push('fireworks');
    }
    
    // Проверяем OpenAI
    if (process.env.OPENAI_API_KEY) {
      available.push('openai');
    }
    
    // Проверяем OpenRouter
    if (process.env.OPENROUTER_API_KEY) {
      available.push('openrouter');
    }
    
    // Всегда добавляем fallback
    available.push('fallback');
    
    // Сортируем согласно AI_PROVIDER
    const preferredProvider = process.env.AI_PROVIDER || 'fireworks';
    if (available.includes(preferredProvider)) {
      // Перемещаем предпочтительный провайдер в начало
      const index = available.indexOf(preferredProvider);
      if (index > 0) {
        available.splice(index, 1);
        available.unshift(preferredProvider);
      }
    }
    
    return available;
  }

  async chat(messages: AIMessage[], config: AIConfig = {}): Promise<AIResponse> {
    return this.tryWithProviders(messages, config);
  }

  private async tryWithProviders(messages: AIMessage[], config: AIConfig, attempt = 0): Promise<AIResponse> {
    if (attempt >= this.providers.length) {
      throw new Error('All AI providers failed');
    }

    const provider = this.providers[attempt];
    
    try {
      switch (provider) {
        case 'fireworks':
          return await this.callFireworksAPI(messages, config);
        case 'fallback':
          return this.fallbackResponse(messages);
        default:
          throw new Error(`Unknown provider: ${provider}`);
      }
    } catch (error: any) {
      console.warn(`⚠️ Provider ${provider} failed:`, error.message);
      
      // Если это региональная блокировка, сразу переходим к следующему
      if (error.message.includes('region') || error.message.includes('not available')) {
        console.log(`🌍 ${provider} unavailable in your region, trying next...`);
      }
      
      // Пробуем следующий провайдер
      return this.tryWithProviders(messages, config, attempt + 1);
    }
  }

  // Fireworks API (через Vercel AI SDK)
  private async callFireworksAPI(messages: AIMessage[], config: AIConfig): Promise<AIResponse> {
    const apiKey = process.env.FIREWORKS_API_KEY;
    if (!apiKey) {
      throw new Error('Fireworks API key not configured');
    }

    const model = config.model || 
      process.env.FIREWORKS_MODEL || 
      'accounts/fireworks/models/llama-v3p1-8b-instruct';
    
    const maxTokens = config.maxTokens || 
      parseInt(process.env.DEFAULT_MAX_TOKENS || '512');
    
    const temperature = config.temperature || 0.7;
    
    // Подготавливаем сообщения для AI SDK
    const aiMessages = this.limitContext(messages);
    
    // Если есть системный промпт, добавляем его
    const systemMessage = aiMessages.find(m => m.role === 'system');
    const systemPrompt = config.systemPrompt || systemMessage?.content;
    const otherMessages = aiMessages.filter(m => m.role !== 'system');

    try {
      const { text, usage, finishReason } = await generateText({
        model: fireworks(model),
        system: systemPrompt,
        messages: otherMessages,
        //maxTokens,
        temperature,
      });

      return {
        content: text,
        tokens: usage?.totalTokens,
        provider: 'fireworks',
        finishReason: finishReason
      };
    } catch (error: any) {
      console.error('Fireworks API error:', error);
      // Если это ошибка аутентификации, пробуем другой провайдер
      if (error.message?.includes('auth') || error.message?.includes('401') || error.message?.includes('403')) {
        console.log('🔑 Fireworks authentication failed, trying next provider...');
        throw error;
      }
      // Для других ошибок пробуем переключиться
      throw new Error(`Fireworks error: ${error.message}`);
    }
  }
  

  private fallbackResponse(messages: AIMessage[]): AIResponse {
    const lastMessage = messages[messages.length - 1]?.content || '';
    
    const responses = [
      "Привет! Я ваш AI ассистент. Сейчас работаю в демо-режиме. Добавьте API ключ от Fireworks, OpenAI или другого провайдера в .env для полноценной работы.",
      "Чтобы получить реальные ответы от AI, настройте подключение к одному из сервисов:\n1. Fireworks AI (рекомендуется)\n2. OpenAI\n3. OpenRouter",
      "Демо-режим. Получите API ключ на https://fireworks.ai/ и добавьте FIREWORKS_API_KEY в .env"
    ];
    
    const response = responses[Math.floor(Math.random() * responses.length)];
    
    return {
      content: `${response}\n\nВаш запрос: "${lastMessage.substring(0, 100)}..."`,
      provider: 'fallback'
    };
  }

  async generateTitle(firstMessage: string): Promise<string> {
    try {
      const response = await this.chat([
        {
          role: 'system',
          content: 'Сгенерируй краткий заголовок (максимум 5 слов) для этого сообщения. Возвращай только заголовок, без кавычек. Используй тот же язык, что и в сообщении.'
        },
        {
          role: 'user',
          content: firstMessage
        }
      ], {
        maxTokens: 50,
        temperature: 0.3
      });

      return response.content.trim() || 'New Chat';
    } catch (error) {
      console.warn('Failed to generate title:', error);
      return firstMessage.substring(0, 50) + '...';
    }
  }

  private limitContext(messages: AIMessage[]): AIMessage[] {
    const maxTokens = parseInt(process.env.MAX_CONTEXT_TOKENS || '4000');
    let totalTokens = 0;
    const limitedMessages: AIMessage[] = [];

    // Всегда оставляем системное сообщение
    const systemMessage = messages.find(m => m.role === 'system');
    if (systemMessage) {
      const estimatedTokens = Math.ceil(systemMessage.content.length / 4);
      totalTokens += estimatedTokens;
      limitedMessages.push(systemMessage);
    }

    // Остальные сообщения с конца (новые важнее)
    const otherMessages = messages.filter(m => m.role !== 'system').reverse();
    
    for (const message of otherMessages) {
      const estimatedTokens = Math.ceil(message.content.length / 4);
      
      if (totalTokens + estimatedTokens > maxTokens) {
        break;
      }

      totalTokens += estimatedTokens;
      limitedMessages.push(message);
    }

    // Восстанавливаем порядок
    limitedMessages.sort((a, b) => {
      if (a.role === 'system') return -1;
      if (b.role === 'system') return 1;
      return 0;
    });

    return limitedMessages;
  }

  async testConnection(): Promise<{ success: boolean; provider?: string }> {
    try {
      const result = await this.chat([
        { role: 'user', content: 'Hello' }
      ], { maxTokens: 5 });
      
      return { 
        success: true, 
        provider: result.provider || 'unknown' 
      };
    } catch (error: any) {
      console.error('AI connection test failed:', error.message);
      return { success: false };
    }
  }

  // Метод для стриминга (используется в эндпоинте /stream)
  async *streamChat(messages: AIMessage[], config: AIConfig = {}): AsyncGenerator<string> {
    const apiKey = process.env.FIREWORKS_API_KEY;
    if (!apiKey) {
      throw new Error('Fireworks API key not configured for streaming');
    }

    const model = config.model || 
      process.env.FIREWORKS_MODEL || 
      'accounts/fireworks/models/llama-v3p1-8b-instruct';
    
    const maxTokens = config.maxTokens || 
      parseInt(process.env.DEFAULT_MAX_TOKENS || '512');
    
    const temperature = config.temperature || 0.7;

    const aiMessages = this.limitContext(messages);
    const systemMessage = aiMessages.find(m => m.role === 'system');
    const systemPrompt = config.systemPrompt || systemMessage?.content;
    const otherMessages = aiMessages.filter(m => m.role !== 'system');

    try {
      const { textStream } = await streamText({
        model: fireworks(model),
        system: systemPrompt,
        messages: otherMessages,
        //maxTokens,
        temperature,
      });

      for await (const chunk of textStream) {
        yield chunk;
      }
    } catch (error: any) {
      console.error('Streaming error:', error);
      // В случае ошибки возвращаем сообщение об ошибке
      yield `Ошибка стриминга: ${error.message}`;
    }
  }
}

export const aiService = new AIService();