module.exports = {
  apps: [
    {
      name: "structuredqueries-server",
      cwd: "./server",
      script: "./dist/index.js",
      interpreter: "node",
      instances: 1,
      autorestart: true,
      env: {
        NODE_ENV: "production",
        PORT: "3000",
        DOTENV_CONFIG_PATH: "./.env.production"
      }
    }
  ]
};
