// client/src/stores/useAuthStore.ts
import { defineStore } from 'pinia';
import axios from 'axios';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null as any,
    isLoading: false,
  }),

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

    async loadUser() {
      try {
        const res = await axios.get('/api/auth/me', { withCredentials: true });
        this.user = res.data.user;
      } catch (err) {
        this.user = null;
      }
    },

    async logout() {
      await axios.post('/api/auth/logout', {}, { withCredentials: true });
      this.user = null;
    },
  },
});