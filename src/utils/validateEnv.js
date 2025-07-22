// Environment validation utility

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
    console.error(`Missing required environment variables: ${missingVars.join(', ')}`);
    return false;
  }

  return true;
}

module.exports = {
  validateEnvironment
};
