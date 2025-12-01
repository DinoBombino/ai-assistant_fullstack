import { createApp } from 'vue'
import App from './App.vue'
import { createPinia } from 'pinia'
import 'bootstrap/dist/css/bootstrap.min.css'
import 'bootstrap/dist/js/bootstrap.bundle.min.js'
import { useAuthStore } from './stores/useAuthStore'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)  // ← ВОТ ЭТО ОБЯЗАТЕЛЬНО!

const auth = useAuthStore()
auth.loadUser()

app.mount('#app')