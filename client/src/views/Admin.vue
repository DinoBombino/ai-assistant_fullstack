<!-- client/src/views/Admin.vue -->
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import axios from 'axios';
import Swal from 'sweetalert2';

interface FileItem {
  id: number;
  original_name: string;
  size: number;
  uploaded_at: string;
}

const files = ref<FileItem[]>([]);
const loadingFiles = ref(true);
const uploading = ref(false);
const uploadMessage = ref('');
const uploadSuccess = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const selectedFile = ref<File | null>(null);

    

const totalSize = computed(() => {
  const total = files.value.reduce((sum, file) => sum + file.size, 0);
  return formatSize(total);
});

const lastUpload = computed(() => {
  if (files.value.length === 0) return 'Нет файлов';
  const dates = files.value.map(f => new Date(f.uploaded_at).getTime());
  const latest = new Date(Math.max(...dates));
  return latest.toLocaleDateString('ru-RU');
});


const loadFiles = async () => {
  loadingFiles.value = true;
  try {
    console.log('Запрашиваю файлы...');
    const res = await axios.get('/api/files');
    console.log('Получены данные:', res.data);
    console.log('Файлы:', res.data.files);
    files.value = res.data.files || [];
    console.log('files.value после обновления:', files.value);
  } catch (err) {
    console.error('Error loading files:', err);
    Swal.fire({
      icon: 'error',
      title: 'Ошибка',
      text: 'Не удалось загрузить список файлов',
    });
  } finally {
    loadingFiles.value = false;
  }
};

const handleFileSelect = (event: Event) => {
  const input = event.target as HTMLInputElement;
  if (input.files && input.files[0]) {
    selectedFile.value = input.files[0];
  }
};

const uploadFile = async () => {
  if (!selectedFile.value) return;

  uploading.value = true;
  uploadMessage.value = '';
  
  const formData = new FormData();
  formData.append('file', selectedFile.value);

  try {
    await axios.post('/api/files/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    
    uploadMessage.value = 'Файл успешно загружен';
    uploadSuccess.value = true;
    
    selectedFile.value = null;
    if (fileInput.value) {
      fileInput.value.value = '';
    }
    
    await loadFiles();
    
    // Автоматически скрыть сообщение через 3 секунды
    setTimeout(() => {
      uploadMessage.value = '';
    }, 3000);
  } catch (err: any) {
    uploadMessage.value = err.response?.data?.error || 'Ошибка загрузки файла';
    uploadSuccess.value = false;
  } finally {
    uploading.value = false;
  }
};

const downloadFile = async (id: number, filename: string) => {
  try {
    const res = await axios.get(`/api/files/${id}`, { 
      responseType: 'blob',
      onDownloadProgress: (progressEvent) => {
        const percent = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 1));
        console.log(`Downloading: ${percent}%`);
      }
    });
    
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  } catch (err) {
    Swal.fire({
      icon: 'error',
      title: 'Ошибка',
      text: 'Не удалось скачать файл',
    });
  }
};

const confirmDelete = (file: FileItem) => {
  Swal.fire({
    title: 'Удалить файл?',
    text: `Вы уверены, что хотите удалить "${file.original_name}"?`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#d33',
    cancelButtonColor: '#3085d6',
    confirmButtonText: 'Да, удалить!',
    cancelButtonText: 'Отмена'
  }).then(async (result) => {
    if (result.isConfirmed) {
      try {
        await axios.delete(`/api/files/${file.id}`);
        await loadFiles();
        Swal.fire('Удалено!', 'Файл был удален.', 'success');
      } catch (err) {
        Swal.fire('Ошибка!', 'Не удалось удалить файл.', 'error');
      }
    }
  });
};

const formatSize = (bytes: number) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
};

const formatDate = (date: string) => {
  return new Date(date).toLocaleDateString('ru-RU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

onMounted(() => {
  loadFiles();
});
</script>

<template>
  <div class="admin-page container py-5">
    <div class="d-flex justify-content-between align-items-center mb-5">
      <div>
        <h1 class="mb-2">Управление материалами</h1>
        <p class="text-muted">Загрузка и управление учебными материалами</p>
      </div>
      <router-link to="/" class="btn btn-outline-secondary">
        ← Назад к чату
      </router-link>
    </div>

    <!-- Статистика -->
    <div class="row mb-4">
      <div class="col-md-4">
        <div class="card stat-card">
          <div class="card-body">
            <h5 class="card-title">Всего файлов</h5>
            <h2 class="card-text">{{ files.length }}</h2>
          </div>
        </div>
      </div>
      <div class="col-md-4">
        <div class="card stat-card">
          <div class="card-body">
            <h5 class="card-title">Общий размер</h5>
            <h2 class="card-text">{{ totalSize }}</h2>
          </div>
        </div>
      </div>
      <div class="col-md-4">
        <div class="card stat-card">
          <div class="card-body">
            <h5 class="card-title">Последняя загрузка</h5>
            <h2 class="card-text">{{ lastUpload }}</h2>
          </div>
        </div>
      </div>
    </div>

    <!-- Форма загрузки -->
    <div class="card mb-5 shadow">
      <div class="card-body">
        <h4 class="card-title mb-4">Загрузить новый файл</h4>
        <form @submit.prevent="uploadFile" class="upload-form">
          <div class="mb-3">
            <div class="file-input-wrapper">
              <input type="file" 
                     ref="fileInput" 
                     class="form-control" 
                     @change="handleFileSelect"
                     :disabled="uploading" />
              <div class="file-info" v-if="selectedFile">
                Выбран: {{ selectedFile.name }} ({{ formatSize(selectedFile.size) }})
              </div>
            </div>
          </div>
          <button type="submit" 
                  class="btn btn-success btn-lg"
                  :disabled="uploading || !selectedFile">
            <span v-if="uploading">
              <span class="spinner-border spinner-border-sm me-2"></span>
              Загрузка...
            </span>
            <span v-else>Загрузить файл</span>
          </button>
        </form>
        <div v-if="uploadMessage" 
             class="mt-3 alert" 
             :class="uploadSuccess ? 'alert-success' : 'alert-danger'">
          {{ uploadMessage }}
        </div>
      </div>
    </div>

    <!-- Таблица файлов -->
    <div class="card shadow">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-center mb-4">
          <h4 class="card-title mb-0">Загруженные файлы</h4>
          <button class="btn btn-outline-primary" @click="loadFiles" :disabled="loadingFiles">
            <span class="spinner-border spinner-border-sm me-2" v-if="loadingFiles"></span>
            Обновить
          </button>
        </div>

        <div v-if="loadingFiles" class="text-center py-5">
          <div class="spinner-border text-primary" style="width: 3rem; height: 3rem;"></div>
          <p class="mt-3">Загрузка файлов...</p>
        </div>

        <div v-else-if="files.length === 0" class="text-center py-5 text-muted">
          <h5>Файлов пока нет</h5>
          <p>Загрузите первый файл, используя форму выше</p>
        </div>

        <div v-else class="table-responsive">
          <table class="table table-hover">
            <thead class="table-light">
              <tr>
                <th>#</th>
                <th>Имя файла</th>
                <th>Размер</th>
                <th>Дата загрузки</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="file in files" :key="file.id">
                <td>{{ file.id }}</td>
                <td>
                  <div class="d-flex align-items-center">
                    <span class="file-icon me-2"></span>
                    <span>{{ file.original_name }}</span>
                  </div>
                </td>
                <td>{{ formatSize(file.size) }}</td>
                <td>{{ formatDate(file.uploaded_at) }}</td>
                <td>
                  <div class="btn-group btn-group-sm">
                    <button class="btn btn-outline-primary" 
                            @click="downloadFile(file.id, file.original_name)"
                            title="Скачать">
                      
                    </button>
                    <button class="btn btn-outline-danger" 
                            @click="confirmDelete(file)"
                            title="Удалить">
                    
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>



<style scoped>
.admin-page {
  max-width: 1200px;
}

.stat-card {
  border: none;
  border-radius: 10px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  transition: transform 0.3s;
}

.stat-card:hover {
  transform: translateY(-5px);
}

.stat-card .card-title {
  color: #666;
  font-size: 0.9rem;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.stat-card .card-text {
  color: #333;
  font-weight: bold;
}

.upload-form .file-input-wrapper {
  position: relative;
}

.file-info {
  margin-top: 8px;
  padding: 8px 12px;
  background: #f8f9fa;
  border-radius: 5px;
  font-size: 0.9rem;
  color: #666;
}

.file-icon {
  font-size: 1.2rem;
}

.table th {
  font-weight: 600;
  color: #555;
}

.table td {
  vertical-align: middle;
}

.btn-group .btn {
  padding: 0.25rem 0.5rem;
}
</style>