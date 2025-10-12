import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;
const BACKEND_URL = process.env.VITE_BACKEND_URL || 'http://localhost:8000';

// Serve static files from the dist directory
app.use(express.static(path.join(__dirname, 'dist')));

// Health check endpoint for Cloud Run
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'frontend' });
});

// API proxy endpoints (for production routing)
// Note: In production, you might want to call backend directly from browser
// These proxies are optional and can be removed if you configure CORS properly
const API_ROUTES = ['/api', '/health', '/ip'];

API_ROUTES.forEach(route => {
  app.use(route, (req, res) => {
    // Simple redirect to backend - in production, consider using a proper proxy
    const backendUrl = `${BACKEND_URL}${req.originalUrl}`;
    res.redirect(307, backendUrl);
  });
});

// SPA fallback - serve index.html for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Frontend server running on port ${PORT}`);
  console.log(`Backend URL: ${BACKEND_URL}`);
});
