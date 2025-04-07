const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const isAdmin = require('../middleware/admin');
const User = require('../models/User');
const Video = require('../models/Video');

// Get all users (Admin only)
router.get('/users', auth, isAdmin, async (req, res) => {
  try {
    const users = await User.find()
      .select('-password')
      .sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching users' });
  }
});

// Get user details (Admin only)
router.get('/users/:id', auth, isAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching user details' });
  }
});

// Update user status (Admin only)
router.patch('/users/:id/status', auth, isAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['active', 'suspended', 'banned'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Error updating user status' });
  }
});

// Delete user (Admin only)
router.delete('/users/:id', auth, isAdmin, async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Delete all videos associated with the user
    await Video.deleteMany({ userId: req.params.id });

    res.json({ message: 'User and associated videos deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Error deleting user' });
  }
});

// Get system statistics (Admin only)
router.get('/stats', auth, isAdmin, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ status: 'active' });
    const totalVideos = await Video.countDocuments();
    const recentUsers = await User.find()
      .select('-password')
      .sort({ createdAt: -1 })
      .limit(5);
    const recentVideos = await Video.find()
      .sort({ createdAt: -1 })
      .limit(5);

    const stats = {
      totalUsers,
      activeUsers,
      totalVideos,
      recentUsers,
      recentVideos
    };

    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching system statistics' });
  }
});

// Get all videos (Admin only)
router.get('/videos', auth, isAdmin, async (req, res) => {
  try {
    const videos = await Video.find()
      .sort({ createdAt: -1 })
      .populate('userId', 'username email');
    res.json(videos);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching videos' });
  }
});

// Get video by ID (Admin only)
router.get('/videos/:id', auth, isAdmin, async (req, res) => {
  try {
    const video = await Video.findById(req.params.id)
      .populate('userId', 'username email');
    
    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }
    
    res.json(video);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching video details' });
  }
});

// Delete video (Admin only)
router.delete('/videos/:id', auth, isAdmin, async (req, res) => {
  try {
    const video = await Video.findByIdAndDelete(req.params.id);
    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }
    res.json({ message: 'Video deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Error deleting video' });
  }
});

module.exports = router;
