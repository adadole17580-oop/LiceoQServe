
<script setup>
defineProps({
  activePage: {
    type: String,
    default: 'Dashboard'
  }
})

const emit = defineEmits(['navigate', 'logout'])

const menuItems = [
  'Dashboard',
  'Appointments',
  'Guidance Sessions',
  'Students',
  'Notifications',
  'Schedule',
  'History',
  'Profile'
]
</script>

<template>
  <aside class="sidebar">
    <nav class="navigation">
      <button
        v-for="item in menuItems"
        :key="item"
        type="button"
        :class="{ selected: activePage === item }"
        @click="emit('navigate', item)"
      >
        {{ item }}
      </button>
    </nav>

    <div class="sidebar-bottom">
      <div class="office-status">
        <strong>Office status</strong>
        <small>Open · 9:00 AM–5:00 PM</small>
      </div>

      <button
        class="logout-button"
        type="button"
        @click="emit('logout')"
      >
        LOG OUT
      </button>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
  min-height: calc(100vh - 84px);
  padding: 20px 14px 14px;
  background: #f8eeee;
  border-right: 1px solid #c9b8b8;
  box-sizing: border-box;
}

.navigation {
  display: grid;
  gap: 6px;
}

.navigation button {
  width: 100%;
  min-height: 43px;
  padding: 11px 17px;
  color: #39090c;
  text-align: left;
  text-transform: uppercase;
  background: transparent;
  border: 0;
  border-radius: 7px;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s ease;
}

.navigation button:hover,
.navigation button.selected {
  color: #fffafa;
  background: #51090e;
}

.sidebar-bottom {
  margin-top: auto;
  padding-top: 24px;
}

.office-status {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 13px;
  margin-bottom: 10px;
  background: #ead6d7;
  border-radius: 8px;
  font-size: 12px;
}

.office-status strong {
  font-weight: 400;
}

.office-status small {
  color: #775f60;
  font-size: 11px;
}

.logout-button {
  width: 100%;
  min-height: 45px;
  padding: 11px;
  color: #39090c;
  background: transparent;
  border: 1px solid #51090e;
  border-radius: 7px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.logout-button:hover {
  color: #fffafa;
  background: #51090e;
}

@media (max-width: 700px) {
  .sidebar {
    min-height: auto;
    padding: 10px;
  }

  .navigation {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
  }

  .navigation button {
    min-height: 40px;
    padding: 9px 10px;
    font-size: 11px;
  }

  .sidebar-bottom {
    padding-top: 12px;
  }
}
</style>
