const express = require('express');
const router = express.Router();
const User = require('../models/User');
const auth = require('../middleware/auth');
const roleAuth = require('../middleware/roleAuth');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Get all users (Super Admin and Client Admin only)
router.get('/', auth, roleAuth.canManageUsers, async (req, res) => {
  try {
    let query = {};
    
    // Client admins can only see their users
    if (req.user.role === 'client-admin') {
      query = {
        clientId: req.user._id,
        role: 'user' // Only show regular users, not other client admins
      };
    } else if (req.user.role === 'super-admin') {
      // Super admin can see all users except other super admins
      query = {
        role: { $ne: 'super-admin' }
      };
    }
    
    const users = await User.find(query).select('-password');
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching users' });
  }
});

// Create client admin (Super Admin only)
router.post('/client-admin', auth, roleAuth.isSuperAdmin, async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Validate input
    if (!username || !email || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    // Check if user exists with same email
    const existingUserByEmail = await User.findOne({ email });
    if (existingUserByEmail) {
      return res.status(400).json({ 
        message: 'A user with this email already exists',
        field: 'email'
      });
    }

    // Check if user exists with same username
    const existingUserByUsername = await User.findOne({ username });
    if (existingUserByUsername) {
      return res.status(400).json({ 
        message: 'A user with this username already exists',
        field: 'username'
      });
    }

    // Create new client admin
    const user = new User({
      username,
      email,
      password: await bcrypt.hash(password, 10),
      role: 'client-admin',
      status: 'active'
    });

    await user.save();

    // Create token for immediate login
    const token = jwt.sign(
      { _id: user._id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Return user data and token
    res.status(201).json({
      message: 'Client admin created successfully',
      token,
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        status: user.status
      }
    });
  } catch (error) {
    console.error('Error creating client admin:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ 
        message: 'Validation error',
        errors: Object.values(error.errors).map(err => err.message)
      });
    }
    res.status(500).json({ message: 'Error creating client admin' });
  }
});

// Create user (Client Admin only)
router.post('/user', auth, roleAuth.isClientAdmin, async (req, res) => {
  try {
    const { username, email, password } = req.body;

    // Validate input
    if (!username || !email || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    // Check if user exists
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Create new user
    user = new User({
      username,
      email,
      password: await bcrypt.hash(password, 10),
      role: 'user',
      clientId: req.user.role === 'client-admin' ? req.user._id : null
    });

    await user.save();
    res.status(201).json({
      message: 'User created successfully',
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        status: user.status,
        clientId: user.clientId
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Error creating user' });
  }
});

// Update user status
router.patch('/:userId/status', auth, roleAuth.canManageUsers, async (req, res) => {
  try {
    const { status } = req.body;
    const userId = req.params.userId;

    // Validate status
    if (!['active', 'suspended', 'banned'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Client admins can only manage their users
    if (req.user.role === 'client-admin' && !user.clientId.equals(req.user._id)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    user.status = status;
    await user.save();

    res.json({ message: 'User status updated successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error updating user status' });
  }
});

// Delete user
router.delete('/:userId', auth, roleAuth.canManageUsers, async (req, res) => {
  try {
    const userId = req.params.userId;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Client admins can only delete their users
    if (req.user.role === 'client-admin' && !user.clientId?.equals(req.user._id)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Prevent deletion of super admin
    if (user.role === 'super-admin') {
      return res.status(403).json({ message: 'Cannot delete super admin' });
    }

    await User.findByIdAndDelete(userId);
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ message: 'Error deleting user' });
  }
});

// Delete own account
router.delete('/account/self', auth, async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Prevent deletion of super admin account
    if (user.role === 'super-admin') {
      return res.status(403).json({ message: 'Super admin accounts cannot be deleted' });
    }

    // Delete all user's videos and related data
    // TODO: Implement cleanup of user's data (videos, comments, etc.)

    await User.findByIdAndDelete(userId);
    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Error deleting account:', error);
    res.status(500).json({ message: 'Error deleting account' });
  }
});

// Get client group for the authenticated user
router.get('/client-group', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('clientGroup', 'name _id');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!user.clientGroup) {
      return res.status(404).json({ message: 'Client group not found for this user' });
    }

    res.json({ clientGroup: user.clientGroup });
  } catch (error) {
    console.error('Error fetching client group:', error);
    res.status(500).json({ message: 'Error fetching client group' });
  }
});

module.exports = router;
