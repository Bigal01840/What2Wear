// Load ./.env (if present) before anything reads process.env.
try {
  process.loadEnvFile();
} catch {
  // no .env file: rely on the real environment
}
