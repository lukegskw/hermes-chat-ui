// This file is overwritten at container startup by entrypoint.sh
// with all Docker environment variables. During local dev, use
// .env file and import.meta.env instead.
window.APP_CONFIG = {
  HERMES_API_URL: "",
  HERMES_API_KEY: ""
};
