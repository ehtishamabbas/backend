#!/usr/bin/env node

/**
 * Load testing script for the Node.js backend API
 * This script simulates high traffic to test API performance under load
 */

require('dotenv').config();
const axios = require('axios');
const { performance } = require('perf_hooks');
const logger = require('./logger');

// Configuration
const API_URL = process.env.NODEJS_API_URL || 'http://localhost:3000';
const CONCURRENT_USERS = parseInt(process.argv[2] || '10', 10);
const TEST_DURATION_SECONDS = parseInt(process.argv[3] || '60', 10);
const REQUEST_TIMEOUT = 30000; // 30 seconds

// Test scenarios
const scenarios = [
  {
    name: 'Get Listings (Default)',
    endpoint: '/api/listings',
    method: 'get',
    params: {},
    weight: 10 // Higher weight means this scenario will be chosen more often
  },
  {
    name: 'Get Listings (Filtered)',
    endpoint: '/api/listings',
    method: 'get',
    params: { property_type: 'Residential', min_price: 100000, max_price: 500000 },
    weight: 5
  },
  {
    name: 'Get Listings (Pagination)',
    endpoint: '/api/listings',
    method: 'get',
    params: { skip: 10, limit: 10 },
    weight: 3
  },
  {
    name: 'Get Property Types',
    endpoint: '/api/listings/property-type',
    method: 'get',
    params: {},
    weight: 2
  },
  {
    name: 'Autocomplete',
    endpoint: '/api/autocomplete',
    method: 'get',
    params: { query: 'San' },
    weight: 3
  },
  {
    name: 'Health Check',
    endpoint: '/health',
    method: 'get',
    params: {},
    weight: 1
  }
];

// Weighted random selection
function selectScenario() {
  const totalWeight = scenarios.reduce((sum, scenario) => sum + scenario.weight, 0);
  let random = Math.random() * totalWeight;

  for (const scenario of scenarios) {
    random -= scenario.weight;
    if (random <= 0) {
      return scenario;
    }
  }

  return scenarios[0]; // Fallback
}

// Execute a single request
async function executeRequest(userId) {
  const scenario = selectScenario();
  const startTime = performance.now();
  let success = false;
  let statusCode = 0;
  let errorMessage = null;

  try {
    const response = await axios({
      method: scenario.method,
      url: `${API_URL}${scenario.endpoint}`,
      params: scenario.params,
      timeout: REQUEST_TIMEOUT
    });

    success = true;
    statusCode = response.status;
  } catch (error) {
    success = false;
    statusCode = error.response?.status || 0;
    errorMessage = error.message;
  }

  const duration = performance.now() - startTime;

  return {
    userId,
    scenario: scenario.name,
    endpoint: scenario.endpoint,
    success,
    statusCode,
    duration,
    errorMessage,
    timestamp: new Date().toISOString()
  };
}

// Simulate a user session
async function simulateUser(userId) {
  const results = [];
  const startTime = Date.now();

  while (Date.now() - startTime < TEST_DURATION_SECONDS * 1000) {
    const result = await executeRequest(userId);
    results.push(result);

    // Random delay between requests (100ms to 2000ms)
    const delay = 100 + Math.random() * 1900;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  return results;
}

// Run the load test
async function runLoadTest() {
  logger.info(`Starting load test with ${CONCURRENT_USERS} concurrent users for ${TEST_DURATION_SECONDS} seconds`);
  logger.info(`Target API: ${API_URL}`);

  const startTime = Date.now();
  const userPromises = [];

  for (let i = 1; i <= CONCURRENT_USERS; i++) {
    userPromises.push(simulateUser(i));
  }

  const allResults = await Promise.all(userPromises);
  const results = allResults.flat();

  const endTime = Date.now();
  const totalDuration = (endTime - startTime) / 1000;

  // Calculate statistics
  const totalRequests = results.length;
  const successfulRequests = results.filter(r => r.success).length;
  const failedRequests = totalRequests - successfulRequests;
  const successRate = (successfulRequests / totalRequests) * 100;
  const requestsPerSecond = totalRequests / totalDuration;

  const durations = results.map(r => r.duration);
  const avgResponseTime = durations.reduce((sum, d) => sum + d, 0) / durations.length;
  const minResponseTime = Math.min(...durations);
  const maxResponseTime = Math.max(...durations);

  // Calculate percentiles
  durations.sort((a, b) => a - b);
  const p50 = durations[Math.floor(durations.length * 0.5)];
  const p90 = durations[Math.floor(durations.length * 0.9)];
  const p95 = durations[Math.floor(durations.length * 0.95)];
  const p99 = durations[Math.floor(durations.length * 0.99)];

  // Group by endpoint
  const endpointStats = {};

  for (const result of results) {
    if (!endpointStats[result.endpoint]) {
      endpointStats[result.endpoint] = {
        total: 0,
        successful: 0,
        failed: 0,
        durations: []
      };
    }

    endpointStats[result.endpoint].total++;

    if (result.success) {
      endpointStats[result.endpoint].successful++;
    } else {
      endpointStats[result.endpoint].failed++;
    }

    endpointStats[result.endpoint].durations.push(result.duration);
  }

  // Calculate endpoint statistics
  for (const endpoint in endpointStats) {
    const stats = endpointStats[endpoint];
    stats.successRate = (stats.successful / stats.total) * 100;
    stats.avgResponseTime = stats.durations.reduce((sum, d) => sum + d, 0) / stats.durations.length;
    stats.minResponseTime = Math.min(...stats.durations);
    stats.maxResponseTime = Math.max(...stats.durations);

    // Calculate percentiles
    stats.durations.sort((a, b) => a - b);
    stats.p50 = stats.durations[Math.floor(stats.durations.length * 0.5)];
    stats.p90 = stats.durations[Math.floor(stats.durations.length * 0.9)];
    stats.p95 = stats.durations[Math.floor(stats.durations.length * 0.95)];

    // Remove raw durations to keep the output clean
    delete stats.durations;
  }

  // Generate report
  const report = {
    summary: {
      concurrentUsers: CONCURRENT_USERS,
      duration: totalDuration,
      totalRequests,
      successfulRequests,
      failedRequests,
      successRate,
      requestsPerSecond,
      responseTime: {
        min: minResponseTime,
        max: maxResponseTime,
        avg: avgResponseTime,
        p50,
        p90,
        p95,
        p99
      }
    },
    endpoints: endpointStats
  };

  // Log report
  logger.info('\n=== Load Test Report ===');
  logger.info(`Duration: ${totalDuration.toFixed(2)} seconds`);
  logger.info(`Concurrent Users: ${CONCURRENT_USERS}`);
  logger.info(`Total Requests: ${totalRequests}`);
  logger.info(`Successful Requests: ${successfulRequests}`);
  logger.info(`Failed Requests: ${failedRequests}`);
  logger.info(`Success Rate: ${successRate.toFixed(2)}%`);
  logger.info(`Requests Per Second: ${requestsPerSecond.toFixed(2)}`);
  logger.info('\nResponse Time:');
  logger.info(`  Min: ${minResponseTime.toFixed(2)}ms`);
  logger.info(`  Max: ${maxResponseTime.toFixed(2)}ms`);
  logger.info(`  Avg: ${avgResponseTime.toFixed(2)}ms`);
  logger.info(`  P50: ${p50.toFixed(2)}ms`);
  logger.info(`  P90: ${p90.toFixed(2)}ms`);
  logger.info(`  P95: ${p95.toFixed(2)}ms`);
  logger.info(`  P99: ${p99.toFixed(2)}ms`);

  logger.info('\nEndpoint Statistics:');

  for (const endpoint in endpointStats) {
    const stats = endpointStats[endpoint];
    logger.info(`\n${endpoint}:`);
    logger.info(`  Requests: ${stats.total}`);
    logger.info(`  Success Rate: ${stats.successRate.toFixed(2)}%`);
    logger.info(`  Avg Response Time: ${stats.avgResponseTime.toFixed(2)}ms`);
    logger.info(`  Min Response Time: ${stats.minResponseTime.toFixed(2)}ms`);
    logger.info(`  Max Response Time: ${stats.maxResponseTime.toFixed(2)}ms`);
    logger.info(`  P50: ${stats.p50.toFixed(2)}ms`);
    logger.info(`  P90: ${stats.p90.toFixed(2)}ms`);
    logger.info(`  P95: ${stats.p95.toFixed(2)}ms`);
  }

  return report;
}

// Run if this script is executed directly
if (require.main === module) {
  runLoadTest()
    .then(() => {
      logger.info('\nLoad test completed successfully!');
      process.exit(0);
    })
    .catch(error => {
      logger.error(`Load test error: ${error.message}`);
      process.exit(1);
    });
}

module.exports = { runLoadTest };
