const { google } = require('googleapis')
const path = require('path')

const auth = new google.auth.GoogleAuth({
  keyFile: path.join(__dirname, 'credentials.json'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
})

const sheets = google.sheets({ version: 'v4', auth })

// ⚠️ El ID de la hoja se configura vía variable de entorno
const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID
if (!SPREADSHEET_ID) {
  throw new Error('GOOGLE_SHEET_ID no está definido en las variables de entorno')
}

async function appendFiltroRow(filtro) {
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
    range: 'A1',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values }
  })
}

async function appendMantenimientoRow(mantenimiento) {
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

module.exports = { appendFiltroRow, appendMantenimientoRow }