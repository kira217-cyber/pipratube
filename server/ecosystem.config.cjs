// PM2 on the VPS:  pm2 start ecosystem.config.cjs --env production
// One instance on purpose — sign-in hand-off codes and live analytics are
// kept in this process's memory.
module.exports = {
  apps: [
    {
      name: "pipratube-api",
      script: "index.js",
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "700M",
      kill_timeout: 12000,
      env: { NODE_ENV: "development" },
      env_production: { NODE_ENV: "production" },
    },
  ],
};
