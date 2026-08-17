import '@ramoslabs/tokens/css'
import './styles/base.css'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { logEvent } from './utils/logger'

const app = createApp(App)

// Last-resort capture for uncaught render/lifecycle/watcher errors (T005 / NFR-ERR-1).
// The SJErrorBoundary in App.vue contains failures locally; this catches whatever
// escapes it so nothing white-screens silently.
app.config.errorHandler = (err, _instance, info) => {
  logEvent(
    {
      event: 'vue.unhandledError',
      service: 'app',
      status: 'error',
      operation: info,
      errorKind: err instanceof Error ? err.name : 'unknown',
    },
    'error',
  )
  if (import.meta.env.DEV) console.error(err)
}

app.use(createPinia())
app.mount('#app')
