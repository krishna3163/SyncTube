// PM2 ecosystem for 10k concurrent users — cluster mode with graceful reload
// Usage:  npm i -g pm2   &&   pm2 start ecosystem.config.cjs --env production
//         pm2 reload ecosystem.config.cjs   # zero-downtime reload
//         pm2 scale synctube 4               # scale workers without restart
module.exports = {
  apps: [{
    name: 'synctube',
    script: 'dist/index.js',
    instances: process.env.WORKERS ? parseInt(process.env.WORKERS, 10) : 'max', // one per vCPU, e.g. 4 on Render starter, auto on bigger hosts
    exec_mode: 'cluster',
    max_memory_restart: '800M',           // restart worker before OOM at scale
    kill_timeout: 5000,
    listen_timeout: 10000,
    wait_ready: false,
    autorestart: true,
    max_restarts: 20,
    min_uptime: '10s',
    exp_backoff_restart_delay: 100,
    // Keep 10k sockets alive through deploys
    shutdown_with_message: true,
    env: {
      NODE_ENV: 'production',
      PORT: 10000,
      CLUSTER: '0', // PM2 already clusters, disable internal cluster to avoid double-fork
      PG_POOL_MAX: '20',
      PG_POOL_MIN: '2',
      MAX_ROOMS: '20000',
    },
    env_production: {
      NODE_ENV: 'production',
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
  }],
};
