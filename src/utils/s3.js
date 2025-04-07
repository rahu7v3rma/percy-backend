const { GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { s3Client, BUCKET_NAME } = require('../config/s3Config');

/**
 * Generates a signed URL for accessing an S3 object
 * @param {string} key - The S3 object key
 * @returns {Promise<string|null>} The signed URL or null if key is invalid
 */
async function generateSignedUrl(key) {
  // Skip if key is null or undefined
  if (!key) return null;
  
  // If key already contains a full URL, return it as is
  if (key.startsWith('http://') || key.startsWith('https://')) {
    return key;
  }
  
  // Check if the key is a relative path that doesn't start with "thumbnails/" or "videos/"
  if (!key.startsWith('thumbnails/') && !key.startsWith('videos/') && 
      (key.startsWith('/uploads/') || key.includes('/thumbnails/') || key.includes('/uploads/'))) {
    console.warn(`Legacy path detected: ${key}, needs migration`);
    // For backward compatibility, return the local server URL temporarily
    // This ensures things don't break during migration
    return `${process.env.BACKEND_URL}${key.startsWith('/') ? '' : '/'}${key}`;
  }
  
  // Generate S3 signed URL
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key
  });
  return await getSignedUrl(s3Client, command, { expiresIn: 3600 }); // URL expires in 1 hour
}

module.exports = {
  generateSignedUrl
}; 