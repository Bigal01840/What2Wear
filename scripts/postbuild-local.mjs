// Static-host extras for the local build (Cloudflare and Netlify read _headers).
// Routes like /morning fall back to index.html via wrangler.jsonc on Cloudflare.
import { writeFileSync } from 'node:fs';

const out = 'dist/local';
writeFileSync(`${out}/_headers`, `/sw.js
  Cache-Control: no-cache
/index.html
  Cache-Control: no-cache
/assets/*
  Cache-Control: public, max-age=31536000, immutable
`);
console.log('wrote _headers to', out);
