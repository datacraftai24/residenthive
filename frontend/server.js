import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createProxyMiddleware } from 'http-proxy-middleware';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;
const BACKEND_URL = process.env.VITE_BACKEND_URL || 'http://localhost:8000';

// Serve static files from the dist directory
app.use(express.static(path.join(__dirname, 'dist')));

// API proxy - forwards requests to backend
app.use('/api', createProxyMiddleware({
  target: BACKEND_URL,
  changeOrigin: true,
  logLevel: 'debug',
}));

// Health check endpoint for frontend
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'frontend' });
});

// SPA fallback - serve index.html for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Frontend server running on port ${PORT}`);
  console.log(`Backend URL: ${BACKEND_URL}`);
});
