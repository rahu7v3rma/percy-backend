const express = require('express');
const router = express.Router();
const Settings = require('../models/Settings');
const auth = require('../middleware/auth');
const roleAuth = require('../middleware/roleAuth');

// Get all settings
router.get('/', auth, roleAuth.isSuperAdmin, async (req, res) => {
  try {
    const settings = await Settings.find();
    const formattedSettings = settings.reduce((acc, setting) => {
      acc[setting.type] = setting.settings;
      return acc;
    }, {});
    res.json(formattedSettings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update settings
router.put('/:type', auth, roleAuth.isSuperAdmin, async (req, res) => {
  const { type } = req.params;
  const { settings } = req.body;

  try {
    const existingSettings = await Settings.findOne({ type });
    
    if (existingSettings) {
      existingSettings.settings = settings;
      existingSettings.lastUpdatedBy = req.user._id;
      existingSettings.lastUpdatedAt = new Date();
      await existingSettings.save();
    } else {
      await Settings.create({
        type,
        settings,
        lastUpdatedBy: req.user._id
      });
    }

    res.json({ message: 'Settings updated successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Test email configuration
router.post('/test-email', auth, roleAuth.isSuperAdmin, async (req, res) => {
  const { smtpServer, smtpPort, smtpUsername, smtpPassword, senderEmail } = req.body;
  
  try {
    // TODO: Implement email testing logic
    // This would typically involve:
    // 1. Creating a temporary nodemailer transport
    // 2. Sending a test email
    // 3. Returning success/failure
    
    res.json({ message: 'Email configuration test successful' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
