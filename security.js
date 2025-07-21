/**
 * Security configuration for the Node.js backend
 * This module provides middleware and utilities for securing the API
 */

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const logger = require('./logger');

/**
 * Configure security middleware for Express app
 * @param {object} app - Express app instance
 */
function configureSecurityMiddleware(app) {
  // Use Helmet for security headers
  app.use(helmet());

  // Configure CORS
  const corsOptions = {
    origin: process.env.CORS_ALLOWED_ORIGINS ?
      process.env.CORS_ALLOWED_ORIGINS.split(',') :
      '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400 // 24 hours
  };
  app.use(cors(corsOptions));

  // Rate limiting
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.RATE_LIMIT_MAX_REQUESTS ?
      parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) :
      100, // limit each IP to 100 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
    message: 'Too many requests from this IP, please try again later',
    handler: (req, res, next, options) => {
      logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
      res.status(options.statusCode).send(options.message);
    }
  });

  // Apply rate limiting to all API routes
  app.use('/api/', apiLimiter);

  // Prevent clickjacking
  app.use((req, res, next) => {
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  });

  // Disable X-Powered-By header
  app.disable('x-powered-by');

  // Log security-related events
  app.use((req, res, next) => {
    // Log suspicious requests (e.g., SQL injection attempts)
    const url = req.url.toLowerCase();
    if (url.includes('select') && url.includes('from') ||
        url.includes('union') && url.includes('select') ||
        url.includes('drop') && url.includes('table') ||
        url.includes('--') || url.includes(';')) {
      logger.warn(`Potential SQL injection attempt: ${req.method} ${req.url} from ${req.ip}`);
    }

    // Log potential XSS attempts
    if (url.includes('<script>') || url.includes('javascript:') || url.includes('onerror=')) {
      logger.warn(`Potential XSS attempt: ${req.method} ${req.url} from ${req.ip}`);
    }

    next();
  });
}

/**
 * Validate and sanitize request parameters
 * @param {object} req - Express request object
 * @param {object} schema - Validation schema
 * @returns {object} - Validation result
 */
function validateRequest(req, schema) {
  // This is a simple implementation
  // In a production app, you might want to use a library like Joi or express-validator
  const errors = [];
  const sanitized = {};

  // Combine query and body parameters
  const params = { ...req.query, ...req.body };

  // Validate each field against schema
  Object.keys(schema).forEach(field => {
    const fieldSchema = schema[field];
    const value = params[field];

    // Check required fields
    if (fieldSchema.required && (value === undefined || value === null || value === '')) {
      errors.push(`${field} is required`);
      return;
    }

    // Skip validation if field is not present and not required
    if (value === undefined || value === null) {
      return;
    }

    // Type validation
    if (fieldSchema.type) {
      let valid = true;

      switch (fieldSchema.type) {
      case 'string':
        valid = typeof value === 'string';
        break;
      case 'number':
        valid = !isNaN(Number(value));
        break;
      case 'boolean':
        valid = value === true || value === false || value === 'true' || value === 'false';
        break;
      case 'array':
        valid = Array.isArray(value);
        break;
      case 'object':
        valid = typeof value === 'object' && !Array.isArray(value) && value !== null;
        break;
      }

      if (!valid) {
        errors.push(`${field} must be a ${fieldSchema.type}`);
        return;
      }
    }

    // Min/max validation for strings and arrays
    if (fieldSchema.type === 'string' || fieldSchema.type === 'array') {
      if (fieldSchema.min !== undefined && value.length < fieldSchema.min) {
        errors.push(`${field} must be at least ${fieldSchema.min} characters long`);
      }

      if (fieldSchema.max !== undefined && value.length > fieldSchema.max) {
        errors.push(`${field} must be at most ${fieldSchema.max} characters long`);
      }
    }

    // Min/max validation for numbers
    if (fieldSchema.type === 'number') {
      const numValue = Number(value);

      if (fieldSchema.min !== undefined && numValue < fieldSchema.min) {
        errors.push(`${field} must be at least ${fieldSchema.min}`);
      }

      if (fieldSchema.max !== undefined && numValue > fieldSchema.max) {
        errors.push(`${field} must be at most ${fieldSchema.max}`);
      }
    }

    // Pattern validation
    if (fieldSchema.pattern && !new RegExp(fieldSchema.pattern).test(value)) {
      errors.push(`${field} has an invalid format`);
    }

    // Enum validation
    if (fieldSchema.enum && !fieldSchema.enum.includes(value)) {
      errors.push(`${field} must be one of: ${fieldSchema.enum.join(', ')}`);
    }

    // Sanitize value
    let sanitizedValue = value;

    if (fieldSchema.type === 'string') {
      // Escape HTML
      sanitizedValue = String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    } else if (fieldSchema.type === 'number') {
      sanitizedValue = Number(value);
    } else if (fieldSchema.type === 'boolean') {
      sanitizedValue = value === true || value === 'true';
    }

    sanitized[field] = sanitizedValue;
  });

  return { valid: errors.length === 0, errors, sanitized };
}

/**
 * Create middleware for request validation
 * @param {object} schema - Validation schema
 * @returns {function} - Express middleware
 */
function validateRequestMiddleware(schema) {
  return (req, res, next) => {
    const { valid, errors, sanitized } = validateRequest(req, schema);

    if (!valid) {
      return res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors
      });
    }

    // Attach sanitized parameters to request
    req.sanitized = sanitized;
    next();
  };
}

/**
 * Create authentication middleware
 * @param {object} options - Authentication options
 * @returns {function} - Express middleware
 */
function authMiddleware(options = {}) {
  return (req, res, next) => {
    // This is a placeholder for actual authentication logic
    // In a real app, you would verify tokens, check permissions, etc.
    const apiKey = req.headers['x-api-key'];

    if (options.requireApiKey && !apiKey) {
      logger.warn(`Authentication failed: Missing API key from ${req.ip}`);
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required'
      });
    }

    if (options.requireApiKey && apiKey !== process.env.API_KEY) {
      logger.warn(`Authentication failed: Invalid API key from ${req.ip}`);
      return res.status(401).json({
        status: 'error',
        message: 'Invalid API key'
      });
    }

    next();
  };
}

module.exports = {
  configureSecurityMiddleware,
  validateRequest,
  validateRequestMiddleware,
  authMiddleware
};
