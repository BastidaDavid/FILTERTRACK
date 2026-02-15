// ==============================
// FILTERTRACK V1 - CLEAN FRONTEND
// ==============================

document.addEventListener('DOMContentLoaded', () => {
  console.log('SCRIPT V1 CLEAN LOADED')

  // ===== PRODUCTION API CONFIG =====
  const API_BASE = 'https://filtertrack-backend.onrender.com'
  const API_URL = `${API_BASE}/filters`

  const REPORTS_URL = `${API_BASE}/reports`

  const MACHINES_URL = `${API_BASE}/machines`

  let maquinaSeleccionadaId = null

  // -----------------------------
  // AUTH TOKEN HELPER
  // -----------------------------
  function getToken() {
    const token = localStorage.getItem('token')

    if (!token) {
      alert('Sesión expirada. Inicia sesión nuevamente.')
      window.location.href = 'login.html'
      return null
    }

    return token
  }

  // -----------------------------
  // SECURE FETCH (handles 401 auto logout)
  // -----------------------------
  async function secureFetch(url, options = {}) {
    const token = getToken()
    if (!token) return

    const headers = {
      Authorization: `Bearer ${token}`
    }

    // Only attach JSON header if body exists
    if (options.body) {
      headers['Content-Type'] = 'application/json'
    }

    const response = await fetch(url, {
      ...options,
      headers
    })

    if (response.status === 401) {
      localStorage.removeItem('token')
      alert('Sesión expirada. Inicia sesión nuevamente.')
      window.location.href = 'login.html'
      return
    }

    return response
  }

  let filtroEditandoId = null
  let filtroActualId = null

  // -----------------------------
  // Helpers
  // -----------------------------
  function formatISO(date) {
    if (!date) return ''

    const d = new Date(date)
    if (isNaN(d.getTime())) return ''

    return d.toISOString().slice(0, 10)
  }

  function calcularEstado(dueDate) {
    const hoy = new Date()
    const venc = new Date(dueDate)
    const diffMs = venc - hoy
    const dias = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

    if (dias <= 0) return { texto: 'Vencido', clase: 'estado-rojo', dias }
    if (dias <= 30) return { texto: 'Próximo', clase: 'estado-naranja', dias }
    return { texto: 'OK', clase: 'estado-verde', dias }
  }

  // -----------------------------
  // LOAD FILTERS
  // -----------------------------
  async function cargarFiltros() {
    try {
      const url = maquinaSeleccionadaId
        ? `${API_URL}?machine_id=${maquinaSeleccionadaId}`
        : API_URL

      const res = await secureFetch(url)
      if (!res || !res.ok) throw new Error('Error loading filters')
      const filtros = await res.json()

      const tbody = document.querySelector('#tabla-filtros tbody')
      if (!tbody) return
      tbody.innerHTML = ''

      filtros.forEach(f => {
        const estado = calcularEstado(f.due_date)

        const tr = document.createElement('tr')
        tr.innerHTML = `
          <td>${f.filter_id}</td>
          <td>${f.area}</td>
          <td>${f.equipment}</td>
          <td>${f.location}</td>
          <td>${f.brand} / ${f.model}</td>
          <td>${formatISO(f.install_date)}</td>
          <td>${formatISO(f.due_date)}</td>
          <td>
            <span class="badge ${estado.clase}">
              ${estado.texto}
              <div class="dias-restantes">${estado.dias} días</div>
            </span>
          </td>
          <td>
            <button onclick="editarFiltro('${f.filter_id}')">Editar</button>
            <button onclick="eliminarFiltro('${f.filter_id}')">Archivar</button>
            <button onclick="verHistorial('${f.filter_id}')">Historial</button>
          </td>
        `
        tbody.appendChild(tr)
      })
    } catch (err) {
      console.error('Error cargando filtros:', err)
      alert('No se pudo conectar con el servidor.')
    }
  }

  // -----------------------------
  // LOAD MACHINES (SIDEBAR)
  // -----------------------------
  async function cargarMaquinas() {
    try {
      const res = await secureFetch(MACHINES_URL)
      if (!res || !res.ok) return

      const maquinas = await res.json()

      const lista = document.getElementById('lista-maquinas')
      if (!lista) return

      lista.innerHTML = ''

      maquinas.forEach(m => {
        const item = document.createElement('div')
        item.className = 'maquina-item'
        if (maquinaSeleccionadaId === m.machine_id) {
          item.classList.add('activa');
        }
        item.textContent = `${m.machine_id} - ${m.area || ''}`

        item.addEventListener('click', () => {
          maquinaSeleccionadaId = m.machine_id;

          document.querySelectorAll('.maquina-item')
            .forEach(el => el.classList.remove('activa'));

          item.classList.add('activa');

          const titulo = document.getElementById('titulo-maquina');
          if (titulo) {
            titulo.textContent = `Máquina seleccionada: ${m.machine_id}`;
          }

          cargarFiltros();
        })

        lista.appendChild(item)
      })
      if (!maquinaSeleccionadaId && maquinas.length > 0) {
        maquinaSeleccionadaId = maquinas[0].machine_id;
        cargarFiltros();
      }
    } catch (err) {
      console.error('Error cargando máquinas:', err)
    }
  }

  // -----------------------------
  // NUEVA MAQUINA
  // -----------------------------
  const btnNuevaMaquina = document.getElementById('btn-nueva-maquina')

  if (btnNuevaMaquina) {
    btnNuevaMaquina.addEventListener('click', async () => {
      const machineId = prompt('ID de la nueva máquina:')
      if (!machineId) return

      await secureFetch(MACHINES_URL, {
        method: 'POST',
        body: JSON.stringify({
          machine_id: machineId,
          area: 'General'
        })
      })

      cargarMaquinas()
    })
  }

  // -----------------------------
  // CREATE / UPDATE FILTER
  // -----------------------------
  const formFiltro = document.getElementById('form-filtro')
  if (formFiltro) {
    formFiltro.addEventListener('submit', async (e) => {
      e.preventDefault()

      const data = {
        filter_id: document.getElementById('filter-id').value.trim(),
        area: document.getElementById('area').value.trim(),
        equipment: document.getElementById('equipment').value.trim(),
        location: document.getElementById('location').value.trim(),
        brand: document.getElementById('brand').value.trim(),
        model: document.getElementById('model').value.trim(),
        install_date: document.getElementById('install-date').value,
        life_months: Number(document.getElementById('life-months').value),
        responsible: document.getElementById('responsible').value.trim(),
        notes: document.getElementById('notes').value.trim()
      }

      if (filtroEditandoId) {
        await secureFetch(`${API_URL}/${filtroEditandoId}`, {
          method: 'PUT',
          body: JSON.stringify(data)
        })
        filtroEditandoId = null
      } else {
        await secureFetch(API_URL, {
          method: 'POST',
          body: JSON.stringify(data)
        })
      }

      formFiltro.reset()
      cargarFiltros()
    })
  }

  // -----------------------------
  // EDIT
  // -----------------------------
  window.editarFiltro = async function (filterId) {
    const res = await secureFetch(`${API_URL}/${filterId}`)
    if (!res || !res.ok) return
    const f = await res.json()

    filtroEditandoId = filterId

    document.getElementById('filter-id').value = f.filter_id
    document.getElementById('area').value = f.area
    document.getElementById('equipment').value = f.equipment
    document.getElementById('location').value = f.location
    document.getElementById('brand').value = f.brand
    document.getElementById('model').value = f.model
    document.getElementById('install-date').value = formatISO(f.install_date)
    document.getElementById('life-months').value = f.life_months
    document.getElementById('responsible').value = f.responsible
    document.getElementById('notes').value = f.notes || ''

    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // -----------------------------
  // ARCHIVE
  // -----------------------------
  window.eliminarFiltro = async function (filterId) {
    if (!confirm('¿Archivar filtro?')) return

    await secureFetch(`${API_URL}/${filterId}/archive`, {
      method: 'PATCH',
      body: JSON.stringify({ responsible: 'UI', notes: 'Archived from UI' })
    })

    cargarFiltros()
  }

  // -----------------------------
  // HISTORIAL
  // -----------------------------
  window.verHistorial = async function (filterId) {
    filtroActualId = filterId

    const res = await secureFetch(`${API_URL}/${filterId}/events`)
    if (!res || !res.ok) return
    const events = await res.json()

    const tbody = document.querySelector('#tabla-mantenimientos tbody')
    if (!tbody) return
    tbody.innerHTML = ''

    events.forEach(ev => {
      const tr = document.createElement('tr')
      tr.innerHTML = `
        <td>${ev.event_id || '-'}</td>
        <td>${formatISO(ev.event_date)}</td>
        <td>${ev.reason || ev.event_type || '-'}</td>
        <td>${ev.responsible || '-'}</td>
        <td>${ev.notes || '-'}</td>
      `
      tbody.appendChild(tr)
    })

    // Mostrar panel lateral
    const panel = document.querySelector('.col-mantenimientos')
    const overlay = document.getElementById('overlay')

    if (panel) {
      panel.classList.add('activo')
    }

    if (overlay) {
      overlay.classList.add('overlay-activo')
    }
  }

  // -----------------------------
  // ADD MANUAL EVENT
  // -----------------------------
  const formMantenimiento = document.getElementById('form-mantenimiento')
  if (formMantenimiento) {
    formMantenimiento.addEventListener('submit', async (e) => {
      e.preventDefault()

      if (!filtroActualId) {
        alert('Selecciona un filtro primero')
        return
      }

      await secureFetch(`${API_URL}/${filtroActualId}/events`, {
        method: 'POST',
        body: JSON.stringify({
          event_type: document.getElementById('mant-motivo').value || 'SERVICE',
          event_date: document.getElementById('mant-fecha').value,
          reason: document.getElementById('mant-motivo').value,
          responsible: document.getElementById('mant-responsable').value,
          notes: document.getElementById('mant-observaciones').value
        })
      })

      formMantenimiento.reset()
      verHistorial(filtroActualId)
      cargarFiltros()
    })
  }

  // -----------------------------
  // EXECUTIVE REPORT (PDF)
  // -----------------------------
  const btnReporteFiltros = document.getElementById('btn-reporte-pdf')

  if (btnReporteFiltros) {
    btnReporteFiltros.addEventListener('click', async () => {
      try {
        const res = await secureFetch(`${REPORTS_URL}/executive`)
        if (!res || !res.ok) {
          alert('Error generando reporte PDF')
          return
        }

        const blob = await res.blob()
        const url = window.URL.createObjectURL(blob)

        const a = document.createElement('a')
        a.href = url
        a.download = 'FilterTrack_Reporte.pdf'
        document.body.appendChild(a)
        a.click()
        a.remove()
      } catch (err) {
        console.error('Error reporte PDF:', err)
        alert('No se pudo generar el reporte')
      }
    })
  }

  // -----------------------------
  // EXECUTIVE REPORT (EXCEL)
  // -----------------------------
  const btnReporteExcel = document.getElementById('btn-reporte-excel')

  if (btnReporteExcel) {
    btnReporteExcel.addEventListener('click', async () => {
      try {
        const res = await secureFetch(`${REPORTS_URL}/executive.xlsx`)
        if (!res || !res.ok) {
          alert('Error generando reporte Excel')
          return
        }

        const blob = await res.blob()
        const url = window.URL.createObjectURL(blob)

        const a = document.createElement('a')
        a.href = url
        a.download = 'FilterTrack_Reporte.xlsx'
        document.body.appendChild(a)
        a.click()
        a.remove()
      } catch (err) {
        console.error('Error reporte Excel:', err)
        alert('No se pudo generar el reporte')
      }
    })
  }

  // -----------------------------
  // CERRAR PANEL HISTORIAL
  // -----------------------------
  const btnCerrarPanel = document.getElementById('btn-cerrar-panel')
  const overlay = document.getElementById('overlay')

  function cerrarPanel() {
    const panel = document.querySelector('.col-mantenimientos')
    if (panel) panel.classList.remove('activo')
    if (overlay) overlay.classList.remove('overlay-activo')
  }

  if (btnCerrarPanel) {
    btnCerrarPanel.addEventListener('click', cerrarPanel)
  }

  if (overlay) {
    overlay.addEventListener('click', cerrarPanel)
  }

  // -----------------------------
  // LOGOUT
  // -----------------------------
  const btnLogout = document.getElementById('btn-logout')

  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      localStorage.removeItem('token')
      window.location.href = 'login.html'
    })
  }

  if (localStorage.getItem('token')) {
    cargarMaquinas()
    cargarFiltros()
  } else {
    window.location.href = 'login.html'
  }
})