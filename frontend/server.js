import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createProxyMiddleware } from 'http-proxy-middleware';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;
const BACKEND_URL = process.env.VITE_BACKEND_URL || 'http://localhost:8000';

// Pre-rendered landing page content for crawlers and AI tools
const LANDING_PAGE_CONTENT = `
<header>
  <nav>
    <a href="/"><strong>ResidenceHive</strong></a>
    <a href="#how-it-works">How It Works</a>
    <a href="#features">Features</a>
    <a href="#why-us">Why Us</a>
    <a href="/sign-in">Sign In</a>
    <a href="/sign-up">Request Demo</a>
  </nav>
</header>

<main>
  <section id="hero">
    <p>Now in Private Pilot</p>
    <h1>The first-response layer for real estate</h1>
    <p>Transform generic lead responses into curated, compliant buyer engagement that converts.</p>
    <p><strong>78% of real estate leads never receive a personalized response.</strong></p>
  </section>

  <section id="problem">
    <h2>The problem with lead response today</h2>
    <p>Real estate leads are expensive, but most brokerages struggle to respond effectively.</p>

    <h3>Expensive, Ignored</h3>
    <p>Brokerages pay $100-225+ per lead. Most never get a meaningful response.</p>

    <h3>Generic Replies</h3>
    <p>Buyers get 30-40 unranked listings with no explanation or trade-offs. It looks like spam.</p>

    <h3>Lost Intent</h3>
    <p>Buyer questions reveal timeline, budget, must-haves. Traditional CRMs capture none of it.</p>
  </section>

  <section id="features">
    <h2>A smarter first response</h2>
    <p>ResidenceHive transforms how brokerages engage leads from the first touchpoint.</p>

    <h3>Curated Top-5</h3>
    <p>Instead of 40 listings, buyers get 5 ranked picks with clear explanations of why each fits.</p>

    <h3>Async Engagement</h3>
    <p>Buyers engage on their schedule. AI handles follow-up within brokerage-controlled parameters.</p>

    <h3>Automatic Intent Capture</h3>
    <p>No forms. Natural conversation reveals timeline, budget, and preferences automatically.</p>

    <h3>One Link, Zero Threads</h3>
    <p>Replace the 10-message email thread with a single shareable link.</p>
  </section>

  <section id="how-it-works">
    <h2>How it works</h2>
    <p>From lead to qualified buyer in five seamless steps.</p>

    <h3>Step 1: Lead Arrives</h3>
    <p>From website, Zillow, Realtor.com, or referral.</p>

    <h3>Step 2: AI Analyzes</h3>
    <p>Extracts budget, timeline, must-haves, dealbreakers.</p>

    <h3>Step 3: Report Generated</h3>
    <p>Curated Top-5 with personalized explanations.</p>

    <h3>Step 4: Buyer Engages</h3>
    <p>Chatbot answers questions within compliance guardrails.</p>

    <h3>Step 5: Agent Acts</h3>
    <p>Receive qualified lead with full context - ready for action.</p>
  </section>

  <section id="why-us">
    <h2>Why ResidenceHive?</h2>
    <p>Generic AI hallucinates listings. ResidenceHive is built for compliance-first real estate.</p>

    <table>
      <thead>
        <tr><th>Capability</th><th>CRM + ChatGPT</th><th>ResidenceHive</th></tr>
      </thead>
      <tbody>
        <tr><td>Brokerage-controlled answers</td><td>No</td><td>Yes</td></tr>
        <tr><td>MLS-contextual responses</td><td>No</td><td>Yes</td></tr>
        <tr><td>Automatic intent capture</td><td>No</td><td>Yes</td></tr>
        <tr><td>Compliance guardrails</td><td>No</td><td>Yes</td></tr>
        <tr><td>Risk detection and escalation</td><td>No</td><td>Yes</td></tr>
      </tbody>
    </table>
  </section>

  <section id="social-proof">
    <h2>Results</h2>
    <p><strong>~15 min</strong> saved per listing</p>
    <p><strong>$100+</strong> lead cost protected</p>
    <p><strong>Toronto</strong> pilot market</p>
    <blockquote>"This saves me ~15 minutes per listing." — Agent (demo)</blockquote>
  </section>

  <section id="cta">
    <h2>Ready to transform your lead response?</h2>
    <p>Join the private pilot and see ResidenceHive in action.</p>
    <a href="/sign-up">Request Demo</a>
    <p><strong>$100/seat/month | No long-term contracts</strong></p>
  </section>
</main>

<footer>
  <p><strong>ResidenceHive</strong></p>
  <nav>
    <a href="mailto:info@residencehive.com">Contact</a>
    <a href="/privacy">Privacy Policy</a>
    <a href="/terms">Terms</a>
  </nav>
  <p>&copy; ResidenceHive 2026</p>
</footer>
`;

// Cache the pre-rendered index.html at startup
let prerenderedIndexHtml = null;
function getPrerenderedHtml() {
  if (!prerenderedIndexHtml) {
    const indexHtml = fs.readFileSync(path.join(__dirname, 'dist', 'index.html'), 'utf-8');
    prerenderedIndexHtml = indexHtml.replace(
      '<div id="root"></div>',
      `<div id="root">${LANDING_PAGE_CONTENT}</div>`
    );
  }
  return prerenderedIndexHtml;
}

// Serve static files from the dist directory (index: false so our / handler takes priority)
app.use(express.static(path.join(__dirname, 'dist'), { index: false }));

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

// robots.txt
app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  res.send(`User-agent: *
Allow: /
Disallow: /dashboard
Disallow: /analytics
Disallow: /agent-setup
Disallow: /sign-in
Disallow: /sign-up
Disallow: /agent-login
Disallow: /client/

Sitemap: https://residencehive.com/sitemap.xml
`);
});

// sitemap.xml
app.get('/sitemap.xml', (req, res) => {
  res.type('application/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://residencehive.com/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
`);
});

// Pre-rendered landing page for crawlers and AI tools
app.get('/', (req, res) => {
  res.type('html');
  res.send(getPrerenderedHtml());
});

// SPA fallback - serve index.html for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Frontend server running on port ${PORT}`);
  console.log(`Backend URL: ${BACKEND_URL}`);
});
