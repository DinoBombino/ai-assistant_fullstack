<script setup lang="ts">
import { onMounted } from 'vue';
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
  <div id="app" class="app-shell">
    <header v-if="auth.user" class="topbar">
      <div class="container topbar-inner">
        <router-link class="brand" to="/">AI Assistant</router-link>
        <div class="topbar-actions ">
          <small class="text">{{ auth.user.name }}</small>
          <router-link v-if="auth.user.role === 'teacher' || auth.user.role === 'admin'" to="/admin"
            class="btn btn-sm btn-outline-primary">Админка</router-link>
          <button class="btn btn-sm btn-outline-danger" @click="logout">Выйти</button>
        </div>
      </div>
    </header>
    <div v-if="auth.isLoading && !auth.user" class="loading-overlay">
      <div class="spinner-border" role="status"></div>
    </div>

      <main class="app-main" :class="{ 'has-topbar': auth.user }">
        <router-view />
      </main>
  </div>
</template>


<style scoped>
.app-shell { min-height: 100vh; }

.topbar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 40;
  background: rgba(247, 247, 248, 0.92);
  backdrop-filter: blur(6px);
  border-bottom: 1px solid #e4e6eb;
}

.topbar-inner {
  min-height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

/* Стили для правой части шапки */
.topbar-actions {
  display: flex;
  align-items: center;
  gap: 0.95rem;
  /* margin-left: auto; Прижимает вправо */
  padding-left: 3 rem; /* Дополнительный отступ для смещения */
}

.brand {
  text-decoration: none;
  color: #1f1f23;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.app-main { min-height: 100vh; }
.app-main.has-topbar { padding-top: 56px; }

.loading-overlay {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(247, 247, 248, 0.8);
  z-index: 60;
}
</style>