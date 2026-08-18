<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'
import SJInput from '../ui/SJInput.vue'
import SJButton from '../ui/SJButton.vue'

/**
 * Search field (design.md §3.2, AC2.1–AC2.2). Persistent <label>, debounced
 * (~300ms) so a burst of keystrokes emits at most one settled `search` — the
 * client-side filtering itself is done by the parent against fixtures.
 */
type WMarketSearchProps = {
  debounceMs?: number
}
const props = withDefaults(defineProps<WMarketSearchProps>(), {
  debounceMs: 300,
})

type WMarketSearchEmits = { search: [query: string] }
const emit = defineEmits<WMarketSearchEmits>()

const query = defineModel<string>('query', { default: '' })

let timer: ReturnType<typeof setTimeout> | undefined

watch(query, (val) => {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => emit('search', val.trim()), props.debounceMs)
})

function clear() {
  query.value = ''
  if (timer) clearTimeout(timer)
  emit('search', '')
}

onBeforeUnmount(() => {
  if (timer) clearTimeout(timer)
})
</script>

<template>
  <section class="ws">
    <div class="ws__field">
      <SJInput
        v-model="query"
        label="Search markets"
        type="search"
        inputmode="search"
        autocomplete="off"
        placeholder="Try “Bitcoin”, “election”, “Fed”…"
        help="Filters the list as you type. Clear to browse top markets."
      />
    </div>
    <div v-if="query" class="ws__clear">
      <SJButton variant="ghost" size="sm" @click="clear">Clear</SJButton>
    </div>
  </section>
</template>

<style scoped>
.ws {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
}

.ws__field {
  flex: 1 1 auto;
}

.ws__clear {
  padding-top: calc(var(--font-size-sm) + var(--space-2));
}
</style>
