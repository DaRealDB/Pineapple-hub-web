import express from 'express';
import cors from 'cors';
import config from './config.js';
import { testConnection } from './db.js';
import { connectMqtt } from './mqtt.js';
import authRoutes from './routes/auth.js';
import deviceRoutes from './routes/devices.js';
import crateLogRoutes from './routes/crateLogs.js';
import hmiRoutes from './routes/hmi.js';
import analyticsRoutes from './routes/analytics.js';
import reportsRoutes from './routes/reports.js';

const app = express();

app.use(cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] }));
app.use(express.json());

// Health check
app.get('/api/health', async (_req, res) => {
  const dbOk = await testConnection();
  res.json({ status: dbOk ? 'ok' : 'degraded', db: dbOk });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/crate-logs', crateLogRoutes);
app.use('/api/hmi', hmiRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/reports', reportsRoutes);

// Start
async function start() {
  const dbOk = await testConnection();
  if (!dbOk) {
    console.error('[Server] WARNING: Database connection failed — starting anyway');
  }

  connectMqtt();

  app.listen(config.port, () => {
    console.log(`[Server] Pineapple Hub API running on http://localhost:${config.port}`);
    console.log(`[Server] Database: ${dbOk ? 'connected' : 'DISCONNECTED'}`);
  });
}

start();
