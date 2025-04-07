const mongoose = require('mongoose');

const folderSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  workspaceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace',
    required: true
  },
  parentFolderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Folder',
    default: null
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  path: {
    type: String,
    required: true
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

// Update path when saving
folderSchema.pre('save', async function(next) {
  this.updatedAt = Date.now();
  
  if (this.parentFolderId) {
    const parentFolder = await this.constructor.findById(this.parentFolderId);
    if (parentFolder) {
      this.path = `${parentFolder.path}/${this._id}`;
    } else {
      this.path = `/${this._id}`;
    }
  } else {
    this.path = `/${this._id}`;
  }
  
  next();
});

module.exports = mongoose.model('Folder', folderSchema);
