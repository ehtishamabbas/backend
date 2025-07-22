const { createApp } = require('./config/server');

// Import routes
const listingsRoutes = require('./routes/listings');
const autocompleteRoutes = require('./routes/autocomplete');
const countiesRoutes = require('./routes/counties');
const utilityRoutes = require('./routes/utility');

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

module.exports = {
  initializeApp
};
