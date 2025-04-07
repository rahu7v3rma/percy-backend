const express = require('express');
const router = express.Router();
const Video = require('../models/Video');
const ShareLink = require('../models/ShareLink');
const nodemailer = require('nodemailer');
const auth = require('../middleware/auth');

// Create a share link
router.post('/create', auth, async (req, res) => {

  console.log('* * * * * * * * ** * * * * * *  * *')
  console.log('share route --- ',req.body)
  console.log('req.user.id  --- ',req.user.id )
  console.log('* * * * * * * * ** * * * * * *  * *')
  try {
    const { videoId, expiryDate, requireEmail } = req.body;

    // Verify video exists and user has access
    const video = await Video.findOne({ _id: videoId, userId: req.user._id });
    console.log('video ---- ',video)
    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    // Create share link
    const shareLink = new ShareLink({
      videoId,
      userId: req.user._id,
      expiryDate: expiryDate ? new Date(Number(expiryDate)) : null,
      requireEmail,
      token: Math.random().toString(36).substring(2) + Date.now().toString(36)
    });

    console.log('share link  ----- ',shareLink)

    await shareLink.save();

    res.json({
      shareUrl: `${process.env.FRONTEND_URL}/share/${shareLink.token}`,
      expiryDate: shareLink.expiryDate
    });
  } catch (error) {
    console.error('Error creating share link:', error);
    res.status(500).json({ error: 'Error creating share link' });
  }
});

// Validate share link and get video
router.get('/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { email } = req.query;


    
    const shareLink = await ShareLink.findOne({ token });
    console.log('req.body get video shared --- ',shareLink)
    
    if (!shareLink) {
      return res.status(404).json({ error: 'Share link not found' });
    }

    // Check if link has expired
    if (shareLink.expiryDate && new Date() > shareLink.expiryDate) {
      return res.status(403).json({ error: 'Share link has expired' });
    }

    // Check if email is required
    if (shareLink.requireEmail && !email) {
      return res.status(403).json({ 
        error: 'Email required',
        requireEmail: true
      });
    }

    const video = await Video.findById(shareLink.videoId)
      .select('title description url thumbnail');


    console.log('video --- ',video)
    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    // // Increment views
    // video.views += 1;
    // await video.save();

    res.json(video);
  } catch (error) {
    console.error('Error validating share link:', error);
    res.status(500).json({ error: 'Error validating share link' });
  }
});

// Send share link via email
router.post('/email',auth, async (req, res) => {
  try {
    const { videoId, recipientEmail, message, expiryDate, requireEmail } = req.body;

    console.log('req.user ---- ',req.user)

    // Create share link first
    const shareLink = new ShareLink({
      videoId,
      userId: req.user._id,
      expiryDate: expiryDate ? new Date(Number(expiryDate)) : null,
      requireEmail,
      token: Math.random().toString(36).substring(2) + Date.now().toString(36)
    });

    await shareLink.save();

    const video = await Video.findById(videoId);
    if (!video) {
      return res.status(404).json({ error: 'Video not found' });
    }

    // Configure email transport
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    // Send email
    await transporter.sendMail({
      from: process.env.SMTP_FROM,
      to: recipientEmail,
      subject: `${req.user.username} shared a video with you: ${video.title}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Video Shared With You</h2>
          <p>${req.user.username} has shared a video with you: <strong>${video.title}</strong></p>
          ${message ? `<p>Message: ${message}</p>` : ''}
          <p>Click the button below to watch the video:</p>
          <a href="${process.env.FRONTEND_URL}/share/${shareLink.token}" 
             style="display: inline-block; padding: 12px 24px; background: #9333EA; color: white; text-decoration: none; border-radius: 6px;">
            Watch Video
          </a>
          ${shareLink.expiryDate ? 
            `<p style="color: #666; font-size: 14px;">This link will expire on ${shareLink.expiryDate.toLocaleString()}</p>` 
            : ''}
        </div>
      `
    });

    res.json({ message: 'Share link sent successfully' });
  } catch (error) {
    console.error('Error sending share email:', error);
    res.status(500).json({ error: 'Error sending share email' });
  }
});

module.exports = router;
