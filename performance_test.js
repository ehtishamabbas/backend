// Performance test script
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
    iterations: 50
  },
  {
    name: 'Get Listings (Small)',
    pythonEndpoint: '/api/listings',
    nodeEndpoint: '/api/listings',
    method: 'get',
    params: { limit: 10 },
    iterations: 20
  },
  {
    name: 'Get Listings (Medium)',
    pythonEndpoint: '/api/listings',
    nodeEndpoint: '/api/listings',
    method: 'get',
    params: { limit: 50 },
    iterations: 10
  },
  {
    name: 'Get Listings (Large)',
    pythonEndpoint: '/api/listings',
    nodeEndpoint: '/api/listings',
    method: 'get',
    params: { limit: 100 },
    iterations: 5
  },
  {
    name: 'Get Property Types',
    pythonEndpoint: '/api/listings/property-type',
    nodeEndpoint: '/api/listings/property-type',
    method: 'get',
    params: {},
    iterations: 20
  },
  {
    name: 'Autocomplete',
    pythonEndpoint: '/api/autocomplete',
    nodeEndpoint: '/api/autocomplete',
    method: 'get',
    params: { query: 'San' },
    iterations: 20
  }
];

// Test function
async function testEndpointPerformance(testCase, apiUrl, isNode) {
  const type = isNode ? 'Node.js' : 'Python';
  const endpoint = isNode ? testCase.nodeEndpoint : testCase.pythonEndpoint;
  const durations = [];

  logger.info(`Testing ${type} ${testCase.name} (${testCase.iterations} iterations)...`);

  for (let i = 0; i < testCase.iterations; i++) {
    const start = Date.now();

    try {
      await axios({
        method: testCase.method,
        url: `${apiUrl}${endpoint}`,
        params: testCase.params,
        timeout: 30000 // 30 seconds timeout
      });

      const duration = Date.now() - start;
      durations.push(duration);

      if ((i + 1) % 5 === 0 || i === testCase.iterations - 1) {
        logger.info(`   ${type} ${testCase.name}: ${i + 1}/${testCase.iterations} completed`);
      }
    } catch (error) {
      logger.error(`   ${type} ${testCase.name} iteration ${i + 1} failed: ${error.message}`);
      durations.push(null); // Mark as failed
    }

    // Small delay between requests to avoid overwhelming the server
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Calculate statistics
  const successfulDurations = durations.filter(d => d !== null);

  if (successfulDurations.length === 0) {
    return {
      type,
      endpoint,
      success: false,
      error: 'All iterations failed'
    };
  }

  const min = Math.min(...successfulDurations);
  const max = Math.max(...successfulDurations);
  const avg = successfulDurations.reduce((sum, d) => sum + d, 0) / successfulDurations.length;
  const median = getMedian(successfulDurations);
  const successRate = (successfulDurations.length / testCase.iterations) * 100;

  return {
    type,
    endpoint,
    success: true,
    iterations: testCase.iterations,
    successful: successfulDurations.length,
    successRate,
    min,
    max,
    avg,
    median,
    durations
  };
}

// Helper function to calculate median
function getMedian(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  } else {
    return sorted[middle];
  }
}

// Run all tests
async function runTests() {
  logger.info(`Starting performance tests between Python (${PYTHON_API_URL}) and Node.js (${NODEJS_API_URL})`);

  const results = [];

  for (const testCase of testCases) {
    // Test Python API
    const pythonResult = await testEndpointPerformance(testCase, PYTHON_API_URL, false);

    // Test Node.js API
    const nodeResult = await testEndpointPerformance(testCase, NODEJS_API_URL, true);

    // Compare results
    if (pythonResult.success && nodeResult.success) {
      const improvement = ((pythonResult.avg - nodeResult.avg) / pythonResult.avg) * 100;

      logger.info(`\nResults for ${testCase.name}:`);
      logger.info(`   Python: ${pythonResult.avg.toFixed(2)}ms avg, ${pythonResult.median.toFixed(2)}ms median`);
      logger.info(`   Node.js: ${nodeResult.avg.toFixed(2)}ms avg, ${nodeResult.median.toFixed(2)}ms median`);
      logger.info(`   Difference: ${improvement.toFixed(2)}% ${improvement > 0 ? 'faster' : 'slower'} with Node.js`);

      results.push({
        testCase: testCase.name,
        pythonResult,
        nodeResult,
        improvement
      });
    } else {
      logger.error(`\nCould not compare ${testCase.name} due to test failures`);

      results.push({
        testCase: testCase.name,
        pythonResult,
        nodeResult,
        error: 'Test failures prevented comparison'
      });
    }
  }

  // Generate report
  const report = {
    timestamp: new Date().toISOString(),
    pythonApi: PYTHON_API_URL,
    nodeApi: NODEJS_API_URL,
    summary: {
      total: results.length,
      improvements: results.filter(r => r.improvement && r.improvement > 0).length,
      regressions: results.filter(r => r.improvement && r.improvement <= 0).length,
      errors: results.filter(r => r.error).length
    },
    results
  };

  const reportPath = path.join(__dirname, 'logs', 'performance_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  logger.info(`\nReport saved to ${reportPath}`);

  return report;
}

// Run if this script is executed directly
if (require.main === module) {
  runTests()
    .then(report => {
      logger.info('\nPerformance Test Summary:');
      logger.info(`   Total tests: ${report.summary.total}`);
      logger.info(`   Improvements: ${report.summary.improvements}`);
      logger.info(`   Regressions: ${report.summary.regressions}`);
      logger.info(`   Errors: ${report.summary.errors}`);
      process.exit(0);
    })
    .catch(error => {
      logger.error('Error running tests:', error);
      process.exit(1);
    });
}

module.exports = { runTests };
