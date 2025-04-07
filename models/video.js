const mongoose = require('mongoose');

const videoSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  workspaceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true
  },
  folderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Folder',
    default: null
  },
  filePath: {
    type: String,
    required: true
  },
  fileSize: {
    type: Number,
    required: true
  },
  mimeType: {
    type: String,
    required: true
  },
  duration: {
    type: Number
  },
  thumbnail: {
    type: String
  },
  status: {
    type: String,
    enum: ['processing', 'ready', 'error'],
    default: 'processing'
  },
  access: {
    type: String,
    enum: ['private', 'workspace', 'public', 'custom'],
    default: 'workspace'
  },
  allowedUsers: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    email: String,
    accessGrantedAt: {
      type: Date,
      default: Date.now
    },
    expiresAt: Date
  }],
  embedSettings: {
    enabled: {
      type: Boolean,
      default: false
    },
    allowedDomains: [{
      type: String,
      trim: true
    }],
    customizationOptions: {
      autoplay: {
        type: Boolean,
        default: false
      },
      controls: {
        type: Boolean,
        default: true
      },
      loop: {
        type: Boolean,
        default: false
      }
    }
  },
  analytics: {
    views: {
      type: Number,
      default: 0
    },
    uniqueViewers: [{
      userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      firstViewedAt: {
        type: Date,
        default: Date.now
      },
      lastViewedAt: {
        type: Date,
        default: Date.now
      },
      viewCount: {
        type: Number,
        default: 1
      }
    }]
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update timestamps
videoSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Index for efficient queries
videoSchema.index({ workspaceId: 1, folderId: 1 });
videoSchema.index({ workspaceId: 1, 'analytics.views': -1 });
videoSchema.index({ 'allowedUsers.userId': 1 });
videoSchema.index({ 'allowedUsers.email': 1 });
videoSchema.index({ access: 1 });
videoSchema.index({ status: 1 });

const Video = mongoose.model('Video', videoSchema);

module.exports = Video;
