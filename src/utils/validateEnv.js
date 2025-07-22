const logger = require('./logger');

/**
 * Validate required environment variables
 * @returns {boolean} - True if all required variables are present
 */
function validateEnvironment() {
  const requiredVars = [
    'MONGODB_URL',
    'DATABASE_NAME'
  ];

  const missingVars = requiredVars.filter(varName => !process.env[varName]);

  if (missingVars.length > 0) {
    logger.error(`Missing required environment variables: ${missingVars.join(', ')}`);
    return false;
  }

  return true;
}

module.exports = {
  validateEnvironment
};
