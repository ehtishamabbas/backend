// Test script for the Node.js backend API
require('dotenv').config();
const axios = require('axios');
const logger = require('./logger');

// API base URL
const API_BASE_URL = process.env.TEST_API_URL || 'http://localhost:3000';

// Test endpoints
const endpoints = [
  { name: 'Health Check', path: '/health', method: 'get', params: {} },
  { name: 'Get Listings', path: '/api/listings', method: 'get', params: { limit: 5 } },
  { name: 'Get Property Types', path: '/api/listings/property-type', method: 'get', params: {} },
  { name: 'Autocomplete', path: '/api/autocomplete', method: 'get', params: { query: 'San' } },
  { name: 'Counties Images', path: '/api/counties-images', method: 'get', params: { county: 'San Diego' } }
];

// Test function
async function testEndpoint(endpoint) {
  try {
    logger.info(`Testing ${endpoint.name}: ${endpoint.method.toUpperCase()} ${endpoint.path}`);

    const response = await axios({
      method: endpoint.method,
      url: `${API_BASE_URL}${endpoint.path}`,
      params: endpoint.params,
      timeout: 10000 // 10 seconds timeout
    });

    logger.info(`✅ ${endpoint.name}: ${response.status} ${response.statusText}`);

    // Log response data summary
    if (response.data) {
      if (Array.isArray(response.data)) {
        logger.info(`   Response: Array with ${response.data.length} items`);
      } else if (typeof response.data === 'object') {
        logger.info(`   Response: Object with keys: ${Object.keys(response.data).join(', ')}`);
      } else {
        logger.info(`   Response: ${response.data}`);
      }
    }

    return true;
  } catch (error) {
    logger.error(`❌ ${endpoint.name} failed: ${error.message}`);

    if (error.response) {
      logger.error(`   Status: ${error.response.status}`);
      logger.error(`   Data: ${JSON.stringify(error.response.data)}`);
    }

    return false;
  }
}

// Run all tests
async function runTests() {
  logger.info(`Starting API tests against ${API_BASE_URL}`);

  let passed = 0;
  let failed = 0;

  for (const endpoint of endpoints) {
    const success = await testEndpoint(endpoint);
    if (success) {
      passed++;
    } else {
      failed++;
    }
  }

  logger.info(`\nTest Summary: ${passed} passed, ${failed} failed`);

  return failed === 0;
}

// Run if this script is executed directly
if (require.main === module) {
  runTests()
    .then(success => {
      if (success) {
        logger.info('All tests passed!');
        process.exit(0);
      } else {
        logger.error('Some tests failed!');
        process.exit(1);
      }
    })
    .catch(error => {
      logger.error('Error running tests:', error);
      process.exit(1);
    });
}

module.exports = { runTests };
