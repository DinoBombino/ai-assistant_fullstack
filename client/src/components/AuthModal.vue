<!-- client/src/components/AuthModal.vue -->
<script setup lang="ts">
import { ref, watch } from 'vue';
import bcrypt from 'bcryptjs';
import { useAuthStore } from '../stores/useAuthStore';

const props = defineProps<{
  isOpen: boolean;
}>();
const emit = defineEmits(['close']);

const auth = useAuthStore();
const isLogin = ref(true);
const form = ref({
  email: '',
  password: '',
  name: '',
});
const isLoading = ref(false);

const close = () => emit('close');

const submit = async () => {
  isLoading.value = true;
  try {
    if (isLogin.value) {
      await auth.login(form.value.email, form.value.password);
    } else {
      await auth.register({ ...form.value });
    }
    close();
  } catch (err) {
    alert('Ошибка: ' + (err as any).response?.data?.error || 'Попробуйте снова');
  } finally {
    isLoading.value = false;
  }
};

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      form.value = { email: '', password: '', name: '' };
      isLogin.value = true;
    }
  },
);
</script>

<template>
  <div class="modal fade" :class="{ show: isOpen }" :style="{ display: isOpen ? 'block' : 'none' }" tabindex="-1">
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content">
        <div class="modal-header border-0 pb-0">
          <h5 class="modal-title">{{ isLogin ? 'Вход' : 'Регистрация' }}</h5>
          <button type="button" class="btn-close" @click="close"></button>
        </div>
        <div class="modal-body">
          <form @submit.prevent="submit" class="d-grid gap-3">
            <div v-if="!isLogin">
              <label class="form-label">Имя</label>
              <input v-model="form.name" type="text" class="form-control" required />
            </div>
             <div>
              <label class="form-label">Email</label>
              <input v-model="form.email" type="email" class="form-control" required />
            </div>
            <div>
              <label class="form-label">Пароль</label>
              <input v-model="form.password" type="password" class="form-control" required />
            </div>
            <button type="submit" class="btn btn-primary w-100" :disabled="isLoading">
              {{ isLoading ? 'Загрузка...' : isLogin ? 'Войти' : 'Зарегистрироваться' }}
            </button>
          </form>
        </div>
      </div>
    </div>
  </div>
  <div class="modal-backdrop fade" :class="{ show: isOpen }" v-if="isOpen"></div>
</template>

<style scoped>
.modal.show {
  background: rgba(17, 24, 39, 0.3);
}

.auth-toggle {
  color: #374151;
  text-decoration: none;
}

.auth-toggle:hover {
  color: #111827;
}
</style>