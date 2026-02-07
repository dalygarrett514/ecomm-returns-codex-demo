const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(process.cwd(), '.env') });

function parseBoolean(value, defaultValue = false) {
  if (value === undefined) {
    return defaultValue;
  }

  return String(value).toLowerCase() === 'true';
}

const config = {
  app: {
    port: Number(process.env.API_PORT || process.env.PORT || 4000),
    clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:3000'
  },
  auth: {
    disabled: parseBoolean(process.env.AUTH_DISABLED, true),
    domain: process.env.AUTH0_DOMAIN || '',
    audience: process.env.AUTH0_AUDIENCE || '',
    rolesClaimNamespace: process.env.AUTH0_ROLES_CLAIM_NAMESPACE || 'https://ecomm-demo.example.com'
  },
  db: {
    connectionString: process.env.DATABASE_URL || ''
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-5-codex'
  }
};

module.exports = config;
