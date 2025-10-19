<script setup lang="ts">
import { ref } from 'vue'
import axios from 'axios'

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
    <div class="modal-dialog modal-dialog-centered modal-lg">
      <div class="modal-content">
        <div class="modal-header">
          <h5 class="modal-title" id="chatModalLabel">Чат с AI-ассистеном</h5>
          <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
        </div>
        <div class="modal-body">
          <div class="chat-window border rounded p-3 mb-3" style="height: 300px; overflow-y: auto;">
            <div v-for="(msg, index) in messages" :key="index" :class="['mb-2', msg.isUser ? 'text-end' : 'text-start']">
              <div :class="['message-bubble', msg.isUser ? 'user-message' : 'ai-message']">
                {{ msg.text }}
              </div>
            </div>
            <div v-if="isLoading" class="text-center">Размышляю...</div>
          </div>
          <div class="input-group">
            <input v-model="userInput" type="text" class="form-control" placeholder="Задай вопрос..." @keyup.enter="sendMessage" />
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
.chat-window { background-color: #f8f9fa; }
.message-bubble {
  display: inline-block; max-width: 70%; padding: 8px 12px;
  border-radius: 10px; white-space: normal; word-wrap: break-word;
  line-height: 1.4;
}
.user-message { background-color: #007bff; color: white; }
.ai-message { background-color: #6c757d; color: white; }
</style>