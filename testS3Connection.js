require('dotenv').config();
const fs = require('fs');
const { s3Client, BUCKET_NAME } = require('./src/config/s3Config');
const { PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

async function testS3Connection() {
  console.log('Testing S3 connection...');
  console.log('Bucket Name:', BUCKET_NAME);
  console.log('AWS Region:', process.env.AWS_REGION);
  
  try {
    // Create a test file
    const testFileName = 'test-file.txt';
    fs.writeFileSync(testFileName, 'This is a test file for S3 upload.');
    
    // Upload test file to S3
    const fileContent = fs.readFileSync(testFileName);
    const key = `test/${Date.now()}-${testFileName}`;
    
    const uploadParams = {
      Bucket: BUCKET_NAME,
      Key: key,
      Body: fileContent,
      ContentType: 'text/plain'
    };
    
    console.log('Uploading test file...');
    const uploadCommand = new PutObjectCommand(uploadParams);
    await s3Client.send(uploadCommand);
    console.log('Upload successful!');
    
    // Generate presigned URL
    console.log('Generating presigned URL...');
    const getCommand = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key
    });
    
    const signedUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 });
    console.log('Presigned URL:', signedUrl);
    
    // Clean up
    fs.unlinkSync(testFileName);
    console.log('S3 connection test completed successfully.');
  } catch (error) {
    console.error('Error testing S3 connection:', error);
  }
}

testS3Connection(); 