import { defineStore } from 'pinia';
import axios from 'axios';

export interface ChatSession {
  id: number;
  title: string;
  created_at: string;
  updated_at?: string;
}

export interface ChatMessage {
  id: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  tokens?: number | null;
  created_at: string;
}

interface ChatState {
  sessions: ChatSession[];
  activeSessionId: number | null;
  messages: ChatMessage[];
  loadingSessions: boolean;
  loadingMessages: boolean;
  sending: boolean;
}

export const useChatStore = defineStore('chat', {
  state: (): ChatState => ({
    sessions: [],
    activeSessionId: null,
    messages: [],
    loadingSessions: false,
    loadingMessages: false,
    sending: false,
  }),

  getters: {
    hasActiveSession: (state) => state.activeSessionId !== null,
    activeSession(state): ChatSession | null {
      return state.sessions.find((s) => s.id === state.activeSessionId) || null;
    },
  },

  actions: {
    async fetchSessions() {
      this.loadingSessions = true;
      try {
        const res = await axios.get('/api/chat/sessions', {
          withCredentials: true,
        });
        this.sessions = res.data.sessions || [];

        if (this.sessions.length === 0) {
          this.activeSessionId = null;
          this.messages = [];
          return;
        }

        // Если нет активной сессии, попробуем выбрать первую
        if (!this.activeSessionId && this.sessions.length > 0) {
          this.activeSessionId = this.sessions[0].id;
          await this.fetchMessages(this.activeSessionId);
        }
      } catch (error) {
        console.error('Failed to fetch chat sessions:', error);
      } finally {
        this.loadingSessions = false;
      }
    },

    async createSession(title: string) {
      try {
        const res = await axios.post(
          '/api/chat/sessions',
          { title },
          { withCredentials: true }
        );
        const session: ChatSession = res.data.session;

        // Добавляем новую сессию в начало списка
        this.sessions = [session, ...this.sessions];
        this.activeSessionId = session.id;
        this.messages = [];

        return session;
      } catch (error) {
        console.error('Failed to create chat session:', error);
        throw error;
      }
    },

    updateSessionTitleLocally(sessionId: number, title: string) {
      this.sessions = this.sessions.map((s) =>
        s.id === sessionId ? { ...s, title } : s
      );
    },

    async renameSession(sessionId: number, title: string) {
      try {
        const res = await axios.patch(
          `/api/chat/sessions/${sessionId}/title`,
          { title },
          { withCredentials: true }
        );
        const updated: ChatSession = res.data.session;

        this.sessions = this.sessions.map((s) =>
          s.id === sessionId ? { ...s, title: updated.title } : s
        );
      } catch (error) {
        console.error('Failed to rename chat session:', error);
        throw error;
      }
    },

    async deleteSession(sessionId: number) {
      try {
        await axios.delete(`/api/chat/sessions/${sessionId}`, {
          withCredentials: true,
        });

        this.sessions = this.sessions.filter((s) => s.id !== sessionId);

        if (this.activeSessionId === sessionId) {
          // Переключаемся на первую оставшуюся сессию или сбрасываем всё
          const next = this.sessions[0];
          this.activeSessionId = next ? next.id : null;
          this.messages = [];

          if (next) {
            await this.fetchMessages(next.id);
          }
        }
      } catch (error) {
        console.error('Failed to delete chat session:', error);
        throw error;
      }
    },

    async fetchMessages(sessionId: number) {
      this.loadingMessages = true;
      try {
        const res = await axios.get(`/api/chat/sessions/${sessionId}`, {
          withCredentials: true,
        });

        this.activeSessionId = res.data.sessionId;
        this.messages = (res.data.messages || []) as ChatMessage[];
      } catch (error) {
        console.error('Failed to fetch chat messages:', error);
      } finally {
        this.loadingMessages = false;
      }
    },

    async sendMessage(message: string) {
      if (!message.trim()) return;

      if (!this.activeSessionId) {
        throw new Error('No active chat session selected');
      }

      this.sending = true;

      // Оптимистично добавляем сообщение пользователя в локальное состояние
      const now = new Date().toISOString();
      const tempUserMessage: ChatMessage = {
        id: Date.now(),
        role: 'user',
        content: message,
        created_at: now,
        tokens: null,
      };
      this.messages.push(tempUserMessage);

      try {
        const res = await axios.post(
          '/api/chat',
          {
            sessionId: this.activeSessionId,
            message,
          },
          { withCredentials: true }
        );

        const replyText: string = res.data.reply || 'Нет ответа от AI';
        const replyMessage: ChatMessage = {
          id: Date.now() + 1,
          role: 'assistant',
          content: replyText,
          created_at: new Date().toISOString(),
          tokens: res.data.tokens ?? null,
        };
        this.messages.push(replyMessage);

        // Обновляем заголовок чата без перезагрузки, если бэкенд его изменил
        const sessionTitle = res.data.sessionTitle;
        if (sessionTitle && this.activeSessionId) {
          this.updateSessionTitleLocally(this.activeSessionId, sessionTitle);
        }

        return replyText;
      } catch (error) {
        console.error('Failed to send chat message:', error);
        // В случае ошибки добавим системное сообщение
        const errorMessage: ChatMessage = {
          id: Date.now() + 2,
          role: 'assistant',
          content:
            'Ошибка при отправке сообщения. Попробуйте ещё раз или обновите страницу.',
          created_at: new Date().toISOString(),
          tokens: null,
        };
        this.messages.push(errorMessage);
        throw error;
      } finally {
        this.sending = false;
      }
    },
  },
});

