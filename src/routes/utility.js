const express = require('express');
const router = express.Router();
const axios = require('axios');
const { validateRequestMiddleware } = require('../middleware/security');

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
    console.error(`Error proxying image ${req.query.url}: ${error}`);
    res.status(500).json({ error: error.message });
  }
});


router.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

module.exports = router;
