<!-- client/src/views/Login.vue -->
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/useAuthStore';
import AuthModal from '../components/AuthModal.vue';

const router = useRouter();
const auth = useAuthStore();
const isLoading = ref(true);
const showAuthModal = ref(false); // <-- Новый флаг


onMounted(async () => {
  // Сначала загружаем пользователя, если он есть
  await auth.loadUser();
  
  // Если пользователь уже авторизован, перенаправляем на главную
  if (auth.user) {
    router.push('/');
  } else {
    // Только если пользователь не авторизован, показываем модальное окно
    showAuthModal.value = true;
  }
  
  isLoading.value = false;
});


const handleAuthClose = () => {
  if (auth.user) {
    router.push('/');
  } else {
    // Если пользователь закрыл окно без авторизации
    showAuthModal.value = false;
  }
};
</script>

<template>
  <div class="login-page min-vh-100 d-flex align-items-center justify-content-center">
    <div class="container">
      <div class="row justify-content-center">
        <div class="col-md-6 col-lg-4">
          <div class="card shadow-lg">
            <div class="card-body p-4">
              <h2 class="text-center mb-4">AI Помощник</h2>
              <!-- Показываем спиннер во время загрузки -->
              <div v-if="isLoading" class="text-center">
                <div class="spinner-border text-primary" role="status">
                  <span class="visually-hidden">Загрузка...</span>
                </div>
              </div>
              
              <!-- Показываем модальное окно только если пользователь не авторизован -->
              <AuthModal 
                v-else 
                :is-open="showAuthModal" 
                @close="handleAuthClose" 
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  background: linear-gradient(135deg, #ffffff 0%, #764ba2 100%);
}

.card {
  border-radius: 15px;
  border: none;
}

.card-body {
  background: white;
  border-radius: 15px;
}
</style>