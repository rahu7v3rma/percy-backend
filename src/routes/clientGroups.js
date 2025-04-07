const express = require('express');
const router = express.Router();
const ClientGroup = require('../models/ClientGroup');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { isSuperAdmin } = require('../middleware/roleCheck');

// Get client group for the current user
router.get('/current', auth, async (req, res) => {
  try {
    // For client admin, find the client group where they are an admin
    if (req.user.role === 'client-admin') {
      const clientGroup = await ClientGroup.findOne({ clientAdmins: req.user._id })
        .select('name _id');

      if (!clientGroup) {
        return res.status(404).json({ message: 'Client group not found for this user' });
      }

      return res.json({ clientGroup });
    }

    // For regular users, find the client group where they are a user
    if (req.user.role === 'user') {
      const clientGroup = await ClientGroup.findOne({ users: req.user._id })
        .select('name _id');

      if (!clientGroup) {
        return res.status(404).json({ message: 'Client group not found for this user' });
      }

      return res.json({ clientGroup });
    }

    // Super admins don't have a specific client group
    res.status(403).json({ message: 'Super admins do not belong to a client group' });
  } catch (error) {
    console.error('Error fetching client group:', error);
    res.status(500).json({ message: 'Error fetching client group' });
  }
});

// Create a new client group (super admin only)
router.post('/', auth, isSuperAdmin, async (req, res) => {
  try {
    const { name, description, clientAdmins, users } = req.body;

    // Check if name already exists
    const existingGroup = await ClientGroup.findOne({ name });
    if (existingGroup) {
      return res.status(400).json({ message: 'A client group with this name already exists' });
    }

    // Validate client admins and users
    if (clientAdmins && clientAdmins.length > 0) {
      const validAdmins = await User.find({
        _id: { $in: clientAdmins },
        role: 'client-admin'
      });
      if (validAdmins.length !== clientAdmins.length) {
        return res.status(400).json({ message: 'Invalid client admin IDs provided' });
      }
    }

    if (users && users.length > 0) {
      const validUsers = await User.find({
        _id: { $in: users },
        role: { $ne: 'super-admin' }
      });
      if (validUsers.length !== users.length) {
        return res.status(400).json({ message: 'Invalid user IDs provided' });
      }
    }

    const clientGroup = new ClientGroup({
      name,
      description,
      clientAdmins,
      users,
      createdBy: req.user._id
    });

    await clientGroup.save();
    res.status(201).json(clientGroup);
  } catch (error) {
    console.error('Error creating client group:', error);
    res.status(500).json({ message: 'Error creating client group' });
  }
});

// Get all client groups (super admin sees all, client admin sees assigned groups)
router.get('/', auth, async (req, res) => {
  console.log('inside client groups route')
  try {
    let query = {};
    
    // If user is not a super admin, only show groups where they are a client admin
    if (req.user.role !== 'super-admin') {
      if (req.user.role !== 'client-admin') {
        return res.status(403).json({ message: 'Access denied. Only admins can access client groups.' });
      }
      query = { clientAdmins: req.user._id };
    }
    
    const clientGroups = await ClientGroup.find(query)
      .populate('clientAdmins', 'username email role')
      .populate('users', 'username email role')
      .populate('createdBy', 'username email')
      .sort({ createdAt: -1 });
    res.json(clientGroups);
  } catch (error) {
    console.error('Error fetching client groups:', error);
    res.status(500).json({ message: 'Error fetching client groups' });
  }
});

// Get single client group (super admin or assigned client admin)
router.get('/:id', auth, async (req, res) => {
  try {
    const clientGroup = await ClientGroup.findById(req.params.id)
      .populate('clientAdmins', 'username email role')
      .populate('users', 'username email role')
      .populate('createdBy', 'username email');
    
    if (!clientGroup) {
      return res.status(404).json({ message: 'Client group not found' });
    }

    // Check if user has permission (super admin or is a client admin of this group)
    if (req.user.role !== 'super-admin' && 
        !clientGroup.clientAdmins.some(admin => admin._id.toString() === req.user._id.toString())) {
      return res.status(403).json({ message: 'Access denied. You are not an admin of this client group.' });
    }
    
    res.json(clientGroup);
  } catch (error) {
    console.error('Error fetching client group:', error);
    res.status(500).json({ message: 'Error fetching client group' });
  }
});

// Update client group (super admin or client admin - with permissions)
router.put('/:id', auth, async (req, res) => {
  try {
    const { name, description, clientAdmins, users, status } = req.body;
    const clientGroup = await ClientGroup.findById(req.params.id)
      .populate('clientAdmins', 'username email role');

    if (!clientGroup) {
      return res.status(404).json({ message: 'Client group not found' });
    }

    // Check permissions
    const isAdmin = req.user.role === 'super-admin';
    const isClientAdmin = clientGroup.clientAdmins.some(admin => 
      admin._id.toString() === req.user._id.toString()
    );

    if (!isAdmin && !isClientAdmin) {
      return res.status(403).json({ message: 'Access denied. You are not an admin of this client group.' });
    }

    // Client admins can only update users, not other fields
    if (!isAdmin) {
      // Client admins can only update users array
      if (name || description || clientAdmins || status) {
        return res.status(403).json({ 
          message: 'Client admins can only modify user assignments, not group details.' 
        });
      }
    } else {
      // Super admin validation
      // Check if new name already exists (if name is being changed)
      if (name && name !== clientGroup.name) {
        const existingGroup = await ClientGroup.findOne({ name });
        if (existingGroup) {
          return res.status(400).json({ message: 'A client group with this name already exists' });
        }
      }

      // Validate client admins if provided
      if (clientAdmins && clientAdmins.length > 0) {
        const validAdmins = await User.find({
          _id: { $in: clientAdmins },
          role: 'client-admin'
        });
        if (validAdmins.length !== clientAdmins.length) {
          return res.status(400).json({ message: 'Invalid client admin IDs provided' });
        }
      }
    }

    // Validate users if provided (both super admin and client admin)
    if (users && users.length > 0) {
      const validUsers = await User.find({
        _id: { $in: users },
        role: { $ne: 'super-admin' }
      });
      if (validUsers.length !== users.length) {
        return res.status(400).json({ message: 'Invalid user IDs provided' });
      }
    }

    // Update fields
    if (isAdmin) {
      if (name) clientGroup.name = name;
      if (description) clientGroup.description = description;
      if (clientAdmins) clientGroup.clientAdmins = clientAdmins;
      if (status) clientGroup.status = status;
    }

    // Both super admin and client admin can update users
    if (users) clientGroup.users = users;

    await clientGroup.save();
    
    // Populate the response
    const updatedClientGroup = await ClientGroup.findById(clientGroup._id)
      .populate('clientAdmins', 'username email role')
      .populate('users', 'username email role')
      .populate('createdBy', 'username email');
      
    res.json(updatedClientGroup);
  } catch (error) {
    console.error('Error updating client group:', error);
    res.status(500).json({ message: 'Error updating client group' });
  }
});

// Delete client group (super admin only)
router.delete('/:id', auth, isSuperAdmin, async (req, res) => {
  try {
    const clientGroup = await ClientGroup.findById(req.params.id);
    if (!clientGroup) {
      return res.status(404).json({ message: 'Client group not found' });
    }

    await clientGroup.remove();
    res.json({ message: 'Client group deleted successfully' });
  } catch (error) {
    console.error('Error deleting client group:', error);
    res.status(500).json({ message: 'Error deleting client group' });
  }
});

// Add/remove users from client group (super admin only)
router.patch('/:id/users', auth, isSuperAdmin, async (req, res) => {
  try {
    const { action, userIds } = req.body;
    
    if (!['add', 'remove'].includes(action)) {
      return res.status(400).json({ message: 'Invalid action. Use "add" or "remove"' });
    }
    
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ message: 'User IDs must be provided as an array' });
    }
    
    const clientGroup = await ClientGroup.findById(req.params.id);
    if (!clientGroup) {
      return res.status(404).json({ message: 'Client group not found' });
    }
    
    // Validate user IDs
    const validUsers = await User.find({
      _id: { $in: userIds }
    });
    
    if (validUsers.length !== userIds.length) {
      return res.status(400).json({ message: 'Some user IDs are invalid' });
    }
    
    if (action === 'add') {
      // Filter out users that are already in the group
      const newUserIds = userIds.filter(id => 
        !clientGroup.users.some(userId => userId.toString() === id)
      );
      
      clientGroup.users.push(...newUserIds);
      
      // Also update user clientGroup reference
      for (const userId of newUserIds) {
        await User.findByIdAndUpdate(userId, { clientGroup: clientGroup._id });
      }
    } else {
      // Remove users from the group
      clientGroup.users = clientGroup.users.filter(userId => 
        !userIds.includes(userId.toString())
      );
      
      // Also update user clientGroup reference
      for (const userId of userIds) {
        await User.findByIdAndUpdate(userId, { $unset: { clientGroup: 1 } });
      }
    }
    
    await clientGroup.save();
    
    // Populate the response
    const updatedClientGroup = await ClientGroup.findById(clientGroup._id)
      .populate('clientAdmins', 'username email role')
      .populate('users', 'username email role')
      .populate('createdBy', 'username email');
    
    res.json(updatedClientGroup);
  } catch (error) {
    console.error(`Error ${req.body.action}ing users to client group:`, error);
    res.status(500).json({ message: `Error ${req.body.action}ing users to client group` });
  }
});

// Add/remove client admins from client group (super admin only)
router.patch('/:id/admins', auth, isSuperAdmin, async (req, res) => {
  try {
    const { action, adminIds } = req.body;
    
    if (!['add', 'remove'].includes(action)) {
      return res.status(400).json({ message: 'Invalid action. Use "add" or "remove"' });
    }
    
    if (!adminIds || !Array.isArray(adminIds) || adminIds.length === 0) {
      return res.status(400).json({ message: 'Admin IDs must be provided as an array' });
    }
    
    const clientGroup = await ClientGroup.findById(req.params.id);
    if (!clientGroup) {
      return res.status(404).json({ message: 'Client group not found' });
    }
    
    // Validate admin IDs (must be client-admin role)
    const validAdmins = await User.find({
      _id: { $in: adminIds },
      role: 'client-admin'
    });
    
    if (validAdmins.length !== adminIds.length) {
      return res.status(400).json({ message: 'Some admin IDs are invalid or not client-admin role' });
    }
    
    if (action === 'add') {
      // Filter out admins that are already in the group
      const newAdminIds = adminIds.filter(id => 
        !clientGroup.clientAdmins.some(adminId => adminId.toString() === id)
      );
      
      clientGroup.clientAdmins.push(...newAdminIds);
    } else {
      // Remove admins from the group
      clientGroup.clientAdmins = clientGroup.clientAdmins.filter(adminId => 
        !adminIds.includes(adminId.toString())
      );
    }
    
    await clientGroup.save();
    
    // Populate the response
    const updatedClientGroup = await ClientGroup.findById(clientGroup._id)
      .populate('clientAdmins', 'username email role')
      .populate('users', 'username email role')
      .populate('createdBy', 'username email');
    
    res.json(updatedClientGroup);
  } catch (error) {
    console.error(`Error ${req.body.action}ing admins to client group:`, error);
    res.status(500).json({ message: `Error ${req.body.action}ing admins to client group` });
  }
});

module.exports = router; 