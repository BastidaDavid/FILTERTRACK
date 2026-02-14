// ==============================
// FILTERTRACK V1 - CLEAN FRONTEND
// ==============================

document.addEventListener('DOMContentLoaded', () => {
  console.log('SCRIPT V1 CLEAN LOADED')

  const API_BASE = location.hostname.includes('github.io')
    ? 'https://filtertrack-backend.onrender.com'
    : 'http://localhost:3000'

  const API_URL = `${API_BASE}/filters`

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
    const res = await fetch(API_URL)
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
        await fetch(`${API_URL}/${filtroEditandoId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        })
        filtroEditandoId = null
      } else {
        await fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
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
    const res = await fetch(`${API_URL}/${filterId}`)
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

    await fetch(`${API_URL}/${filterId}/archive`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ responsible: 'UI', notes: 'Archived from UI' })
    })

    cargarFiltros()
  }

  // -----------------------------
  // HISTORIAL
  // -----------------------------
  window.verHistorial = async function (filterId) {
    filtroActualId = filterId

    const res = await fetch(`${API_URL}/${filterId}/events`)
    const events = await res.json()

    const tbody = document.querySelector('#tabla-mantenimientos tbody')
    if (!tbody) return
    tbody.innerHTML = ''

    events.forEach(ev => {
      const tr = document.createElement('tr')
      tr.innerHTML = `
        <td>${ev.event_type}</td>
        <td>${ev.event_date}</td>
        <td>${ev.reason || '-'}</td>
        <td>${ev.responsible || '-'}</td>
        <td>${ev.notes || ''}</td>
      `
      tbody.appendChild(tr)
    })
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

      await fetch(`${API_URL}/${filtroActualId}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  cargarFiltros()
})