// Discord bot for Roblox key generation and verification

import express from 'express';
const PORT = process.env.PORT || 3000;
const app = express();
app.use(express.json());

// Health check route for Railway
app.get('/', (req, res) => {
  res.send('OK');
});

// Dummy endpoint for Roblox game to verify and consume key
app.post('/verify-key', (req, res) => {
  // Always return success for testing
  return res.json({ success: true, message: 'Key verified (test mode).' });
});

app.listen(PORT, () => {
  console.log(`Express server running on port ${PORT}`);
});
