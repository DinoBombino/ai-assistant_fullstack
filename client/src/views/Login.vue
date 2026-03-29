<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/useAuthStore';
import AuthModal from '../components/AuthModal.vue';

const router = useRouter();
const auth = useAuthStore();
const isLoading = ref(true);
const showAuthModal = ref(false);

onMounted(async () => {
  await auth.loadUser();

  // Если пользователь уже авторизован, перенаправляем на главную
  if (auth.user) {
    router.push('/');
  } else {
    showAuthModal.value = true;
  }

  isLoading.value = false;
});

const handleAuthClose = () => {
  if (auth.user) {
    router.push('/');
  } else {
    showAuthModal.value = false;
  }
};
</script>

<template>
  <div class="login-page min-vh-100 d-flex align-items-center justify-content-center">
    <div class="login-card card">
      <div class="card-body p-4 p-md-5">
        <h2 class="mb-2">AI Assistant</h2>
        <p class="text-muted mb-4">Войдите, чтобы продолжить диалог.</p>

        <div v-if="isLoading" class="text-center py-4">
          <div class="spinner-border" role="status"></div>
        </div>

        <AuthModal v-else :is-open="showAuthModal" @close="handleAuthClose" />
      </div>
    </div>
  </div>
</template>


<style scoped>
.login-page {
  padding: 1rem;
  background: #f3f4f6;
}

.login-card {
  width: min(480px, 100%);
}

h2 {
  font-weight: 700;
  letter-spacing: -0.01em;
}
</style>