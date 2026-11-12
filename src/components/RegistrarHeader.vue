
<template>
  <header class="registrar-header">
    <div class="heading">
      <h1>Registrar Portal</h1>
      <p>Student Services and Records Management</p>
    </div>

    <div class="header-actions">
      <span class="staff-status">
        <span class="status-dot"></span>
        Authorized Staff
      </span>

      <button
        class="icon-button"
        aria-label="Open notifications"
        @click="$router.push('/registrar/notifications')"
      >
        ♧
      </button>

      <button
        class="profile-button"
        @click="$router.push('/registrar/profile')"
      >
        <span class="avatar">MS</span>

        <span class="profile-info">
          <strong>Michelle Sy</strong>
          <small>Registrar Staff</small>
        </span>
      </button>
    </div>
  </header>
</template>

<style scoped>
.registrar-header {
  position: relative;
  display: flex;
  flex: 0 0 94px;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 94px;
  margin: 0;
  padding: 18px 32px;
  gap: 20px;
  box-sizing: border-box;

  background: #650b18;
  border-bottom: 3px solid #4c0711;
  color: #ffffff;
  z-index: 20;
}

.heading h1 {
  margin: 0;
  font-size: 21px;
  font-weight: 700;
  color: #ffffff;
}

.heading p {
  margin: 6px 0 0;
  color: #f0dadd;
  font-size: 12px;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 20px;
}

.staff-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #fff0f1;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #83d7a1;
}

.icon-button {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border: 1px solid #98515b;
  border-radius: 8px;
  background: #7a1b28;
  color: #ffffff;
  font-size: 21px;
  cursor: pointer;
}

.icon-button:hover {
  background: #8c2634;
}

.profile-button {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  text-align: left;
}

.avatar {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: 50%;
  background: #f2e2e3;
  color: #650b18;
  font-size: 12px;
  font-weight: 800;
}

.profile-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.profile-info strong {
  font-size: 12px;
  color: #ffffff;
}

.profile-info small {
  font-size: 11px;
  color: #f0dadd;
}

@media (max-width: 650px) {
  .registrar-header {
    padding: 16px;
  }

  .heading h1 {
    font-size: 17px;
  }

  .heading p,
  .staff-status,
  .profile-info {
    display: none;
  }

  .header-actions {
    gap: 10px;
  }
}
</style>
