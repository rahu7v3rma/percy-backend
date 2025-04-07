const express = require('express');
const router = express.Router();
const Folder = require('../models/folder');
const Video = require('../models/video');
const auth = require('../middleware/auth');
const { isWorkspaceMember } = require('../middleware/workspaceAuth');

// Get all folders in a workspace
router.get('/workspace/:workspaceId', auth, isWorkspaceMember, async (req, res) => {
  try {
    const folders = await Folder.find({
      workspaceId: req.params.workspaceId,
      parentFolderId: null // Get root level folders
    }).sort({ name: 1 });
    res.json(folders);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});



// Create a new folder
router.post('/', auth, async (req, res) => {
  try {
    const { name, workspaceId, parentFolderId } = req.body;

    // Check if user has access to the workspace
    const member = await isWorkspaceMember(req, workspaceId);
    if (!member) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // If parentFolderId is provided, verify it exists and belongs to the same workspace
    if (parentFolderId) {
      const parentFolder = await Folder.findById(parentFolderId);
      if (!parentFolder || parentFolder.workspaceId.toString() !== workspaceId) {
        return res.status(400).json({ message: 'Invalid parent folder' });
      }
    }

    const folder = new Folder({
      name,
      workspaceId,
      parentFolderId: parentFolderId || null,
      createdBy: req.user._id
    });

    const newFolder = await folder.save();
    res.status(201).json(newFolder);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Update a folder
router.patch('/:id', auth, async (req, res) => {
  try {
    const folder = await Folder.findById(req.params.id);
    if (!folder) {
      return res.status(404).json({ message: 'Folder not found' });
    }

    // Check if user has access to the workspace
    const member = await isWorkspaceMember(req, folder.workspaceId);
    if (!member) {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (req.body.name) {
      folder.name = req.body.name;
    }

    if (req.body.parentFolderId !== undefined) {
      // If moving to root level
      if (req.body.parentFolderId === null) {
        folder.parentFolderId = null;
      } else {
        // Verify new parent folder exists and belongs to the same workspace
        const parentFolder = await Folder.findById(req.body.parentFolderId);
        if (!parentFolder || parentFolder.workspaceId.toString() !== folder.workspaceId.toString()) {
          return res.status(400).json({ message: 'Invalid parent folder' });
        }
        // Prevent circular references
        if (req.body.parentFolderId === folder._id) {
          return res.status(400).json({ message: 'A folder cannot be its own parent' });
        }
        folder.parentFolderId = req.body.parentFolderId;
      }
    }

    const updatedFolder = await folder.save();
    res.json(updatedFolder);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Delete a folder
router.delete('/:id', auth, async (req, res) => {
  try {
    const folder = await Folder.findById(req.params.id);
    if (!folder) {
      return res.status(404).json({ message: 'Folder not found' });
    }

    // Check if user has access to the workspace
    const member = await isWorkspaceMember(req, folder.workspaceId);
    if (!member) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Get all subfolders recursively
    const getAllSubfolderIds = async (folderId) => {
      const subfolders = await Folder.find({ parentFolderId: folderId });
      let ids = [folderId];
      for (const subfolder of subfolders) {
        ids = ids.concat(await getAllSubfolderIds(subfolder._id));
      }
      return ids;
    };

    const folderIds = await getAllSubfolderIds(folder._id);

    // Update videos to remove folder reference
    await Video.updateMany(
      { folderId: { $in: folderIds } },
      { $set: { folderId: null } }
    );

    // Delete all subfolders
    await Folder.deleteMany({ _id: { $in: folderIds } });

    res.json({ message: 'Folder deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
