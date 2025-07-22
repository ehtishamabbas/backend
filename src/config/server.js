import express from 'express';
import cors from 'cors';
import { validateEnvironment } from '../utils/validateEnv.js';
import { configureSecurityMiddleware } from '../middleware/security.js';

// Server configuration
const PORT = process.env.PORT || 3000;

/**
 * Configure and create Express app
 */
function createApp() {
  // Create Express app
  const app = express();

  // Basic middleware
  app.use(express.json());
  app.use(cors());

  // Configure security middleware
  configureSecurityMiddleware(app);

  return app;
}

/**
 * Start the Express server
 */
async function startServer(app) {
  // Validate environment variables
  if (!validateEnvironment()) {
    console.error('Environment validation failed. Exiting...');
    process.exit(1);
  }

  // Start the server
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('Shutting down server...');
    process.exit(0);
  });
}

export {
  createApp,
  startServer
};
