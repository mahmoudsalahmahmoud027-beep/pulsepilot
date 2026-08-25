import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '2mb' }));

// Lazy initialize Gemini client to avoid crashes if key is not present
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey.trim() === '') {
    return null;
  }
  try {
    return new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          },
      },
    });
  } catch (err) {
    console.error('[Gemini Init Error]', err);
    return null;
  }
}

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'pulsepilot-backend',
    timestamp: new Date().toISOString(),
  });
});

// Check AI status
app.get('/api/gemini-status', (_req, res) => {
  const hasKey = Boolean(
    process.env.GEMINI_API_KEY &&
    process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY' &&
    process.env.GEMINI_API_KEY.trim().length > 5
  );

  res.json({
    available: hasKey,
    model: 'gemini-3.7-flash',
    mode: hasKey ? 'connected' : 'local_deterministic_fallback',
  });
});

// AI-assisted Operations Analysis endpoint
app.post('/api/analyze', async (req, res) => {
  const { query, contextData, targetType, targetId } = req.body;

  const ai = getGeminiClient();

  if (!ai) {
    return res.status(503).json({
      error: 'GEMINI_API_KEY is not configured on the server. Falling back to local deterministic intelligence.',
      fallbackRequired: true,
    });
  }

  try {
    const systemInstruction = `
You are the intelligence engine for PulsePilot, an operations monitoring and decision-support platform.
You analyze real application state (events, incidents, alerts, project health metrics, deployments).

CRITICAL RULES:
1. Ground every claim directly in the provided JSON operational data. Never hallucinate fake metrics, incidents, or logs.
2. Clearly distinguish between:
   - OBSERVED: Direct facts recorded in events, incidents, alerts, timestamps.
   - DERIVED: Mathematical or logical facts calculated from state (e.g. failure rates, elapsed time).
   - INFERRED: Probable causal links, hypotheses, or system behavior deductions.
3. Be concise, technical, objective, and actionable. Avoid buzzwords like "hyper-optimization" or "synergy".
4. Assign a realistic confidence level (HIGH, MEDIUM, LOW) based on available evidence.
5. Provide concrete, prioritized next operational steps.

Always respond in strictly formatted JSON conforming to the requested schema.
`;

    const prompt = `
USER QUERY / INVESTIGATION:
"${query || 'Analyze current operations state and identify immediate risks and next actions.'}"

TARGET CONTEXT:
Type: ${targetType || 'WORKSPACE'}
ID: ${targetId || 'ALL'}

OPERATIONAL DATA CONTEXT:
${JSON.stringify(contextData, null, 2)}
`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.7-flash',
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: {
              type: Type.STRING,
              description: 'Clear, 2-3 sentence executive operational summary of the situation.',
            },
            confidence: {
              type: Type.STRING,
              description: 'HIGH, MEDIUM, or LOW',
            },
            confidenceReason: {
              type: Type.STRING,
              description: 'Why this confidence level was assigned based on evidence volume.',
            },
            observedFacts: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Direct factual observations grounded in event/incident data.',
            },
            derivedMetrics: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Derived calculations (e.g., latency deltas, failure counts).',
            },
            inferredCauses: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Logical inferences or probable root causes.',
            },
            likelyRootCause: {
              type: Type.STRING,
              description: 'The most probable root cause identified or stated ambiguity.',
            },
            recommendedActions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  priority: { type: Type.STRING, description: 'P1, P2, or P3' },
                  title: { type: Type.STRING, description: 'Short actionable title' },
                  description: { type: Type.STRING, description: 'Specific command, rollback, or check to perform' },
                  targetEntity: { type: Type.STRING, description: 'Project or Incident ID if applicable' },
                },
                required: ['priority', 'title', 'description'],
              },
              description: 'Prioritized list of concrete operational actions.',
            },
          },
          required: [
            'summary',
            'confidence',
            'confidenceReason',
            'observedFacts',
            'derivedMetrics',
            'inferredCauses',
            'likelyRootCause',
            'recommendedActions',
          ],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json({
      success: true,
      source: 'gemini-3.7-flash',
      data: parsed,
    });
  } catch (err: unknown) {
    console.error('[Gemini Analyze Error]', err);
    return res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to generate AI analysis',
      fallbackRequired: true,
    });
  }
});

// Vite middleware in dev or static files in prod
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      configLoader: 'runner',
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[PulsePilot] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
