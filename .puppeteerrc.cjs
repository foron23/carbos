/**
 * No descargar Chrome en `npm install` (no lo usamos).
 * En local la prueba E2E usa el Firefox del sistema; en CI se instala a proposito
 * el que Puppeteer espera: `npx puppeteer browsers install firefox`.
 */
module.exports = { skipDownload: true };
