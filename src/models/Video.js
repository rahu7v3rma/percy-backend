const mongoose = require('mongoose');

// Call to action schema
const callToActionSchema = new mongoose.Schema({
  enabled: {
    type: Boolean,
    default: false
  },
  title: {
    type: String,
    default: 'Want to learn more?'
  },
  description: {
    type: String
  },
  buttonText: {
    type: String,
    default: 'Visit Website'
  },
  buttonLink: {
    type: String
  },
  displayTime: {
    type: Number,
    default: 0
  }
}, { _id: false });

// Video settings schema
const videoSettingsSchema = new mongoose.Schema({
  playerColor: {
    type: String,
    default: '#E11D48'
  },
  secondaryColor: {
    type: String,
    default: '#581C87'
  },
  autoPlay: {
    type: Boolean,
    default: false
  },
  showControls: {
    type: Boolean,
    default: true
  },
  callToAction: callToActionSchema
}, { _id: false });

// Analytics tracking schema
const analyticsSchema = new mongoose.Schema({
  viewSessions: [{
    sessionId: String,
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    startTime: Date,
    endTime: Date,
    watchTime: Number, // in seconds
    completedQuarters: [Number], // 0-3 representing each quarter watched
    quarters: [
      {
        quarter: Number, // 0-3
        position: Number, // seconds into the video
        timestamp: Date
      }
    ],
    ctaClicked: {
      type: Boolean,
      default: false
    },
    viewerInfo: {
      ip: String,
      userAgent: String,
      country: String,
      city: String
    }
  }]
}, { _id: false });

const videoSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  filePath: {
    type: String,
    required: true
  },
  thumbnail: {
    type: String
  },
  duration: {
    type: Number
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  clientGroup: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ClientGroup',
    required: true
  },
  campaigns: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Campaign'
  }],
  status: {
    type: String,
    enum: ['processing', 'ready', 'error'],
    default: 'processing'
  },
  visibility: {
    type: String,
    enum: ['public', 'private', 'campaign'],
    default: 'private'
  },
  metadata: {
    type: Map,
    of: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  views: {
    type: Number,
    default: 0
  },
  shares: [{
    type: {
      type: String, 
      enum: ['public', 'private'],
      default: 'public'
    },
    accessCount: {
      type: Number,
      default: 0
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    expiresAt: {
      type: Date
    },
    requireEmail: {
      type: Boolean,
      default: false
    },
    viewers: [{
      email: String,
      viewedAt: Date
    }]
  }],
  settings: {
    type: videoSettingsSchema,
    default: () => ({})
  },
  analytics: {
    type: analyticsSchema,
    default: () => ({
      viewSessions: []
    })
  }
}, { timestamps: true });

// Helper methods
videoSchema.methods.getViewsCount = function() {
  console.log('getViewsCount called, views:', this.views);
  return this.views || 0;
};

videoSchema.methods.getUniqueViewers = function() {
  console.log('getUniqueViewers called, analytics:', this.analytics ? 'exists' : 'null');
  
  const viewerIds = new Set();
  
  if (this.analytics && this.analytics.viewSessions) {
    this.analytics.viewSessions.forEach(session => {
      if (session.userId) {
        viewerIds.add(session.userId.toString());
      }
    });
  }
  
  console.log('Unique viewers count:', viewerIds.size);
  return viewerIds.size;
};

videoSchema.methods.getWatchTime = function() {
  console.log('getWatchTime called, analytics:', this.analytics ? 'exists' : 'null');
  
  if (!this.analytics || !this.analytics.viewSessions || this.analytics.viewSessions.length === 0) {
    console.log('No view sessions found');
    return { total: 0, average: 0 };
  }
  
  let totalTime = 0;
  
  this.analytics.viewSessions.forEach(session => {
    if (session.watchTime) {
      totalTime += session.watchTime;
    }
  });
  
  const average = totalTime / this.analytics.viewSessions.length;
  console.log(`Total watch time: ${totalTime}, Average: ${average}`);
  
  return {
    total: totalTime,
    average: average
  };
};

videoSchema.methods.getRetention = function() {
  console.log('getRetention called, analytics:', this.analytics ? 'exists' : 'null');
  
  if (!this.analytics || !this.analytics.viewSessions || this.analytics.viewSessions.length === 0) {
    console.log('No view sessions found for retention');
    return { quarters: [0, 0, 0, 0] };
  }
  
  const quartersCount = [0, 0, 0, 0];
  
  this.analytics.viewSessions.forEach(session => {
    if (session.completedQuarters && session.completedQuarters.length > 0) {
      session.completedQuarters.forEach(quarter => {
        if (quarter >= 0 && quarter < 4) {
          quartersCount[quarter]++;
        }
      });
    }
  });
  
  const sessionCount = this.analytics.viewSessions.length;
  const quartersPercentage = quartersCount.map(count => (count / sessionCount) * 100);
  
  console.log('Quarters retention:', quartersPercentage);
  return { quarters: quartersPercentage };
};

videoSchema.methods.getCtaClicks = function() {
  console.log('getCtaClicks called, analytics:', this.analytics ? 'exists' : 'null');
  
  if (!this.analytics || !this.analytics.viewSessions) {
    console.log('No view sessions found for CTA clicks');
    return 0;
  }
  
  const clickCount = this.analytics.viewSessions.filter(session => session.ctaClicked).length;
  console.log('CTA clicks:', clickCount);
  return clickCount;
};

// Add indexes
videoSchema.index({ userId: 1 });
videoSchema.index({ clientGroup: 1 });
videoSchema.index({ views: -1 });
videoSchema.index({ "analytics.viewSessions.userId": 1 });
videoSchema.index({ "analytics.viewSessions.startTime": 1 });

const Video = mongoose.model('Video', videoSchema);

module.exports = Video;
