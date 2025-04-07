require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { s3Client, BUCKET_NAME } = require('./src/config/s3Config');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const Video = require('./src/models/Video');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => {
  console.error('MongoDB connection error:', err);
  process.exit(1);
});

// Function to upload a file to S3
async function uploadFileToS3(filePath, s3Key, contentType) {
  try {
    if (!fs.existsSync(filePath)) {
      console.error(`File does not exist: ${filePath}`);
      return null;
    }

    const fileContent = fs.readFileSync(filePath);
    
    const uploadParams = {
      Bucket: BUCKET_NAME,
      Key: s3Key,
      Body: fileContent,
      ContentType: contentType
    };
    
    console.log(`Uploading ${filePath} to S3 as ${s3Key}`);
    const uploadCommand = new PutObjectCommand(uploadParams);
    await s3Client.send(uploadCommand);
    console.log(`Successfully uploaded ${s3Key}`);
    return s3Key;
  } catch (error) {
    console.error(`Error uploading file ${filePath}:`, error);
    return null;
  }
}

async function migrateVideosToS3() {
  try {
    console.log('Starting migration of videos to S3...');
    
    // Get all videos from database
    const videos = await Video.find({});
    console.log(`Found ${videos.length} videos to migrate`);
    
    let migratedCount = 0;
    let errorCount = 0;
    
    for (const video of videos) {
      console.log(`\nProcessing video ${video._id}...`);
      
      // Check if the video has already been migrated
      if (video.filePath && video.filePath.startsWith('videos/')) {
        console.log(`Video ${video._id} already has S3 path: ${video.filePath}`);
        continue;
      }
      
      // Handle video file
      let videoPath, thumbnailPath;
      
      // Convert relative URL to absolute file path
      if (video.url) {
        // Handle both /uploads/... and uploads/... formats
        const normalizedUrl = video.url.startsWith('/') ? video.url : `/${video.url}`;
        videoPath = path.join(__dirname, normalizedUrl);
        console.log(`Video path: ${videoPath}`);
      } else {
        console.warn(`No URL found for video ${video._id}`);
        errorCount++;
        continue;
      }
      
      if (video.thumbnail) {
        // Handle both /uploads/... and uploads/... formats
        const normalizedThumbnail = video.thumbnail.startsWith('/') ? video.thumbnail : `/${video.thumbnail}`;
        thumbnailPath = path.join(__dirname, normalizedThumbnail);
        console.log(`Thumbnail path: ${thumbnailPath}`);
      }
      
      // Generate S3 keys
      const videoFileName = path.basename(videoPath || '');
      const thumbnailFileName = thumbnailPath ? path.basename(thumbnailPath) : '';
      
      const videoS3Key = `videos/${Date.now()}-${videoFileName}`;
      const thumbnailS3Key = thumbnailFileName ? `thumbnails/${Date.now()}-${thumbnailFileName}` : null;
      
      // Upload video to S3
      let videoS3Path = null;
      if (videoPath && fs.existsSync(videoPath)) {
        console.log(`Uploading video file: ${videoPath}`);
        videoS3Path = await uploadFileToS3(videoPath, videoS3Key, video.mimeType || 'video/mp4');
      } else {
        console.warn(`Video file not found for ${video._id}: ${videoPath}`);
        errorCount++;
        continue;
      }
      
      // Upload thumbnail to S3 if exists
      let thumbnailS3Path = null;
      if (thumbnailPath && fs.existsSync(thumbnailPath)) {
        console.log(`Uploading thumbnail file: ${thumbnailPath}`);
        const thumbnailMimeType = thumbnailPath.endsWith('.png') ? 'image/png' : 
                                 thumbnailPath.endsWith('.jpg') || thumbnailPath.endsWith('.jpeg') ? 'image/jpeg' :
                                 thumbnailPath.endsWith('.gif') ? 'image/gif' :
                                 thumbnailPath.endsWith('.webp') ? 'image/webp' :
                                 thumbnailPath.endsWith('.avif') ? 'image/avif' : 'image/jpeg';
        
        thumbnailS3Path = await uploadFileToS3(thumbnailPath, thumbnailS3Key, thumbnailMimeType);
      } else if (thumbnailPath) {
        console.warn(`Thumbnail file not found: ${thumbnailPath}`);
      }
      
      // Update database record with S3 paths
      if (videoS3Path) {
        video.filePath = videoS3Path;
        
        if (thumbnailS3Path) {
          video.thumbnail = thumbnailS3Path;
        }
        
        // Save updated video document
        await video.save();
        console.log(`Updated video ${video._id} with S3 paths:`);
        console.log(`  - Video: ${videoS3Path}`);
        if (thumbnailS3Path) console.log(`  - Thumbnail: ${thumbnailS3Path}`);
        
        migratedCount++;
        
        // Don't delete files during migration, safer to keep them until verified
        // Use the cleanup script after verification
      } else {
        console.error(`Failed to migrate video ${video._id}`);
        errorCount++;
      }
    }
    
    console.log('\nMigration summary:');
    console.log(`Total videos: ${videos.length}`);
    console.log(`Successfully migrated: ${migratedCount}`);
    console.log(`Failed to migrate: ${errorCount}`);
    console.log(`Already migrated: ${videos.length - migratedCount - errorCount}`);
    
    console.log('\nMigration completed!');
    console.log('Run the cleanup script after verifying migration to remove local files.');
  } catch (error) {
    console.error('Error during migration:', error);
  } finally {
    mongoose.disconnect();
  }
}

migrateVideosToS3(); 