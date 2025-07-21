#!/usr/bin/env node

// Comprehensive test script for the Node.js backend
require('dotenv').config();
const { validateEnvironment } = require('./validate_env');
const { initializeDatabase } = require('./db_init');
const { runTests: runApiTests } = require('./test_api');
const { runTests: runFeatureParityTests } = require('./feature_parity_test');
const { runTests: runPerformanceTests } = require('./performance_test');
const logger = require('./logger');
const { spawn } = require('child_process');
const axios = require('axios');

// Configuration
const NODE_API_URL = process.env.NODE_API_URL || 'http://localhost:3000';
const MAX_STARTUP_WAIT = 30000; // 30 seconds
const STARTUP_CHECK_INTERVAL = 1000; // 1 second

// Command line arguments
const args = process.argv.slice(2);
const runAll = args.includes('--all') || args.length === 0;
const runValidation = args.includes('--validate') || runAll;
const runDbInit = args.includes('--db-init') || runAll;
const runServer = args.includes('--server') || runAll;
const runApiTest = args.includes('--api-test') || runAll;
const runFeatureParity = args.includes('--feature-parity') || runAll;
const runPerformance = args.includes('--performance') || runAll;

// Server process reference
let serverProcess = null;

// Wait for server to be ready
async function waitForServer() {
  logger.info(`Waiting for server to be ready at ${NODE_API_URL}...`);

  const startTime = Date.now();

  while (Date.now() - startTime < MAX_STARTUP_WAIT) {
    try {
      const response = await axios.get(`${NODE_API_URL}/health`);

      if (response.status === 200) {
        logger.info('Server is ready!');
        return true;
      }
    } catch (error) {
      // Ignore errors and keep trying
    }

    await new Promise(resolve => setTimeout(resolve, STARTUP_CHECK_INTERVAL));
  }

  logger.error(`Server did not become ready within ${MAX_STARTUP_WAIT / 1000} seconds`);
  return false;
}

// Start server
function startServer() {
  logger.info('Starting server...');

  serverProcess = spawn('node', ['index.js', '--server'], {
    stdio: 'pipe',
    detached: false
  });

  serverProcess.stdout.on('data', data => {
    process.stdout.write(`[SERVER] ${data}`);
  });

  serverProcess.stderr.on('data', data => {
    process.stderr.write(`[SERVER] ${data}`);
  });

  serverProcess.on('error', error => {
    logger.error(`Failed to start server: ${error.message}`);
  });

  serverProcess.on('close', code => {
    logger.info(`Server process exited with code ${code}`);
  });

  return serverProcess;
}

// Stop server
function stopServer() {
  if (serverProcess) {
    logger.info('Stopping server...');

    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', serverProcess.pid, '/f', '/t']);
    } else {
      serverProcess.kill('SIGINT');
    }

    serverProcess = null;
  }
}

// Run all tests
async function runAllTests() {
  let success = true;

  try {
    // Step 1: Validate environment
    if (runValidation) {
      logger.info('\n=== STEP 1: Environment Validation ===');
      const isValid = validateEnvironment();

      if (!isValid) {
        logger.error('Environment validation failed');
        return false;
      }

      logger.info('Environment validation passed');
    }

    // Step 2: Initialize database
    if (runDbInit) {
      logger.info('\n=== STEP 2: Database Initialization ===');
      await initializeDatabase();
      logger.info('Database initialization completed');
    }

    // Step 3: Start server (if needed)
    let startedServer = false;

    if (runServer) {
      logger.info('\n=== STEP 3: Starting Server ===');
      startServer();
      startedServer = true;

      const serverReady = await waitForServer();
      if (!serverReady) {
        logger.error('Server failed to start');
        return false;
      }
    }

    // Step 4: Run API tests
    if (runApiTest) {
      logger.info('\n=== STEP 4: API Tests ===');
      const apiTestsSuccess = await runApiTests();

      if (!apiTestsSuccess) {
        logger.error('API tests failed');
        success = false;
      } else {
        logger.info('API tests passed');
      }
    }

    // Step 5: Run feature parity tests
    if (runFeatureParity) {
      logger.info('\n=== STEP 5: Feature Parity Tests ===');

      try {
        const featureParitySuccess = await runFeatureParityTests();

        if (!featureParitySuccess) {
          logger.error('Feature parity tests failed');
          success = false;
        } else {
          logger.info('Feature parity tests passed');
        }
      } catch (error) {
        logger.error(`Feature parity tests error: ${error.message}`);
        success = false;
      }
    }

    // Step 6: Run performance tests
    if (runPerformance) {
      logger.info('\n=== STEP 6: Performance Tests ===');

      try {
        const performanceReport = await runPerformanceTests();

        logger.info('\nPerformance Test Summary:');
        logger.info(`   Total tests: ${performanceReport.summary.total}`);
        logger.info(`   Improvements: ${performanceReport.summary.improvements}`);
        logger.info(`   Regressions: ${performanceReport.summary.regressions}`);
        logger.info(`   Errors: ${performanceReport.summary.errors}`);

        if (performanceReport.summary.errors > 0) {
          logger.warn('Some performance tests had errors');
          success = false;
        }
      } catch (error) {
        logger.error(`Performance tests error: ${error.message}`);
        success = false;
      }
    }

    // Stop server if we started it
    if (startedServer) {
      stopServer();
    }

    return success;
  } catch (error) {
    logger.error(`Test execution error: ${error.message}`);

    // Make sure to stop the server if we started it
    if (serverProcess) {
      stopServer();
    }

    return false;
  }
}

// Run if this script is executed directly
if (require.main === module) {
  runAllTests()
    .then(success => {
      if (success) {
        logger.info('\n=== All tests completed successfully! ===');
        process.exit(0);
      } else {
        logger.error('\n=== Some tests failed! ===');
        process.exit(1);
      }
    })
    .catch(error => {
      logger.error(`Error running tests: ${error.message}`);
      process.exit(1);
    });
}

module.exports = { runAllTests };
