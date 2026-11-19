# Prompt para pegar en el chat nuevo (junto con los archivos adjuntos)

Soy Daniel, estudiante de Ingeniería de Sistemas (Universidad CESMAG). Mi tesis es un sistema de gestión de inventarios para panaderías (SCM con clasificación ABC y modelo EOQ), con una panadería piloto en Pasto. Te adjunto el cuaderno de Google Colab del Sprint 8 y los archivos que lo respaldan. Todavía no entiendo a fondo el modelo de validación y tengo que explicarlo a mi director.

Quiero que me lo expliques paso a paso, como a alguien que sabe programar pero no sabe estadística de pronósticos. Sigue este orden y espera mi "continúa" al terminar cada parte:

1. Para qué sirve todo el cuaderno y qué pregunta de la tesis responde.
2. Los datos: qué son los 4 escenarios simulados y por qué los datos simulados no sirven como evidencia.
3. Las líneas base (consumo declarado y promedio de 12 semanas) y por qué se comparan contra ellas.
4. Los métodos de pronóstico (promedio móvil, suavizado exponencial, Holt amortiguado, AR(2)): idea, fórmula y cuándo ganan o pierden.
5. La validación de origen móvil (rolling-origin): qué es, por qué evita usar el futuro, y un ejemplo numérico pequeño.
6. Las métricas WAPE, MAE, RMSE y sesgo: fórmula, ejemplo con números y cómo leerlas.
7. El stock de seguridad (z·σ del error) frente a 2 días fijos, y cómo se interpretan 93–94 % de servicio.
8. Las pruebas y los mutantes (test_pronostico.py): qué comprueban.
9. La validación independiente de ABC y EOQ (validar_abc_eoq.py contra el sistema en TypeScript): qué se compara y qué significa que concuerden.
10. Cómo explicar todo en 2 minutos al director, y qué NO se puede afirmar todavía.

Reglas: no inventes datos ni resultados; si algo no está en los archivos, dilo. Cita el nombre de la celda o la función del código cuando expliques. Termina cada parte con 2 preguntas de comprobación para que yo responda.
