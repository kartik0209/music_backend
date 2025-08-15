const mongoose = require('mongoose');

const playlistSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Playlist name is required'],
    trim: true,
    maxlength: [100, 'Playlist name cannot exceed 100 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  coverImage: {
    cloudinaryId: String,
    url: String,
    secureUrl: String,
    size: Number,
    format: String
  },
  songs: [{
    song: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Song',
      required: true
    },
    addedAt: {
      type: Date,
      default: Date.now
    },
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    position: {
      type: Number,
      required: true
    }
  }],
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  collaborators: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    permissions: {
      type: String,
      enum: ['view', 'edit', 'admin'],
      default: 'view'
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],
  privacy: {
    type: String,
    enum: ['public', 'private', 'unlisted'],
    default: 'public'
  },
  category: {
    type: String,
    enum: ['personal', 'mood', 'genre', 'activity', 'collaborative', 'auto-generated'],
    default: 'personal'
  },
  tags: [String],
  playCount: {
    type: Number,
    default: 0
  },
  likeCount: {
    type: Number,
    default: 0
  },
  shareCount: {
    type: Number,
    default: 0
  },
  followers: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    followedAt: {
      type: Date,
      default: Date.now
    }
  }],
  metadata: {
    totalDuration: {
      type: Number,
      default: 0
    },
    genres: [String],
    languages: [String],
    averageRating: {
      type: Number,
      default: 0
    }
  },
  autoUpdate: {
    enabled: {
      type: Boolean,
      default: false
    },
    criteria: {
      genre: [String],
      mood: [String],
      artist: [String],
      minRating: Number,
      maxSongs: {
        type: Number,
        default: 50
      }
    },
    lastUpdated: Date
  },
  status: {
    type: String,
    enum: ['active', 'archived', 'deleted'],
    default: 'active'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
playlistSchema.index({ owner: 1 });
playlistSchema.index({ name: 'text', description: 'text' });
playlistSchema.index({ privacy: 1 });
playlistSchema.index({ category: 1 });
playlistSchema.index({ playCount: -1 });
playlistSchema.index({ likeCount: -1 });
playlistSchema.index({ 'followers.user': 1 });
playlistSchema.index({ status: 1 });

// Virtual for song count
playlistSchema.virtual('songCount').get(function() {
  return this.songs.length;
});

// Virtual for follower count
playlistSchema.virtual('followerCount').get(function() {
  return this.followers.length;
});

// Virtual for cover URL (use Cloudinary URL)
playlistSchema.virtual('coverUrl').get(function() {
  if (this.coverImage && this.coverImage.secureUrl) {
    return this.coverImage.secureUrl;
  }
  return 'https://via.placeholder.com/300x300/1a1a1a/ffffff?text=Playlist'; // Default placeholder
});

// Virtual for formatted duration
playlistSchema.virtual('formattedDuration').get(function() {
  const totalSeconds = this.metadata.totalDuration;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
});

// Pre-save middleware to update metadata
playlistSchema.pre('save', async function(next) {
  if (this.isModified('songs')) {
    await this.updateMetadata();
  }
  next();
});

// Method to add collaborator
playlistSchema.methods.addCollaborator = function(userId, permissions = 'view') {
  const existingCollaborator = this.collaborators.find(c => c.user.toString() === userId.toString());
  if (existingCollaborator) {
    existingCollaborator.permissions = permissions;
  } else {
    this.collaborators.push({
      user: userId,
      permissions
    });
  }
  
  return this.save();
};

// Method to remove collaborator
playlistSchema.methods.removeCollaborator = function(userId) {
  this.collaborators = this.collaborators.filter(c => c.user.toString() !== userId.toString());
  return this.save();
};

// Method to toggle follow
playlistSchema.methods.toggleFollow = function(userId) {
  const followerIndex = this.followers.findIndex(f => f.user.toString() === userId.toString());
  
  if (followerIndex > -1) {
    // Unfollow
    this.followers.splice(followerIndex, 1);
    return { action: 'unfollowed' };
  } else {
    // Follow
    this.followers.push({
      user: userId,
      followedAt: new Date()
    });
    return { action: 'followed' };
  }
};

// Method to increment play count
playlistSchema.methods.incrementPlayCount = function() {
  this.playCount += 1;
  return this.save();
};

// Method to check permissions
playlistSchema.methods.hasPermission = function(userId, requiredPermission) {
  // Owner has all permissions
  if (this.owner.toString() === userId.toString()) {
    return true;
  }
  
  // Check collaborator permissions
  const collaborator = this.collaborators.find(c => c.user.toString() === userId.toString());
  if (!collaborator) {
    return this.privacy === 'public' && requiredPermission === 'view';
  }
  
  const permissionLevels = { view: 1, edit: 2, admin: 3 };
  const userLevel = permissionLevels[collaborator.permissions];
  const requiredLevel = permissionLevels[requiredPermission];
  
  return userLevel >= requiredLevel;
};

// Static method to get user playlists
playlistSchema.statics.getUserPlaylists = function(userId, includePrivate = false) {
  const query = {
    $or: [
      { owner: userId },
      { 'collaborators.user': userId }
    ],
    status: 'active'
  };
  
  if (!includePrivate) {
    query.privacy = { $ne: 'private' };
  }
  
  return this.find(query)
    .populate('owner', 'username profile.firstName profile.lastName profile.avatar')
    .sort({ updatedAt: -1 });
};

// Static method to search playlists
playlistSchema.statics.searchPlaylists = function(query, filters = {}) {
  const searchQuery = { 
    status: 'active',
    privacy: 'public'
  };
  
  // Text search
  if (query && query.trim()) {
    searchQuery.$text = { $search: query };
  }
  
  // Apply filters
  if (filters.category) {
    searchQuery.category = filters.category;
  }
  
  if (filters.minSongs) {
    searchQuery.$expr = { $gte: [{ $size: '$songs' }, filters.minSongs] };
  }
  
  if (filters.tags && filters.tags.length > 0) {
    searchQuery.tags = { $in: filters.tags };
  }
  
  return this.find(searchQuery)
    .populate('owner', 'username profile.firstName profile.lastName profile.avatar')
    .sort(query ? { score: { $meta: 'textScore' } } : { playCount: -1 });
};

// Static method to get featured playlists
playlistSchema.statics.getFeatured = function(limit = 10) {
  return this.find({
    status: 'active',
    privacy: 'public'
  })
    .sort({ playCount: -1, likeCount: -1 })
    .limit(limit)
    .populate('owner', 'username profile.firstName profile.lastName profile.avatar');
};

module.exports = mongoose.model('Playlist', playlistSchema);
playlistSchema.methods.addSong = function(songId, userId) {
  const existingSong = this.songs.find(s => s.song.toString() === songId.toString());
  if (existingSong) {
    throw new Error('Song already exists in playlist');
  }
  
  const position = this.songs.length + 1;
  this.songs.push({
    song: songId,
    addedBy: userId,
    position
  });
  
  return this.save();
};

// Method to remove song
playlistSchema.methods.removeSong = function(songId) {
  const songIndex = this.songs.findIndex(s => s.song.toString() === songId.toString());
  if (songIndex === -1) {
    throw new Error('Song not found in playlist');
  }
  
  this.songs.splice(songIndex, 1);
  
  // Reorder positions
  this.songs.forEach((song, index) => {
    song.position = index + 1;
  });
  
  return this.save();
};

// Method to reorder songs
playlistSchema.methods.reorderSongs = function(songId, newPosition) {
  const songIndex = this.songs.findIndex(s => s.song.toString() === songId.toString());
  if (songIndex === -1) {
    throw new Error('Song not found in playlist');
  }
  
  const song = this.songs.splice(songIndex, 1)[0];
  this.songs.splice(newPosition - 1, 0, song);
  
  // Update all positions
  this.songs.forEach((song, index) => {
    song.position = index + 1;
  });
  
  return this.save();
};

// Method to update metadata
playlistSchema.methods.updateMetadata = async function() {
  if (!this.populated('songs.song')) {
    await this.populate('songs.song');
  }
  
  let totalDuration = 0;
  const genres = new Set();
  const languages = new Set();
  let totalRating = 0;
  let ratedSongs = 0;
  
  this.songs.forEach(item => {
    if (item.song) {
      totalDuration += item.song.duration || 0;
      
      if (item.song.genre) {
        item.song.genre.forEach(g => genres.add(g));
      }
      
      if (item.song.language) {
        languages.add(item.song.language);
      }
      
      if (item.song.ratings && item.song.ratings.average > 0) {
        totalRating += item.song.ratings.average;
        ratedSongs++;
      }
    }
  });
  
  this.metadata.totalDuration = totalDuration;
  this.metadata.genres = Array.from(genres);
  this.metadata.languages = Array.from(languages);
  this.metadata.averageRating = ratedSongs > 0 ? totalRating / ratedSongs : 0;
};

// Method to ad