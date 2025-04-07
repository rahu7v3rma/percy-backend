const express = require('express');
const router = express.Router();
const Campaign = require('../models/Campaign');
const User = require('../models/User');
const Video = require('../models/Video');
const auth = require('../middleware/auth');
const roleAuth = require('../middleware/roleAuth');

// Get all campaigns (filtered by role)
router.get('/', auth, async (req, res) => {
  try {
    let query = {};
    
    // Super admin can see all campaigns
    if (req.user.role === 'super-admin') {
      // No filter needed
    }
    // Client admin can see campaigns in their client group
    else if (req.user.role === 'client-admin') {
      query.clientGroup = req.user.clientGroup;
    }
    // Regular users can see campaigns they're assigned to
    else {
      query['assignedUsers.user'] = req.user._id;
    }

    const campaigns = await Campaign.find(query)
      .populate('clientGroup', 'name')
      .populate('createdBy', 'username email')
      .populate('assignedUsers.user', 'username email')
      .populate('videos', 'title thumbnail');

    res.json(campaigns);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching campaigns' });
  }
});

// Create new campaign (Super Admin and Client Admin)
router.post('/', auth, roleAuth.canManageCampaigns, async (req, res) => {
  try {
    const {
      name,
      description,
      clientGroup,
      assignedUsers,
      videos,
      startDate,
      endDate
    } = req.body;

    console.log('Creating campaign with data:', {
      name,
      description,
      clientGroup,
      assignedUsers,
      videos,
      startDate,
      endDate,
      createdBy: req.user._id
    });

    // For client admin, use their user ID as the client group
    const effectiveClientGroup = req.user.role === 'client-admin' ? req.user._id : clientGroup;

    const campaign = new Campaign({
      name,
      description,
      clientGroup: effectiveClientGroup,
      assignedUsers: assignedUsers || [],
      videos: videos || [],
      startDate,
      endDate,
      createdBy: req.user._id
    });

    console.log('Campaign model created:', campaign);
    await campaign.save();
    console.log('Campaign saved successfully');

    // Update users with their new campaign
    if (assignedUsers && assignedUsers.length > 0) {
      await User.updateMany(
        { _id: { $in: assignedUsers.map(au => au.user) } },
        { $addToSet: { campaigns: campaign._id } }
      );
    }

    // Populate the response
    const populatedCampaign = await Campaign.findById(campaign._id)
      .populate('clientGroup', 'name')
      .populate('createdBy', 'username email')
      .populate('assignedUsers.user', 'username email')
      .populate('videos', 'title thumbnail');

    res.status(201).json(populatedCampaign);
  } catch (error) {
    console.error('Error creating campaign:', error);
    res.status(500).json({ 
      message: 'Error creating campaign', 
      error: error.message,
      stack: error.stack 
    });
  }
});

// Get specific campaign (Super Admin, Client Admin, and assigned Users)
router.get('/:campaignId', auth, roleAuth.canAccessCampaign, async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.campaignId)
      .populate('clientGroup', 'name')
      .populate('createdBy', 'username email')
      .populate('assignedUsers.user', 'username email')
      .populate('videos', 'title thumbnail filePath');
    
    if (!campaign) {
      return res.status(404).json({ message: 'Campaign not found' });
    }

    res.json(campaign);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching campaign' });
  }
});

// Update campaign (Super Admin and Client Admin)
router.put('/:campaignId', auth, roleAuth.canManageCampaigns, async (req, res) => {
  try {
    const {
      name,
      description,
      assignedUsers,
      videos,
      status,
      startDate,
      endDate
    } = req.body;

    const campaign = await Campaign.findById(req.params.campaignId);
    if (!campaign) {
      return res.status(404).json({ message: 'Campaign not found' });
    }

    // Validate client group access
    if (req.user.role === 'client-admin' && !campaign.clientGroup.equals(req.user.clientGroup)) {
      return res.status(403).json({ message: 'Access denied. Cannot modify campaign from other client groups.' });
    }

    // Update fields
    if (name) campaign.name = name;
    if (description) campaign.description = description;
    if (assignedUsers) campaign.assignedUsers = assignedUsers;
    if (videos) campaign.videos = videos;
    if (status) campaign.status = status;
    if (startDate) campaign.startDate = startDate;
    if (endDate) campaign.endDate = endDate;

    await campaign.save();

    // Update users with their new campaign assignments
    if (assignedUsers && assignedUsers.length > 0) {
      await User.updateMany(
        { _id: { $in: assignedUsers.map(au => au.user) } },
        { $addToSet: { campaigns: campaign._id } }
      );
    }

    res.json(campaign);
  } catch (error) {
    res.status(500).json({ message: 'Error updating campaign' });
  }
});

// Delete campaign (Super Admin and Client Admin)
router.delete('/:campaignId', auth, roleAuth.canManageCampaigns, async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.campaignId);
    if (!campaign) {
      return res.status(404).json({ message: 'Campaign not found' });
    }

    // Validate client group access
    if (req.user.role === 'client-admin' && !campaign.clientGroup.equals(req.user.clientGroup)) {
      return res.status(403).json({ message: 'Access denied. Cannot delete campaign from other client groups.' });
    }

    // Remove campaign reference from users
    await User.updateMany(
      { campaigns: campaign._id },
      { $pull: { campaigns: campaign._id } }
    );

    await campaign.remove();
    res.json({ message: 'Campaign deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting campaign' });
  }
});

module.exports = router; 