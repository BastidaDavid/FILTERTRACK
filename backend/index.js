require('dotenv').config()
const express = require('express')
const cors = require('cors')
const db = require('./database')
const { appendFiltroRow, appendMantenimientoRow } = require('./googleSheets')

const app = express()
app.use(cors())
app.use(express.json())

 // Asegurar tabla de mantenimientos
db.run(`
  CREATE TABLE IF NOT EXISTS mantenimientos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filtro_id INTEGER,
    fecha TEXT,
    presion_actual REAL,
    observaciones TEXT
  )
`, (err) => {
  if (err) {
    console.error('Error creando tabla mantenimientos:', err.message)
  } else {
    console.log('Tabla mantenimientos lista')
  }
})

// Asegurar tabla de filtros
db.run(`
  CREATE TABLE IF NOT EXISTS filtros (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT,
    codigo_barra TEXT,
    fecha_instalacion TEXT,
    vida_util_dias INTEGER,
    pressure_initial REAL,
    presion_actual REAL
  )
`, (err) => {
  if (err) {
    console.error('Error creando tabla filtros:', err.message)
  } else {
    console.log('Tabla filtros lista')
  }
})

app.get('/', (req, res) => {
  res.send('Sistema de Filtros funcionandooooo 🚀')
})

// Crear filtro
app.post('/filtros', (req, res) => {
  const { nombre, codigo_barra, fecha_instalacion, vida_util_dias, pressure_initial } = req.body

  if (!nombre || !codigo_barra) {
    return res.status(400).json({ error: 'nombre y codigo_barra son obligatorios' })
  }

  const sql = `
    INSERT INTO filtros (nombre, codigo_barra, fecha_instalacion, vida_util_dias, pressure_initial, presion_actual)
    VALUES (?, ?, ?, ?, ?, ?)
  `

  db.run(sql, [nombre, codigo_barra, fecha_instalacion, vida_util_dias, pressure_initial || null, null], function (err) {
    if (err) {
      return res.status(500).json({ error: err.message })
    }
    const nuevoFiltro = {
      id: this.lastID,
      nombre,
      codigo_barra,
      fecha_instalacion,
      vida_util_dias,
      pressure_initial,
      presion_actual: null,
      estado: 'Activo'
    }

    ;(async () => {
      try {
        console.log('🧪 Enviando filtro a Google Sheets:', nuevoFiltro)
        await appendFiltroRow(nuevoFiltro)
        console.log('✅ Filtro sincronizado en Google Sheets')
      } catch (err) {
        console.warn('⚠️ Error sincronizando filtro en Sheets:', err.message)
      }
    })()

    res.json({ message: 'Filtro agregado', id: this.lastID })
  })
})

// Listar filtros
app.get('/filtros', (req, res) => {
  db.all('SELECT * FROM filtros', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message })
    }
    res.json(rows)
  })
})

// Eliminar filtro por ID
app.delete('/filtros/:id', (req, res) => {
  const { id } = req.params
  console.log('DELETE solicitado para filtro ID:', id)

  db.run('DELETE FROM filtros WHERE id = ?', [id], function (err) {
    if (err) {
      console.error('Error al eliminar filtro:', err.message)
      return res.status(500).json({ error: err.message })
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: 'Filtro no encontrado' })
    }

    res.json({ message: 'Filtro eliminado correctamente' })
  })
})

// Actualizar filtro por ID
app.put('/filtros/:id', (req, res) => {
  const { id } = req.params
  const { nombre, codigo_barra, fecha_instalacion, vida_util_dias } = req.body

  const sql = `
    UPDATE filtros
    SET nombre = ?, codigo_barra = ?, fecha_instalacion = ?, vida_util_dias = ?
    WHERE id = ?
  `

  db.run(
    sql,
    [nombre, codigo_barra, fecha_instalacion, vida_util_dias, id],
    function (err) {
      if (err) {
        return res.status(500).json({ error: err.message })
      }

      if (this.changes === 0) {
        return res.status(404).json({ error: 'Filtro no encontrado' })
      }

      res.json({ message: 'Filtro actualizado correctamente' })
    }
  )
})

app.patch('/filtros/:id', (req, res) => {
  const { id } = req.params
  const { presion_actual } = req.body

  db.run(
    'UPDATE filtros SET presion_actual = ? WHERE id = ?',
    [presion_actual, id],
    function (err) {
      if (err) {
        return res.status(500).json({ error: err.message })
      }
      res.json({ message: 'Presión actualizada correctamente' })
    }
  )
})

// ===============================
// MANTENIMIENTOS
// ===============================

// Registrar mantenimiento
app.post('/mantenimientos', (req, res) => {
  const { filtro_id, fecha, presion_actual, observaciones } = req.body

  if (!filtro_id || !fecha) {
    return res.status(400).json({ error: 'filtro_id y fecha son obligatorios' })
  }

  const sql = `
    INSERT INTO mantenimientos (filtro_id, fecha, presion_actual, observaciones)
    VALUES (?, ?, ?, ?)
  `

  db.run(sql, [filtro_id, fecha, presion_actual || null, observaciones], function (err) {
    if (err) {
      console.error('Error al registrar mantenimiento:', err.message)
      return res.status(500).json({ error: err.message })
    }

    db.run(
      'UPDATE filtros SET presion_actual = ? WHERE id = ?',
      [presion_actual || null, filtro_id]
    )

    const nuevoMantenimiento = {
      id: this.lastID,
      filtro_id,
      fecha,
      presion_actual,
      observaciones
    }

    ;(async () => {
      try {
        console.log('🧪 Enviando mantenimiento a Google Sheets:', nuevoMantenimiento)
        await appendMantenimientoRow(nuevoMantenimiento)
        console.log('✅ Mantenimiento sincronizado en Google Sheets')
      } catch (err) {
        console.warn('⚠️ Error sincronizando mantenimiento en Sheets:', err.message)
      }
    })()

    res.json({
      message: 'Mantenimiento registrado',
      id: this.lastID
    })
  })
})

// Obtener mantenimientos por filtro
app.get('/mantenimientos/:filtro_id', (req, res) => {
  const { filtro_id } = req.params

  const sql = `
    SELECT *
    FROM mantenimientos
    WHERE filtro_id = ?
    ORDER BY fecha DESC
  `

  db.all(sql, [filtro_id], (err, rows) => {
    if (err) {
      console.error('Error al obtener mantenimientos:', err.message)
      return res.status(500).json({ error: err.message })
    }

    res.json(rows)
  })
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => {
  console.log(`Servidor activo en http://localhost:${PORT}`)
})