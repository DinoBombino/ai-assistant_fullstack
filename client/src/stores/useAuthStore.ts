// client/src/stores/useAuthStore.ts
import { defineStore } from 'pinia';
import axios from 'axios';

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null as User | null,
    isLoading: false,
    isUserLoading: false, // Флаг для отслеживания загрузки пользователя
    isInitialized: false, // Флаг для отслеживания инициализации
  }),

  getters: {
    isAuthenticated: (state) => !!state.user,
  },

  actions: {
    async register(data: { email: string; password: string; name: string }) {
      this.isLoading = true;
      try {
        const res = await axios.post('/api/auth/register', data, { withCredentials: true });
        this.user = res.data.user;
        return true;
      } catch (err: any) {
        console.error('Register error:', err.response?.data || err);
        throw err;
      } finally {
        this.isLoading = false;
      }
    },

    async login(email: string, password: string) {
      this.isLoading = true;
      try {
        const res = await axios.post('/api/auth/login', { email, password }, { withCredentials: true });
        this.user = res.data.user;
        return true;
      } catch (err: any) {
        console.error('Login error:', err.response?.data || err);
        throw err;
      } finally {
        this.isLoading = false;
      }
    },

    async loadUser(force = false) {
      // Если уже загружаем, не делаем повторный запрос
      if (this.isUserLoading && !force) return;
      
      // Если уже инициализировали и не принудительно, пропускаем
      if (this.isInitialized && !force) return;
      
      this.isUserLoading = true;
      try {
        const res = await axios.get('/api/auth/me', { withCredentials: true });
        if (res.data && res.data.user) {
          this.user = res.data.user;
        } else {
          this.user = null;
        }
      } catch (err: any) {
        console.error('Failed to load user:', err.response?.data || err);
        this.user = null;
      } finally {
        this.isUserLoading = false;
        this.isInitialized = true;
      }
    },

    async logout() {
      try {
        await axios.post('/api/auth/logout', {}, { withCredentials: true });
      } catch (err) {
        console.error('Logout error:', err);
      } finally {
        this.user = null;
        this.isInitialized = false; // Сбрасываем флаг инициализации
      }
    },

    // Метод для инициализации при запуске приложения
    async init() {
      await this.loadUser();
    }
  },
});