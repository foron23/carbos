# SPEC 07 - Fine-tuning: opciones, esfuerzo y riesgo (D20)

> [!abstract] TL;DR
> El fine-tuning **no bloquea la v1**: la v1 usa un modelo publico con **mapeo de clases +
> "desconocido" -> seleccion manual** (D31). El fine-tuning solo entra si la shortlist evaluada en
> Nutrition5k (D28) queda corta o el mapeo es fragil. El camino recomendado es **cabeza nueva
> (linear probe)** cuando exista algo de set propio, y **destilacion** si faltan etiquetas. Se
> entrena en Python, se exporta a ONNX int8 y se publica fuera del repo (D24).

## Cuando se activa

- Si la shortlist (D28) queda por debajo del umbral honesto de error.
- Si el mapeo clase a clase del modelo publico genera demasiados "desconocido".
- Nunca antes de tener el benchmark funcionando: sin medir, no se sabe si hace falta.

## Las opciones, en cristiano

### 1. Cabeza nueva (linear probe)

Se congela el modelo preentrenado y se entrena **solo la ultima capa** para las clases del catalogo.

- **Datos**: cientos de fotos etiquetadas.
- **Esfuerzo**: bajo. Horas de trabajo, minutos de GPU (una sola GPU o Colab).
- **Techo**: medio. Limitado por lo que el backbone ya "sabe ver"; no arregla el salto de dominio.
- **Riesgo**: bajo. Dificil romperlo; si sale mal, se vuelve al mapeo.
- **Cuando**: primer intento, en cuanto haya un minimo de set propio.

### 2. Fine-tune completo

Se reentrena tambien el backbone con la cabeza nueva.

- **Datos**: miles de fotos etiquetadas (set propio + aumento).
- **Esfuerzo**: medio-alto. Dias de trabajo, horas de GPU; hay que cuidar tasa de aprendizaje,
  sobreajuste y reproducibilidad.
- **Techo**: alto. Es el que mejor cierra el salto de dominio.
- **Riesgo**: alto con pocos datos (sobreajuste, olvido catastrofico); mas dificil de reproducir.
- **Cuando**: solo con set propio maduro.

### 3. LoRA / PEFT

Adaptadores de bajo rango que se entrenan dejando el resto congelado.

- **Datos**: como la cabeza nueva.
- **Esfuerzo**: medio.
- **Techo**: medio-alto.
- **Riesgo**: medio. Menos estandar en CNN; encaja mejor en backbones tipo ViT.
- **Cuando**: si el backbone elegido es un transformer y se quiere algo entre 1 y 2.

### 4. Destilacion

Un modelo grande (**teacher**) etiqueta fotos sin etiquetar y se entrena al pequeno para imitarlo.

- **Datos**: fotos **sin etiquetar** del dominio espanol + un teacher (VLM o clasificador grande).
- **Esfuerzo**: medio. Hay que montar la inferencia del teacher sobre el corpus.
- **Techo**: alto para el dominio; a menudo mejor que el linear probe sin etiquetas.
- **Riesgo**: medio. **Hereda los sesgos y errores del teacher**; hay que revisar su licencia/ToS.
- **Cuando**: cuando hay fotos espanolas pero pocas etiquetas.

### 5. Adaptacion de dominio (auto-supervisada)

Ajuste sin etiquetas sobre fotos espanolas para acercar las representaciones.

- **Datos**: fotos sin etiquetar.
- **Esfuerzo**: medio.
- **Techo**: medio.
- **Riesgo**: medio. Menos directo; suele combinarse con 1 o 2.
- **Cuando**: como preludio del linear probe o del fine-tune.

## Comparativa rapida

| Opcion                | Datos                   | Esfuerzo   | Techo          | Riesgo | Rol                   |
| --------------------- | ----------------------- | ---------- | -------------- | ------ | --------------------- |
| Cabeza nueva          | Cientos                 | Bajo       | Medio          | Bajo   | **Primer intento**    |
| Fine-tune completo    | Miles                   | Medio-alto | Alto           | Alto   | Con set maduro        |
| LoRA / PEFT           | Cientos                 | Medio      | Medio-alto     | Medio  | Si el backbone es ViT |
| Destilacion           | Sin etiquetar + teacher | Medio      | Alto (dominio) | Medio  | Si faltan etiquetas   |
| Adaptacion de dominio | Sin etiquetar           | Medio      | Medio          | Medio  | Preludio              |

## Recomendacion (escalera)

1. **v1**: modelo publico + mapeo + "desconocido" (D31). Sin fine-tuning.
2. **Si el mapeo falla**: **cabeza nueva** en cuanto haya unas cientos de fotos propias.
3. **Si faltan etiquetas**: **destilacion** desde un teacher grande sobre fotos espanolas.
4. **Solo al final**: **fine-tune completo** con set propio maduro.

## Datos e infraestructura

- **Datos**: el set propio (deuda, D25) es la pieza que falta; el aumento puede apoyarse en
  Nutrition5k (mapeando ingredientes a clases) y en pseudo-etiquetas de destilacion.
- **Entrenamiento**: Python + PyTorch en `training/` (fuera del build). GPU local o Colab.
- **Publicacion**: exportar a **ONNX**, cuantizar **int8**, subir a jsDelivr/Releases con **sha256**
  (D24). El contrato del `model-manifest.json` (E3) no cambia: solo URL, version y clases.
- **Regla intacta**: el modelo sigue **sin** producir unidades ni gramos; solo clase y confianza.

## Decision abierta (I-Q3)

Elegir el camino por defecto a documentar. La recomendacion es **cabeza nueva** como primer paso,
con **destilacion** como acelerador si no hay etiquetas. Pendiente de confirmar.
