export default {
  apps: [
    {
      name: 'telegram-bot',
      script: 'src/index.js',
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
      },
      autorestart: true,
      restart_delay: 5000,
      min_uptime: '10s',
      max_restarts: 10,
    },
  ],
};
