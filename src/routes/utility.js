const express = require('express');
const router = express.Router();
const axios = require('axios');
const { validateRequestMiddleware } = require('../middleware/security');
const logger = require('../utils/logger');

/**
 * @swagger
 * /proxy-image:
 *   get:
 *     summary: Proxy images to avoid CORS issues
 *     parameters:
 *       - in: query
 *         name: url
 *         required: true
 *         schema:
 *           type: string
 *         description: URL of the image to proxy
 *     responses:
 *       200:
 *         description: Image binary data
 *       400:
 *         description: URL parameter is required
 *       404:
 *         description: Image not found
 */
router.get('/proxy-image', validateRequestMiddleware({
  url: { type: 'string', required: true }
}), async (req, res) => {
  try {
    const url = req.query.url;
    if (!url) {
      return res.status(400).json({ error: 'URL parameter is required' });
    }

    const response = await axios.get(url, { responseType: 'arraybuffer' });

    if (response.status !== 200) {
      return res.status(404).json({ error: 'Image not found' });
    }

    const contentType = response.headers['content-type'] || 'image/jpeg';
    res.set('Content-Type', contentType);
    res.send(response.data);
  } catch (error) {
    logger.error(`Error proxying image ${req.query.url}: ${error}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check endpoint
 *     responses:
 *       200:
 *         description: API is healthy
 */
router.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

module.exports = router;
