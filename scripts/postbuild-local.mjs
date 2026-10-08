// Static-host extras for the local build (Cloudflare Pages and Netlify read both files).
import { writeFileSync } from 'node:fs';

const out = 'dist/local';
// Serve the app shell for /morning, /wardrobe … (the service worker does this once installed).
writeFileSync(`${out}/_redirects`, '/* /index.html 200\n');
writeFileSync(`${out}/_headers`, `/sw.js
  Cache-Control: no-cache
/index.html
  Cache-Control: no-cache
/assets/*
  Cache-Control: public, max-age=31536000, immutable
`);
console.log('wrote _redirects and _headers to', out);
