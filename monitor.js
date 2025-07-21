#!/usr/bin/env node

/**
 * Monitoring script for the Node.js backend
 * This script periodically checks the health of the API and crawler services
 * and sends notifications if issues are detected
 */

require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { MongoClient } = require('mongodb');
const logger = require('./logger');

// Configuration
const API_URL = process.env.NODEJS_API_URL || 'http://localhost:3000';
const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017';
const DATABASE_NAME = process.env.DATABASE_NAME || 'real_estate';
const MONGODB_COLLECTION = process.env.MONGODB_COLLECTION || 'listings';
const CHECK_INTERVAL = parseInt(process.env.MONITOR_CHECK_INTERVAL || '300000', 10); // 5 minutes
const NOTIFICATION_EMAIL = process.env.NOTIFICATION_EMAIL;
const NOTIFICATION_WEBHOOK = process.env.NOTIFICATION_WEBHOOK;

// State tracking
const state = {
  apiHealthy: true,
  dbHealthy: true,
  lastListingUpdate: null,
  lastNotification: null,
  systemStats: {
    cpuUsage: 0,
    memoryUsage: 0,
    diskUsage: 0
  }
};

/**
 * Check API health
 * @returns {Promise<boolean>} - True if healthy
 */
async function checkApiHealth() {
  try {
    const response = await axios.get(`${API_URL}/health`, { timeout: 5000 });
    return response.status === 200 && response.data.status === 'ok';
  } catch (error) {
    logger.error(`API health check failed: ${error.message}`);
    return false;
  }
}

/**
 * Check database health and last update time
 * @returns {Promise<{healthy: boolean, lastUpdate: Date|null}>}
 */
async function checkDatabaseHealth() {
  let client;

  try {
    client = new MongoClient(MONGODB_URL, { useUnifiedTopology: true });
    await client.connect();

    const db = client.db(DATABASE_NAME);
    const collection = db.collection(MONGODB_COLLECTION);

    // Check if collection exists and has documents
    const count = await collection.countDocuments();

    if (count === 0) {
      return { healthy: false, lastUpdate: null };
    }

    // Get the most recently updated document
    const latestListing = await collection.find()
      .sort({ _updated_at: -1 })
      .limit(1)
      .toArray();

    const lastUpdate = latestListing.length > 0 ? latestListing[0]._updated_at : null;

    return { healthy: true, lastUpdate };
  } catch (error) {
    logger.error(`Database health check failed: ${error.message}`);
    return { healthy: false, lastUpdate: null };
  } finally {
    if (client) {
      await client.close();
    }
  }
}

/**
 * Check system resources
 * @returns {Promise<{cpuUsage: number, memoryUsage: number, diskUsage: number}>}
 */
async function checkSystemResources() {
  try {
    // CPU usage (average load)
    const cpuLoad = os.loadavg()[0];
    const cpuCount = os.cpus().length;
    const cpuUsage = (cpuLoad / cpuCount) * 100;

    // Memory usage
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const memoryUsage = ((totalMemory - freeMemory) / totalMemory) * 100;

    // Disk usage (only works on Linux/Unix)
    let diskUsage = 0;

    if (process.platform !== 'win32') {
      try {
        const { exec } = require('child_process');
        const diskData = await new Promise((resolve, reject) => {
          exec('df -h / | tail -1 | awk \'{print $5}\'', (error, stdout) => {
            if (error) {
              reject(error);
              return;
            }
            resolve(stdout.trim());
          });
        });

        diskUsage = parseInt(diskData.replace('%', ''), 10);
      } catch (error) {
        logger.error(`Failed to get disk usage: ${error.message}`);
      }
    }

    return { cpuUsage, memoryUsage, diskUsage };
  } catch (error) {
    logger.error(`System resources check failed: ${error.message}`);
    return { cpuUsage: 0, memoryUsage: 0, diskUsage: 0 };
  }
}

/**
 * Send notification about issues
 * @param {string} message - Notification message
 */
async function sendNotification(message) {
  // Avoid sending too many notifications
  const now = new Date();
  if (state.lastNotification && (now - state.lastNotification) < 3600000) { // 1 hour
    logger.info(`Skipping notification, last one sent ${Math.round((now - state.lastNotification) / 60000)} minutes ago`);
    return;
  }

  logger.warn(`Sending notification: ${message}`);

  // Log to file
  const logFile = path.join(__dirname, 'logs', 'monitoring_alerts.log');
  fs.appendFileSync(logFile, `[${now.toISOString()}] ${message}\n`);

  // Send email if configured
  if (NOTIFICATION_EMAIL) {
    try {
      // This is a placeholder - implement actual email sending
      logger.info(`Would send email to ${NOTIFICATION_EMAIL}: ${message}`);
    } catch (error) {
      logger.error(`Failed to send email: ${error.message}`);
    }
  }

  // Send webhook if configured
  if (NOTIFICATION_WEBHOOK) {
    try {
      await axios.post(NOTIFICATION_WEBHOOK, {
        text: `[ALERT] ${message}`,
        timestamp: now.toISOString()
      });
    } catch (error) {
      logger.error(`Failed to send webhook: ${error.message}`);
    }
  }

  state.lastNotification = now;
}

/**
 * Check for stale data
 * @param {Date} lastUpdate - Last update timestamp
 * @returns {boolean} - True if data is stale
 */
function isDataStale(lastUpdate) {
  if (!lastUpdate) return true;

  const now = new Date();
  const lastUpdateTime = new Date(lastUpdate);
  const hoursSinceUpdate = (now - lastUpdateTime) / (1000 * 60 * 60);

  // Consider data stale if no updates in 24 hours
  return hoursSinceUpdate > 24;
}

/**
 * Run all checks
 */
async function runChecks() {
  logger.info('Running monitoring checks...');

  // Check API health
  const apiHealthy = await checkApiHealth();

  if (apiHealthy !== state.apiHealthy) {
    if (!apiHealthy) {
      await sendNotification('API service is DOWN');
    } else {
      await sendNotification('API service has recovered');
    }
    state.apiHealthy = apiHealthy;
  }

  // Check database health
  const { healthy: dbHealthy, lastUpdate } = await checkDatabaseHealth();

  if (dbHealthy !== state.dbHealthy) {
    if (!dbHealthy) {
      await sendNotification('Database connection is DOWN');
    } else {
      await sendNotification('Database connection has recovered');
    }
    state.dbHealthy = dbHealthy;
  }

  // Check for stale data
  if (lastUpdate) {
    state.lastListingUpdate = lastUpdate;

    if (isDataStale(lastUpdate)) {
      await sendNotification(`Data is stale. Last update was ${new Date(lastUpdate).toISOString()}`);
    }
  }

  // Check system resources
  const systemStats = await checkSystemResources();
  state.systemStats = systemStats;

  // Alert on high resource usage
  if (systemStats.cpuUsage > 80) {
    await sendNotification(`High CPU usage: ${systemStats.cpuUsage.toFixed(1)}%`);
  }

  if (systemStats.memoryUsage > 85) {
    await sendNotification(`High memory usage: ${systemStats.memoryUsage.toFixed(1)}%`);
  }

  if (systemStats.diskUsage > 85) {
    await sendNotification(`High disk usage: ${systemStats.diskUsage.toFixed(1)}%`);
  }

  // Log current state
  logger.info(`Monitoring status: API=${state.apiHealthy ? 'UP' : 'DOWN'}, DB=${state.dbHealthy ? 'UP' : 'DOWN'}, ` +
    `Last update=${state.lastListingUpdate ? new Date(state.lastListingUpdate).toISOString() : 'unknown'}, ` +
    `CPU=${systemStats.cpuUsage.toFixed(1)}%, Memory=${systemStats.memoryUsage.toFixed(1)}%, Disk=${systemStats.diskUsage.toFixed(1)}%`);
}

/**
 * Start monitoring
 */
function startMonitoring() {
  logger.info(`Starting monitoring service for ${API_URL}`);
  logger.info(`Check interval: ${CHECK_INTERVAL / 1000} seconds`);

  // Run initial check
  runChecks();

  // Schedule periodic checks
  setInterval(runChecks, CHECK_INTERVAL);
}

// Run if this script is executed directly
if (require.main === module) {
  startMonitoring();
}

module.exports = { startMonitoring, runChecks };
