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
  folder_name: string;
}

const files = ref<FileItem[]>([]);
const loadingFiles = ref(true);
const uploading = ref(false);
const uploadMessage = ref('');
const uploadSuccess = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const selectedFile = ref<File | null>(null);
const selectedFolder = ref('Лекции');
const newFolderName = ref('');
const permanentFolders = ['Лекции', 'Практика'];


const folderOptions = computed(() => {
  const folders = new Set(files.value.map((file) => file.folder_name || 'Лекции'));
  permanentFolders.forEach((folder) => folders.add(folder));
  return Array.from(folders).sort((a, b) => a.localeCompare(b, 'ru'));
});

const filteredFiles = computed(() =>
  files.value.filter((file) => (file.folder_name || 'Лекции') === selectedFolder.value)
);
    

const totalSize = computed(() => {
  const total = filteredFiles.value.reduce((sum, file) => sum + file.size, 0);
  return formatSize(total);
});

const lastUpload = computed(() => {
  if (filteredFiles.value.length === 0) return 'Нет файлов';
  const dates = filteredFiles.value.map((f) => new Date(f.uploaded_at).getTime());
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
    if (!folderOptions.value.includes(selectedFolder.value)) {
      selectedFolder.value = 'Лекции';
    }
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
  formData.append('folderName', selectedFolder.value);

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
      },
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
    cancelButtonText: 'Отмена',
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
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatDate = (date: string) =>
  new Date(date).toLocaleDateString('ru-RU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const createFolder = () => {
  const normalized = newFolderName.value.trim().replace(/\s+/g, ' ').slice(0, 120);
  if (!normalized) return;
  selectedFolder.value = normalized;
  newFolderName.value = '';
};

onMounted(() => {
  loadFiles();
});
</script>

<template>
  <div class="admin-page container py-4 py-md-5">
    <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-4">
      <div>
        <h1 class="mb-1">Материалы</h1>
        <p class="text-muted mb-0">Управление документами для базы знаний.</p>
      </div>
     <router-link to="/" class="btn btn-outline-primary">← К чату</router-link>
    </div>
    <div class="row g-3 mb-4">
      <div class="col-md-4"><div class="card stat"><div class="card-body"><div class="stat-label">Файлов в папке</div><div class="stat-value">{{ filteredFiles.length }}</div></div></div></div>
      <div class="col-md-4"><div class="card stat"><div class="card-body"><div class="stat-label">Размер</div><div class="stat-value">{{ totalSize }}</div></div></div></div>
      <div class="col-md-4"><div class="card stat"><div class="card-body"><div class="stat-label">Последняя загрузка</div><div class="stat-value ">{{ lastUpload }}</div></div></div></div>
    </div>

    <div class="card mb-4">
      <div class="card-body p-4">
        <h5 class="mb-3">Папка материалов</h5>
        <div class="row g-2 mb-4">
          <div class="col-md-6">
            <label class="form-label">Текущая папка</label>
            <select class="form-select" v-model="selectedFolder">
              <option v-for="folder in folderOptions" :key="folder" :value="folder">{{ folder }}</option>
            </select>
            <div class="form-text">Постоянные папки: Лекции и Практика.</div>
          </div>
          <div class="col-md-6">
            <label class="form-label">Новая папка</label>
            <div class="input-group">
              <input
                v-model="newFolderName"
                type="text"
                maxlength="120"
                placeholder="Например: Лекции / Математика"
                class="form-control"
                @keyup.enter="createFolder"
              />
              <button class="btn btn-outline-secondary" type="button" @click="createFolder">Создать</button>
            </div>
          </div>
        </div>

        <h5 class="mb-3">Загрузить файл</h5>
        <form @submit.prevent="uploadFile">
          <input type="file" ref="fileInput" class="form-control" @change="handleFileSelect" :disabled="uploading" />
          <div class="mt-2 text-muted small">Файл будет загружен в папку: <b>{{ selectedFolder }}</b></div>
          <div class="mt-2 text-muted small" v-if="selectedFile">{{ selectedFile.name }} ({{ formatSize(selectedFile.size) }})</div>
          <button type="submit" class="btn btn-primary mt-3" :disabled="uploading || !selectedFile">
            <span v-if="uploading" class="spinner-border spinner-border-sm me-2"></span>
            {{ uploading ? 'Загрузка...' : 'Загрузить' }}
          </button>
        </form>

        <div v-if="uploadMessage" class="mt-3 alert" :class="uploadSuccess ? 'alert-success' : 'alert-danger'">{{ uploadMessage }}</div>
      </div>
    </div>

    <div class="card">
      <div class="card-body p-4">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h5 class="mb-0">Файлы</h5>
          <button class="btn btn-outline-primary btn-sm" @click="loadFiles" :disabled="loadingFiles">Обновить</button>
        </div>

        <div v-if="loadingFiles" class="text-center py-5"><div class="spinner-border"></div></div>
        <div v-else-if="filteredFiles.length === 0" class="text-center py-5 text-muted">В выбранной папке пока нет файлов.</div>

        <div v-else class="table-responsive">

           <table class="table align-middle">
            <thead>
              <tr><th>#</th><th>Папка</th><th>Имя файла</th><th>Размер</th><th>Дата загрузки</th><th>Действия</th></tr>
            </thead>
            <tbody>
              <tr v-for="file in filteredFiles" :key="file.id">
                <td>{{ file.id }}</td>
                <td>{{ file.folder_name || 'Лекции' }}</td>
                <td>{{ file.original_name }}</td>
                <td>{{ formatSize(file.size) }}</td>
                <td>{{ formatDate(file.uploaded_at) }}</td>
                <td>
                  <div class="btn-group btn-group-sm">
                    <button class="btn btn-outline-primary" @click="downloadFile(file.id, file.original_name)"><i class="bi bi-download"></i></button>
                    <button class="btn btn-outline-danger" @click="confirmDelete(file)"><i class="bi bi-trash"></i></button>
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
.admin-page { max-width: 1120px; }
h1 { font-size: 1.65rem; font-weight: 700; }
.stat { background: #fff; }
.stat-label { font-size: 0.78rem; color: #6a6f7a; text-transform: uppercase; letter-spacing: 0.04em; }
.stat-value { font-size: 1.5rem; font-weight: 700; margin-top: 0.2rem; }
.stat-value.small { font-size: 1.15rem; }
.table thead th { color: #6a6f7a; font-weight: 600; }
</style>