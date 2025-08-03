const mongoose = require('mongoose');

const songSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Song title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  artist: {
    type: String,
    required: [true, 'Artist name is required'],
    trim: true,
    maxlength: [100, 'Artist name cannot exceed 100 characters']
  },
  album: {
    name: {
      type: String,
      trim: true,
      maxlength: [200, 'Album name cannot exceed 200 characters']
    },
    releaseDate: Date,
    totalTracks: Number
  },
  duration: {
    type: Number,
    required: [true, 'Song duration is required'],
    min: [1, 'Duration must be at least 1 second']
  },
  genre: {
    type: [String],
    required: [true, 'At least one genre is required'],
    validate: {
      validator: function(v) {
        return v && v.length > 0;
      },
      message: 'At least one genre must be specified'
    }
  },
  subGenre: [String],
  mood: {
    type: [String],
    enum: ['happy', 'sad', 'energetic', 'calm', 'romantic', 'angry', 'nostalgic', 'uplifting', 'melancholic', 'party'],
    default: []
  },
  language: {
    type: String,
     enum: {
    values: [
      'english', 'hindi', 'gujarati', 'tamil', 'telugu', 'marathi', 
      'bengali', 'kannada', 'malayalam', 'punjabi', 'urdu', 'odia',
      'spanish', 'french', 'german', 'italian', 'portuguese', 'russian',
      'arabic', 'chinese', 'japanese', 'korean', 'none'
    ],},
    required: [true, 'Language is required'],
    trim: true
  },
  lyrics: {
    text: String,
    language: String,
    hasExplicitContent: { type: Boolean, default: false }
  },
  audioFile: {
    filename: {
      type: String,
      required: [true, 'Audio filename is required']
    },
    originalName: String,
    path: {
      type: String,
      required: [true, 'Audio file path is required']
    },
    size: Number,
    format: {
      type: String,
      enum: ['mp3','mpeg','wav', 'flac', 'm4a', 'ogg'],
      required: true
    },
    bitrate: Number,
    sampleRate: Number,
    quality: {
      type: String,
      enum: ['low', 'medium', 'high', 'lossless'],
      default: 'medium'
    }
  },
  coverImage: {
    filename: String,
    path: String,
    size: Number,
    format: String
  },
  metadata: {
    bpm: Number,
    key: String,
    timeSignature: String,
    isrc: String, // International Standard Recording Code
    composer: [String],
    producer: [String],
    recordLabel: String,
    copyright: String
  },
  tags: [String],
  playCount: {
    type: Number,
    default: 0
  },
  downloadCount: {
    type: Number,
    default: 0
  },
  likeCount: {
    type: Number,
    default: 0
  },
  ratings: {
    average: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },
    count: {
      type: Number,
      default: 0
    },
    distribution: {
      1: { type: Number, default: 0 },
      2: { type: Number, default: 0 },
      3: { type: Number, default: 0 },
      4: { type: Number, default: 0 },
      5: { type: Number, default: 0 }
    }
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'pending', 'rejected'],
    default: 'active'
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  uploadDate: {
    type: Date,
    default: Date.now
  },
  lastModified: {
    type: Date,
    default: Date.now
  },
  featured: {
    type: Boolean,
    default: false
  },
  trending: {
    score: { type: Number, default: 0 },
    lastUpdated: { type: Date, default: Date.now }
  },
  accessibility: {
    transcription: String,
    audioDescription: String
  },
  regionalAvailability: {
    countries: [String], // ISO country codes
    restrictions: [String]
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better search performance
songSchema.index({ title: 'text', artist: 'text', 'album.name': 'text' });
songSchema.index({ artist: 1 });
songSchema.index({ genre: 1 });
songSchema.index({ language: 1 });
songSchema.index({ mood: 1 });
songSchema.index({ playCount: -1 });
songSchema.index({ 'ratings.average': -1 });
songSchema.index({ featured: 1 });
songSchema.index({ status: 1 });
songSchema.index({ uploadDate: -1 });
songSchema.index({ 'trending.score': -1 });

// Compound indexes for complex queries
songSchema.index({ genre: 1, language: 1 });
songSchema.index({ artist: 1, 'album.name': 1 });
songSchema.index({ status: 1, featured: 1, playCount: -1 });

// Virtual for formatted duration
songSchema.virtual('formattedDuration').get(function() {
  const minutes = Math.floor(this.duration / 60);
  const seconds = this.duration % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
});

// Virtual for audio URL
songSchema.virtual('audioUrl').get(function() {
  if (this.audioFile && this.audioFile.path) {
    return `/api/stream/audio/${this._id}`;
  }
  return null;
});

// Virtual for cover image URL
songSchema.virtual('coverUrl').get(function() {
  if (this.coverImage && this.coverImage.path) {
    return `/uploads/covers/${this.coverImage.filename}`;
  }
  return '/uploads/covers/default-cover.jpg';
});

// Virtual for popularity score
songSchema.virtual('popularityScore').get(function() {
  const playWeight = 0.4;
  const ratingWeight = 0.3;
  const likeWeight = 0.2;
  const downloadWeight = 0.1;
  
  const normalizedPlays = Math.min(this.playCount / 1000, 1);
  const normalizedRating = this.ratings.average / 5;
  const normalizedLikes = Math.min(this.likeCount / 100, 1);
  const normalizedDownloads = Math.min(this.downloadCount / 50, 1);
  
  return (
    normalizedPlays * playWeight +
    normalizedRating * ratingWeight +
    normalizedLikes * likeWeight +
    normalizedDownloads * downloadWeight
  ) * 100;
});

// Pre-save middleware
songSchema.pre('save', function(next) {
  this.lastModified = new Date();
  next();
});

// Method to increment play count
songSchema.methods.incrementPlayCount = function() {
  this.playCount += 1;
  this.updateTrendingScore();
  return this.save();
};

// Method to increment download count
songSchema.methods.incrementDownloadCount = function() {
  this.downloadCount += 1;
  return this.save();
};

// Method to add rating
songSchema.methods.addRating = function(rating) {
  const oldCount = this.ratings.count;
  const oldAverage = this.ratings.average;
  
  // Update distribution
  this.ratings.distribution[rating] += 1;
  
  // Update count and average
  this.ratings.count = oldCount + 1;
  this.ratings.average = ((oldAverage * oldCount) + rating) / this.ratings.count;
  
  this.updateTrendingScore();
  return this.save();
};

// Method to update rating
songSchema.methods.updateRating = function(oldRating, newRating) {
  // Update distribution
  this.ratings.distribution[oldRating] -= 1;
  this.ratings.distribution[newRating] += 1;
  
  // Recalculate average
  let totalScore = 0;
  for (let i = 1; i <= 5; i++) {
    totalScore += i * this.ratings.distribution[i];
  }
  
  this.ratings.average = this.ratings.count > 0 ? totalScore / this.ratings.count : 0;
  this.updateTrendingScore();
  return this.save();
};

// Method to update trending score
songSchema.methods.updateTrendingScore = function() {
  const now = new Date();
  const daysSinceUpload = (now - this.uploadDate) / (1000 * 60 * 60 * 24);
  
  // Trending score based on recent activity and time decay
  const recentPlays = this.playCount;
  const ratingBonus = this.ratings.average * this.ratings.count;
  const timeDecay = Math.max(0.1, 1 / (1 + daysSinceUpload * 0.1));
  
  this.trending.score = (recentPlays + ratingBonus) * timeDecay;
  this.trending.lastUpdated = now;
};

// Static method to get trending songs
songSchema.statics.getTrending = function(limit = 20) {
  return this.find({ status: 'active' })
    .sort({ 'trending.score': -1 })
    .limit(limit)
    .populate('uploadedBy', 'username profile.avatar');
};

// Static method to get featured songs
songSchema.statics.getFeatured = function(limit = 10) {
  return this.find({ status: 'active', featured: true })
    .sort({ playCount: -1 })
    .limit(limit)
    .populate('uploadedBy', 'username profile.avatar');
};

// Static method to search songs
songSchema.statics.searchSongs = function(query, filters = {}) {
  const searchQuery = { status: 'active' };
  
  // Text search
  if (query && query.trim()) {
    searchQuery.$text = { $search: query };
  }
  
  // Apply filters
  if (filters.genre && filters.genre.length > 0) {
    searchQuery.genre = { $in: filters.genre };
  }
  
  if (filters.language) {
    searchQuery.language = filters.language;
  }
  
  if (filters.mood && filters.mood.length > 0) {
    searchQuery.mood = { $in: filters.mood };
  }
  
  if (filters.artist) {
    searchQuery.artist = new RegExp(filters.artist, 'i');
  }
  
  if (filters.minRating) {
    searchQuery['ratings.average'] = { $gte: filters.minRating };
  }
  
  if (filters.duration) {
    if (filters.duration.min) {
      searchQuery.duration = { ...searchQuery.duration, $gte: filters.duration.min };
    }
    if (filters.duration.max) {
      searchQuery.duration = { ...searchQuery.duration, $lte: filters.duration.max };
    }
  }
  
  return this.find(searchQuery)
    .populate('uploadedBy', 'username profile.avatar')
    .sort(query ? { score: { $meta: 'textScore' }, playCount: -1 } : { playCount: -1 });
};

// Static method to get recommendations
songSchema.statics.getRecommendations = function(userId, preferences, limit = 20) {
  const query = { status: 'active' };
  
  // Filter by preferred genres and languages
  if (preferences.genres && preferences.genres.length > 0) {
    query.genre = { $in: preferences.genres };
  }
  
  if (preferences.languages && preferences.languages.length > 0) {
    query.language = { $in: preferences.languages };
  }
  
  return this.find(query)
    .sort({ 'ratings.average': -1, playCount: -1 })
    .limit(limit * 2) // Get more to filter out already heard
    .populate('uploadedBy', 'username profile.avatar');
};

module.exports = mongoose.model('Song', songSchema);