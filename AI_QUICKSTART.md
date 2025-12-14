# FlowSight AI - Inicio Rápido con IA

## 🚀 Setup en 5 Minutos

### Opción 1: Usar Modelos Locales (Recomendado - Gratis y Privado)

```bash
# 1. Instala Ollama
# Visita: https://ollama.ai/download
# Descarga e instala para tu sistema operativo

# 2. Inicia Ollama
ollama serve

# 3. Descarga el modelo Phi-3
ollama pull phi3:3.8b

# ¡Listo! La IA local ya está funcionando
```

### Opción 2: Usar OpenRouter (Cloud - Pago)

```bash
# 1. Visita https://openrouter.ai/keys
# 2. Crea una cuenta gratuita
# 3. Click en "Create Key"
# 4. Copia tu API key (empieza con sk-or-v1-...)

# 2. Agrega a tu Configuración
cd apps/dashboard
echo "OPENROUTER_API_KEY=sk-or-v1-tu-key-aqui" >> .env.local
echo "DEFAULT_AI_MODEL=openai/gpt-4-turbo-preview" >> .env.local
```

### 3. Instala Dependencia

```bash
pnpm install
```

### 4. Reinicia el Dashboard

```bash
pnpm dev
```

¡Listo! La IA ya está activa. 🎉

---

## 🧪 Probar la IA

### Opción 1: Automático (Reglas Engine)

La IA se ejecutará automáticamente cada ~10 eventos que recibas del agent, usando modelos locales por defecto:

```bash
# 1. Asegúrate de que Ollama esté corriendo
ollama serve

# 2. Inicia el agent
cd apps/agent
pnpm dev

# 3. Simula varios eventos
# En el agent, click en "💻 Coding" varias veces

# 4. Mira los logs del dashboard
# Verás: "AI Blocker Analysis Result: {...}" (usando Phi-3 local)
```

### Opción 2: Manual (API)

```bash
# Analiza la actividad de un developer
curl -X POST http://localhost:3000/api/ai/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "devId": "tu@email.com",
    "analysisType": "blocker",
    "timeRange": {
      "start": "2025-10-24T08:00:00Z",
      "end": "2025-10-24T16:00:00Z"
    }
  }'
```

**Respuesta Ejemplo:**
```json
{
  "success": true,
  "analysis": {
    "isBlocked": true,
    "confidence": 87,
    "reason": "El desarrollador ha estado buscando el mismo error en StackOverflow por 45 minutos sin progreso en el código",
    "category": "technical",
    "suggestions": [
      "Revisar los logs del servidor para obtener más contexto sobre el error",
      "Hacer pair programming con un senior developer",
      "Verificar si hay problemas conocidos en la documentación del framework"
    ],
    "estimatedImpact": "high"
  },
  "metadata": {
    "eventsAnalyzed": 45,
    "timeRange": {
      "start": "2025-10-24T08:00:00Z",
      "end": "2025-10-24T16:00:00Z"
    }
  }
}
```

### Opción 3: Verificar Estado

```bash
curl http://localhost:3000/api/ai/analyze/status
```

**Respuesta:**
```json
{
  "available": true,
  "providers": {
    "openrouter": true,
    "openai": false
  },
  "models": {
    "default": "openai/gpt-4-turbo-preview"
  }
}
```

---

## 💡 Casos de Uso

### 1. Detectar Desarrolladores Bloqueados

**Problema:** No sabes cuándo un developer está atorado hasta que te lo dice (a veces días después)

**Solución:** La IA analiza patrones y te alerta proactivamente

```typescript
// Automático via Rules Engine
// Si confidence > 70%, el ticket se marca como "blocked"
// El PM recibe notificación en tiempo real
```

### 2. Análisis de Productividad

**Problema:** Quieres entender si el equipo tiene suficiente tiempo de "deep work"

**Solución:** La IA identifica períodos de concentración y distracciones

```bash
curl -X POST http://localhost:3000/api/ai/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "devId": "dev@company.com",
    "analysisType": "productivity"
  }'
```

**Resultado:**
```json
{
  "focusScore": 78,
  "deepWorkPeriods": [
    {"start": "09:00", "end": "10:45", "duration": 105}
  ],
  "insights": [
    "Developer tuvo 2 períodos de deep work > 1 hora",
    "Productividad máxima entre 9-11am",
    "Sugerencia: Bloquear calendario en estas horas"
  ]
}
```

### 3. Estimación Inteligente de Tickets

**Problema:** No sabes cuánto falta realmente para completar un ticket

**Solución:** La IA analiza el progreso y estima tiempo restante

```bash
curl -X POST http://localhost:3000/api/ai/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "ticketId": "FE-123",
    "analysisType": "ticket"
  }'
```

**Resultado:**
```json
{
  "estimatedCompletion": 65,
  "velocity": "normal",
  "timeEstimate": {
    "remaining": 4,
    "confidence": 75
  },
  "risks": [
    "Baja actividad de commits en los últimos 2 días"
  ],
  "nextActions": [
    "Hacer commit del trabajo actual",
    "Actualizar tests"
  ]
}
```

---

## 💰 Costos

### Opción 1: Modelos Locales - ¡GRATIS! 🎉

**Phi-3 3.8B via Ollama:**
- **Costo mensual:** $0 USD
- **Hardware:** Tu propia máquina
- **Privacidad:** 100% local
- **Velocidad:** Sub-200ms (después de carga inicial)

**Ventajas:**
- ✅ Completamente gratis
- ✅ Máxima privacidad
- ✅ Sin límites de uso
- ✅ Funciona offline
- ✅ Control total

### Opción 2: Modelos Cloud (Pago)

#### Modelo Recomendado: Claude 3 Sonnet

**50 developers, 22 días/mes:**
- **Costo mensual:** ~$85 USD
- **Por developer:** $1.70/mes
- **Por día:** $3.86

**¿Por qué Claude 3 Sonnet?**
- ✅ Excelente calidad de análisis
- ✅ Precio razonable
- ✅ Respuestas rápidas
- ✅ Buen balance costo/beneficio

#### Alternativa Económica: Claude 3 Haiku

**50 developers, 22 días/mes:**
- **Costo mensual:** ~$7 USD
- **Por developer:** $0.14/mes
- **Por día:** $0.32

**Trade-off:**
- ✅ Súper económico
- ⚠️ Análisis menos detallados
- ✅ Suficiente para detección básica

### Cambiar Modelo

```bash
# En .env.local
DEFAULT_AI_MODEL=anthropic/claude-3-sonnet  # Recomendado
# o
DEFAULT_AI_MODEL=anthropic/claude-3-haiku   # Económico
# o
DEFAULT_AI_MODEL=openai/gpt-4-turbo-preview  # Premium
```

---

## 🏢 Para Empresas: Usar Modelo Propio

### Opción 1: OpenAI Direct (Si ya tienes cuenta)

```bash
# .env.local
OPENAI_API_KEY=sk-tu-key-de-openai
DEFAULT_AI_MODEL=gpt-4-turbo-preview
```

### Opción 2: Modelo Custom (On-Premise)

```typescript
// Via API
POST /api/projects/default/ai-config
{
  "provider": "custom",
  "apiKey": "tu-key-interno",
  "model": "llama-3-70b-fine-tuned",
  "baseURL": "https://ai.tuempresa.com/v1"
}
```

**Ventajas:**
- ✅ Máxima privacidad
- ✅ Sin costos por uso
- ✅ Control total
- ✅ Cumplimiento regulatorio

**Ejemplo con vLLM:**
```bash
# Deploy en tu servidor
docker run --gpus all -p 8000:8000 \
  vllm/vllm-openai:latest \
  --model meta-llama/Llama-3-70b-chat-hf \
  --api-key tu-key-interno

# Configura FlowSight
curl -X PUT http://localhost:3000/api/projects/default/ai-config \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "custom",
    "apiKey": "tu-key-interno",
    "model": "meta-llama/Llama-3-70b-chat-hf",
    "baseURL": "http://tu-servidor:8000/v1"
  }'
```

---

## 🔧 Troubleshooting

### "AI analysis failed: Invalid API key"

```bash
# Verifica tu API key
echo $OPENROUTER_API_KEY

# Debe empezar con sk-or-v1-
# Si no, regenera en https://openrouter.ai/keys
```

### "Analysis not running"

```bash
# 1. Verifica que la variable está cargada
curl http://localhost:3000/api/ai/analyze/status

# 2. Si available:false, revisa .env.local
cat apps/dashboard/.env.local | grep OPENROUTER

# 3. Reinicia el dashboard
cd apps/dashboard
pnpm dev
```

### "Rate limit exceeded" (solo para OpenRouter)

```bash
# Opción 1: Reducir frecuencia de análisis
# En apps/dashboard/src/lib/rules-engine.ts
# Cambiar: Math.random() < 0.1  →  Math.random() < 0.05

# Opción 2: Usar modelo más barato
# En .env.local
DEFAULT_AI_MODEL=anthropic/claude-3-haiku

# Opción 3: Agregar créditos en OpenRouter
# https://openrouter.ai/credits
```

### "Ollama connection failed"

```bash
# Verificar que Ollama esté corriendo
ollama list

# Si no está corriendo, iniciarlo
ollama serve

# Verificar que el modelo esté descargado
ollama pull phi3:3.8b

# Verificar que el puerto esté abierto
curl http://localhost:11434/api/tags
```

### "Local AI analysis failed"

```bash
# Verificar configuración
cd apps/dashboard
cat .env.local | grep -E "(OLLAMA|OPENROUTER)"

# Si no hay OPENROUTER_API_KEY, debería usar Ollama automáticamente
# Verificar logs del dashboard para más detalles
```

---

## 📚 Más Información

- **Documentación Completa:** Ver `AI_INTEGRATION.md`
- **API Reference:** Ver endpoints en el archivo
- **Modelos Disponibles:** https://openrouter.ai/models
- **Precios:** https://openrouter.ai/models (columna "Pricing")

---

## ✅ Checklist - Modelos Locales

- [ ] Ollama instalado y corriendo (`ollama serve`)
- [ ] Modelo Phi-3 descargado (`ollama pull phi3:3.8b`)
- [ ] Dashboard corriendo en http://localhost:3000
- [ ] Agent configurado y enviando eventos
- [ ] Logs muestran "AI Blocker Analysis Result" (con Phi-3 local)

**¡Todo listo con IA local!** 🎉

Ahora cada ~10 eventos, Phi-3 analizará automáticamente la actividad y te alertará si detecta problemas.

## ✅ Checklist - OpenRouter (Opcional)

- [ ] Cuenta en OpenRouter creada
- [ ] API key generada
- [ ] Variable `OPENROUTER_API_KEY` en `.env.local`
- [ ] Dashboard reiniciado
- [ ] API status retorna `available: true`
- [ ] Agent enviando eventos
- [ ] Logs muestran "AI Blocker Analysis Result" (con modelo cloud)

---

**Siguiente Paso:** Lee `AI_INTEGRATION.md` para configuración avanzada y uso enterprise.




