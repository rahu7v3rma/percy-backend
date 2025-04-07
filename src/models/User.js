const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  role: {
    type: String,
    enum: ['super-admin', 'client-admin', 'user'],
    default: 'user'
  },
  clientGroup: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ClientGroup'
  },
  campaigns: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Campaign'
  }],
  status: {
    type: String,
    enum: ['active', 'suspended', 'banned'],
    default: 'active'
  },
  lastLogin: {
    type: Date
  },
  profilePicture: {
    type: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Update the lastLogin timestamp
userSchema.methods.updateLastLogin = async function() {
  this.lastLogin = new Date();
  await this.save();
};

// Check if user is active
userSchema.methods.isActive = function() {
  return this.status === 'active';
};

// Role-based permission checks
userSchema.methods.isSuperAdmin = function() {
  return this.role === 'super-admin';
};

userSchema.methods.isClientAdmin = function() {
  return this.role === 'client-admin';
};

userSchema.methods.canManageUsers = function() {
  return ['super-admin', 'client-admin'].includes(this.role);
};

userSchema.methods.canManageVideos = function(videoUserId) {
  return this.role !== 'user' || this._id.equals(videoUserId);
};

userSchema.methods.canManageCampaigns = function() {
  return ['super-admin', 'client-admin'].includes(this.role);
};

userSchema.methods.canManageClientGroups = function() {
  return this.role === 'super-admin';
};

module.exports = mongoose.model('User', userSchema);
