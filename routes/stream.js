const express = require('express');
const router = express.Router();
const fs = require('fs');
const Video = require('../models/video');
const auth = require('../middleware/auth');
const { isWorkspaceMember } = require('../middleware/workspaceAuth');

// Stream video content
router.get('/:id', auth, async (req, res) => {
  try {
    const video = await Video.findById(req.params.id)
      .populate('workspaceId')
      .populate('uploadedBy', 'name email');

    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
    }

    // Check access permissions
    if (video.access === 'workspace') {
      const member = await isWorkspaceMember(req, video.workspaceId);
      if (!member) {
        return res.status(403).json({ message: 'Access denied' });
      }
    } else if (video.access === 'private') {
      if (video.uploadedBy._id.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: 'Access denied' });
      }
    } else if (video.access === 'custom') {
      const hasAccess = video.allowedUsers.some(user => 
        user.userId?.toString() === req.user._id.toString() ||
        user.email === req.user.email
      );
      if (!hasAccess) {
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    const videoPath = video.filePath;
    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;
      const file = fs.createReadStream(videoPath, { start, end });
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': video.mimeType,
      };

      res.writeHead(206, head);
      file.pipe(res);
    } else {
      const head = {
        'Content-Length': fileSize,
        'Content-Type': video.mimeType,
      };
      res.writeHead(200, head);
      fs.createReadStream(videoPath).pipe(res);
    }

    // Update view count asynchronously
    const viewer = {
      userId: req.user._id,
      lastViewedAt: new Date()
    };

    const existingViewer = video.analytics.uniqueViewers.find(
      v => v.userId.toString() === req.user._id.toString()
    );

    if (existingViewer) {
      existingViewer.lastViewedAt = new Date();
      existingViewer.viewCount += 1;
    } else {
      video.analytics.uniqueViewers.push(viewer);
    }
    video.analytics.views += 1;
    await video.save();

  } catch (error) {
    console.error('Streaming error:', error);
    res.status(500).json({ message: 'Error streaming video' });
  }
});

module.exports = router;
