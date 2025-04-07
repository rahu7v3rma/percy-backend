const express = require('express');
const router = express.Router();
const Video = require('../models/video');
const auth = require('../middleware/auth');
const { isWorkspaceMember } = require('../middleware/workspaceAuth');
const multer = require('multer');
const multerS3 = require('multer-s3');
const { s3Client, BUCKET_NAME } = require('../config/s3Config');
const { GetObjectCommand, DeleteObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const path = require('path');

// Configure multer for S3 uploads
const upload = multer({
  storage: multerS3({
    s3: s3Client,
    bucket: BUCKET_NAME,
    metadata: (req, file, cb) => {
      cb(null, { fieldName: file.fieldname });
    },
    key: (req, file, cb) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const folder = file.fieldname === 'thumbnail' ? 'thumbnails' : 'videos';
      cb(null, `${folder}/${uniqueSuffix}${path.extname(file.originalname)}`);
    }
  }),
  limits: {
    fileSize: file => {
      // 100MB for videos, 5MB for thumbnails
      return file.fieldname === 'thumbnail' ? 5 * 1024 * 1024 : 100 * 1024 * 1024;
    }
  },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'video') {
      const allowedTypes = ['video/mp4', 'video/webm', 'video/quicktime'];
      if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Invalid file type. Only MP4, WebM, and QuickTime videos are allowed.'));
      }
    } else if (file.fieldname === 'thumbnail') {
      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Invalid file type. Only JPEG, PNG, GIF and WebP images are allowed for thumbnails.'));
      }
    } else {
      cb(new Error('Unexpected field name'));
    }
  }
});

// Helper function to generate signed URL
async function generateSignedUrl(key) {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key
  });
  return await getSignedUrl(s3Client, command, { expiresIn: 3600 }); // URL expires in 1 hour
}

// Get all videos in a workspace
router.get('/workspace/:workspaceId', auth, isWorkspaceMember, async (req, res) => {
  try {
    const query = { workspaceId: req.params.workspaceId };
    
    // If folderId is 'root', get videos not in any folder
    if (req.query.folderId === 'root') {
      query.folderId = null;
    } else if (req.query.folderId) {
      query.folderId = req.query.folderId;
    }

    const videos = await Video.find(query)
      .sort({ createdAt: -1 })
      .populate('uploadedBy', 'name email');

    // Generate signed URLs for each video
    const videosWithUrls = await Promise.all(videos.map(async (video) => {
      const videoDoc = video.toObject();
      videoDoc.url = await generateSignedUrl(video.filePath);
      
      // Generate thumbnail URL if exists
      if (video.thumbnail) {
        videoDoc.thumbnailUrl = await generateSignedUrl(video.thumbnail);
      }
      
      return videoDoc;
    }));

    res.json(videosWithUrls);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Upload a new video
router.post('/', auth, isWorkspaceMember, upload.fields([
  { name: 'video', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 }
]), async (req, res) => {
  try {
    const { title, description, workspaceId, folderId } = req.body;

    if (!title || !workspaceId || !req.files.video) {
      return res.status(400).json({ message: 'Title, workspace ID, and video file are required' });
    }

    const videoFile = req.files.video[0];
    const thumbnailFile = req.files.thumbnail ? req.files.thumbnail[0] : null;

    const video = new Video({
      title,
      description,
      workspaceId,
      folderId: folderId || null,
      filePath: videoFile.key, // Store S3 key instead of local path
      thumbnail: thumbnailFile ? thumbnailFile.key : null,
      uploadedBy: req.user._id,
      fileSize: videoFile.size,
      mimeType: videoFile.mimetype,
      status: 'ready' // Set status as ready since processing is handled by AWS
    });

    const savedVideo = await video.save();
    await savedVideo.populate('uploadedBy', 'name email');
    
    // Generate signed URL for the uploaded video and thumbnail
    const videoUrl = await generateSignedUrl(videoFile.key);
    const responseVideo = savedVideo.toObject();
    responseVideo.url = videoUrl;
    
    if (thumbnailFile) {
      responseVideo.thumbnailUrl = await generateSignedUrl(thumbnailFile.key);
    }

    res.status(201).json(responseVideo);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Get video by ID
router.get('/:id', auth, async (req, res) => {
  try {
    const video = await Video.findById(req.params.id)
      .populate('uploadedBy', 'name email')
      .populate('workspaceId');

    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
    }

    // Check if user has access to the workspace
    const member = await isWorkspaceMember(req, video.workspaceId);
    if (!member) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Generate signed URL
    const videoDoc = video.toObject();
    videoDoc.url = await generateSignedUrl(video.filePath);
    
    // Generate thumbnail URL if exists
    if (video.thumbnail) {
      videoDoc.thumbnailUrl = await generateSignedUrl(video.thumbnail);
    }

    res.json(videoDoc);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update video
router.patch('/:id', auth, async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
    }

    // Check if user has access to the workspace
    const member = await isWorkspaceMember(req, video.workspaceId);
    if (!member) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const allowedUpdates = ['title', 'description', 'folderId'];
    const updates = Object.keys(req.body);
    updates.forEach(update => {
      if (allowedUpdates.includes(update)) {
        video[update] = req.body[update];
      }
    });

    const updatedVideo = await video.save();
    await updatedVideo.populate('uploadedBy', 'name email');

    // Generate signed URL
    const videoDoc = updatedVideo.toObject();
    videoDoc.url = await generateSignedUrl(video.filePath);
    
    // Generate thumbnail URL if exists
    if (video.thumbnail) {
      videoDoc.thumbnailUrl = await generateSignedUrl(video.thumbnail);
    }

    res.json(videoDoc);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Delete video
router.delete('/:id', auth, async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
    }

    // Check if user has access to the workspace
    const member = await isWorkspaceMember(req, video.workspaceId);
    if (!member) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Delete video from S3
    const deleteVideoCommand = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: video.filePath
    });
    await s3Client.send(deleteVideoCommand);
    
    // Delete thumbnail from S3 if exists
    if (video.thumbnail) {
      const deleteThumbnailCommand = new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: video.thumbnail
      });
      await s3Client.send(deleteThumbnailCommand);
    }

    // Delete from database
    await video.remove();
    res.json({ message: 'Video deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
