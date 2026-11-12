
<template>
  <!-- Public pages such as login -->
  <router-view v-if="$route.meta.public" />

  <!-- Registrar layout -->
  <div v-else class="registrar-app">
    <!-- Full-width header -->
    <RegistrarHeader />

    <!-- Sidebar and page content underneath header -->
    <div class="registrar-body">
      <RegistrarSidebar />

      <div class="main-section">
        <main class="page-content">
          <router-view />
        </main>

        <footer class="app-footer">
          LiceoQServe · Registrar Services
        </footer>
      </div>
    </div>
  </div>
</template>

<script setup>
import RegistrarSidebar from './components/RegistrarSidebar.vue'
import RegistrarHeader from './components/RegistrarHeader.vue'
</script>

<style>
:root {
  font-family: Arial, Helvetica, sans-serif;
  color: #3b292c;
  background: #f8eeee;
  font-synthesis: none;
  text-rendering: optimizeLegibility;

  --maroon: #650b18;
  --maroon-dark: #4c0711;
  --maroon-soft: #8c2634;
  --pink-bg: #f8eeee;
  --pink-panel: #f2e2e3;
  --pink-border: #e6cdd0;
  --text-main: #3b292c;
  --text-muted: #887477;
  --white: #ffffff;
  --green: #367653;
  --yellow: #e6b83f;
}

* {
  box-sizing: border-box;
}

html,
body,
#app {
  width: 100%;
  min-width: 320px;
  min-height: 100%;
  margin: 0;
  padding: 0;
}

body {
  min-height: 100vh;
  background: var(--pink-bg);
}

button,
input,
select,
textarea {
  font: inherit;
}

button {
  cursor: pointer;
}

/* MAIN REGISTRAR LAYOUT */
.registrar-app {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: 100vh;
  margin: 0;
  padding: 0;
  background: var(--pink-bg);
}

/* SIDEBAR + PAGE CONTENT ROW */
.registrar-body {
  display: flex;
  flex: 1;
  align-items: stretch;
  width: 100%;
  min-height: calc(100vh - 94px);
}

/* MAIN CONTENT AREA */
.main-section {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: calc(100vh - 94px);
  background: var(--pink-bg);
}

/* PAGE CONTENT */
.page-content {
  flex: 1;
  width: 100%;
  max-width: 1600px;
  margin: 0 auto;
  padding: 26px 30px;
}

/* FOOTER */
.app-footer {
  padding: 14px 30px;
  color: var(--text-muted);
  font-size: 11px;
  border-top: 1px solid var(--pink-border);
  background: #fff8f8;
}

/* PAGE HEADINGS */
.page-heading {
  margin-bottom: 22px;
}

.page-heading h2 {
  margin: 0 0 7px;
  color: var(--maroon);
  font-size: 23px;
  font-weight: 700;
}

.page-heading p {
  margin: 0;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.6;
}

/* PANELS */
.panel {
  min-width: 0;
  padding: 20px;
  border: 1px solid var(--pink-border);
  border-radius: 9px;
  background: var(--white);
  box-shadow: 0 2px 7px rgb(85 15 25 / 4%);
}

.panel-title {
  margin: 0 0 16px;
  color: var(--maroon);
  font-size: 15px;
  font-weight: 700;
}

/* BUTTONS */
.primary-button {
  padding: 10px 15px;
  color: #fff;
  border: 1px solid var(--maroon);
  border-radius: 6px;
  background: var(--maroon);
  font-size: 12px;
  font-weight: 700;
}

.primary-button:hover {
  background: var(--maroon-dark);
}

.secondary-button {
  padding: 9px 13px;
  color: var(--maroon);
  border: 1px solid var(--pink-border);
  border-radius: 6px;
  background: #fff8f8;
  font-size: 12px;
  font-weight: 600;
}

/* TABLES */
.data-table-wrap {
  width: 100%;
  overflow-x: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 12px;
}

.data-table th {
  padding: 12px 10px;
  color: #785c61;
  background: #fbf3f3;
  border-bottom: 1px solid var(--pink-border);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.35px;
  text-transform: uppercase;
  white-space: nowrap;
}

.data-table td {
  padding: 13px 10px;
  border-bottom: 1px solid #f0e4e5;
  color: #554346;
  vertical-align: middle;
}

.data-table tbody tr:last-child td {
  border-bottom: none;
}

.data-table tbody tr:hover {
  background: #fff9f9;
}

/* STATUS LABELS */
.status-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 5px 9px;
  border-radius: 20px;
  background: #f5e8e9;
  color: #7b2631;
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
}

.status-pill.pending {
  background: #fff1d0;
  color: #8b6100;
}

.status-pill.processing {
  background: #e9e4fa;
  color: #5a4396;
}

.status-pill.ready {
  background: #e0f3e7;
  color: #286b43;
}

.status-pill.completed {
  background: #e1f1e6;
  color: #286b43;
}

.status-pill.cancelled {
  background: #f4e1e3;
  color: #8b2634;
}

.empty-state {
  padding: 28px 12px;
  color: var(--text-muted);
  text-align: center;
  font-size: 13px;
}

/* RESPONSIVE */
@media (max-width: 900px) {
  .page-content {
    padding: 20px 16px;
  }

  .app-footer {
    padding: 12px 16px;
  }
}

@media (max-width: 650px) {
  .registrar-body {
    min-height: calc(100vh - 94px);
  }

  .page-content {
    padding: 16px 12px;
  }
}
</style>
