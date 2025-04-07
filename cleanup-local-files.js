require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
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

// Directories to check and clean
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const VIDEO_UPLOADS_DIR = path.join(UPLOADS_DIR, 'videos');
const THUMBNAIL_UPLOADS_DIR = path.join(UPLOADS_DIR, 'thumbnails');

// Safely delete a file
function safeDeleteFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`Deleted: ${filePath}`);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`Failed to delete ${filePath}:`, error);
    return false;
  }
}

// Delete all files in a directory
function cleanDirectory(directory) {
  console.log(`Cleaning directory: ${directory}`);
  if (!fs.existsSync(directory)) {
    console.log(`Directory does not exist: ${directory}`);
    return;
  }

  const files = fs.readdirSync(directory);
  console.log(`Found ${files.length} files in ${directory}`);
  
  let deletedCount = 0;
  for (const file of files) {
    const filePath = path.join(directory, file);
    // Skip directories
    if (fs.statSync(filePath).isDirectory()) {
      console.log(`Skipping subdirectory: ${filePath}`);
      continue;
    }
    
    if (safeDeleteFile(filePath)) {
      deletedCount++;
    }
  }
  
  console.log(`Deleted ${deletedCount} files from ${directory}`);
}

async function cleanupAfterS3Migration() {
  try {
    console.log('Starting cleanup after S3 migration...');
    
    // Check if videos have been migrated to S3
    const videos = await Video.find({});
    const nonMigratedVideos = videos.filter(v => !v.filePath || v.filePath.startsWith('/uploads/'));
    
    if (nonMigratedVideos.length > 0) {
      console.warn(`WARNING: ${nonMigratedVideos.length} videos have not been migrated to S3 yet.`);
      console.warn('Run the migration script first with: npm run migrate-to-s3');
      
      const proceed = await promptUser('Do you want to proceed with deletion anyway? (yes/no): ');
      if (proceed.toLowerCase() !== 'yes') {
        console.log('Cleanup aborted.');
        process.exit(0);
      }
    }
    
    // Clean video uploads directory
    cleanDirectory(VIDEO_UPLOADS_DIR);
    
    // Clean thumbnail uploads directory
    cleanDirectory(THUMBNAIL_UPLOADS_DIR);
    
    // Remove empty uploads directories
    if (fs.existsSync(VIDEO_UPLOADS_DIR) && fs.readdirSync(VIDEO_UPLOADS_DIR).length === 0) {
      fs.rmdirSync(VIDEO_UPLOADS_DIR);
      console.log(`Removed empty directory: ${VIDEO_UPLOADS_DIR}`);
    }
    
    if (fs.existsSync(THUMBNAIL_UPLOADS_DIR) && fs.readdirSync(THUMBNAIL_UPLOADS_DIR).length === 0) {
      fs.rmdirSync(THUMBNAIL_UPLOADS_DIR);
      console.log(`Removed empty directory: ${THUMBNAIL_UPLOADS_DIR}`);
    }
    
    if (fs.existsSync(UPLOADS_DIR) && fs.readdirSync(UPLOADS_DIR).length === 0) {
      fs.rmdirSync(UPLOADS_DIR);
      console.log(`Removed empty directory: ${UPLOADS_DIR}`);
    }
    
    console.log('Cleanup completed!');
  } catch (error) {
    console.error('Error during cleanup:', error);
  } finally {
    mongoose.disconnect();
  }
}

// Simple utility to prompt user for confirmation
function promptUser(question) {
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(resolve => {
    readline.question(question, answer => {
      readline.close();
      resolve(answer);
    });
  });
}

// Run the cleanup
cleanupAfterS3Migration(); 