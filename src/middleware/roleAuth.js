const roleAuth = {
  isSuperAdmin: (req, res, next) => {
    if (req.user && req.user.role === 'super-admin') {
      next();
    } else {
      res.status(403).json({ message: 'Access denied. Super admin privileges required.' });
    }
  },

  isClientAdmin: (req, res, next) => {
    if (req.user && (req.user.role === 'super-admin' || req.user.role === 'client-admin')) {
      next();
    } else {
      res.status(403).json({ message: 'Access denied. Admin privileges required.' });
    }
  },

  canManageUsers: (req, res, next) => {
    if (req.user && ['super-admin', 'client-admin'].includes(req.user.role)) {
      next();
    } else {
      res.status(403).json({ message: 'Access denied. Insufficient privileges to manage users.' });
    }
  },

  canManageClientGroups: (req, res, next) => {
    if (req.user && req.user.role === 'super-admin') {
      next();
    } else {
      res.status(403).json({ message: 'Access denied. Super admin privileges required to manage client groups.' });
    }
  },

  canManageCampaigns: (req, res, next) => {
    if (req.user && ['super-admin', 'client-admin'].includes(req.user.role)) {
      next();
    } else {
      res.status(403).json({ message: 'Access denied. Insufficient privileges to manage campaigns.' });
    }
  },

  canManageVideo: async (req, res, next) => {
    if (!req.user) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    const videoId = req.params.videoId;
    const Video = require('../models/Video');
    
    try {
      const video = await Video.findById(videoId);
      if (!video) {
        return res.status(404).json({ message: 'Video not found' });
      }

      // Super admin can manage any video
      if (req.user.role === 'super-admin') {
        return next();
      }

      // Client admin can manage videos in their client group
      if (req.user.role === 'client-admin' && video.clientGroup.equals(req.user.clientGroup)) {
        return next();
      }

      // Regular users can only manage their own videos
      if (req.user.role === 'user' && video.userId.equals(req.user._id)) {
        return next();
      }

      res.status(403).json({ message: 'Access denied. Insufficient privileges to manage this video.' });
    } catch (error) {
      res.status(500).json({ message: 'Server error while checking video permissions' });
    }
  },

  canAccessClientGroup: async (req, res, next) => {
    if (!req.user) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    const clientGroupId = req.params.clientGroupId;
    
    try {
      // Super admin can access any client group
      if (req.user.role === 'super-admin') {
        return next();
      }

      // Client admin can only access their own client group
      if (req.user.role === 'client-admin' && req.user.clientGroup.equals(clientGroupId)) {
        return next();
      }

      res.status(403).json({ message: 'Access denied. Insufficient privileges to access this client group.' });
    } catch (error) {
      res.status(500).json({ message: 'Server error while checking client group permissions' });
    }
  },

  canAccessCampaign: async (req, res, next) => {
    if (!req.user) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    const campaignId = req.params.campaignId;
    const Campaign = require('../models/Campaign');
    
    try {
      const campaign = await Campaign.findById(campaignId);
      if (!campaign) {
        return res.status(404).json({ message: 'Campaign not found' });
      }

      // Super admin can access any campaign
      if (req.user.role === 'super-admin') {
        return next();
      }

      // Client admin can access campaigns in their client group
      if (req.user.role === 'client-admin' && campaign.clientGroup.equals(req.user.clientGroup)) {
        return next();
      }

      // Regular users can access campaigns they're assigned to
      if (req.user.role === 'user' && 
          campaign.assignedUsers.some(assignment => assignment.user.equals(req.user._id))) {
        return next();
      }

      res.status(403).json({ message: 'Access denied. Insufficient privileges to access this campaign.' });
    } catch (error) {
      res.status(500).json({ message: 'Server error while checking campaign permissions' });
    }
  }
};

module.exports = roleAuth;
