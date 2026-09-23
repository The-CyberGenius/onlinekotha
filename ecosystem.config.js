module.exports = {
  apps: [
    {
      name: "onlinekotha",
      script: "./server.js",
      instances: 1, // Keep as 1 because SQLite is not concurrent-write friendly across multiple processes
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: 3000
      },
      error_file: "logs/err.log",
      out_file: "logs/out.log",
      merge_logs: true,
      time: true
    }
  ]
};
