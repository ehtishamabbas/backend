// Feature parity test script
require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

// API base URLs
const PYTHON_API_URL = process.env.PYTHON_API_URL || 'http://localhost:8000';
const NODEJS_API_URL = process.env.NODEJS_API_URL || 'http://localhost:3000';

// Test cases
const testCases = [
  {
    name: 'Health Check',
    pythonEndpoint: '/health',
    nodeEndpoint: '/health',
    method: 'get',
    params: {},
    compareFields: ['status']
  },
  {
    name: 'Get Listings',
    pythonEndpoint: '/api/listings',
    nodeEndpoint: '/api/listings',
    method: 'get',
    params: { limit: 5 },
    compareFields: ['total_items', 'total_pages', 'current_page', 'limit']
  },
  {
    name: 'Get Property Types',
    pythonEndpoint: '/api/listings/property-type',
    nodeEndpoint: '/api/listings/property-type',
    method: 'get',
    params: {},
    compareFields: ['property_type', 'property_sub_type']
  },
  {
    name: 'Autocomplete',
    pythonEndpoint: '/api/autocomplete',
    nodeEndpoint: '/api/autocomplete',
    method: 'get',
    params: { query: 'San' },
    compareFields: ['length']
  },
  {
    name: 'Counties Images',
    pythonEndpoint: '/api/counties-images',
    nodeEndpoint: '/api/counties-images',
    method: 'get',
    params: { county: 'San Diego' },
    compareFields: ['length']
  }
];

// Compare responses
function compareResponses(pythonResponse, nodeResponse, compareFields) {
  const differences = [];

  for (const field of compareFields) {
    if (field === 'length' && Array.isArray(pythonResponse)) {
      if (pythonResponse.length !== nodeResponse.length) {
        differences.push(`Length mismatch: Python=${pythonResponse.length}, Node=${nodeResponse.length}`);
      }
    } else {
      const pythonValue = field.includes('.') ?
        field.split('.').reduce((obj, key) => obj && obj[key], pythonResponse) :
        pythonResponse[field];

      const nodeValue = field.includes('.') ?
        field.split('.').reduce((obj, key) => obj && obj[key], nodeResponse) :
        nodeResponse[field];

      if (JSON.stringify(pythonValue) !== JSON.stringify(nodeValue)) {
        differences.push(`Field '${field}' mismatch: Python=${JSON.stringify(pythonValue)}, Node=${JSON.stringify(nodeValue)}`);
      }
    }
  }

  return differences;
}

// Test function
async function testEndpoint(testCase) {
  try {
    logger.info(`Testing ${testCase.name}...`);

    // Call Python API
    const pythonResponse = await axios({
      method: testCase.method,
      url: `${PYTHON_API_URL}${testCase.pythonEndpoint}`,
      params: testCase.params,
      timeout: 10000
    });

    // Call Node.js API
    const nodeResponse = await axios({
      method: testCase.method,
      url: `${NODEJS_API_URL}${testCase.nodeEndpoint}`,
      params: testCase.params,
      timeout: 10000
    });

    // Compare responses
    const differences = compareResponses(
      pythonResponse.data,
      nodeResponse.data,
      testCase.compareFields
    );

    if (differences.length === 0) {
      logger.info(`✅ ${testCase.name}: Responses match`);
      return { success: true, testCase: testCase.name };
    } else {
      logger.error(`❌ ${testCase.name}: Differences found:`);
      for (const diff of differences) {
        logger.error(`   - ${diff}`);
      }
      return { success: false, testCase: testCase.name, differences };
    }
  } catch (error) {
    logger.error(`❌ ${testCase.name} failed: ${error.message}`);

    if (error.response) {
      logger.error(`   Status: ${error.response.status}`);
      logger.error(`   Data: ${JSON.stringify(error.response.data)}`);
    }

    return { success: false, testCase: testCase.name, error: error.message };
  }
}

// Run all tests
async function runTests() {
  logger.info(`Starting feature parity tests between Python (${PYTHON_API_URL}) and Node.js (${NODEJS_API_URL})`);

  const results = [];

  for (const testCase of testCases) {
    const result = await testEndpoint(testCase);
    results.push(result);
  }

  // Generate report
  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  logger.info(`\nTest Summary: ${passed} passed, ${failed} failed`);

  // Save report to file
  const report = {
    timestamp: new Date().toISOString(),
    pythonApi: PYTHON_API_URL,
    nodeApi: NODEJS_API_URL,
    summary: {
      total: results.length,
      passed,
      failed
    },
    results
  };

  const reportPath = path.join(__dirname, 'logs', 'feature_parity_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  logger.info(`Report saved to ${reportPath}`);

  return failed === 0;
}

// Run if this script is executed directly
if (require.main === module) {
  runTests()
    .then(success => {
      if (success) {
        logger.info('All feature parity tests passed!');
        process.exit(0);
      } else {
        logger.error('Some feature parity tests failed!');
        process.exit(1);
      }
    })
    .catch(error => {
      logger.error('Error running tests:', error);
      process.exit(1);
    });
}

module.exports = { runTests };
