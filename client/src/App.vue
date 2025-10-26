<script setup lang="ts">
import { ref } from 'vue'
import axios from 'axios'
import { parseMarkdown } from './utils/markdown';

interface Message {
  text: string
  isUser: boolean
}

const messages = ref<Message[]>([])
const userInput = ref('')
const isLoading = ref(false)

const sendMessage = async () => {
  if (!userInput.value.trim()) return

  messages.value.push({ text: userInput.value, isUser: true })
  isLoading.value = true

  try {
    const response = await axios.post('/api/chat', { message: userInput.value })
    const reply = response.data.reply || 'Нет ответа от AI'
    messages.value.push({ text: reply, isUser: false })
  } catch (error) {
    messages.value.push({ text: 'Ошибка: ' + (error as Error).message, isUser: false })
  } finally {
    isLoading.value = false
    userInput.value = ''
  }
}
</script>

<template>
  <div class="container text-center mt-5">
    <h1>AI-Assistant</h1>
    <p>Нажми кнопку, чтобы начать чат с AI-ассистеном.</p>
    <button class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#chatModal">
      Начать чат
    </button>
  </div>

  <div class="modal fade" id="chatModal" tabindex="-1" aria-labelledby="chatModalLabel">
    <div class="modal-dialog modal-dialog-centered modal-xl modal-fullscreen-md-down">
      <div class="modal-content shadow-lg border-0">
        <div class="modal-header border-0 pb-2">
          <h5 class="modal-title fw-bold">Чат с AI-ассистеном</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
        </div>
        <div class="modal-body">
          <div class="chat-window d-flex flex-column">
            <div v-for="(msg, index) in messages" :key="index"
              :class="['d-flex', msg.isUser ? 'justify-content-end' : 'justify-content-start']">
              <div :class="['message-bubble', msg.isUser ? 'user-message' : 'ai-message']" v-if="msg.isUser">
                {{ msg.text }}
              </div>
              <div v-else class="message-bubble ai-message" v-html="parseMarkdown(msg.text)"></div>
            </div>

            <div v-if="isLoading" class="text-center text-muted mt-2">
              <div class="spinner-border spinner-border-sm" role="status"></div>
              <span class="ms-2">Размышляю...</span>
            </div>
          </div>
          <div class="input-group">
            <input v-model="userInput" type="text" class="form-control" placeholder="Задай вопрос..."
              @keyup.enter="sendMessage" />
            <button class="btn btn-primary" @click="sendMessage" :disabled="isLoading">
              Отправить
            </button>
          </div>
        </div>
      </div>
    </div>
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