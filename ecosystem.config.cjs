// pm2 process file: `pm2 start ecosystem.config.cjs`
module.exports = {
  apps: [{
    name: 'sleep-outfit',
    script: 'dist/server/main.js',
    cwd: __dirname,
    env: { NODE_ENV: 'production' },
    max_memory_restart: '200M',
    time: true,
  }],
};
