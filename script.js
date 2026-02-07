document.addEventListener('DOMContentLoaded', () => {

console.log('SCRIPT CARGADO')

const API_BASE =
  location.hostname.includes('github.io')
    ? 'https://filtertrack-backend.onrender.com'
    : 'http://localhost:3001'

const API_URL = `${API_BASE}/filtros`
let filtroEditandoId = null
let filtrosCache = []
let estadoFiltroActual = 'all'

function calcularEstado(fechaInstalacion, vidaUtilDias) {
  const hoy = new Date()
  const instalacion = new Date(fechaInstalacion)
  const vencimiento = new Date(instalacion)
  vencimiento.setDate(vencimiento.getDate() + Number(vidaUtilDias))

  const diffMs = vencimiento - hoy
  const diasRestantes = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

  if (diasRestantes <= 0) {
    return {
      texto: 'Vencido',
      clase: 'estado-rojo',
      prioridad: 0,
      dias: diasRestantes
    }
  }

  if (diasRestantes <= 30) {
    return {
      texto: 'Cambio inmediato',
      clase: 'estado-naranja',
      prioridad: 1,
      dias: diasRestantes
    }
  }

  if (diasRestantes <= 60) {
    return {
      texto: 'Solicitar',
      clase: 'estado-amarillo',
      prioridad: 2,
      dias: diasRestantes
    }
  }

  return {
    texto: 'OK',
    clase: 'estado-verde',
    prioridad: 3,
    dias: diasRestantes
  }
}

function calcularEstadoPorPresion(pressureInitial, pressureActual) {
  if (!pressureInitial || !pressureActual) return null

  const drop = pressureInitial - pressureActual

  if (drop > 10) {
    return {
      texto: 'Crítico (Presión)',
      clase: 'estado-rojo',
      prioridad: 0
    }
  }

  if (drop > 5) {
    return {
      texto: 'Advertencia (Presión)',
      clase: 'estado-amarillo',
      prioridad: 1
    }
  }

  return {
    texto: 'OK',
    clase: 'estado-verde',
    prioridad: 3
  }
}

// Cargar filtros
async function cargarFiltros() {
  try {
    const response = await fetch(API_URL)
    const filtros = await response.json()

    // Ordenar por estado: Vencido → Próximo → OK
    filtros.sort((a, b) => {
      const estadoA = calcularEstado(a.fecha_instalacion, a.vida_util_dias)
      const estadoB = calcularEstado(b.fecha_instalacion, b.vida_util_dias)
      return estadoA.prioridad - estadoB.prioridad
    })

    // Guardar filtros en cache
    filtrosCache = filtros

    let countVencido = 0
    let countProximo = 0

    filtros.forEach(f => {
      const estado = calcularEstado(f.fecha_instalacion, f.vida_util_dias)
      if (estado.prioridad === 0) countVencido++
      else if (estado.prioridad === 1) countProximo++
    })

    document.getElementById('count-all').innerText = filtros.length
    document.getElementById('count-proximo').innerText = countProximo
    document.getElementById('count-vencido').innerText = countVencido

    const tbody = document.querySelector('#tabla-filtros tbody')
    tbody.innerHTML = ''

    const vencidos = []
    const proximos = []
    const ok = []

    filtros.forEach(filtro => {
      let estado = calcularEstado(
        filtro.fecha_instalacion,
        filtro.vida_util_dias
      )

      const estadoPresion = calcularEstadoPorPresion(
        filtro.pressure_initial,
        filtro.presion_actual
      )

      if (estadoPresion && estadoPresion.prioridad < estado.prioridad) {
        estado = { ...estado, ...estadoPresion }
      }

      const tr = document.createElement('tr')
      tr.innerHTML = `
        <td>${filtro.id}</td>
        <td>${filtro.nombre}</td>
        <td>${filtro.codigo_barra}</td>
        <td>${filtro.fecha_instalacion}</td>
        <td>
          <span class="badge-presion">
            ${filtro.presion_actual
              ? filtro.presion_actual + ' PSI'
              : (filtro.pressure_initial ? filtro.pressure_initial + ' PSI' : '-')}
          </span>
        </td>
        <td>
          <span class="badge ${estado.clase}">
            ${estado.texto}
            ${estado.dias !== undefined 
              ? `<div class="dias-restantes">${estado.dias} días</div>` 
              : ''}
          </span>
        </td>
        <td>
          <button onclick="editarFiltro(${filtro.id}, '${filtro.nombre}', '${filtro.codigo_barra}', '${filtro.fecha_instalacion}', ${filtro.vida_util_dias})">
            Editar
          </button>
          <button onclick="eliminarFiltro(${filtro.id})">Eliminar</button>
          <button onclick="verMantenimientos(${filtro.id})">Mantenimientos</button>
        </td>
      `

      if (
        estadoFiltroActual === 'all' ||
        (estadoFiltroActual === 'vencido' && estado.prioridad === 0) ||
        (estadoFiltroActual === 'proximo' && estado.prioridad === 1)
      ) {
        if (estado.prioridad === 0) vencidos.push(tr)
        else if (estado.prioridad === 1) proximos.push(tr)
        else ok.push(tr)
      }
    })

    // Limpiar tabla y renderizar por secciones
    tbody.innerHTML = ''
    vencidos.forEach(tr => tbody.appendChild(tr))
    proximos.forEach(tr => tbody.appendChild(tr))
    ok.forEach(tr => tbody.appendChild(tr))
  } catch (error) {
    console.warn('Backend no disponible, frontend sigue activo')
    console.warn(error.message)
  }
}

// Enviar formulario
const formFiltro = document.getElementById('form-filtro')
if (formFiltro) {
  formFiltro.addEventListener('submit', async (e) => {
    e.preventDefault()

    const data = {
      nombre: document.getElementById('nombre').value,
      codigo_barra: document.getElementById('codigo').value,
      fecha_instalacion: document.getElementById('fecha').value,
      vida_util_dias: document.getElementById('vida').value,
      pressure_initial: document.getElementById('pressure-initial')?.value || null
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

    limpiarFormulario()
    cargarFiltros()
  })
}

const btnGuardar = document.getElementById('btn-guardar')
if (btnGuardar) {
  btnGuardar.addEventListener('click', (e) => {
    e.preventDefault()
    formFiltro?.dispatchEvent(new Event('submit', { cancelable: true }))
  })
}

// Inicial
cargarFiltros()

  // Reporte de filtros
  const btnReporteFiltros = document.getElementById('btn-reporte-filtros')
  if (btnReporteFiltros) {
    btnReporteFiltros.addEventListener('click', generarReporteFiltros)
  }


// Eliminar filtro
async function eliminarFiltro(id) {
  const confirmar = confirm('¿Seguro que quieres eliminar este filtro?')
  if (!confirmar) return

  try {
    const res = await fetch(`${API_BASE}/filtros/${id}`, {
      method: 'DELETE'
    })

    if (!res.ok) {
      const error = await res.json()
      alert('Error al eliminar: ' + error.error)
      return
    }

    limpiarFormulario()
    cargarFiltros()
  } catch (error) {
    console.error('Error eliminando filtro:', error)
  }
}

function editarFiltro(id, nombre, codigo, fecha, vida) {
  filtroEditandoId = id
  document.getElementById('nombre').value = nombre
  document.getElementById('codigo').value = codigo
  document.getElementById('fecha').value = fecha
  document.getElementById('vida').value = vida
}

function limpiarFormulario() {
  filtroEditandoId = null
  document.getElementById('form-filtro').reset()
}

const btnLimpiar = document.getElementById('btn-limpiar')
if (btnLimpiar) {
  btnLimpiar.addEventListener('click', () => {
    limpiarFormulario()
  })
}

let filtroActualId = null
window.filtroActualId = null

function verMantenimientos(filtroId) {
  filtroActualId = filtroId
  window.filtroActualId = filtroId

  const panel = document.querySelector('.col-mantenimientos')
  const overlay = document.getElementById('overlay')
  const seccion = document.getElementById('seccion-mantenimientos')

  if (!panel || !overlay || !seccion) {
    console.error('Panel de mantenimientos no encontrado')
    return
  }

  panel.classList.add('activo')
  overlay.classList.add('activo')
  seccion.style.display = 'block'

  document.getElementById('titulo-mantenimientos').innerText =
    `Mantenimientos del filtro ID ${filtroId}`

  fetch(`${API_BASE}/mantenimientos/${filtroId}`)
    .then(res => res.json())
    .then(data => {
      const tbody = document.querySelector('#tabla-mantenimientos tbody')
      tbody.innerHTML = ''

      data.forEach(m => {
        const tr = document.createElement('tr')
        tr.innerHTML = `
          <td>${m.id}</td>
          <td>${m.fecha}</td>
          <td>${m.presion_actual ? m.presion_actual + ' PSI' : '-'}</td>
          <td>${m.observaciones || ''}</td>
        `
        tbody.appendChild(tr)
      })
    })
  // Conectar botón de reporte de mantenimientos cuando el panel está activo
  const btnReporteMantenimientos = document.getElementById('btn-reporte-mantenimientos')
  if (btnReporteMantenimientos) {
    btnReporteMantenimientos.onclick = generarReporteMantenimientos
  }
}

// Guardar mantenimiento
const formMantenimiento = document.getElementById('form-mantenimiento')
if (formMantenimiento) {
  formMantenimiento.addEventListener('submit', e => {
    e.preventDefault()

    const fecha = document.getElementById('mant-fecha').value
    const observaciones = document.getElementById('mant-observaciones').value

    fetch(`${API_BASE}/mantenimientos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filtro_id: filtroActualId,
        fecha,
        presion_actual: document.getElementById('mant-pressure-current')?.value || null,
        observaciones
      })
    })
      .then(res => res.json())
      .then(() => {
        return fetch(`${API_BASE}/filtros/${filtroActualId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            presion_actual: document.getElementById('mant-pressure-current')?.value || null
          })
        })
      })
      .then(() => {
        document.getElementById('mant-fecha').value = ''
        document.getElementById('mant-observaciones').value = ''
        verMantenimientos(filtroActualId)
        cargarFiltros()
      })
  })
}

const overlay = document.getElementById('overlay')
const btnCerrar = document.getElementById('btn-cerrar-panel')

if (overlay) {
  overlay.addEventListener('click', () => {
    document.querySelector('.col-mantenimientos').classList.remove('activo')
    overlay.classList.remove('activo')
  })
}

if (btnCerrar) {
  btnCerrar.addEventListener('click', () => {
    document.querySelector('.col-mantenimientos').classList.remove('activo')
    overlay.classList.remove('activo')
  })
}

document.querySelectorAll('.estado-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.estado-btn').forEach(b =>
      b.classList.remove('activo')
    )

    btn.classList.add('activo')
    estadoFiltroActual = btn.dataset.estado
    cargarFiltros()
  })
})

// Exponer funciones para botones inline
window.verMantenimientos = verMantenimientos
window.editarFiltro = editarFiltro
window.eliminarFiltro = eliminarFiltro
// Exponer funciones de estado para reportes PDF
window.calcularEstado = calcularEstado
window.calcularEstadoPorPresion = calcularEstadoPorPresion
})

async function generarReporteFiltros() {
  const { jsPDF } = window.jspdf
  const doc = new jsPDF('p', 'mm', 'a4')

  doc.setFontSize(18)
  doc.text('FILTERTRACK', 105, 15, { align: 'center' })

  doc.setFontSize(11)
  doc.text('Reporte de Filtros', 14, 25)
  doc.text(`Fecha: ${new Date().toLocaleDateString()}`, 14, 32)

  const res = await fetch(`${API_BASE}/filtros`)
  const filtros = await res.json()

  let y = 42

  doc.setFontSize(9)
  doc.text('ID', 14, y)
  doc.text('Nombre', 22, y)
  doc.text('Código', 55, y)
  doc.text('Instalación', 85, y)
  doc.text('Vida (d)', 112, y)
  doc.text('Presión', 132, y)
  doc.text('Estado', 160, y)

  y += 6

  filtros.forEach(f => {
    const estadoTiempo = calcularEstado(f.fecha_instalacion, f.vida_util_dias)
    const estadoPresion = calcularEstadoPorPresion(f.pressure_initial, f.presion_actual)

    let estadoFinal = estadoTiempo
    if (estadoPresion && estadoPresion.prioridad < estadoTiempo.prioridad) {
      estadoFinal = { ...estadoTiempo, ...estadoPresion }
    }

    doc.text(String(f.id), 14, y)
    doc.text(String(f.nombre), 22, y)
    doc.text(String(f.codigo_barra), 55, y)
    doc.text(String(f.fecha_instalacion), 85, y)
    doc.text(String(f.vida_util_dias), 112, y)

    const presion = f.presion_actual ?? f.pressure_initial ?? '-'
    doc.text(String(presion), 132, y)

    doc.text(estadoFinal.texto, 160, y)

    y += 6

    if (y > 280) {
      doc.addPage()
      y = 20
    }
  })

  doc.save('filtertrack_reporte_filtros.pdf')
}

async function generarReporteMantenimientos() {
  if (!window.filtroActualId) {
    alert('Selecciona un filtro para generar su reporte de mantenimientos')
    return
  }

  const filtroId = window.filtroActualId

  const { jsPDF } = window.jspdf
  const doc = new jsPDF('p', 'mm', 'a4')

  doc.setFontSize(18)
  doc.text('FILTERTRACK', 105, 15, { align: 'center' })

  doc.setFontSize(11)
  doc.text('Reporte de Mantenimientos', 14, 25)
  doc.text(`Filtro ID: ${filtroId}`, 14, 32)
  doc.text(`Fecha: ${new Date().toLocaleDateString()}`, 14, 39)

  const res = await fetch(`${API_BASE}/mantenimientos/${filtroId}`)
  const mantenimientos = await res.json()

  let y = 50

  doc.setFontSize(9)
  doc.text('ID', 14, y)
  doc.text('Fecha', 30, y)
  doc.text('Presión', 60, y)
  doc.text('Observaciones', 90, y)

  y += 6

  mantenimientos.forEach(m => {
    doc.text(String(m.id), 14, y)
    doc.text(String(m.fecha), 30, y)
    doc.text(m.presion_actual ? `${m.presion_actual} PSI` : '-', 60, y)

    const obs = m.observaciones || ''
    const obsLines = doc.splitTextToSize(obs, 100)
    doc.text(obsLines, 90, y)

    y += obsLines.length > 1 ? obsLines.length * 5 : 6

    if (y > 280) {
      doc.addPage()
      y = 20
    }
  })

  doc.save(`filtertrack_mantenimientos_filtro_${filtroId}.pdf`)
}