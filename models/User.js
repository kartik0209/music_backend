const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    minlength: [3, 'Username must be at least 3 characters'],
    maxlength: [30, 'Username cannot exceed 30 characters'],
    match: [/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  profile: {
    firstName: {
      type: String,
      trim: true,
      maxlength: [50, 'First name cannot exceed 50 characters']
    },
    lastName: {
      type: String,
      trim: true,
      maxlength: [50, 'Last name cannot exceed 50 characters']
    },
    bio: {
      type: String,
      maxlength: [500, 'Bio cannot exceed 500 characters']
    },
    avatar: {
      cloudinaryId: String,
      url: String,
      secureUrl: String,
      size: Number,
      format: String
    },
    dateOfBirth: Date,
    country: String,
    city: String
  },
  preferences: {
    favoriteGenres: [String],
    preferredLanguages: [String],
    recommendations: {
      enablePersonalized: { type: Boolean, default: true },
      includeExplicit: { type: Boolean, default: false }
    },
    privacy: {
      profilePublic: { type: Boolean, default: true },
      playlistsPublic: { type: Boolean, default: true },
      followersVisible: { type: Boolean, default: true }
    }
  },
  social: {
    following: [{
      user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      followedAt: { type: Date, default: Date.now }
    }],
    followers: [{
      user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      followedAt: { type: Date, default: Date.now }
    }],
    followingArtists: [{
      artist: String,
      followedAt: { type: Date, default: Date.now }
    }]
  },
  activity: {
    lastLogin: Date,
    totalPlayTime: { type: Number, default: 0 }, // in seconds
    songsPlayed: { type: Number, default: 0 },
    playlistsCreated: { type: Number, default: 0 },
    ratingsGiven: { type: Number, default: 0 }
  },
  listeningHistory: [{
    song: { type: mongoose.Schema.Types.ObjectId, ref: 'Song' },
    playedAt: { type: Date, default: Date.now },
    duration: Number, // seconds played
    completed: { type: Boolean, default: false }
  }],
  ratings: [{
    song: { type: mongoose.Schema.Types.ObjectId, ref: 'Song' },
    rating: { type: Number, min: 1, max: 5 },
    ratedAt: { type: Date, default: Date.now }
  }],
  likedSongs: [{
    song: { type: mongoose.Schema.Types.ObjectId, ref: 'Song' },
    likedAt: { type: Date, default: Date.now }
  }],
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: String,
  passwordResetToken: String,
  passwordResetExpires: Date,
  accountStatus: {
    type: String,
    enum: ['active', 'suspended', 'deactivated'],
    default: 'active'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
userSchema.index({ email: 1 });
userSchema.index({ username: 1 });
userSchema.index({ 'social.following.user': 1 });
userSchema.index({ 'listeningHistory.song': 1 });
userSchema.index({ 'listeningHistory.playedAt': -1 });

// Virtual for follower count
userSchema.virtual('followerCount').get(function() {
  return this.social.followers.length;
});

// Virtual for following count
userSchema.virtual('followingCount').get(function() {
  return this.social.following.length;
});

// Virtual for full name
userSchema.virtual('fullName').get(function() {
  if (this.profile.firstName && this.profile.lastName) {
    return `${this.profile.firstName} ${this.profile.lastName}`;
  }
  return this.profile.firstName || this.profile.lastName || this.username;
});

// Virtual for avatar URL
userSchema.virtual('avatarUrl').get(function() {
  if (this.profile.avatar && this.profile.avatar.secureUrl) {
    return this.profile.avatar.secureUrl;
  }
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(this.username)}&background=1a1a1a&color=ffffff&size=200`;
});

// Pre-save middleware to hash password
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to check password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Method to generate JWT token
userSchema.methods.generateToken = function() {
  return jwt.sign(
    { 
      userId: this._id, 
      role: this.role,
      username: this.username 
    },
    process.env.JWT_SECRET || 'your-secret-key',
    { 
      expiresIn: process.env.JWT_EXPIRE || '30d' 
    }
  );
};

// Method to generate password reset token
userSchema.methods.generatePasswordResetToken = function() {
  const resetToken = require('crypto').randomBytes(20).toString('hex');
  
  this.passwordResetToken = require('crypto')
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
  
  this.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
  
  return resetToken;
};

// Method to add song to listening history
userSchema.methods.addToHistory = function(songId, duration, completed = false) {
  // Remove existing entry for this song today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  this.listeningHistory = this.listeningHistory.filter(entry => {
    return !(entry.song.toString() === songId.toString() && 
             entry.playedAt >= today);
  });
  
  // Add new entry
  this.listeningHistory.unshift({
    song: songId,
    duration,
    completed,
    playedAt: new Date()
  });
  
  // Keep only last 1000 entries
  if (this.listeningHistory.length > 1000) {
    this.listeningHistory = this.listeningHistory.slice(0, 1000);
  }
  
  // Update activity stats
  this.activity.songsPlayed += 1;
  this.activity.totalPlayTime += duration;
};

// Method to rate a song
userSchema.methods.rateSong = function(songId, rating) {
  const existingRating = this.ratings.find(r => r.song.toString() === songId.toString());
  
  if (existingRating) {
    existingRating.rating = rating;
    existingRating.ratedAt = new Date();
  } else {
    this.ratings.push({
      song: songId,
      rating,
      ratedAt: new Date()
    });
    this.activity.ratingsGiven += 1;
  }
};

// Method to toggle like song
userSchema.methods.toggleLikeSong = function(songId) {
  const likedIndex = this.likedSongs.findIndex(l => l.song.toString() === songId.toString());
  
  if (likedIndex > -1) {
    // Unlike
    this.likedSongs.splice(likedIndex, 1);
    return { action: 'unliked' };
  } else {
    // Like
    this.likedSongs.push({
      song: songId,
      likedAt: new Date()
    });
    return { action: 'liked' };
  }
};

// Method to follow/unfollow user
userSchema.methods.toggleFollowUser = function(targetUserId) {
  const followingIndex = this.social.following.findIndex(
    f => f.user.toString() === targetUserId.toString()
  );
  
  if (followingIndex > -1) {
    // Unfollow
    this.social.following.splice(followingIndex, 1);
    return { action: 'unfollowed' };
  } else {
    // Follow
    this.social.following.push({
      user: targetUserId,
      followedAt: new Date()
    });
    return { action: 'followed' };
  }
};

// Method to follow/unfollow artist
userSchema.methods.toggleFollowArtist = function(artistName) {
  const followingIndex = this.social.followingArtists.findIndex(
    f => f.artist === artistName
  );
  
  if (followingIndex > -1) {
    // Unfollow
    this.social.followingArtists.splice(followingIndex, 1);
    return { action: 'unfollowed' };
  } else {
    // Follow
    this.social.followingArtists.push({
      artist: artistName,
      followedAt: new Date()
    });
    return { action: 'followed' };
  }
};

// Static method to get user recommendations
userSchema.statics.getUserRecommendations = async function(userId) {
  const user = await this.findById(userId).populate('listeningHistory.song ratings.song');
  
  if (!user) return [];
  
  // Simple recommendation logic based on listening history and ratings
  const preferences = {
    genres: user.preferences.favoriteGenres || [],
    languages: user.preferences.preferredLanguages || [],
    highRatedSongs: user.ratings.filter(r => r.rating >= 4).map(r => r.song)
  };
  
  return preferences;
};

module.exports = mongoose.model('User', userSchema);