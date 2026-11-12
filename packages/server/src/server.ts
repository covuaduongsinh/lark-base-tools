import fs from 'fs';
import path from 'path';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { basicAuth } from 'hono/basic-auth';
import { serveStatic } from '@hono/node-server/serve-static';
import { apiRouter } from './routes/api.js';

export function createApp(): Hono {
  const app = new Hono();

  // Enable CORS
  app.use('*', cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'x-api-key']
  }));

  // Optional Basic Auth security layer (protects UI and API when exposed on public domain)
  const authUser = process.env.AUTH_USER;
  const authPass = process.env.AUTH_PASS;
  if (authUser && authPass) {
    app.use('*', async (c, next) => {
      // Exclude public health checks
      if (c.req.path === '/api/health') {
        return next();
      }

      // Allow Cloudflare Zero Trust authenticated requests bypass basic auth if configured
      const cfEmail = c.req.header('cf-access-authenticated-user-email');
      if (cfEmail) {
        return next();
      }

      const authMiddleware = basicAuth({
        username: authUser,
        password: authPass
      });
      return authMiddleware(c, next);
    });
  }

  // Mount API Router
  app.route('/api', apiRouter);

  // Serve Web UI static files
  const publicDir = fs.existsSync('./packages/server/public')
    ? './packages/server/public'
    : './public';

  if (fs.existsSync(publicDir)) {
    app.use('/*', serveStatic({ root: publicDir }));
    app.get('/', serveStatic({ path: path.join(publicDir, 'index.html').replace(/\\/g, '/') }));
  }

  return app;
}
