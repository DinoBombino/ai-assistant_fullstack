<script setup lang="ts">
import { onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from './stores/useAuthStore';

const router = useRouter();
const auth = useAuthStore();

// Загружаем пользователя при монтировании
onMounted(async () => {
  if (!auth.user && !auth.isUserLoading) {
    await auth.loadUser();
  }
});

const logout = async () => {
  try {
    await auth.logout();
    // После успешного выхода гарантированно переходим на логин
    router.push('/login');
  } catch (error) {
    console.error('Logout error:', error);
    router.push('/login');
  }
};
</script>

<template>
  <div id="app">
    <!-- Навигационная панель (показываем только если пользователь авторизован) -->
    <nav v-if="auth.user" class="navbar navbar-expand-lg navbar-light bg-light shadow-sm">
      <div class="container">
        <router-link class="navbar-brand" to="/">AI Assistant</router-link>
        
        <div class="d-flex align-items-center">
          <span class="me-3">Привет, {{ auth.user.name }}!</span>
          <router-link v-if="auth.user.role === 'teacher' || auth.user.role === 'admin'" 
                       to="/admin" class="btn btn-outline-primary me-2">
            Админка
          </router-link>
          <button class="btn btn-outline-danger" @click="logout">Выйти</button>
        </div>
      </div>
    </nav>

    <div v-if="auth.isLoading && !auth.user" class="loading-overlay">
      <div class="spinner-border text-primary" role="status">
        <span class="visually-hidden">Загрузка...</span>
      </div>
    </div>

    <!-- Основное содержимое -->
    <main>
      <router-view />
    </main>
  </div>
</template>

<style scoped>
.chat-window {
  /* background-color: #f8f9fa; */
  height: 60vh;
  /* Было 300px → теперь 60% высоты экрана */
  min-height: 400px;
  /* Минимум, чтобы не сжималось */
  max-height: 70vh;
  overflow-y: auto;
  background: #f8f9fa;
  border-radius: 12px;
  padding: 1rem;
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.1);
  font-size: 1rem;
  line-height: 1.5;
}

/* Плавный скролл */
.chat-window::-webkit-scrollbar {
  width: 6px;
}

.chat-window::-webkit-scrollbar-track {
  background: transparent;
}

.chat-window::-webkit-scrollbar-thumb {
  background: #adb5bd;
  border-radius: 3px;
}

.message-bubble {
  display: inline-block;
  max-width: 80%;
  /* Было 70% → больше места */
  padding: 0.75rem 1rem;
  border-radius: 18px;
  white-space: pre-wrap;
  /* Сохраняет переносы */
  word-wrap: break-word;
  margin: 0.35rem 0;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  animation: fadeIn 0.3s ease-out;
}

.user-message {
  background: #007bff;
  color: white;
  align-self: flex-end;
  border-bottom-right-radius: 4px;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.ai-message {
  background: #e9ecef;
  color: #212529;
  align-self: flex-start;
  border-bottom-left-radius: 4px;
}

.ai-message :where(h1, h2, h3, h4, h5, h6) {
  margin: 0.5em 0;
  font-weight: bold;
}

.ai-message h1 {
  font-size: 1.5em;
}

.ai-message h2 {
  font-size: 1.3em;
}

.ai-message h3 {
  font-size: 1.1em;
}

.ai-message h4 {
  font-size: 1em;
}

.ai-message strong {
  font-weight: bold;
}

.ai-message em {
  font-style: italic;
}

.ai-message u {
  text-decoration: underline;
}

.ai-message del,
.ai-message s {
  text-decoration: line-through;
}

.ai-message code {
  background: rgba(0, 0, 0, 0.1);
  padding: 0.2em 0.4em;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  font-size: 0.9em;
}

.ai-message pre {
  background: #f4f4f4;
  padding: 1em;
  border-radius: 6px;
  overflow-x: auto;
  margin: 1em 0;
}

.ai-message blockquote {
  border-left: 4px solid #007bff;
  margin: 1em 0;
  padding-left: 1em;
  color: #555;
  font-style: italic;
}

.ai-message ul,
.ai-message ol {
  padding-left: 1.5em;
  margin: 0.5em 0;
}

.ai-message hr {
  border: none;
  border-top: 1px solid #ccc;
  margin: 1em 0;
}

.input-group {
  margin-top: 1rem;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.input-group .form-control {
  border: none;
  padding: 0.75rem 1rem;
  font-size: 1rem;
}

.input-group .btn {
  border: none;
  padding: 0.75rem 1.5rem;
  font-weight: 500;
}
</style>