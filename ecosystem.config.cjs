/**
 * pm2 deployment — single Node process serving SPA + REST API + audio streaming.
 *   pm2 start ecosystem.config.cjs
 *   pm2 save && pm2 startup   (autostart on reboot)
 *   pm2 logs audio-host
 */
module.exports = {
  apps: [
    {
      name: "audio-host",
      script: "dist/server/index.js",
      cwd: __dirname,
      instances: 1, // rate limiter + fixed windows are in-process; keep 1 unless Redis-backed
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
      },
      out_file: "data/pm2-out.log",
      error_file: "data/pm2-err.log",
      time: true,
    },
  ],
};
