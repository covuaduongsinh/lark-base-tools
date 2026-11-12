import { serve } from '@hono/node-server';
import { createApp } from './server.js';

const port = parseInt(process.env.PORT || '3000', 10);
const host = process.env.HOST || '0.0.0.0';

const app = createApp();

console.log(`=======================================================`);
console.log(`🚀 Lark Base -> NocoEdu Web ETL Service`);
console.log(`🌐 Server running at: http://${host}:${port}`);
console.log(`🔒 Dokploy Network / Cloudflare Zero Trust Ready`);
console.log(`=======================================================`);

serve({
  fetch: app.fetch,
  port,
  hostname: host
});
