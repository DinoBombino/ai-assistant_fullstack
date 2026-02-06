<script setup lang="ts">
import { ref, onMounted, nextTick, computed } from 'vue'
import { parseMarkdown } from '../utils/markdown';
import { useAuthStore } from '../stores/useAuthStore';
import { useChatStore } from '../stores/useChatStore';

// Состояния для inline-редактирования
const isCreatingChat = ref(false)
const newChatTitle = ref('')
const editingSessionId = ref<number | null>(null)
const editingSessionTitle = ref('')

const userInput = ref('')
const auth = useAuthStore();
const chat = useChatStore();
const chatWindow = ref<HTMLDivElement | null>(null);
const chatWindowModal = ref<HTMLDivElement | null>(null);
const showFullscreenModal = ref(false);

const isLoading = computed(() => chat.sending || chat.loadingMessages);
const sessions = computed(() => chat.sessions);
const activeSessionId = computed(() => chat.activeSessionId);

// Сообщения для UI: приводим к формату { text, isUser }
const uiMessages = computed(() =>
  chat.messages.map(msg => ({
    text: msg.content,
    isUser: msg.role === 'user'
  }))
);

onMounted(async () => {
  await auth.loadUser();
  if (auth.user) {
    await chat.fetchSessions();
  }
});

const ensureActiveSession = async () => {
  if (!chat.activeSessionId) {
    // Создаём новый чат по умолчанию
    await chat.createSession('Новый чат');
  }
};

const sendMessage = async () => {
  if (!userInput.value.trim()) return;

  try {
    await ensureActiveSession();
    await chat.sendMessage(userInput.value);
  } catch (error) {
    console.error('Send message error:', error);
  } finally {
    userInput.value = '';
    await nextTick(() => {
      const target = showFullscreenModal.value ? chatWindowModal.value : chatWindow.value;
      if (target) target.scrollTop = target.scrollHeight;
    });
  }
};

const openFullscreen = () => {
  showFullscreenModal.value = true;
};

const closeFullscreen = () => {
  showFullscreenModal.value = false;
};

const selectSession = async (sessionId: number) => {
  await chat.fetchMessages(sessionId);
};

const deleteChat = async (sessionId: number) => {
  const confirmed = window.confirm('Удалить этот чат? Его история будет потеряна.');
  if (!confirmed) return;
  await chat.deleteSession(sessionId);
};

///
// Создание чата через inline-форму
const startCreatingChat = () => {
  isCreatingChat.value = true;
  newChatTitle.value = 'Новый чат';
};
const createChat = async () => {
  if (!newChatTitle.value.trim()) {
    isCreatingChat.value = false;
    return;
  }
  
  try {
    await chat.createSession(newChatTitle.value.trim());
  } finally {
    isCreatingChat.value = false;
    newChatTitle.value = '';
  }
};

const cancelCreateChat = () => {
  isCreatingChat.value = false;
  newChatTitle.value = '';
};

// Переименование через inline-форму
const startRenamingChat = (sessionId: number, currentTitle: string) => {
  editingSessionId.value = sessionId;
  editingSessionTitle.value = currentTitle;
};
const renameChat = async () => {
  if (!editingSessionId.value || !editingSessionTitle.value.trim()) {
    editingSessionId.value = null;
    return;
  }
  
  try {
    await chat.renameSession(editingSessionId.value, editingSessionTitle.value.trim());
  } finally {
    editingSessionId.value = null;
    editingSessionTitle.value = '';
  }
};

const cancelRenameChat = () => {
  editingSessionId.value = null;
  editingSessionTitle.value = '';
};
///
</script>

<template>
  <div>
    <div class="container">
      <div class="row">
        <!-- Левая часть: заголовок и список чатов -->
        <div class="col-lg-4 mb-4">
          <div class="text-center mb-4">
            <h1>Ваш ИИ-помощник</h1>
            <p>Выберите чат или создайте новый.</p>
          </div>

          <div v-if="auth.user" class="chat-sessions">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <h5 class="mb-0">Мои чаты</h5>
              <button 
                v-if="!isCreatingChat" 
                class="btn btn-sm btn-outline-primary" 
                @click="startCreatingChat"
              >
                Новый чат
              </button>
            </div>

            <!-- Форма создания чата -->
            <div v-if="isCreatingChat" class="create-chat-form mb-3 p-3 bg-light rounded">
              <div class="mb-2">
                <input
                  v-model="newChatTitle"
                  type="text"
                  class="form-control form-control-sm"
                  placeholder="Название чата"
                  @keyup.enter="createChat"
                  @keyup.esc="cancelCreateChat"
                  ref="createInput"
                />
              </div>
              <div class="d-flex gap-2">
                <button class="btn btn-sm btn-primary" @click="createChat">Создать</button>
                <button class="btn btn-sm btn-outline-secondary" @click="cancelCreateChat">Отмена</button>
              </div>
            </div>

            <div v-if="sessions.length === 0 && !isCreatingChat" class="text-muted small">
              Пока нет чатов. Создайте первый.
            </div>

            <ul v-else class="list-group small">
              <li v-for="session in sessions"
                  :key="session.id"
                  class="list-group-item"
                  :class="{ active: session.id === activeSessionId }"
                  @click="editingSessionId !== session.id && selectSession(session.id)">
                <!-- Режим редактирования -->
                <div v-if="editingSessionId === session.id" class="rename-form">
                  <input
                    v-model="editingSessionTitle"
                    type="text"
                    class="form-control form-control-sm mb-2"
                    @keyup.enter="renameChat"
                    @keyup.esc="cancelRenameChat"
                    @blur="renameChat"
                    ref="renameInput"
                  />
                  <div class="d-flex gap-1">
                    <button class="btn btn-sm btn-success" @click.stop="renameChat">Сохранить</button>
                    <button class="btn btn-sm btn-outline-secondary" @click.stop="cancelRenameChat">Отмена</button>
                  </div>
                </div>
                
                <!-- Обычный режим отображения -->
                <div v-else class="d-flex justify-content-between align-items-center">
                  <div class="me-2 text-truncate flex-grow-1" @click.stop="selectSession(session.id)">
                    {{ session.title }}
                  </div>
                  <div class="btn-group btn-group-sm">
                    <button
                      class="btn btn-outline-secondary"
                      @click.stop="startRenamingChat(session.id, session.title)"
                      title="Переименовать"
                    >
                      <i class="bi bi-pencil"></i>
                    </button>
                    <button
                      class="btn btn-outline-danger"
                      @click.stop="deleteChat(session.id)"
                      title="Удалить"
                    >
                      <i class="bi bi-trash"></i>
                    </button>
                  </div>
                </div>
              </li>
            </ul>
          </div>
        </div>

        <!-- Правая часть: окно чата -->
        <div class="col-lg-8">
          <div class="card shadow border-0">
            <div class="card-body">
              <h5 class="card-title mb-3 d-flex align-items-center justify-content-between">
                <span>
                  Чат
                  <span v-if="chat.activeSession" class="text-muted ms-2">
                    ({{ chat.activeSession.title }})
                  </span>
                </span>
                <button
                  v-if="auth.user && chat.activeSessionId"
                  class="btn btn-sm btn-outline-secondary"
                  @click="openFullscreen"
                  title="Во весь экран"
                >
                  ⛶
                </button>
              </h5>

              <div v-if="!auth.user" class="text-muted">
                Для чата необходимо войти в систему.
              </div>
              <div v-else>
                <div ref="chatWindow" class="chat-window d-flex flex-column mb-3">
                  <div
                    v-for="(msg, index) in uiMessages"
                    :key="index"
                    :class="['d-flex', msg.isUser ? 'justify-content-end' : 'justify-content-start']"
                  >
                    <div
                      :class="['message-bubble', msg.isUser ? 'user-message' : 'ai-message']"
                      v-if="msg.isUser"
                    >
                      {{ msg.text }}
                    </div>
                    <div
                      v-else
                      class="message-bubble ai-message"
                      v-html="parseMarkdown(msg.text)"
                    ></div>
                  </div>
                  <div v-if="isLoading" class="text-center text-muted mt-2">
                    <div class="spinner-border spinner-border-sm" role="status"></div>
                    <span class="ms-2">Размышляю...</span>
                  </div>
                </div>

                <div class="input-group">
                  <input
                    v-model="userInput"
                    type="text"
                    class="form-control"
                    placeholder="Задай вопрос..."
                    @keyup.enter="sendMessage"
                    :disabled="!auth.user"
                  />
                  <button
                    class="btn btn-primary"
                    @click="sendMessage"
                    :disabled="isLoading || !auth.user"
                  >
                    Отправить
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div
      class="modal fade"
      :class="{ show: showFullscreenModal }"
      :style="{ display: showFullscreenModal ? 'block' : 'none' }"
      tabindex="-1"
      aria-modal="true"
    >
      <div class="modal-dialog modal-fullscreen">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">
              Чат
              <span v-if="chat.activeSession" class="text-muted ms-2">
                ({{ chat.activeSession.title }})
              </span>
            </h5>
            <button type="button" class="btn-close" @click="closeFullscreen" aria-label="Закрыть"></button>
          </div>
          <div class="modal-body d-flex flex-column" v-if="auth.user">
            <div ref="chatWindowModal" class="chat-window chat-window-fullscreen d-flex flex-column flex-grow-1 mb-3">
              <div
                v-for="(msg, index) in uiMessages"
                :key="index"
                :class="['d-flex', msg.isUser ? 'justify-content-end' : 'justify-content-start']"
              >
                <div
                  :class="['message-bubble', msg.isUser ? 'user-message' : 'ai-message']"
                  v-if="msg.isUser"
                >
                  {{ msg.text }}
                </div>
                <div
                  v-else
                  class="message-bubble ai-message"
                  v-html="parseMarkdown(msg.text)"
                ></div>
              </div>
              <div v-if="isLoading" class="text-center text-muted mt-2">
                <div class="spinner-border spinner-border-sm" role="status"></div>
                <span class="ms-2">Размышляю...</span>
              </div>
            </div>
            <div class="input-group mt-auto">
              <input
                v-model="userInput"
                type="text"
                class="form-control"
                placeholder="Задай вопрос..."
                @keyup.enter="sendMessage"
              />
              <button class="btn btn-primary" @click="sendMessage" :disabled="isLoading">
                Отправить
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="modal-backdrop fade" :class="{ show: showFullscreenModal }" v-if="showFullscreenModal" @click="closeFullscreen"></div>
  </div>
</template>

<style scoped>
.chat-window-fullscreen {
  height: calc(100vh - 180px);
  min-height: 300px;
  max-height: none;
}

.chat-window {
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

.chat-sessions .list-group-item.active {
  background-color: #0d6efd;
  border-color: #0d6efd;
  color: #fff;
}

/* Стили для форм inline-редактирования */
.create-chat-form {
  border: 1px solid #dee2e6;
}

.rename-form {
  padding: 0.5rem;
  background: white;
  border-radius: 4px;
}

.list-group-item {
  transition: background-color 0.2s;
}

.list-group-item:hover {
  background-color: #f8f9fa;
}

.list-group-item.active:hover {
  background-color: #0d6efd;
}
/**/ 
</style>