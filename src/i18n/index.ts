export const STRINGS = {
  es: {
    'app.title': 'Carbos · carbohidratos en tu dispositivo',
    'app.tagline': 'Cuenta carbohidratos. En tu dispositivo, y solo en tu dispositivo.',
    'nav.language': 'Idioma',
    'field.date': 'Fecha',
    'label.total': 'Total',
    'section.today': 'Hoy',
    'section.diary': 'Registro',
    'section.photo': 'Foto',
    'section.addFood': 'Añadir comida',
    'section.copy': 'Copia',
    'section.settings': 'Ajustes',
    'field.food': 'Alimento',
    'field.grams': 'Gramos',
    'field.portion': 'Porción',
    'field.carbsPer100g': 'Carbohidratos por 100 g',
    'field.search': 'Buscar en el catálogo',
    'button.search': 'Buscar',
    'button.register': 'Registrar',
    'button.addItem': 'Añadir',
    'button.remove': 'Quitar',
    'button.half': 'Mitad',
    'button.double': 'Doble',
    'button.change': 'Cambiar',
    'portion.small': 'Pequeño',
    'portion.medium': 'Mediano',
    'portion.large': 'Grande',
    'button.clear': 'Vaciar',
    'button.exportJson': 'Exportar JSON',
    'button.exportEncrypted': 'Exportar cifrado',
    'button.import': 'Importar',
    'button.takePhoto': 'Hacer foto',
    'button.chooseFile': 'Elegir fichero',
    'button.persist': 'Pedir almacenamiento persistente',
    'button.calc': 'Calcular',
    'text.estimateNote': 'Estimación. Revisa y ajusta los gramos.',
    'text.photoNote': 'La imagen no sale del dispositivo. Se procesa en local.',
    'photo.none': 'Sin foto. Puedes añadir alimentos a mano.',
    'photo.ready': 'Foto lista para revisar.',
    'model.manifest': 'Cargando el modelo...',
    'model.downloading': 'Descargando el modelo...',
    'model.verifying': 'Verificando el modelo...',
    'model.session': 'Preparando el modelo...',
    'photo.detecting': 'Buscando alimentos...',
    'photo.classifying': 'Reconociendo alimentos...',
    'photo.noModel': 'Reconocimiento no disponible. Puedes añadir alimentos a mano.',
    'photo.noItems': 'No se han detectado alimentos. Añádelos a mano.',
    'photo.detected': 'Alimentos detectados',
    'photo.resultsNote': 'Estimación del modelo. Revisa y ajusta los gramos.',
    'detect.engine': 'Motor',
    'detect.alternatives': 'Alternativas',
    'diary.empty': 'Sin registros para este día.',
    'diary.week': 'Semana',
    'diary.day': 'Día',
    'diary.meal': 'Comida',
    'diary.originManual': 'Manual',
    'diary.originPhoto': 'Foto',
    'search.noResults': 'Sin resultados.',
    'draft.empty': 'Ningún alimento en la comida.',
    'draft.items': 'Alimentos de la comida',
    'confidence.label': 'Confianza',
    'unknown.food': 'Desconocido',
    'unknown.note': 'Clase no reconocida. Elige del catálogo.',
    'section.insulinLog': 'Registro de insulina',
    'insulin.note': 'Solo registro de lo ya puesto. Aquí no se calcula nada.',
    'field.units': 'Unidades',
    'field.time': 'Hora',
    'field.kind': 'Tipo',
    'kind.bolus': 'Bolo',
    'kind.basal': 'Basal',
    'button.addInsulin': 'Añadir registro',
    'storage.notice': 'El navegador puede borrar los datos sin avisar. Exporta a menudo.',
    'storage.granted': 'Almacenamiento persistente concedido.',
    'storage.denied': 'El navegador no ha concedido almacenamiento persistente.',
    'export.passwordPrompt': 'Contraseña para el export cifrado',
    'export.passwordHint':
      'Se usa Argon2id para derivar la clave. Guárdala: sin ella no hay acceso.',
    'export.done': 'Export creado.',
    'export.imported': 'Import completado.',
    'export.importFailed': 'No se pudo importar el fichero.',
    'export.summary': 'Resumen',
    'settings.insulinModule': 'Activar módulo de aritmética de insulina (opt-in)',
    'ui.insulinTitle': 'Aritmética (tus números)',
    'ui.insulinDisclaimer':
      'Es la aritmética que has pedido, con tus números. No es consejo médico ni un dispositivo médico. Revisa y ajusta con tu equipo médico.',
    'ui.insulinRatio': 'Ratio (g por U)',
    'ui.insulinCF': 'Factor de corrección (mg/dL por U)',
    'ui.insulinTarget': 'Objetivo (mg/dL)',
    'ui.insulinCurrent': 'Glucosa actual (mg/dL)',
    'ui.insulinCarbs': 'Carbohidratos (g)',
    'ui.insulinIncomplete': 'Datos incompletos',
    'ui.insulinMeal': 'Comida',
    'ui.insulinCorrection': 'Corrección',
    'unit.grams': 'g',
    'unit.units': 'U',
    'onboarding.title': 'Antes de empezar',
    'onboarding.privacyTitle': 'Tus datos no salen de aquí',
    'onboarding.privacyBody':
      'Todo lo que registras (comidas, fotos, números) se queda en este dispositivo. No hay cuentas, no hay servidores, ni analítica. Puedes exportar una copia cuando quieras.',
    'onboarding.storageTitle': 'El navegador puede borrar tus datos',
    'onboarding.storageBody':
      'Este diario vive en tu navegador. Si no lo usas durante días, el navegador puede borrar lo guardado. Añádelo a la pantalla de inicio y exporta copias de vez en cuando.',
    'onboarding.scopeTitle': 'Qué es y qué no es',
    'onboarding.scopeBody':
      'Cuenta carbohidratos y registra lo que haces. No es un dispositivo médico y no te dice cuánta insulina ponerte. Tus números y tus decisiones son tuyos; tu equipo médico es quien te guía.',
    'onboarding.start': 'Empezar',
    'footer.disclaimer':
      'Carbos no es un dispositivo médico ni ofrece consejo médico. Uso bajo tu responsabilidad; consulta con tu equipo médico.',
    'nav.today': 'Hoy',
    'nav.prevDay': 'Día anterior',
    'nav.nextDay': 'Día siguiente',
    'register.done': 'Comida registrada.',
    'register.empty': 'Añade algún alimento antes de registrar.',
    'export.reminder':
      'Hace tiempo que no exportas. El navegador puede borrar los datos sin avisar.',
    'insulin.gateTitle': 'Activar la aritmética de insulina',
    'insulin.gateBody':
      'Vas a activar una calculadora aritmética. No es un dispositivo médico ni consejo médico, y no sustituye a tu equipo médico. La hipoglucemia puede ser peligrosa. Úsala solo con los números que te haya dado tu equipo y bajo tu responsabilidad.',
    'insulin.gateAccept': 'Entiendo y la activo',
    'insulin.gateCancel': 'Cancelar',
    'section.chat': 'Chat del diario',
    'chat.title': 'Chat (en tu dispositivo)',
    'chat.inputPlaceholder': 'Escribe lo que quieres registrar',
    'chat.send': 'Enviar',
    'chat.thinking': 'Interpretando...',
    'chat.unknown': 'No lo he entendido. Prueba con otra frase.',
    'chat.emptyQuery': 'Escribe algo antes de enviar.',
    'chat.noMatch': 'No he encontrado ese alimento en el catálogo.',
    'chat.mealTitle': 'Vas a registrar esta comida',
    'chat.insulinTitle': 'Vas a registrar esta insulina',
    'chat.dateTitle': 'Vas a cambiar de fecha',
    'chat.totalsTitle': 'Carbohidratos de ese día',
    'chat.insulinNote': 'Solo registro de lo ya puesto. El chat no calcula nada.',
    'chat.disclaimer':
      'El chat interpreta lo que escribes y propone; no es consejo médico ni un dispositivo médico. Revisa y ajusta con tu equipo médico.',
    'chat.cancel': 'Cancelar',
    'settings.chatModule': 'Activar el chat experimental (opt-in)',
    'settings.contribAuto':
      'Compartir automáticamente las fotos que confirme (ayuda a mejorar el reconocimiento)',
    'contrib.share': 'Compartir esta foto',
    'contrib.queued': 'Se compartirá cuando haya conexión.',
    'contrib.queueLabel': 'Fotos en cola',
    'contrib.clear': 'Borrar la cola',
    'contrib.cleared': 'Cola borrada.',
    'contrib.note':
      'Solo se comparte el recorte y el tipo de alimento. Sin cuentas ni identificadores. Puedes borrarlo cuando quieras.',
    'contrib.none': 'No has compartido ninguna foto.',
    'contrib.shareFailed': 'No se pudo compartir. Se intentará de nuevo.',
  },
  en: {
    'app.title': 'Carbos · carbs on your device',
    'app.tagline': 'Count carbs. On your device, and only on your device.',
    'nav.language': 'Language',
    'field.date': 'Date',
    'label.total': 'Total',
    'section.today': 'Today',
    'section.diary': 'Log',
    'section.photo': 'Photo',
    'section.addFood': 'Add food',
    'section.copy': 'Backup',
    'section.settings': 'Settings',
    'field.food': 'Food',
    'field.grams': 'Grams',
    'field.portion': 'Portion',
    'field.carbsPer100g': 'Carbs per 100 g',
    'field.search': 'Search the catalog',
    'button.search': 'Search',
    'button.register': 'Log it',
    'button.addItem': 'Add',
    'button.remove': 'Remove',
    'button.half': 'Half',
    'button.double': 'Double',
    'button.change': 'Change',
    'portion.small': 'Small',
    'portion.medium': 'Medium',
    'portion.large': 'Large',
    'button.clear': 'Clear',
    'button.exportJson': 'Export JSON',
    'button.exportEncrypted': 'Export encrypted',
    'button.import': 'Import',
    'button.takePhoto': 'Take photo',
    'button.chooseFile': 'Choose file',
    'button.persist': 'Request persistent storage',
    'button.calc': 'Compute',
    'text.estimateNote': 'Estimate. Review and adjust the grams.',
    'text.photoNote': 'The image never leaves the device. It is processed locally.',
    'photo.none': 'No photo. You can add foods by hand.',
    'photo.ready': 'Photo ready to review.',
    'model.manifest': 'Loading the model...',
    'model.downloading': 'Downloading the model...',
    'model.verifying': 'Verifying the model...',
    'model.session': 'Preparing the model...',
    'photo.detecting': 'Looking for food...',
    'photo.classifying': 'Recognizing food...',
    'photo.noModel': 'Recognition is not available. You can add foods by hand.',
    'photo.noItems': 'No food detected. Add it by hand.',
    'photo.detected': 'Detected foods',
    'photo.resultsNote': 'Model estimate. Review and adjust the grams.',
    'detect.engine': 'Engine',
    'detect.alternatives': 'Alternatives',
    'diary.empty': 'No records for this day.',
    'diary.week': 'Week',
    'diary.day': 'Day',
    'diary.meal': 'Meal',
    'diary.originManual': 'Manual',
    'diary.originPhoto': 'Photo',
    'search.noResults': 'No results.',
    'draft.empty': 'No food in this meal.',
    'draft.items': 'Foods in this meal',
    'confidence.label': 'Confidence',
    'unknown.food': 'Unknown',
    'unknown.note': 'Class not recognized. Pick from the catalog.',
    'section.insulinLog': 'Insulin log',
    'insulin.note': 'Only a record of what was already taken. Nothing is computed here.',
    'field.units': 'Units',
    'field.time': 'Time',
    'field.kind': 'Type',
    'kind.bolus': 'Bolus',
    'kind.basal': 'Basal',
    'button.addInsulin': 'Add record',
    'storage.notice': 'The browser may delete the data without warning. Export often.',
    'storage.granted': 'Persistent storage granted.',
    'storage.denied': 'The browser did not grant persistent storage.',
    'export.passwordPrompt': 'Password for the encrypted export',
    'export.passwordHint': 'Argon2id derives the key. Keep it: without it there is no access.',
    'export.done': 'Export created.',
    'export.imported': 'Import done.',
    'export.importFailed': 'Could not import the file.',
    'export.summary': 'Summary',
    'settings.insulinModule': 'Enable the insulin arithmetic module (opt-in)',
    'ui.insulinTitle': 'Arithmetic (your numbers)',
    'ui.insulinDisclaimer':
      'It is the arithmetic you asked for, with your numbers. It is not medical advice or a medical device. Review and adjust with your care team.',
    'ui.insulinRatio': 'Ratio (g per U)',
    'ui.insulinCF': 'Correction factor (mg/dL per U)',
    'ui.insulinTarget': 'Target (mg/dL)',
    'ui.insulinCurrent': 'Current glucose (mg/dL)',
    'ui.insulinCarbs': 'Carbs (g)',
    'ui.insulinIncomplete': 'Incomplete data',
    'ui.insulinMeal': 'Meal',
    'ui.insulinCorrection': 'Correction',
    'unit.grams': 'g',
    'unit.units': 'U',
    'onboarding.title': 'Before you start',
    'onboarding.privacyTitle': 'Your data never leaves this device',
    'onboarding.privacyBody':
      'Everything you log (meals, photos, numbers) stays on this device. No accounts, no servers, no analytics. You can export a copy whenever you want.',
    'onboarding.storageTitle': 'The browser may delete your data',
    'onboarding.storageBody':
      'This diary lives in your browser. If you do not use it for days, the browser may delete what is stored. Add it to your home screen and export copies from time to time.',
    'onboarding.scopeTitle': 'What it is and what it is not',
    'onboarding.scopeBody':
      'It counts carbohydrates and records what you do. It is not a medical device and it does not tell you how much insulin to take. Your numbers and your decisions are yours; your care team is who guides you.',
    'onboarding.start': 'Start',
    'footer.disclaimer':
      'Carbos is not a medical device and does not give medical advice. Use at your own responsibility; consult your care team.',
    'nav.today': 'Today',
    'nav.prevDay': 'Previous day',
    'nav.nextDay': 'Next day',
    'register.done': 'Meal logged.',
    'register.empty': 'Add some food before logging.',
    'export.reminder':
      'You have not exported in a while. The browser may delete the data without warning.',
    'insulin.gateTitle': 'Enable insulin arithmetic',
    'insulin.gateBody':
      'You are about to enable an arithmetic calculator. It is not a medical device or medical advice, and it does not replace your care team. Hypoglycaemia can be dangerous. Use it only with the numbers your care team gave you, and at your own responsibility.',
    'insulin.gateAccept': 'I understand, enable it',
    'insulin.gateCancel': 'Cancel',
    'section.chat': 'Diary chat',
    'chat.title': 'Chat (on your device)',
    'chat.inputPlaceholder': 'Type what you want to log',
    'chat.send': 'Send',
    'chat.thinking': 'Interpreting...',
    'chat.unknown': "I didn't understand that. Try another phrase.",
    'chat.emptyQuery': 'Type something before sending.',
    'chat.noMatch': 'I could not find that food in the catalog.',
    'chat.mealTitle': 'You are about to log this meal',
    'chat.insulinTitle': 'You are about to log this insulin',
    'chat.dateTitle': 'You are about to change the date',
    'chat.totalsTitle': 'Carbs for that day',
    'chat.insulinNote': 'Only a record of what was already taken. The chat computes nothing.',
    'chat.disclaimer':
      'The chat interprets what you type and proposes; it is not medical advice or a medical device. Review and adjust with your care team.',
    'chat.cancel': 'Cancel',
    'settings.chatModule': 'Enable the experimental chat (opt-in)',
    'settings.contribAuto': 'Automatically share the photos I confirm (helps improve recognition)',
    'contrib.share': 'Share this photo',
    'contrib.queued': 'It will be shared when there is a connection.',
    'contrib.queueLabel': 'Photos queued',
    'contrib.clear': 'Clear the queue',
    'contrib.cleared': 'Queue cleared.',
    'contrib.note':
      'Only the crop and the food type are shared. No accounts or identifiers. You can delete it whenever you want.',
    'contrib.none': 'You have not shared any photo.',
    'contrib.shareFailed': 'Could not share. It will be retried.',
  },
} as const;

export type Locale = keyof typeof STRINGS;
export type StringKey = keyof (typeof STRINGS)['es'];

export const LOCALES: readonly Locale[] = ['es', 'en'];

const LOCALE_KEY = 'carbos.locale';

export function t(locale: Locale, key: StringKey): string {
  return STRINGS[locale][key];
}

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

export function isStringKey(value: string): value is StringKey {
  return Object.prototype.hasOwnProperty.call(STRINGS.es, value);
}

export function detectLocale(fallback: Locale = 'es'): Locale {
  const stored = safeGet(LOCALE_KEY);
  if (stored && isLocale(stored)) return stored;
  const candidates =
    typeof navigator !== 'undefined' ? (navigator.languages ?? [navigator.language]) : [];
  for (const candidate of candidates) {
    const tag = candidate.slice(0, 2).toLowerCase();
    if (isLocale(tag)) return tag;
  }
  return fallback;
}

export function storeLocale(locale: Locale): void {
  safeSet(LOCALE_KEY, locale);
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* almacenamiento no disponible */
  }
}
