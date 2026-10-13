const ENABLED_KEY = 'carbos.chat.enabled';
const DISABLED_KEY = 'carbos.chat.disabled';

/** El chat es opt-in: activo solo si el usuario lo habilito y no consta deshabilitado. */
export function isChatEnabled(): boolean {
  try {
    return (
      localStorage.getItem(ENABLED_KEY) === 'true' && localStorage.getItem(DISABLED_KEY) !== 'true'
    );
  } catch {
    return false;
  }
}

export function setChatEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(ENABLED_KEY, enabled ? 'true' : 'false');
  } catch {
    return;
  }
}

/** `true` si un fallo de runtime dejo el chat deshabilitado (se oculta en silencio). */
export function isChatDisabled(): boolean {
  try {
    return localStorage.getItem(DISABLED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setChatDisabled(disabled: boolean): void {
  try {
    localStorage.setItem(DISABLED_KEY, disabled ? 'true' : 'false');
  } catch {
    return;
  }
}
