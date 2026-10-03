/**
 * PM2 Process Config — OnlineKotha
 * Docs: https://pm2.keymetrics.io/docs/usage/application-declaration/
 *
 * Deploy: ssh kotha "pm2 reload ecosystem.config.js --env production"
 */
module.exports = {
  apps: [
    {
      name: "kotha",               // ← matches live server name
      script: "./server.js",
      instances: 1,                // SQLite = single writer, keep at 1
      autorestart: true,
      watch: false,
      max_memory_restart: "800M",  // restart if memory exceeds 800MB
      env_production: {
        NODE_ENV: "production",
        PORT: 3000
      },
      env_development: {
        NODE_ENV: "development",
        PORT: 3000
      },
      // Logs
      error_file: "logs/err.log",
      out_file: "logs/out.log",
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      time: true,
    }
  ]
};
