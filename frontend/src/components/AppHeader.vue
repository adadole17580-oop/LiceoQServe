
<script setup>
defineProps({
  staffName: {
    type: String,
    default: 'Dr.Lindsay Mae'
  }
})
</script>

<template>
  <header class="topbar">
    <div class="brand">
      <div class="brand-logo">LQ</div>
      <div>
        <h2>LiceoQServe</h2>
        <p>Guidance Office Portal</p>
      </div>
    </div>

    <div class="staff">
      <strong>{{ staffName }}</strong>
      <small>Authorized Staff</small>
    </div>
  </header>
</template>

<style scoped>
.topbar {
  min-height: 84px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 15px 28px;
  color: white;
  background: #51090e;
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand-logo {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border: 1px solid #d9b7a0;
  border-radius: 10px;
  color: #fff0df;
  font-weight: bold;
}

.brand h2,
.brand p {
  margin: 0;
}

.brand h2 {
  font-size: 20px;
}

.brand p,
.staff small {
  display: block;
  margin-top: 5px;
  color: #e7cccc;
  font-size: 12px;
}

.staff {
  text-align: right;
  font-size: 13px;
}

@media (max-width: 500px) {
  .topbar {
    padding: 14px;
  }

  .brand h2 {
    font-size: 17px;
  }

  .staff {
    font-size: 11px;
  }
}
</style>
