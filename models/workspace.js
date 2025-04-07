const mongoose = require('mongoose');

const workspaceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  members: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    email: {
      type: String,
      required: true,
      trim: true
    },
    role: {
      type: String,
      enum: ['owner', 'admin', 'member'],
      required: true
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],
  settings: {
    allowPublicSharing: {
      type: Boolean,
      default: false
    },
    defaultVideoAccess: {
      type: String,
      enum: ['private', 'workspace', 'public'],
      default: 'workspace'
    }
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

// Update the updatedAt timestamp on save
workspaceSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Ensure owner is always in members array with owner role
workspaceSchema.pre('save', function(next) {
  const ownerMember = this.members.find(m => m.userId.toString() === this.ownerId.toString());
  if (!ownerMember) {
    const owner = this.members.find(m => m.role === 'owner');
    if (owner) {
      this.members = this.members.filter(m => m.role !== 'owner');
      this.members.push({
        userId: this.ownerId,
        email: owner.email,
        role: 'owner'
      });
    }
  } else if (ownerMember.role !== 'owner') {
    ownerMember.role = 'owner';
  }
  next();
});

// Add indexes for efficient querying
workspaceSchema.index({ 'members.userId': 1 });
workspaceSchema.index({ 'members.email': 1 });
workspaceSchema.index({ ownerId: 1 });
workspaceSchema.index({ createdAt: -1 });

const Workspace = mongoose.model('Workspace', workspaceSchema);

module.exports = Workspace;
