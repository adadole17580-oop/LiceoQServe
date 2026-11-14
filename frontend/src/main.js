
import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './assets/styles/primary-actions.css'

createApp(App)
  .use(router)
  .mount('#app')
