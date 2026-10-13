const FLAG_KEY = 'carbos.barcode.enabled';
const ONLINE_KEY = 'carbos.barcode.online';

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
