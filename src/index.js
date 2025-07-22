import 'dotenv/config';
import { startServer } from './config/server.js';
import { connectToMongoDB } from './config/database.js';
import { initializeApp } from './app.js';

// Command line arguments
const args = process.argv.slice(2);
const runServer = args.includes('--server') || args.length === 0; // Default to server if no args

/**
 * Main application entry point
 */
async function main() {
  try {
    // Connect to MongoDB
    await connectToMongoDB();

    // Initialize and start the server if requested
    if (runServer) {
      console.log('Starting API server...');
      const app = await initializeApp();
      await startServer(app);
    }
  } catch (error) {
    console.error('Error in main application:', error);
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, _promise) => {
  console.error('Unhandled promise rejection:', reason);
  process.exit(1);
});

// Start the application
main();
