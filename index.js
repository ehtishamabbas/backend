// Main entry point for the Node.js backend
require('dotenv').config();
const logger = require('./logger');
const { startServer } = require('./express_service');
const { connectToMongoDB, crawlAndProcess } = require('./trestle_crawler');

// Command line arguments
const args = process.argv.slice(2);
const runCrawler = args.includes('--crawler');
const runServer = args.includes('--server') || !runCrawler; // Default to server if no args

async function main() {
  try {
    // Connect to MongoDB
    await connectToMongoDB();

    // Start the crawler if requested
    if (runCrawler) {
      logger.info('Starting crawler...');
      await crawlAndProcess();
      logger.info('Crawler finished');

      if (!runServer) {
        process.exit(0);
      }
    }

    // Start the server if requested
    if (runServer) {
      logger.info('Starting API server...');
      await startServer();
    }
  } catch (error) {
    logger.error('Error in main application:', error);
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled promise rejection:', reason);
  process.exit(1);
});

// Start the application
main();
