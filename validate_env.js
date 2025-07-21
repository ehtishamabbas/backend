// Environment validation script
require('dotenv').config();
const logger = require('./logger');

// Required environment variables
const requiredVars = [
  'TRESTLE_CLIENT_ID',
  'TRESTLE_CLIENT_SECRET',
  'TOKEN_URL',
  'API_BASE_URL',
  'MONGODB_URL',
  'DATABASE_NAME',
  'MONGODB_COLLECTION',
  'MONGODB_IMAGES_COLLECTION',
  'GCP_BUCKET_NAME'
];

// Optional environment variables with default values
const optionalVars = {
  'BATCH_SIZE': '500',
  'API_PAGE_SIZE': '1000',
  'API_MAX_PAGES': '10',
  'MAX_PROCESSING_ERRORS': '1000',
  'CONCURRENT_REQUESTS': '10',
  'RATE_LIMIT_PER_SECOND': '5',
  'TIMEOUT_SECONDS': '180',
  'PORT': '3000'
};

// Validate environment variables
function validateEnvironment() {
  logger.info('Validating environment variables...');

  const missing = [];

  // Check required variables
  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  }

  // Set defaults for optional variables if not set
  for (const [varName, defaultValue] of Object.entries(optionalVars)) {
    if (!process.env[varName]) {
      process.env[varName] = defaultValue;
      logger.info(`Setting default value for ${varName}: ${defaultValue}`);
    }
  }

  // Report missing variables
  if (missing.length > 0) {
    logger.error(`Missing required environment variables: ${missing.join(', ')}`);
    logger.error('Please set these variables in your .env file or environment');
    return false;
  }

  logger.info('Environment validation successful');
  return true;
}

// Run if this script is executed directly
if (require.main === module) {
  const isValid = validateEnvironment();

  if (isValid) {
    logger.info('All required environment variables are set');
    process.exit(0);
  } else {
    logger.error('Environment validation failed');
    process.exit(1);
  }
}

module.exports = { validateEnvironment };
