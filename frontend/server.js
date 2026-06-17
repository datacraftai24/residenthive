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
    <a href="/massachusetts">Massachusetts</a>
    <a href="/ontario">Ontario</a>
    <a href="/offer-bot">Offer Bot</a>
    <a href="#how-it-works">How It Works</a>
    <a href="/sign-in">Sign In</a>
    <a href="/sign-up">Request Demo</a>
  </nav>
</header>

<main>
  <section id="hero">
    <p>Now in Private Pilot — Massachusetts &amp; Ontario</p>
    <h1>Which one would your buyer respond to?</h1>
    <p>AI handles the first response and offer prep. Your agents handle the relationship.</p>
    <p>Cost per lead: $100–225+. ~15 min saved per listing.</p>
  </section>

  <section id="problem">
    <h2>Your agent should be showing homes — instead they're stuck</h2>

    <h3>Lead Engagement — $100–225+ per lead, gone</h3>
    <p>Showing homes, building relationships, and converting is the job. Instead agents copy-paste 30 listings into an email no one reads. 78% of leads ghost before your agent even picks up the phone — a generic listing dump that looks like spam, zero intent captured, and no follow-up.</p>
    <p>ResidenceHive handles the first response. Your agent steps in when the buyer is ready to talk.</p>

    <h3>Offer Prep — ~15 min per offer, wasted</h3>
    <p>Winning deals means submitting on tight deadlines. Instead agents retype property details into blank forms at midnight — multiplied by 3 competing offers on a Friday night. Manual data entry, a missing clause that kills the deal, agent time burned on paperwork instead of negotiation.</p>
    <p>ResidenceHive preps the draft. Your agent reviews, edits, and sends — in minutes, not hours.</p>
  </section>

  <section id="features">
    <h2>A smarter first response</h2>

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

    <h3>Lead Engagement</h3>
    <p>Turn raw leads into qualified buyers with AI-powered first response.</p>
    <p>Lead arrives from your website, Zillow, Realtor.com, or a referral. AI extracts budget, timeline, must-haves, and dealbreakers. A curated Top-5 report is generated with personalized explanations. The chatbot answers buyer questions within compliance guardrails. Your agent acts on a qualified lead with full context — ready for action.</p>

    <h3>Offer Bot</h3>
    <p>Go from a listing address to a draft-ready offer package in minutes.</p>
    <p>The agent sends deal details in natural language via WhatsApp — no forms. The system extracts price, conditions, dates, parties, and clauses, then flags any missing fields. A pre-filled draft package is generated for agent review. Nothing goes out without agent approval.</p>
  </section>

  <section id="channels">
    <h2>Works on any phone — WhatsApp, iMessage &amp; SMS</h2>
    <p>No app to download. Works on any phone. One number for everything.</p>
  </section>

  <section id="markets">
    <h2>Built for your market</h2>

    <h3>Massachusetts</h3>
    <p>Purpose-built for MA agents. MLS PIN data, local compliance guardrails, and buyer engagement workflows designed for how Massachusetts transactions actually work — lead intake and buyer qualification, a compliance-first chatbot with Fair Housing guardrails, and MLS-contextual buyer reports.</p>

    <h3>Ontario</h3>
    <p>Built around Ontario agent workflows. From buyer engagement to draft offer packages — localized for how Ontario deals move, including lead engagement and buyer intake, listing-aware offer preparation, and draft OREA form generation for agent review.</p>
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
        <tr><td>Market-specific form generation</td><td>No</td><td>Yes</td></tr>
      </tbody>
    </table>
  </section>

  <section id="social-proof">
    <h2>Results</h2>
    <p><strong>2 Markets</strong> active pilots</p>
    <p><strong>MLS PIN</strong> &amp; listing data access</p>
    <p><strong>6-Tier</strong> compliance framework</p>
    <blockquote>"This saves me 15 minutes per listing and catches things I'd miss." — Pilot agent</blockquote>
  </section>

  <section id="cta">
    <h2>Ready to transform your workflow?</h2>
    <p>Join the private pilot — 60 days free, no contracts.</p>
    <a href="/sign-up">Request Demo — Pilots are free for 60 days</a>
  </section>
</main>

<footer>
  <p><strong>ResidenceHive</strong></p>
  <nav>
    <a href="mailto:hello@residencehive.com">Contact</a>
    <a href="/privacy">Privacy Policy</a>
    <a href="/compliance">Compliance</a>
  </nav>
  <p>&copy; ResidenceHive 2026</p>
</footer>
`;

// Cache the pre-rendered index.html at startup
let prerenderedIndexHtml = null;
function getPrerenderedHtml() {
  if (!prerenderedIndexHtml) {
    const indexHtml = fs.readFileSync(path.join(__dirname, 'dist', 'index.html'), 'utf-8');
    // The SEO content below is unstyled HTML meant for crawlers/AI tools. Real
    // browsers must NOT see it: until the React bundle loads and replaces #root,
    // hide the pre-render visually so users don't get a flash of unstyled content
    // (FOUC). Text-based crawlers read the markup regardless of this CSS.
    const hidePrerenderStyle =
      '<style>#root > header,#root > main,#root > footer{display:none!important}</style>';
    prerenderedIndexHtml = indexHtml
      .replace('</head>', `${hidePrerenderStyle}</head>`)
      .replace(
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
