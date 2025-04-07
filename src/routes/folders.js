const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Folder = require('../models/Folder');
const { mongoose } = require('mongoose');
const { isWorkspaceMember, checkWorkspaceMembership } = require('../../middleware/workspaceAuth');
const Video = require('../models/Video');

// Get all folders for a workspace
router.get('/workspace/:workspaceId', auth, async (req, res) => {
  try {
    const folders = await Folder.find({ workspace: req.params.workspaceId });
    res.json(folders);
  } catch (error) {
    console.error('Error fetching folders:', error);
    res.status(500).json({ error: 'Failed to fetch folders' });
  }
});

// Create a new folder
router.post('/', auth, async (req, res) => {
  try {
    const { name, workspaceId } = req.body;
    const folder = new Folder({
      name,
      workspace: workspaceId,
      createdBy: req.user._id
    });
    await folder.save();
    res.status(201).json(folder);
  } catch (error) {
    console.error('Error creating folder:', error);
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

// Update a folder
router.put('/:id', auth, async (req, res) => {
  try {
    const folder = await Folder.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true }
    );
    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }
    res.json(folder);
  } catch (error) {
    console.error('Error updating folder:', error);
    res.status(500).json({ error: 'Failed to update folder' });
  }
});

// Delete a folder
router.delete('/:id', auth, async (req, res) => {
  try {
    const folder = await Folder.findByIdAndDelete(req.params.id);
    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }
    res.json({ message: 'Folder deleted successfully' });
  } catch (error) {
    console.error('Error deleting folder:', error);
    res.status(500).json({ error: 'Failed to delete folder' });
  }
});


// Get folder contents (subfolders and videos)
router.get('/:id/contents', auth, async (req, res) => {
  console.log('folder body data ---- ',req.body)
  try {
    const folderId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(folderId)) {
      return res.status(400).json({ message: 'Invalid folder ID' });
    }

    const folder = await Folder.findById(folderId);

    if (!folder) {
      return res.status(404).json({ message: 'Folder not found' });
    }


    const member = await checkWorkspaceMembership(req, folder.workspace._id);
    if (!member) {
      return res.status(403).json({ message: 'Access denied' });
    }

    console.log('folderId--- ',folderId)
    const folders = await Folder.find({
      parentFolderId: folder._id
    }).sort({ name: 1 });

    console.log('folders --- ',folders)

    const videos = await Video.find({
      folder: folderId
    }).sort({ createdAt: -1 });

    res.json({
      folders,
      videos
    });
  } catch (error) {
    console.error('Server error:', error); // Log the error for debugging
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
