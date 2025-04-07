const express = require('express');
const router = express.Router();
const Workspace = require('../models/Workspace');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { isWorkspaceOwnerOrAdmin } = require('../../middleware/workspaceAuth');

// Create workspace
router.post('/', auth, async (req, res) => {
  try {
    console.log('Creating workspace with data:', req.body);
    console.log('Authenticated user:', req.user);

    // Validate authenticated user
    if (!req.user || !req.user._id || !req.user.email) {
      return res.status(401).json({ message: 'Invalid user authentication' });
    }

    const workspace = new Workspace({
      name: req.body.name,
      description: req.body.description || '',
      ownerId: req.user._id,
      members: [{
        userId: req.user._id,
        email: req.user.email,
        role: 'owner'
      }],
      settings: {
        requireEmailForVideos: req.body.settings?.requireEmailForVideos ?? false,
        defaultVideoExpiry: req.body.settings?.defaultVideoExpiry ?? 7
      }
    });

    console.log('Created workspace object:', workspace);
    const newWorkspace = await workspace.save();
    await newWorkspace.populate('members.userId', 'name email');
    console.log('Saved workspace:', newWorkspace);

    res.status(201).json(newWorkspace);
  } catch (error) {
    console.error('Workspace creation error:', error);
    res.status(400).json({ message: error.message });
  }
});

// Get all workspaces for user
router.get('/', auth, async (req, res) => {
  try {
    const workspaces = await Workspace.find({
      'members.userId': req.user._id
    }).populate('members.userId', 'name email');
    res.json(workspaces);
  } catch (error) {
    console.error('Error fetching workspaces:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get workspace by ID
router.get('/:id', auth, async (req, res) => {
  try {
    const workspace = await Workspace.findById(req.params.id)
      .populate('members.userId', 'name email');
    
    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    // Check if user is a member
    const isMember = workspace.members.some(m => 
      m.userId.toString() === req.user._id.toString()
    );

    if (!isMember) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json(workspace);
  } catch (error) {
    console.error('Error fetching workspace:', error);
    res.status(500).json({ message: error.message });
  }
});

// Update workspace
router.patch('/:id', auth, isWorkspaceOwnerOrAdmin, async (req, res) => {
  try {
    const workspace = await Workspace.findById(req.params.id);
    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    // Update allowed fields
    if (req.body.name) workspace.name = req.body.name;
    if (req.body.description) workspace.description = req.body.description;
    if (req.body.settings) {
      workspace.settings = {
        ...workspace.settings,
        ...req.body.settings
      };
    }

    const updatedWorkspace = await workspace.save();
    await updatedWorkspace.populate('members.userId', 'name email');
    res.json(updatedWorkspace);
  } catch (error) {
    console.error('Error updating workspace:', error);
    res.status(400).json({ message: error.message });
  }
});

// Delete workspace
router.delete('/:id', auth, isWorkspaceOwnerOrAdmin, async (req, res) => {
  try {
    const workspace = await Workspace.findById(req.params.id);
    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    await workspace.remove();
    res.json({ message: 'Workspace deleted successfully' });
  } catch (error) {
    console.error('Error deleting workspace:', error);
    res.status(500).json({ message: error.message });
  }
});

// Add member to workspace
router.post('/:id/members', auth, isWorkspaceOwnerOrAdmin, async (req, res) => {
  try {
    const { email, role } = req.body;
    if (!email || !role) {
      return res.status(400).json({ message: 'Email and role are required' });
    }

    const workspace = await Workspace.findById(req.params.id);
    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    // Check if user is already a member
    if (workspace.members.some(m => m.email === email)) {
      return res.status(400).json({ message: 'User is already a member' });
    }

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    workspace.members.push({
      userId: user._id,
      email,
      role
    });

    const updatedWorkspace = await workspace.save();
    await updatedWorkspace.populate('members.userId', 'name email');
    res.json(updatedWorkspace);
  } catch (error) {
    console.error('Error adding member:', error);
    res.status(400).json({ message: error.message });
  }
});

// Update member role
router.patch('/:id/members/:userId', auth, isWorkspaceOwnerOrAdmin, async (req, res) => {
  try {
    const { role } = req.body;
    if (!role) {
      return res.status(400).json({ message: 'Role is required' });
    }

    const workspace = await Workspace.findById(req.params.id);
    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    const member = workspace.members.find(m => m.userId.toString() === req.params.userId);
    if (!member) {
      return res.status(404).json({ message: 'Member not found' });
    }

    // Prevent changing owner's role
    if (member.role === 'owner') {
      return res.status(403).json({ message: 'Cannot change owner\'s role' });
    }

    member.role = role;
    const updatedWorkspace = await workspace.save();
    await updatedWorkspace.populate('members.userId', 'name email');
    res.json(updatedWorkspace);
  } catch (error) {
    console.error('Error updating member role:', error);
    res.status(400).json({ message: error.message });
  }
});

// Remove member from workspace
router.delete('/:id/members/:userId', auth, isWorkspaceOwnerOrAdmin, async (req, res) => {
  try {
    const workspace = await Workspace.findById(req.params.id);
    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    const memberIndex = workspace.members.findIndex(m => m.userId.toString() === req.params.userId);
    if (memberIndex === -1) {
      return res.status(404).json({ message: 'Member not found' });
    }

    // Prevent removing owner
    if (workspace.members[memberIndex].role === 'owner') {
      return res.status(403).json({ message: 'Cannot remove workspace owner' });
    }

    workspace.members.splice(memberIndex, 1);
    const updatedWorkspace = await workspace.save();
    await updatedWorkspace.populate('members.userId', 'name email');
    res.json(updatedWorkspace);
  } catch (error) {
    console.error('Error removing member:', error);
    res.status(400).json({ message: error.message });
  }
});

module.exports = router;
