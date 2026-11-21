/**
 * NeuroScribe Studio - Server Bootstrapper
 * High-performance native Node.js 22 HTTP server with zero external dependencies.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VaultDb } from './src/db/vaultDb.js';
import { ApiRouter } from './src/routes/api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '3000', 10);
const VAULT_DIR = path.join(__dirname, 'storage', 'notes');
const DB_PATH = path.join(__dirname, 'storage', 'vault.db');
const PUBLIC_DIR = path.join(__dirname, 'public');
const VIEWS_DIR = path.join(__dirname, 'views');

// MIME Type Mappings
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

async function bootstrap() {
  console.log('\n======================================================');
  console.log('⚡  NeuroScribe Studio - Knowledge Graph & Semantic Vault');
  console.log('======================================================');
  console.log(`[BOOT] Initializing Vault Storage at: ${VAULT_DIR}`);

  // Initialize Database & Vault Synchronizer
  const vaultDb = new VaultDb(VAULT_DIR, DB_PATH);
  await vaultDb.init();

  const vaultStats = vaultDb.getVaultStats();
  console.log(`[VAULT] Engine Mode: ${vaultStats.storageMode}`);
  console.log(`[VAULT] Indexed: ${vaultStats.totalNotes} notes, ${vaultStats.totalLinks} links, ${vaultStats.totalTags} tags`);

  // Initialize API Router
  const apiRouter = new ApiRouter(vaultDb);

  // Create Native HTTP Server
  const server = http.createServer(async (req, res) => {
    try {
      const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const pathname = parsedUrl.pathname;

      // 1. Route API Requests
      if (pathname.startsWith('/api')) {
        const handled = await apiRouter.handle(req, res, pathname, parsedUrl.searchParams);
        if (handled) return;
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Endpoint not found' }));
        return;
      }

      // 2. Serve HTML Views
      if (pathname === '/' || pathname === '/index.html') {
        return serveFile(res, path.join(VIEWS_DIR, 'index.html'));
      }
      if (pathname === '/graph') {
        return serveFile(res, path.join(VIEWS_DIR, 'graph.html'));
      }

      // 3. Serve Static Assets (public/)
      const safeSuffix = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
      const potentialStaticPath = path.join(PUBLIC_DIR, safeSuffix);

      if (fs.existsSync(potentialStaticPath) && fs.statSync(potentialStaticPath).isFile()) {
        return serveFile(res, potentialStaticPath);
      }

      // Fallback 404
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found - NeuroScribe Studio');
    } catch (err) {
      console.error('[ERROR] Request failure:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Internal Server Error' }));
    }
  });

  server.listen(PORT, () => {
    console.log(`\n🚀 Server running in Node.js ${process.version}`);
    console.log(`🔗 Workspace UI:  http://localhost:${PORT}`);
    console.log(`🔗 Graph Explorer: http://localhost:${PORT}/graph`);
    console.log(`🔗 REST API Root:  http://localhost:${PORT}/api/stats\n`);
  });

  // Graceful Shutdown
  const shutdown = () => {
    console.log('\n[SHUTDOWN] Closing server gracefully...');
    server.close(() => {
      console.log('[SHUTDOWN] Server closed.');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

/**
 * Serves static file with appropriate Content-Type and caching
 */
function serveFile(res, filePath) {
  try {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const content = fs.readFileSync(filePath);

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': Buffer.byteLength(content),
      'Cache-Control': 'no-cache'
    });
    res.end(content);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Error loading asset');
  }
}

// Start server
bootstrap().catch(err => {
  console.error('[FATAL] Failed to start server:', err);
  process.exit(1);
});
