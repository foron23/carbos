# SPEC 10 - Feedback de usuarios para construir dataset (DIFERIDO)

> [!abstract] TL;DR
> Mecanismo **opt-in** para que las correcciones de los usuarios generen un dataset propio,
> alineado al catalogo, sin pedirles etiquetar a mano. **Diferido**: se especifica ahora, se
> implementa mas adelante. Destino de subida **por definir**.

## Por que

El cuello de botella del reconocimiento es la **cobertura** (~28 %): ningun clasificador publico
habla el idioma del catalogo. El fine-tuning al catalogo necesita imagenes por clase, que hoy no
existen (set propio, D25). El uso real es la fuente natural de esas imagenes.

## Idea

Cuando el usuario **confirma o corrige** una clasificacion de la foto, ofrecer (opt-in, foto a
foto) contribuir esa imagen con su **etiqueta confirmada**. Se acumula un dataset real:
`clase_del_catalogo -> imagenes`.

## Diseno propuesto

- **Consentimiento explicito por foto**: nada se sube sin un "compartir esta foto" claro. Nunca
  automatico.
- **Cola en el dispositivo** (IndexedDB) con estado; el usuario ve que se subira y puede borrarlo.
- **Sin cuentas ni identificadores**: se sube solo la **imagen** (recortada) + el **id de clase**
  confirmado. Se **elimina EXIF** antes de subir. Nada de metadatos del usuario.
- **Destino de subida (por definir)**:
  - **A. Endpoint colector minimo** (un servicio pequeno que recibe y guarda). Implica backend,
    aunque sea minimo.
  - **B. Bundle manual**: la app exporta un `.zip` de contribuciones y el usuario lo sube a un
    lugar (formulario, HF Dataset). Cero backend; menos comodo.
  - **C. HF Dataset** con token de mantenedor (no apto para usuarios finales).
- **Generacion del dataset**: agregar, revisar y deduplicar las contribuciones en
  `dataset/<clase>/` para el pipeline de `training/` (fine-tuning al catalogo).

## Privacidad y riesgos

- **Privacidad**: sin cuentas, sin EXIF, opt-in por foto; el usuario puede no contribuir nunca.
- **Abuso**: moderacion minima del lado del colector (tamano, tipo, dedupe).
- **Coste**: almacenamiento y ancho de banda del colector; acotado por el opt-in.
- **Texto**: la UI lo presenta como "ayudar a mejorar el reconocimiento", nunca como subida
  obligatoria ni como analitica (D11: sin analitica).

## Estado

**Diferido.** No se implementa en Fase 1. Se implementa despues del fine-tuning/destilacion
inicial, cuando el valor de un dataset propio este claro.
