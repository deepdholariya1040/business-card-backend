module.exports = {
  apps: [
    {
      name: "ocr-saas-backend",
      script: "server.js",
      instances: process.env.PM2_INSTANCES || 1,
      exec_mode: "cluster",
      watch: false,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
      },
      error_file: "logs/pm2-error.log",
      out_file: "logs/pm2-out.log",
      merge_logs: true,
      time: true,
    },
  ],
};
