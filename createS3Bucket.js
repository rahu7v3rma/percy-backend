require('dotenv').config();
const { S3Client, CreateBucketCommand, PutBucketCorsCommand } = require('@aws-sdk/client-s3');

// Initialize S3 client with the credentials from .env
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  }
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME;

async function createBucket() {
  try {
    console.log(`Creating bucket: ${BUCKET_NAME}`);
    
    // For us-east-1, we don't need to specify LocationConstraint
    const params = {
      Bucket: BUCKET_NAME
    };
    
    // Add LocationConstraint for regions other than us-east-1
    if (process.env.AWS_REGION !== 'us-east-1') {
      params.CreateBucketConfiguration = {
        LocationConstraint: process.env.AWS_REGION
      };
    }
    
    const createBucketCommand = new CreateBucketCommand(params);
    await s3Client.send(createBucketCommand);
    console.log(`Bucket ${BUCKET_NAME} created successfully!`);

    // Configure CORS for the bucket
    console.log(`Configuring CORS for bucket: ${BUCKET_NAME}`);
    const corsParams = {
      Bucket: BUCKET_NAME,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedHeaders: ["*"],
            AllowedMethods: ["GET", "PUT", "POST", "DELETE", "HEAD"],
            AllowedOrigins: [
              "http://localhost:8080", 
              "http://localhost:3000",
              process.env.FRONTEND_URL || "https://app.hey-percy.com"
            ],
            ExposeHeaders: ["ETag", "Content-Length", "Content-Type"]
          }
        ]
      }
    };

    const putBucketCorsCommand = new PutBucketCorsCommand(corsParams);
    await s3Client.send(putBucketCorsCommand);
    console.log(`CORS configured for bucket ${BUCKET_NAME}`);

  } catch (error) {
    console.error("Error creating bucket:", error);
  }
}

createBucket(); 