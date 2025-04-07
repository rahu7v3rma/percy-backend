const express = require('express');
const router = express.Router();
const multer = require('multer');
const multerS3 = require('multer-s3');
const path = require('path');
const fs = require('fs');
const Video = require('../models/Video');
const Workspace = require('../models/Workspace');
const auth = require('../middleware/auth');
const { promisify } = require('util');
const stat = promisify(fs.stat);
const { s3Client, BUCKET_NAME } = require('../config/s3Config');
const { GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const uuid = require('uuid');
const { uploadToS3 } = require('../utils/s3Utils');
const roleAuth = require('../middleware/roleAuth');
const { generateSignedUrl } = require('../utils/s3');

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
    fileSize: 500 * 1024 * 1024, // 500MB max file size for videos
  },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'video' && file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else if (file.fieldname === 'thumbnail' && file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Videos must be MP4 and thumbnails must be images.'));
    }
  }
});

// Get all videos (filtered by role and access)
router.get('/', auth, async (req, res) => {
  try {
    let query = {};
    
    // Super admin can see all videos
    if (req.user.role === 'super-admin') {
      // No filter needed
    }
    // Client admin can see their own videos and videos in their client group
    else if (req.user.role === 'client-admin') {
      query.$or = [
        { userId: req.user._id },
        { clientGroup: req.user.clientGroup }
      ];
    }
    // Regular users can only see their own videos
    else {
      query.userId = req.user._id;
    }

    const videos = await Video.find(query)
      .sort({ createdAt: -1 })
      .populate('userId', 'username email role')
      .populate('clientGroup', 'name');

    // Create array to store all video objects with signed URLs
    const videosWithSignedUrls = [];
    
    // Generate signed URLs for each video
    for (const video of videos) {
      const videoObj = video.toObject();
      videoObj.id = video._id;
      
      // Generate S3 signed URL for video
      if (video.filePath) {
        videoObj.url = await generateSignedUrl(video.filePath);
      } else if (video.url) {
        videoObj.url = await generateSignedUrl(video.url);
        videoObj.needsMigration = true;
      }
      
      // Generate S3 signed URL for thumbnail
      if (video.thumbnail) {
        videoObj.thumbnailUrl = await generateSignedUrl(video.thumbnail);
      }
      
      // Add user information
      if (video.userId) {
        videoObj.uploader = {
          username: video.userId.username,
          email: video.userId.email,
          role: video.userId.role
        };
      }
      
      // Add client group information if applicable
      if (video.clientGroup) {
        videoObj.clientGroup = {
          id: video.clientGroup._id,
          name: video.clientGroup.name
        };
      }
      
      videosWithSignedUrls.push(videoObj);
    }

    res.json(videosWithSignedUrls);
  } catch (error) {
    console.error('Error fetching videos:', error);
    res.status(500).json({ message: 'Error fetching videos' });
  }
});

// Get single video metadata (public)
router.get('/:id', async (req, res) => {
  try {
    const video = await Video.findById(req.params.id)
      .populate('userId', 'username email role')
      .populate('folder', 'name');
      
    if (!video) return res.status(404).json({ message: 'Video not found' });
    
    // Create response object with video data
    const responseVideo = video.toObject();
    responseVideo.id = video._id;
    
    // Generate signed URL for video if filePath exists
    if (video.filePath) {
      responseVideo.url = await generateSignedUrl(video.filePath);
    } else if (video.url) {
      // Handle legacy video URL
      responseVideo.url = await generateSignedUrl(video.url);
      responseVideo.needsMigration = true;
    }
    
    // Generate signed URL for thumbnail if exists
    if (video.thumbnail) {
      responseVideo.thumbnailUrl = await generateSignedUrl(video.thumbnail);
    }
    
    // Add user information
    if (video.userId) {
      responseVideo.uploader = {
        username: video.userId.username,
        email: video.userId.email,
        role: video.userId.role
      };
    }
    
    // Add folder information if applicable
    if (video.folder) {
      responseVideo.folder = {
        id: video.folder._id,
        name: video.folder.name
      };
    }
    
    res.json(responseVideo);
  } catch (error) {
    console.error('Error fetching video details:', error);
    res.status(500).json({ message: error.message });
  }
});

// Stream video (updated to use S3)
router.get('/:id/stream', async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) return res.status(404).json({ message: 'Video not found' });

    // Generate a signed URL for the video file
    const signedUrl = await generateSignedUrl(video.filePath);
    
    // Redirect to the signed URL
    res.redirect(signedUrl);
  } catch (error) {
    console.error('Streaming error:', error);
    res.status(500).json({ message: 'Error streaming video' });
  }
});

// Get video embed code (public)
router.get('/:id/embed', async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) return res.status(404).json({ message: 'Video not found' });

    const embedCode = `<iframe 
      width="560" 
      height="315" 
      src="${req.protocol}://${req.get('host')}/embed/${video._id}" 
      frameborder="0" 
      allowfullscreen
    ></iframe>`;

    res.json({ embedCode });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Share video
router.post('/:id/share', auth, async (req, res) => {
  try {
    const { type, expiresIn, requireEmail } = req.body;
    const video = await Video.findOne({ _id: req.params.id, userId: req.user.id });
    
    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
    }

    const share = {
      type,
      requireEmail: requireEmail || false,
      expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 24 * 60 * 60 * 1000) : null
    };

    video.shares.push(share);
    await video.save();

    res.status(201).json({
      shareId: share._id,
      shareUrl: `${req.protocol}://${req.get('host')}/share/${video._id}/${share._id}`
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Track video view
router.post('/:id/views', async (req, res) => {
  try {
    const { shareId, email } = req.body;
    const video = await Video.findById(req.params.id);
    
    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
    }

    if (shareId) {
      const share = video.shares.id(shareId);
      if (!share) {
        return res.status(404).json({ message: 'Share not found' });
      }

      if (share.expiresAt && share.expiresAt < new Date()) {
        return res.status(403).json({ message: 'Share link expired' });
      }

      share.accessCount += 1;
      if (email) {
        share.viewers.push({ email, viewedAt: new Date() });
      }
    }

    video.views += 1;
    await video.save();
    res.json({ message: 'View tracked successfully' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Get video analytics
router.get('/:id/analytics', auth, async (req, res) => {
  try {
    console.log(`Analytics request for video ${req.params.id} by user ${req.user._id}`);
    
    // Modified query to find by user ID only since workspaces are not in req.user
    const video = await Video.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    console.log(`Video found: ${video ? 'Yes' : 'No'}`);
    
    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
    }

    console.log(`Video has analytics: ${video.analytics ? 'Yes' : 'No'}`);
    console.log(`Video sessions: ${video.analytics?.viewSessions?.length || 0}`);
    
    // Ensure empty fields are initialized
    if (!video.analytics) {
      video.analytics = { viewSessions: [] };
      console.log('Initialized empty analytics object');
    }
    
    // Get analytics data from helper methods
    const viewsCount = video.getViewsCount();
    const uniqueViewers = video.getUniqueViewers();
    const watchTime = video.getWatchTime();
    const retention = video.getRetention();
    const ctaClicks = video.getCtaClicks();

    // Generate daily view counts for the last 30 days
    const viewsByDate = [];
    const today = new Date();
    const sessions = video.analytics.viewSessions || [];

    // Group sessions by date
    const sessionsByDate = {};
    sessions.forEach(session => {
      if (session.startTime) {
        const date = new Date(session.startTime);
        const dateString = date.toISOString().split('T')[0];
        
        if (!sessionsByDate[dateString]) {
          sessionsByDate[dateString] = 0;
        }
        sessionsByDate[dateString]++;
      }
    });

    // Fill in the last 30 days
    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateString = date.toISOString().split('T')[0];
      const formattedDate = date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      });
      
      viewsByDate.push({
        date: formattedDate,
        count: sessionsByDate[dateString] || 0
      });
    }

    const analyticsData = {
      views: viewsCount,
      uniqueViews: uniqueViewers,
      watchTime,
      retention,
      ctaClicks,
      viewsByDate
    };
    
    console.log('Sending analytics data:', analyticsData);
    res.json(analyticsData);
  } catch (error) {
    console.error('Error getting video analytics:', error);
    res.status(500).json({ message: error.message });
  }
});

// Track video view
router.post('/:id/analytics/view', auth, async (req, res) => {
  try {
    const { 
      sessionId, 
      startTime, 
      endTime, 
      watchTime, 
      playbackPositions, 
      completedQuarters 
    } = req.body;

    if (!sessionId) {
      return res.status(400).json({ message: 'Session ID is required' });
    }

    const video = await Video.findById(req.params.id);
    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
    }

    // Get user agent and IP info
    const userAgent = req.headers['user-agent'];
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    // Create new view session
    const viewSession = {
      sessionId,
      userId: req.user._id,
      startTime: startTime ? new Date(startTime) : new Date(),
      endTime: endTime ? new Date(endTime) : new Date(),
      watchTime: watchTime || 0,
      completedQuarters: completedQuarters || [],
      quarters: [],
      viewerInfo: {
        ip,
        userAgent,
        country: 'Unknown', // Would require GeoIP service
        city: 'Unknown'
      }
    };

    // Add tracking points if available
    if (playbackPositions && Array.isArray(playbackPositions)) {
      playbackPositions.forEach(point => {
        if (point.position !== undefined) {
          // Calculate which quarter this position represents
          const quarterSize = video.duration ? video.duration / 4 : 60;
          const quarter = Math.floor(point.position / quarterSize);
          
          viewSession.quarters.push({
            quarter: quarter >= 0 && quarter < 4 ? quarter : 0,
            position: point.position,
            timestamp: point.timestamp ? new Date(point.timestamp) : new Date()
          });
        }
      });
    }

    // Add session to video analytics
    if (!video.analytics) {
      video.analytics = { viewSessions: [] };
    }
    
    video.analytics.viewSessions.push(viewSession);
    
    // Increment view count
    video.views = (video.views || 0) + 1;
    
    await video.save();
    
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error tracking video view:', error);
    res.status(500).json({ message: error.message });
  }
});

// Track quarter watched
router.post('/:id/analytics/quarters', auth, async (req, res) => {
  try {
    const { sessionId, quarter, position } = req.body;
    
    if (!sessionId || quarter === undefined) {
      return res.status(400).json({ message: 'Session ID and quarter are required' });
    }
    
    const video = await Video.findById(req.params.id);
    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
    }
    
    // Find the session
    if (!video.analytics || !video.analytics.viewSessions) {
      video.analytics = { viewSessions: [] };
    }
    
    let session = video.analytics.viewSessions.find(s => s.sessionId === sessionId);
    
    if (session) {
      // Add quarter if it doesn't exist
      if (!session.completedQuarters.includes(quarter)) {
        session.completedQuarters.push(quarter);
      }
      
      // Add position data
      if (!session.quarters) {
        session.quarters = [];
      }
      
      session.quarters.push({
        quarter,
        position: position || 0,
        timestamp: new Date()
      });
    } else {
      // Create new session if not found
      const newSession = {
        sessionId,
        userId: req.user._id,
        startTime: new Date(),
        completedQuarters: [quarter],
        quarters: [{
          quarter,
          position: position || 0,
          timestamp: new Date()
        }]
      };
      
      video.analytics.viewSessions.push(newSession);
    }
    
    await video.save();
    
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error tracking video quarter:', error);
    res.status(500).json({ message: error.message });
  }
});

// Track CTA click
router.post('/:id/analytics/cta-click', auth, async (req, res) => {
  try {
    const { sessionId } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ message: 'Session ID is required' });
    }
    
    const video = await Video.findById(req.params.id);
    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
    }
    
    // Find the session
    if (!video.analytics || !video.analytics.viewSessions) {
      video.analytics = { viewSessions: [] };
    }
    
    let session = video.analytics.viewSessions.find(s => s.sessionId === sessionId);
    
    if (session) {
      // Mark CTA as clicked
      session.ctaClicked = true;
    } else {
      // Create new session if not found
      const newSession = {
        sessionId,
        userId: req.user._id,
        startTime: new Date(),
        ctaClicked: true
      };
      
      video.analytics.viewSessions.push(newSession);
    }
    
    await video.save();
    
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error tracking CTA click:', error);
    res.status(500).json({ message: error.message });
  }
});

// Get workspace videos (with folder filter)
router.get('/workspace/:workspaceId', auth, async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { folderId } = req.query;
    
    // Build query based on workspace and folder
    let query = { workspace: workspaceId };
    
    if (folderId && folderId !== 'root') {
      query.folder = folderId;
    } else if (folderId === 'root') {
      query.folder = null; // Videos not in any folder
    }

    const videos = await Video.find(query)
      .sort({ createdAt: -1 })
      .populate('userId', 'username email role')
      .populate('folder', 'name');

    // Create array to store all video objects with signed URLs
    const videosWithSignedUrls = [];
    
    // Generate signed URLs for each video
    for (const video of videos) {
      const videoObj = video.toObject();
      videoObj.id = video._id;
      
      // Generate S3 signed URL for video
      if (video.filePath) {
        videoObj.url = await generateSignedUrl(video.filePath);
      } else if (video.url) {
        videoObj.url = await generateSignedUrl(video.url);
        videoObj.needsMigration = true;
      }
      
      // Generate S3 signed URL for thumbnail
      if (video.thumbnail) {
        videoObj.thumbnailUrl = await generateSignedUrl(video.thumbnail);
      }
      
      // Add user information
      if (video.userId) {
        videoObj.uploader = {
          username: video.userId.username,
          email: video.userId.email,
          role: video.userId.role
        };
      }
      
      // Add folder information if applicable
      if (video.folder) {
        videoObj.folder = {
          id: video.folder._id,
          name: video.folder.name
        };
      }
      
      videosWithSignedUrls.push(videoObj);
    }

    res.json(videosWithSignedUrls);
  } catch (error) {
    console.error('Error fetching workspace videos:', error);
    res.status(500).json({ message: error.message });
  }
});

// Upload video to workspace/folder
router.post('/workspace/:workspaceId', auth, upload.fields([
  { name: 'video', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 }
]), async (req, res) => {
  try {
    const { workspaceId } = req.params;
    const { title, description, folderId } = req.body;
    
    // Verify workspace access
    const workspace = await Workspace.findById(workspaceId);
    if (!workspace) {
      return res.status(404).json({ message: 'Workspace not found' });
    }

    if (!req.files || !req.files.video) {
      return res.status(400).json({ message: 'No video file uploaded' });
    }

    const videoFile = req.files.video[0];
    const thumbnailFile = req.files.thumbnail ? req.files.thumbnail[0] : null;

    // Create a new video document with S3 paths
    const video = new Video({
      title,
      description,
      fileName: path.basename(videoFile.key),
      fileSize: videoFile.size,
      mimeType: videoFile.mimetype,
      filePath: videoFile.key, // S3 key path
      thumbnail: thumbnailFile ? thumbnailFile.key : null, // S3 key path for thumbnail
      userId: req.user._id,
      workspace: workspaceId,
      folder: folderId || null
    });

    const savedVideo = await video.save();
    
    // Generate signed URL for direct access
    const videoUrl = await generateSignedUrl(videoFile.key);
    const responseVideo = savedVideo.toObject();
    responseVideo.url = videoUrl;
    
    if (thumbnailFile) {
      responseVideo.thumbnailUrl = await generateSignedUrl(thumbnailFile.key);
    }

    res.status(201).json(responseVideo);
  } catch (error) {
    console.error('Error uploading video:', error);
    res.status(500).json({ message: error.message });
  }
});

// Upload video (protected) - also updated for S3
router.post('/upload', auth, upload.fields([
  { name: 'video', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 }
]), async (req, res) => {
  try {
    if (!req.files || !req.files.video) {
      return res.status(400).json({ message: 'No video file uploaded' });
    }

    const videoFile = req.files.video[0];
    const thumbnailFile = req.files.thumbnail?.[0];

    // Create video record with S3 paths
    const video = new Video({
      title: videoFile.originalname,
      fileName: path.basename(videoFile.key),
      fileSize: videoFile.size,
      mimeType: videoFile.mimetype,
      filePath: videoFile.key,
      description: req.body.description || '',
      thumbnail: thumbnailFile ? thumbnailFile.key : null,
      userId: req.user._id,
      clientGroup: req.user.role === 'client-admin' ? req.user.clientGroup : null
    });

    const newVideo = await video.save();
    
    // Generate signed URL for direct access
    const videoUrl = await generateSignedUrl(videoFile.key);

    // Return video details
    res.status(201).json({
      id: newVideo._id,
      title: newVideo.title,
      url: videoUrl,
      size: newVideo.fileSize,
      uploadDate: newVideo.createdAt
    });
  } catch (error) {
    console.error('Error uploading video:', error);
    res.status(400).json({ message: error.message });
  }
});

// Create video metadata (protected)
router.post('/', auth, async (req, res) => {
  const video = new Video({
    title: req.body.title,
    description: req.body.description,
    url: req.body.url,
    thumbnail: req.body.thumbnail,
    userId: req.user.id,
    clientGroup: req.user.role === 'client-admin' ? req.user.clientGroup : null
  });

  try {
    const newVideo = await video.save();
    res.status(201).json(newVideo);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Update video views (protected)
router.patch('/:id/views', auth, async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) return res.status(404).json({ message: 'Video not found' });
    
    video.views += 1;
    const updatedVideo = await video.save();
    res.json(updatedVideo);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete video - updated for S3
router.delete('/:id', auth, async (req, res) => {
  try {
    const video = await Video.findById(req.params.id);
    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
    }

    // Delete video from S3
    if (video.filePath) {
      const deleteVideoCommand = new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: video.filePath
      });
      await s3Client.send(deleteVideoCommand);
    }
    
    // Delete thumbnail from S3 if exists
    if (video.thumbnail) {
      const deleteThumbnailCommand = new DeleteObjectCommand({
        Bucket: BUCKET_NAME,
        Key: video.thumbnail
      });
      await s3Client.send(deleteThumbnailCommand);
    }

    // Delete from database
    await Video.findByIdAndDelete(req.params.id);
    res.json({ message: 'Video deleted successfully' });
  } catch (error) {
    console.error('Error deleting video:', error);
    res.status(500).json({ message: error.message });
  }
});

// Update video with new settings and thumbnail
router.patch('/:id', auth, upload.single('thumbnail'), async (req, res) => {
  try {
    console.log(`Updating video ${req.params.id} for user ${req.user._id}`);
    console.log('User workspaces:', req.user.workspaces);
    
    // First try to find the video with exact user ID match
    let video = await Video.findOne({ 
      _id: req.params.id,
      userId: req.user._id 
    });
    
    // If not found and user has workspaces, check if video belongs to any of user's workspaces
    if (!video && req.user.workspaces && req.user.workspaces.length > 0) {
      console.log('Checking workspace permissions...');
      video = await Video.findOne({
        _id: req.params.id,
        workspace: { $in: req.user.workspaces }
      });
    }

    if (!video) {
      console.log('Video not found or permission denied');
      return res.status(404).json({ message: 'Video not found or you do not have permission to modify it' });
    }

    console.log('Video found, proceeding with update');

    // Handle basic fields
    const allowedUpdates = ['title', 'description'];
    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        video[field] = req.body[field];
      }
    });

    // Handle custom thumbnail
    if (req.file) {
      try {
        // Generate S3 key
        const thumbnailKey = `thumbnails/${uuid.v4()}-${path.basename(req.file.originalname)}`;
        
        // When multer-s3 is used, the file is automatically uploaded to S3
        // and the path is available in req.file.key
        if (req.file.key) {
          // For multer-s3, the key is already set in the file object
          console.log(`Thumbnail already uploaded to S3 with key: ${req.file.key}`);
          video.thumbnail = req.file.key;
        } else {
          // For local multer uploads, we need to upload to S3 manually
          // This is a fallback for non-S3 configurations
          console.log(`Uploading thumbnail from local path: ${req.file.path}`);
          
          try {
            await uploadToS3(req.file.path, thumbnailKey);
            video.thumbnail = thumbnailKey;
            
            // Clean up local file
            fs.unlinkSync(req.file.path);
          } catch (s3Error) {
            console.error('Error uploading to S3:', s3Error);
            return res.status(500).json({ message: 'Error uploading thumbnail to S3' });
          }
        }
        
        console.log(`Updated thumbnail path: ${video.thumbnail}`);
      } catch (error) {
        console.error('Error processing thumbnail:', error);
        return res.status(500).json({ message: 'Error processing thumbnail' });
      }
    }

    // Handle settings
    if (req.body.settings) {
      try {
        const settings = JSON.parse(req.body.settings);
        console.log('Processing settings update:', settings);
        
        // Initialize settings object if it doesn't exist
        if (!video.settings) {
          video.settings = {};
        }
        
        // Update player color settings
        if (settings.playerColor) {
          video.settings.playerColor = settings.playerColor;
        }
        
        if (settings.secondaryColor) {
          video.settings.secondaryColor = settings.secondaryColor;
        }
        
        // Update player behavior settings
        if (settings.autoPlay !== undefined) {
          video.settings.autoPlay = settings.autoPlay;
        }
        
        if (settings.showControls !== undefined) {
          video.settings.showControls = settings.showControls;
        }
        
        // Update call to action settings
        if (settings.callToAction) {
          video.settings.callToAction = {
            enabled: settings.callToAction.enabled || false,
            title: settings.callToAction.title || 'Want to learn more?',
            description: settings.callToAction.description || '',
            buttonText: settings.callToAction.buttonText || 'Visit Website',
            buttonLink: settings.callToAction.buttonLink || '',
            displayTime: settings.callToAction.displayTime || 0
          };
        }
      } catch (error) {
        console.error('Error parsing settings:', error);
        return res.status(400).json({ message: 'Invalid settings format' });
      }
    }

    console.log('Saving updated video');
    await video.save();
    
    // Generate a response object with thumbnailUrl if available
    const responseVideo = video.toObject();
    responseVideo.id = video._id;
    
    // Generate signed URL for the video
    if (video.filePath) {
      responseVideo.url = await generateSignedUrl(video.filePath);
    }
    
    // Generate signed URL for the thumbnail if exists
    if (video.thumbnail) {
      responseVideo.thumbnailUrl = await generateSignedUrl(video.thumbnail);
      console.log('Generated thumbnail URL:', responseVideo.thumbnailUrl);
    }
    
    res.status(200).json(responseVideo);
  } catch (error) {
    console.error('Error updating video:', error);
    res.status(500).json({ message: error.message });
  }
});

// Associate video with client group
router.post('/:id/associate-group', auth, roleAuth.isClientAdmin, async (req, res) => {
  try {
    const { groupId } = req.body;
    if (!groupId) {
      return res.status(400).json({ message: 'Group ID is required' });
    }

    const video = await Video.findById(req.params.id);
    if (!video) {
      return res.status(404).json({ message: 'Video not found' });
    }

    // Verify ownership or super admin status
    if (req.user.role !== 'super-admin' && video.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to associate this video with a group' });
    }

    // Update the video with the client group
    video.clientGroup = groupId;
    await video.save();

    res.status(200).json(video);
  } catch (error) {
    console.error('Error associating video with group:', error);
    res.status(500).json({ message: 'Error associating video with group' });
  }
});

module.exports = router;
