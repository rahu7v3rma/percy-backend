const Workspace = require('../src/models/Workspace');

// Middleware to check if user is workspace owner or admin
const isWorkspaceOwnerOrAdmin = async (req, res, next) => {
  try {
    console.log('Checking workspace auth for:', {
      workspaceId: req.params.id,
      userId: req.user._id,
      userRole: req.user.role
    });

    // Super admins always have access
    if (req.user.role === 'super-admin') {
      next();
      return;
    }

    const workspace = await Workspace.findById(req.params.id);
    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    const member = workspace.members.find(m => m.userId.toString() === req.user._id.toString());
    if (!member) {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (member.role !== 'owner' && member.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied. Only owners and admins can perform this action.' });
    }

    req.workspace = workspace;
    next();
  } catch (error) {
    console.error('Workspace auth error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Middleware to check if user is workspace member
const isWorkspaceMember = async (req, res, next) => {

  try {
    console.log('Checking workspace membership for:', {
      workspaceId: req.params.id,
      userId: req.user._id,
      userRole: req.user.role
    });

    // Super admins always have access
    if (req.user.role === 'super-admin') {
      next();
      return;
    }

    const workspace = await Workspace.findById(req.params.id);
    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    const member = workspace.members.find(m => m.userId.toString() === req.user._id.toString());
    if (!member) {
      return res.status(403).json({ message: 'Access denied. You must be a member of this workspace.' });
    }

    req.workspace = workspace;
    req.memberRole = member.role;
    next();
  } catch (error) {
    console.error('Workspace auth error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Middleware to check if user is workspace owner
const isWorkspaceOwner = async (req, res, next) => {
  try {
    console.log('Checking workspace ownership for:', {
      workspaceId: req.params.id,
      userId: req.user._id,
      userRole: req.user.role
    });

    // Super admins always have access
    if (req.user.role === 'super-admin') {
      next();
      return;
    }

    const workspace = await Workspace.findById(req.params.id);
    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    const member = workspace.members.find(m => m.userId.toString() === req.user._id.toString());
    if (!member || member.role !== 'owner') {
      return res.status(403).json({ message: 'Access denied. Only workspace owner can perform this action.' });
    }

    req.workspace = workspace;
    next();
  } catch (error) {
    console.error('Workspace auth error:', error);
    res.status(500).json({ message: error.message });
  }
};

// Utility function for checking membership
const checkWorkspaceMembership = async (req, workspaceId) => {
  try {
    // Super admins always have access
    if (req.user.role === 'super-admin') {
      return true;
    }
    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      return false;
    }
    const member = workspace.members.find(m => m.userId.toString() === req.user._id.toString());
    return !!member; // Convert to boolean
  } catch (error) {
    console.error('Workspace membership check error:', error);
    return false;
  }
};

module.exports = {
  isWorkspaceOwnerOrAdmin,
  isWorkspaceMember,
  isWorkspaceOwner,
  checkWorkspaceMembership
};
