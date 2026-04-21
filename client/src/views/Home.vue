<script setup lang="ts">
import { ref, onMounted, nextTick, computed, watch } from 'vue';
import { parseMarkdown } from '../utils/markdown';
import { useAuthStore } from '../stores/useAuthStore';
import { useChatStore } from '../stores/useChatStore';

// Состояния для inline-редактирования
const isCreatingChat = ref(false);
const newChatTitle = ref('');
const editingSessionId = ref<number | null>(null);
const editingSessionTitle = ref('');

const userInput = ref('');
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
  chat.messages.map((msg) => ({
    text: msg.content,
    isUser: msg.role === 'user',
  })),
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
  // if (!chat.activeSessionId) await chat.createSession('Новый чат');
};

const scrollToBottom = () => {
  nextTick(() => {
    const target = showFullscreenModal.value ? chatWindowModal.value : chatWindow.value;
    if (target) {
      target.scrollTop = target.scrollHeight;
    }
  });
};

watch(uiMessages, () => {
  scrollToBottom();
}, { deep: true });

const resetTextareaHeight = () => {
  const textareas = document.querySelectorAll('.composer-input') as NodeListOf<HTMLTextAreaElement>;
  textareas.forEach(ta => {
    ta.style.height = 'auto';
  });
};

// const sendMessage = async () => {
//   if (!userInput.value.trim()) return;

//   try {
//     await ensureActiveSession();
//     await chat.sendMessage(userInput.value);
//   } catch (error) {
//     console.error('Send message error:', error);
//   } finally {
//     userInput.value = '';
//     // await scrollToBottom();
//     userInput.value = '';
//     resetTextareaHeight();
//   }
// };

const sendMessage = async () => {
  const message = userInput.value.trim();
  if (!message) return;

  userInput.value = '';
  resetTextareaHeight();

  try {
    await ensureActiveSession();
    await chat.sendMessage(message);
  } catch (error) {
    console.error('Send message error:', error);
  }
};

const handleComposerKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    void sendMessage();
  }
};

const autoResizeComposer = (event: Event) => {
  const target = event.target as HTMLTextAreaElement;
  target.style.height = 'auto';
  target.style.height = `${Math.min(target.scrollHeight, 180)}px`;
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
  <div class="home-shell" v-if="auth.user">
    <aside class="chat-sidebar">
      <button v-if="!isCreatingChat" class="btn btn-primary w-100 mb-3" @click="startCreatingChat">
        <i class="bi bi-plus-lg me-2"></i>
        Новый чат
      </button>

      <div v-if="isCreatingChat" class="sidebar-form mb-3">
        <input v-model="newChatTitle" type="text" class="form-control form-control-sm" placeholder="Название чата"
          @keyup.enter="createChat" @keyup.esc="cancelCreateChat" />
        <div class="d-flex gap-2 mt-2">
          <button class="btn btn-primary btn-sm" @click="createChat">Создать</button>
          <button class="btn btn-outline-secondary btn-sm" @click="cancelCreateChat">Отмена</button>
        </div>
      </div>

      <div class="sidebar-title">Чаты</div>

      <div v-if="sessions.length === 0" class="sidebar-empty">Здесь появятся ваши диалоги.</div>

      <ul v-else class="session-list">
        <li v-for="session in sessions" :key="session.id" class="session-item"
          :class="{ active: session.id === activeSessionId }">
          <div v-if="editingSessionId === session.id" class="sidebar-form w-100">
            <input v-model="editingSessionTitle" type="text" class="form-control form-control-sm"
              @keyup.enter="renameChat" @keyup.esc="cancelRenameChat" @blur="renameChat" />
            <div class="d-flex gap-2 mt-2">
              <button class="btn btn-success btn-sm" @click.stop="renameChat">Сохранить</button>
              <button class="btn btn-outline-secondary btn-sm" @click.stop="cancelRenameChat">Отмена</button>
            </div>
          </div>
          <template v-else>
            <button class="session-main" @click="selectSession(session.id)">
              <span class="text-truncate">{{ session.title }}</span>
            </button>
            <div class="session-actions">
              <button class="icon-btn" @click.stop="startRenamingChat(session.id, session.title)" title="Переименовать">
                <i class="bi bi-pencil"></i>
              </button>
              <button class="icon-btn danger" @click.stop="deleteChat(session.id)" title="Удалить">
                <i class="bi bi-trash"></i>
              </button>
            </div>
          </template>
        </li>
      </ul>
    </aside>

    <section class="chat-main">
      <div class="chat-header">
        <div>
          <h1>{{ chat.activeSession?.title || 'Новый чат' }}</h1>
          <p>Спросите что угодно — отвечу максимально понятно.</p>
        </div>
        <button v-if="chat.activeSessionId" class="btn btn-outline-primary btn-sm" @click="openFullscreen">
          <i class="bi bi-arrows-fullscreen"></i>
        </button>
      </div>

      <div ref="chatWindow" class="chat-stream">
        <div v-if="uiMessages.length === 0" class="stream-empty">
          <h4>Чем могу помочь?</h4>
          <p>Введите запрос внизу, чтобы начать диалог.</p>
        </div>

        <div v-for="(msg, index) in uiMessages" :key="index" :class="['msg-row', msg.isUser ? 'user' : 'assistant']">
          <div :class="['msg-bubble', msg.isUser ? 'user-bubble' : 'assistant-bubble']" v-if="msg.isUser">{{ msg.text }}
          </div>
          <div :class="['msg-bubble', 'assistant-bubble']" v-else v-html="parseMarkdown(msg.text)"></div>
        </div>

        <div v-if="isLoading" class="typing-row">
          <div class="spinner-border spinner-border-sm"></div>
          <span>Печатаю ответ...</span>
        </div>
      </div>

      <div class="composer-wrap">
        <textarea v-model="userInput" class="form-control composer-input" placeholder="Напишите сообщение..." rows="1"
          @keydown="handleComposerKeydown" @input="autoResizeComposer"></textarea>
        <button class="btn btn-primary" @click="sendMessage" :disabled="isLoading">Отправить</button>
      </div>
    </section>

    <div class="modal fade" :class="{ show: showFullscreenModal }"
      :style="{ display: showFullscreenModal ? 'block' : 'none' }" tabindex="-1" aria-modal="true">
      <div class="modal-dialog modal-fullscreen">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">{{ chat.activeSession?.title || 'Чат' }}</h5>
            <button type="button" class="btn-close" @click="closeFullscreen" aria-label="Закрыть"></button>
          </div>
          <div class="modal-body d-flex flex-column">
            <div ref="chatWindowModal" class="chat-stream fullscreen-stream">
              <div v-for="(msg, index) in uiMessages" :key="index"
                :class="['msg-row', msg.isUser ? 'user' : 'assistant']">
                <div :class="['msg-bubble', msg.isUser ? 'user-bubble' : 'assistant-bubble']" v-if="msg.isUser">{{
                  msg.text
                  }}</div>
                <div :class="['msg-bubble', 'assistant-bubble']" v-else v-html="parseMarkdown(msg.text)"></div>
              </div>
            </div>
            <div class="composer-wrap mt-3">
              <textarea v-model="userInput" class="form-control composer-input" placeholder="Напишите сообщение..."
                rows="1" @keydown="handleComposerKeydown" @input="autoResizeComposer"></textarea>
              <button class="btn btn-primary" @click="sendMessage" :disabled="isLoading">Отправить</button>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="modal-backdrop fade" :class="{ show: showFullscreenModal }" v-if="showFullscreenModal"
      @click="closeFullscreen"></div>
  </div>

  <div v-else class="container py-5 text-center text-muted">Для чата необходимо войти в систему.</div>
</template>


<style scoped>
.home-shell {
  height: calc(100vh - 56px);
  display: grid;
  grid-template-columns: 280px 1fr;
  overflow: hidden;
}

.chat-sidebar {
  background: var(--bg-sidebar);
  border-right: 1px solid var(--border);
  padding: 0.9rem;
  overflow-y: auto;
  min-height: 0;
}

.sidebar-title {
  font-size: 0.76rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  margin-bottom: 0.55rem;
}

.sidebar-empty {
  font-size: 0.9rem;
  color: var(--text-muted);
}

.session-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.session-item {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  border-radius: 10px;
  min-width: 0;
}

.session-item.active { background: #e4e7ec; }

.session-main {
  flex: 1;
  border: 0;
  min-width: 0;
  overflow: hidden;
  background: transparent;
  text-align: left;
  padding: 0.5rem 0.55rem;
  border-radius: 10px;
  color: #20242c;
}

.session-main .text-truncate {
  display: block;
  max-width: 100%;
}

.session-main:hover { background: #e9ebef; }

.session-actions { display: flex; gap: 0.2rem; }

.icon-btn {
  border: 0;
  background: transparent;
  color: #5e6470;
  width: 28px;
  height: 28px;
  border-radius: 8px;
}

.icon-btn:hover { background: #dce1e8; }
.icon-btn.danger:hover { color: #b91c1c; }

.sidebar-form {
  border: 1px solid var(--border);
  background: #fff;
  border-radius: 10px;
  padding: 0.55rem;
}

.chat-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 1.1rem 1.5rem 0.8rem;
}

.chat-header h1 {
  font-size: 1.2rem;
  margin: 0;
  font-weight: 600;
}

.chat-header p {
  margin: 0.25rem 0 0;
  color: var(--text-muted);
  font-size: 0.9rem;
}

.chat-stream {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  padding: 0 1.5rem 1rem;
}

.stream-empty {
  max-width: 680px;
  margin: 6vh auto 1rem;
  text-align: center;
  color: var(--text-muted);
}

.msg-row {
  max-width: 860px;
  margin: 0 auto 0.9rem;
  display: flex;
}

.msg-row.user { justify-content: flex-end; }

.msg-bubble {
  max-width: min(78%, 760px);
  padding: 0.75rem 0.95rem;
  border-radius: 14px;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.user-bubble {
  background: #0D6EFD;
  color: white;
  border-bottom-right-radius: 5px;
}

.assistant-bubble {
  background: #fff;
  border: 1px solid var(--border);
  color: #232833;
  border-bottom-left-radius: 5px;
}

.assistant-bubble :deep(pre) {
  background: #f4f5f7;
  border-radius: 8px;
  padding: 0.75rem;
}


.assistant-bubble :deep(code) {
  background: #eef0f3;
  border-radius: 4px;
  padding: 0.1rem 0.3rem;
}

.typing-row {
  max-width: 860px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  color: var(--text-muted);
}

.composer-wrap {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.6rem;
  align-items: end;
  padding: 0.7rem 1.5rem 1rem;
  margin: 0 1.5rem 0.7rem;
  background: linear-gradient(to top, #f7f7f8 72%, rgba(247, 247, 248, 0));
  border-radius: 12px;
}

.composer-wrap .form-control {
  background: #fff;
}

.composer-input {
  resize: none;
  overflow-y: auto;
  line-height: 1.4;
  min-height: 44px;
  max-height: 180px;
}

.fullscreen-stream {
  max-height: calc(100vh - 210px);
}

@media (max-width: 992px) {
  .home-shell {
    grid-template-columns: 1fr;
    height: auto;
    min-height: calc(100vh - 56px);
  }

   .chat-sidebar {
    border-right: 0;
    border-bottom: 1px solid var(--border);
    max-height: 300px;
  }
}

@media (max-width: 576px) {
  .chat-header,
  .chat-stream,
  .composer-wrap {
    padding-left: 0.85rem;
    padding-right: 0.85rem;
  }
  
  .composer-wrap {
    margin-left: 0.85rem;
    margin-right: 0.85rem;
  }

    .composer-wrap {
    grid-template-columns: 1fr;
  }

  .msg-bubble {
    max-width: 92%;
  }
}
</style>