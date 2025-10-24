# FlowSight AI - Integración de Inteligencia Artificial

## 🤖 Descripción General

FlowSight AI utiliza modelos de lenguaje avanzados (LLMs) para análisis inteligente de la actividad de desarrolladores. La arquitectura está diseñada para soportar múltiples proveedores de IA y permitir que cada empresa use su propio modelo.

## 🔧 Arquitectura

### Proveedores Soportados

1. **OpenRouter** (Recomendado) ⭐
   - Acceso a múltiples modelos: GPT-4, Claude, Llama, Mixtral, etc.
   - Un solo API key para todos los modelos
   - Precios competitivos y transparentes
   - Ideal para empezar

2. **OpenAI** (Directo)
   - GPT-4 Turbo, GPT-4, GPT-3.5
   - Control directo sobre configuración
   - Requiere API key de OpenAI

3. **Custom** (Enterprise)
   - Modelos propios de la empresa
   - Hosted on-premise o en cloud privado
   - Máxima privacidad y control

### Abstracción de Proveedores

```typescript
interface IAIProvider {
  analyze(prompt: string, systemPrompt?: string): Promise<string>;
  analyzeJSON<T>(prompt: string, systemPrompt?: string): Promise<T>;
}
```

Cada proveedor implementa esta interfaz, permitiendo cambiar entre ellos sin modificar el código de negocio.

## 🚀 Configuración Rápida

### 1. OpenRouter (Recomendado)

```bash
# 1. Obtén tu API key
# Visita: https://openrouter.ai/keys
# Crea una cuenta y genera un API key

# 2. Agrega a .env.local
OPENROUTER_API_KEY=sk-or-v1-your-key-here
DEFAULT_AI_MODEL=openai/gpt-4-turbo-preview
```

**Modelos disponibles en OpenRouter:**

```typescript
// GPT-4 (OpenAI) - Mejor calidad
'openai/gpt-4-turbo-preview'  // $10/$30 por 1M tokens (input/output)
'openai/gpt-4'                 // $30/$60 por 1M tokens

// Claude (Anthropic) - Mejor razonamiento
'anthropic/claude-3-opus'      // $15/$75 por 1M tokens
'anthropic/claude-3-sonnet'    // $3/$15 por 1M tokens
'anthropic/claude-3-haiku'     // $0.25/$1.25 por 1M tokens

// Open Source - Más económicos
'meta-llama/llama-3-70b'       // $0.59/$0.79 por 1M tokens
'mistralai/mixtral-8x7b'       // $0.24/$0.24 por 1M tokens
```

### 2. Uso Directo de OpenAI

```bash
# .env.local
OPENAI_API_KEY=sk-your-openai-key
```

```typescript
// Configurar en código
const config: AIConfig = {
  provider: 'openai',
  apiKey: process.env.OPENAI_API_KEY!,
  model: 'gpt-4-turbo-preview',
};
```

### 3. Modelo Custom (Enterprise)

```bash
# .env.local
# No necesitas API keys externas si usas tu propio modelo
```

```typescript
// Configurar via API
POST /api/projects/default/ai-config
{
  "provider": "custom",
  "apiKey": "your-internal-key",
  "model": "your-model-name",
  "baseURL": "https://your-ai-api.company.com/v1",
  "maxTokens": 2000,
  "temperature": 0.3
}
```

## 📊 Tipos de Análisis

### 1. Detección de Blockers

**Automático**: Se ejecuta cada ~10 eventos (10% de probabilidad)

```typescript
// Analiza patrones y detecta si el developer está bloqueado
const analysis = await analyzer.analyzeBlocker(events);

// Resultado
{
  isBlocked: true,
  confidence: 85,
  reason: "Developer está buscando el mismo error repetidamente en StackOverflow",
  category: "technical",
  suggestions: [
    "Revisar logs del servidor para más contexto",
    "Hacer pair programming con senior",
    "Verificar configuración de ambiente"
  ],
  estimatedImpact: "high"
}
```

**Manual**: Via API endpoint

```bash
curl -X POST http://localhost:3000/api/ai/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "devId": "dev@company.com",
    "analysisType": "blocker",
    "timeRange": {
      "start": "2025-10-24T08:00:00Z",
      "end": "2025-10-24T10:00:00Z"
    }
  }'
```

### 2. Análisis de Productividad

```typescript
const analysis = await analyzer.analyzeProductivity(events);

// Resultado
{
  focusScore: 78,
  contextSwitches: 12,
  deepWorkPeriods: [
    {
      start: "2025-10-24T09:00:00Z",
      end: "2025-10-24T10:45:00Z",
      duration: 105
    }
  ],
  distractions: [
    {
      timestamp: "2025-10-24T09:30:00Z",
      type: "Slack notification - 5 messages",
      duration: 8
    }
  ],
  insights: [
    "Developer tuvo 2 períodos de deep work >1 hora",
    "Productividad máxima entre 9-11am",
    "12 context switches sugieren interrupciones frecuentes"
  ]
}
```

### 3. Análisis de Ticket

```typescript
const analysis = await analyzer.analyzeTicket(events, 'FE-123');

// Resultado
{
  estimatedCompletion: 65,
  velocity: "normal",
  risks: [
    "Baja actividad de commits en los últimos 2 días",
    "Múltiples archivos sin finalizar"
  ],
  nextActions: [
    "Hacer commit del trabajo actual",
    "Actualizar tests",
    "Code review con team lead"
  ],
  timeEstimate: {
    remaining: 4,  // horas
    confidence: 75
  }
}
```

### 4. Análisis de Equipo

```typescript
// TODO: Implementar en V2
const analysis = await analyzer.analyzeTeam(events);
```

## 🔄 Integración en Rules Engine

La IA se integra automáticamente en el Rules Engine:

```typescript
// apps/dashboard/src/lib/rules-engine.ts

// Regla AI activada automáticamente si OPENROUTER_API_KEY está configurada
{
  id: 'ai-blocker-detection',
  name: 'AI-Powered Blocker Detection',
  enabled: !!process.env.OPENROUTER_API_KEY,
  // Se ejecuta cada ~10 eventos para controlar costos
  // Si confianza > 70%, marca ticket como bloqueado
}
```

### Control de Costos

```typescript
// Ejecutar análisis selectivamente
if (Math.random() < 0.1) {  // 10% de eventos
  const analysis = await performAIAnalysis(event);
}

// O cada N eventos
if (eventCount % 10 === 0) {
  const analysis = await performAIAnalysis(event);
}
```

## 💰 Costos Estimados

### Análisis por Developer/Día

- **Eventos capturados**: ~960 (30s interval, 8h workday)
- **Análisis AI**: ~96 (10% de eventos)
- **Tokens promedio por análisis**: ~1,500 tokens
- **Total tokens/día**: ~144,000 tokens

### Costos Mensuales por Modelo

**50 Developers, 22 días laborables:**

| Modelo | Input | Output | Total/mes | Calidad |
|--------|-------|--------|-----------|---------|
| GPT-4 Turbo | $47 | $141 | **$188** | ⭐⭐⭐⭐⭐ |
| Claude 3 Sonnet | $14 | $71 | **$85** | ⭐⭐⭐⭐⭐ |
| Claude 3 Haiku | $1.18 | $5.90 | **$7** | ⭐⭐⭐⭐ |
| Llama 3 70B | $2.79 | $3.73 | **$6.50** | ⭐⭐⭐ |
| Mixtral 8x7B | $1.13 | $1.13 | **$2.26** | ⭐⭐⭐ |

**Recomendación:** Claude 3 Sonnet - mejor balance calidad/precio

### Optimizaciones para Reducir Costos

```typescript
// 1. Análisis solo en horario laboral
const isWorkHours = hour >= 9 && hour <= 18;
if (!isWorkHours) return;

// 2. Análisis solo si hay señales de problema
const browsingRatio = browsingEvents / totalEvents;
if (browsingRatio < 0.5) return; // No analizar si no hay problemas

// 3. Cache de resultados
const cacheKey = `ai:${devId}:${hour}`;
const cached = await redis.get(cacheKey);
if (cached) return JSON.parse(cached);

// 4. Usar modelos más baratos para pre-screening
if (preliminaryCheck.confidence < 60) {
  // Usar Mixtral (barato)
} else {
  // Usar GPT-4 (caro pero preciso)
}
```

## 📡 API Endpoints

### Análisis On-Demand

```http
POST /api/ai/analyze
Content-Type: application/json

{
  "devId": "dev@company.com",
  "analysisType": "blocker",  // blocker | productivity | ticket
  "timeRange": {
    "start": "2025-10-24T08:00:00Z",
    "end": "2025-10-24T10:00:00Z"
  }
}
```

**Respuesta:**
```json
{
  "success": true,
  "analysis": {
    "isBlocked": true,
    "confidence": 85,
    "reason": "...",
    "suggestions": [...]
  },
  "metadata": {
    "eventsAnalyzed": 45,
    "timeRange": {...}
  }
}
```

### Configuración de IA por Proyecto

```http
PUT /api/projects/my-project/ai-config
Content-Type: application/json

{
  "provider": "custom",
  "apiKey": "your-key",
  "model": "company-llama-70b",
  "baseURL": "https://ai.company.com/v1"
}
```

### Verificar Estado de IA

```http
GET /api/ai/analyze/status
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

## 🏢 Configuración Enterprise (Modelos Custom)

### Caso de Uso: Empresa con Modelo Propio

```typescript
// 1. Deploy tu modelo con API compatible con OpenAI
// Ejemplo: vLLM, TGI (Text Generation Inference), Ollama

// 2. Configura via API o base de datos
const aiConfig: AIConfig = {
  provider: 'custom',
  apiKey: 'internal-key',
  model: 'company-fine-tuned-llama-70b',
  baseURL: 'https://ai-internal.company.com/v1',
  maxTokens: 2000,
  temperature: 0.3,
};

// 3. El sistema automáticamente usa tu modelo
// Todo el análisis se hace contra tu infraestructura
// Datos nunca salen de tu red
```

### Ejemplo: Deploy con vLLM

```bash
# Servidor interno
docker run --gpus all \
  -p 8000:8000 \
  vllm/vllm-openai:latest \
  --model meta-llama/Llama-3-70b-chat-hf \
  --api-key internal-secret-key

# Configurar FlowSight
PUT /api/projects/default/ai-config
{
  "provider": "custom",
  "apiKey": "internal-secret-key",
  "model": "meta-llama/Llama-3-70b-chat-hf",
  "baseURL": "http://ai-server.internal:8000/v1"
}
```

## 🔒 Privacidad y Seguridad

### Datos Enviados a IA

**SÍ se envía:**
- ✅ Tipo de actividad (coding, browsing, etc.)
- ✅ Nombres de aplicaciones
- ✅ Nombres de archivos (sanitizados)
- ✅ Ticket IDs
- ✅ Timestamps

**NO se envía:**
- ❌ Contenido de archivos
- ❌ Screenshots
- ❌ Código fuente
- ❌ Credenciales o tokens
- ❌ Información personal identificable

### Para Máxima Privacidad

Use modelos custom on-premise:
```typescript
{
  provider: 'custom',
  baseURL: 'http://localhost:8000/v1'  // Tu servidor interno
}
```

## 📈 Métricas y Monitoreo

### Logs de Análisis

```typescript
console.log('AI Blocker Analysis:', {
  devId: 'dev@company.com',
  confidence: 85,
  cost: 0.023,  // USD
  latency: 1.2,  // segundos
  model: 'gpt-4-turbo'
});
```

### Dashboard de Costos (TODO: V2)

- Total análisis/día
- Costo acumulado
- Distribución por modelo
- Precisión vs feedback

## 🧪 Testing

```typescript
// Test con mock provider
const mockProvider: IAIProvider = {
  async analyze() {
    return 'Mock analysis result';
  },
  async analyzeJSON<T>() {
    return { isBlocked: false } as T;
  },
};

const analyzer = new AIAnalyzer(customConfig);
```

## 🚀 Roadmap

### V2 Features

- [ ] Análisis de equipo completo
- [ ] Fine-tuning con datos históricos
- [ ] A/B testing de modelos
- [ ] Predicción de ETAs
- [ ] Recomendaciones personalizadas
- [ ] Detección de burnout
- [ ] Análisis de code quality vía commits

---

**¿Preguntas?** Consulta la documentación completa en `README.md` o abre un issue.


