const { google } = require('googleapis')

// Detectar si existen credenciales (producción vs local)
const hasSheetsEnv =
  process.env.GOOGLE_CLIENT_EMAIL &&
  process.env.GOOGLE_PRIVATE_KEY &&
  process.env.GOOGLE_SHEET_ID

let sheets = null
let SPREADSHEET_ID = null

if (hasSheetsEnv) {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })

  sheets = google.sheets({ version: 'v4', auth })
  SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID
  console.log('✅ Google Sheets habilitado')
} else {
  console.log('ℹ️ Google Sheets desactivado (entorno local)')
}

async function appendFiltroRow(filtro) {
  if (!sheets) return

  const values = [[
    filtro.id,
    filtro.nombre,
    filtro.codigo_barra,
    filtro.fecha_instalacion,
    filtro.vida_util_dias,
    filtro.pressure_initial ?? '',
    filtro.presion_actual ?? '',
    filtro.estado ?? '',
    new Date().toLocaleString()
  ]]

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Filtros!A1',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values }
  })
}

async function appendMantenimientoRow(mantenimiento) {
  if (!sheets) return

  const values = [[
    mantenimiento.id,
    mantenimiento.filtro_id,
    mantenimiento.fecha,
    mantenimiento.presion_actual ?? '',
    mantenimiento.observaciones ?? '',
    new Date().toLocaleString()
  ]]

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Mantenimientos!A1',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values }
  })
}

module.exports = {
  appendFiltroRow,
  appendMantenimientoRow
}