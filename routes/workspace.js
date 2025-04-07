const express = require('express');
const router = express.Router();
const Workspace = require('../models/workspace');
const User = require('../models/user');
const auth = require('../middleware/auth');
const { isWorkspaceOwnerOrAdmin } = require('../middleware/workspaceAuth');

// Get all workspaces for the authenticated user
router.get('/', auth, async (req, res) => {
  try {
    const workspaces = await Workspace.find({
      'members.userId': req.user._id
    }).populate('members.userId', 'name email');
    res.json(workspaces);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

const auth = require('../middleware/auth');

router.post('/', auth, async (req, res) => {
  console.log('--- POST /api/workspaces handler ---');
  console.log('req.headers:', req.headers); // Log all headers
  console.log('req.user:', req.user); // Log authenticated user
  console.log('req.body:', req.body); // Log request body

  try {
    const workspace = new Workspace({
      name: req.body.name,
      ownerId: req.user._id,
      members: [{
        userId: req.user._id,
        email: req.user.email,
        role: 'owner'
      }]
    });

    console.log('Workspace to save:', workspace); // Log the constructed document

    const newWorkspace = await workspace.save();
    await newWorkspace.populate('members.userId', 'name email');
    console.log('Saved workspace:', newWorkspace); // Log the saved document
    res.status(201).json(newWorkspace);
  } catch (error) {
    console.error('Workspace creation error:', error);
    res.status(400).json({ message: error.message });
  }
});

// Get a specific workspace
router.get('/:id', auth, async (req, res) => {
  try {
    const workspace = await Workspace.findById(req.params.id)
      .populate('members.userId', 'name email');
    
    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    const member = workspace.members.find(m => m.userId.toString() === req.user._id.toString());
    if (!member) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json(workspace);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update a workspace
router.patch('/:id', auth, isWorkspaceOwnerOrAdmin, async (req, res) => {
  try {
    const workspace = await Workspace.findById(req.params.id);
    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    if (req.body.name) {
      workspace.name = req.body.name;
    }

    const updatedWorkspace = await workspace.save();
    await updatedWorkspace.populate('members.userId', 'name email');
    res.json(updatedWorkspace);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Delete a workspace
router.delete('/:id', auth, isWorkspaceOwnerOrAdmin, async (req, res) => {
  try {
    const workspace = await Workspace.findById(req.params.id);
    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    await workspace.remove();
    res.json({ message: 'Workspace deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Add a member to workspace
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
    res.status(400).json({ message: error.message });
  }
});

module.exports = router;
