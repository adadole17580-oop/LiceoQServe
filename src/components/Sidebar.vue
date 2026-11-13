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
  'Request',
  'Students',
  'Notifications',
  'History',
  'Schedule',
  'Profile'
]
</script>

<template>
  <aside class="sidebar">
    <nav class="sidebar-menu">
      <button
        v-for="item in menuItems"
        :key="item"
        type="button"
        class="menu-item"
        :class="{ active: activePage === item }"
        @click="emit('navigate', item)"
      >
        {{ item.toUpperCase() }}
      </button>
    </nav>

    <div class="sidebar-footer">
      <div class="office-status">
        <strong>Office status</strong>
        <span>Open · 9:00 AM–5:00 PM</span>
      </div>

      <button
        type="button"
        class="logout-button"
        @click="$emit('logout')"
      >
        LOG OUT
      </button>
    </div>
  </aside>
</template>

<style scoped>
.sidebar {
  display: flex;
  flex: 0 0 260px;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  padding: 16px 12px;
  background: #f8eeee;
  border-right: 1px solid #d8babb;
}

.sidebar-menu {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.menu-item {
  width: 100%;
  min-height: 46px;
  padding: 0 16px;
  color: #25090b;
  background: transparent;
  border: 0;
  border-radius: 8px;
  text-align: left;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.menu-item:hover {
  background: #efdfdf;
}

.menu-item.active {
  color: #fffafa;
  background: #590b12;
}

.sidebar-footer {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: auto;
  padding-top: 20px;
}

.office-status {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  color: #39090c;
  background: #ecd6d7;
  border-radius: 8px;
  font-size: 12px;
}

.office-status strong {
  font-size: 12px;
  font-weight: 600;
  text-transform: none;
}

.office-status span {
  color: #876c6e;
  font-size: 11px;
}

.logout-button {
  width: 100%;
  min-height: 48px;
  color: #39090c;
  background: #f8eeee;
  border: 1px solid #650f18;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}

.logout-button:hover {
  color: #fffafa;
  background: #590b12;
}

@media (max-width: 700px) {
  .sidebar {
    flex-basis: 175px;
    padding: 12px 8px;
  }

  .menu-item {
    min-height: 40px;
    padding: 0 10px;
    font-size: 12px;
  }

  .office-status {
    padding: 9px;
  }

  .logout-button {
    min-height: 42px;
  }
}
</style>
