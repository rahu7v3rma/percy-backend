const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const auth = require('../middleware/auth');

// Register User
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new user
    const user = new User({
      username,
      email,
      password: hashedPassword,
      role: email.endsWith('@admin.com') ? 'super-admin' : 'user'
    });

    const savedUser = await user.save();

    // Create token with email included
    const token = jwt.sign(
      { 
        _id: savedUser._id, 
        username: savedUser.username, 
        email: savedUser.email,
        role: savedUser.role 
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      token,
      user: {
        _id: savedUser._id,
        username: savedUser.username,
        email: savedUser.email,
        role: savedUser.role
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Login User
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if user exists
    const user = await User.findOne({ email }).populate('clientGroup', 'name _id');

    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Validate password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Check if user is active
    if (user.status !== 'active') {
      return res.status(403).json({ message: 'Account is not active' });
    }

    // Create token with email included
    const token = jwt.sign(
      { 
        _id: user._id, 
        username: user.username, 
        email: user.email,
        role: user.role 
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        clientGroup: user.clientGroup
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/google-login', async (req, res) => {
  try {
    const { email, name } = req.body;

    // Check if user exists
    let user = await User.findOne({ email });
    
    // If user doesn't exist, create a new one
    if (!user) {
      // Generate a username from the email or name
      const username = name ? name.replace(/\s+/g, '').toLowerCase() : 
                       email.split('@')[0];
      
      // Create a random password for the user (they'll login via Google)
      const randomPassword = Math.random().toString(36).slice(-10);
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(randomPassword, salt);
      
      // Create new user
      user = new User({
        username,
        email,
        password: hashedPassword,
        role: email.endsWith('@admin.com') ? 'super-admin' : 'user',
        status: 'active' // Assuming Google users are automatically active
      });
      
      await user.save();
      console.log(`New user created via Google login: ${email}`);
    }

    // Check if user is active
    if (user.status !== 'active') {
      return res.status(403).json({ message: 'Account is not active' });
    }

    // Create token with email included
    const token = jwt.sign(
      { 
        _id: user._id, 
        username: user.username, 
        email: user.email,
        role: user.role 
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get User Profile
router.get('/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-password')
      .populate('clientGroup', 'name _id');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Reset Password (Super Admin Only)
router.post('/reset-password', auth, async (req, res) => {
  try {
    const { email, newPassword } = req.body;

    // Check if the requester is a super admin
    const requester = await User.findById(req.user._id);
    if (!requester || requester.role !== 'super-admin') {
      return res.status(403).json({ message: 'Only super admins can reset passwords' });
    }

    // Find the user to reset password
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update password
    user.password = hashedPassword;
    await user.save();

    res.json({ message: 'Password reset successful' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
