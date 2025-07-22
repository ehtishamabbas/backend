import { createApp } from './config/server.js';

// Import routes
import listingsRoutes from './routes/listings.js';
import autocompleteRoutes from './routes/autocomplete.js';
import countiesRoutes from './routes/counties.js';
import utilityRoutes from './routes/utility.js';

/**
 * Initialize the application
 */
const initializeApp = async () => {
  try {
    // Create Express app
    const app = createApp();

    // Register routes
    app.use('/api/listings', listingsRoutes);
    app.use('/api/autocomplete', autocompleteRoutes);
    app.use('/api/counties', countiesRoutes);
    app.use('/', utilityRoutes);

    console.log('App initialized successfully');
    return app;
  } catch (error) {
    console.error('Error initializing app:', error);
    throw error;
  }
};

export { initializeApp };
