const FLAG_KEY = 'carbos.barcode.enabled';
const ONLINE_KEY = 'carbos.barcode.online';
const AUTOPACK_KEY = 'carbos.barcode.autopack';

/** El modulo de codigo de barras es opt-in: por defecto apagado. */
export function isBarcodeEnabled(): boolean {
  try {
    return localStorage.getItem(FLAG_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setBarcodeEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(FLAG_KEY, enabled ? 'true' : 'false');
  } catch {
    return;
  }
}

/**
 * Resolucion en linea (Fase B): opt-in y por defecto apagada. Con el flag
 * apagado, el escaneo no hace ninguna peticion de red.
 */
export function isBarcodeOnlineEnabled(): boolean {
  try {
    return localStorage.getItem(ONLINE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setBarcodeOnlineEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(ONLINE_KEY, enabled ? 'true' : 'false');
  } catch {
    return;
  }
}

/**
 * Descarga automatica del pack al arrancar: opt-out, por defecto **activada**.
 * Solo se desactiva si el valor guardado es exactamente `"false"`; cualquier
 * otro valor (o si `localStorage` no esta disponible) mantiene el defecto: asi
 * el escaneo funciona sin conexion desde el primer uso.
 */
export function isBarcodeAutoDownloadEnabled(): boolean {
  try {
    return localStorage.getItem(AUTOPACK_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function setBarcodeAutoDownloadEnabled(value: boolean): void {
  try {
    localStorage.setItem(AUTOPACK_KEY, value ? 'true' : 'false');
  } catch {
    return;
  }
}
