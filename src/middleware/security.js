const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

/**
 * Configure security middleware for Express app
 * @param {object} app - Express app
 */
function configureSecurityMiddleware(app) {
  // Use Helmet for security headers
  app.use(helmet());

  // Rate limiting
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many requests from this IP, please try again after 15 minutes'
  });

  // Apply rate limiting to all routes
  app.use('/api/', apiLimiter);
}

/**
 * Validate request parameters middleware
 * @param {object} schema - Schema for validation
 * @returns {function} - Express middleware
 */
function validateRequestMiddleware(schema) {
  return (req, res, next) => {
    try {
      // Validate query parameters
      for (const [param, rules] of Object.entries(schema)) {
        const value = req.query[param];

        // Check if required
        if (rules.required && (value === undefined || value === '')) {
          return res.status(400).json({ error: `${param} is required` });
        }

        // Skip validation if not required and not provided
        if (!rules.required && (value === undefined || value === '')) {
          continue;
        }

        // Type validation
        if (rules.type === 'string') {
          // String validation
          if (rules.min && value.length < rules.min) {
            return res.status(400).json({ error: `${param} must be at least ${rules.min} characters` });
          }
          if (rules.max && value.length > rules.max) {
            return res.status(400).json({ error: `${param} must be at most ${rules.max} characters` });
          }
          if (rules.enum && !rules.enum.includes(value)) {
            return res.status(400).json({ error: `${param} must be one of: ${rules.enum.join(', ')}` });
          }
        } else if (rules.type === 'number') {
          // Number validation
          const numValue = Number(value);
          if (isNaN(numValue)) {
            return res.status(400).json({ error: `${param} must be a number` });
          }
          if (rules.min !== undefined && numValue < rules.min) {
            return res.status(400).json({ error: `${param} must be at least ${rules.min}` });
          }
          if (rules.max !== undefined && numValue > rules.max) {
            return res.status(400).json({ error: `${param} must be at most ${rules.max}` });
          }
        }
      }

      next();
    } catch (error) {
      console.error(`Validation error: ${error}`);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

module.exports = {
  configureSecurityMiddleware,
  validateRequestMiddleware
};
