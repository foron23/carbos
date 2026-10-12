const FLAG_KEY = 'carbos.insulin.enabled';

export function isInsulinEnabled(): boolean {
  try {
    return localStorage.getItem(FLAG_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setInsulinEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(FLAG_KEY, enabled ? 'true' : 'false');
  } catch {
    return;
  }
}
