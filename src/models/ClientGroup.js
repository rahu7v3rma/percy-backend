const mongoose = require('mongoose');

const clientGroupSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    unique: true
  },
  description: {
    type: String,
    trim: true
  },
  clientAdmins: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  users: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
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

// Index for faster queries
clientGroupSchema.index({ name: 1 });
clientGroupSchema.index({ status: 1 });

// Update the updatedAt timestamp before saving
clientGroupSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

const ClientGroup = mongoose.model('ClientGroup', clientGroupSchema);

module.exports = ClientGroup; 