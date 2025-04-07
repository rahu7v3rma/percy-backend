const fs = require('fs');
const { s3Client, BUCKET_NAME } = require('../config/s3Config');
const { PutObjectCommand } = require('@aws-sdk/client-s3');

/**
 * Upload a file from a local path to S3
 * @param {string} filePath - Local file path
 * @param {string} key - S3 key (path in the bucket)
 * @returns {Promise<void>}
 */
const uploadToS3 = async (filePath, key) => {
  try {
    console.log(`Uploading file from ${filePath} to S3 bucket ${BUCKET_NAME} with key ${key}`);
    
    const fileContent = fs.readFileSync(filePath);
    
    const params = {
      Bucket: BUCKET_NAME,
      Key: key,
      Body: fileContent
    };
    
    const command = new PutObjectCommand(params);
    const result = await s3Client.send(command);
    
    console.log(`Upload successful. ETag: ${result.ETag}`);
    return;
  } catch (error) {
    console.error('Error uploading to S3:', error);
    throw error;
  }
};

module.exports = {
  uploadToS3
}; 