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
    coverUrl: {
        type: String,
        default: 'https://via.placeholder.com/300x300/1a1a1a/ffffff?text=Playlist'
    },
    songs: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Song'
    }],
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    collaborators: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    privacy: {
        type: String,
        enum: ['public', 'private', 'unlisted'],
        default: 'public'
    },
    category: {
        type: String,
        enum: ['personal', 'mood', 'genre', 'activity', 'collaborative'],
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
    followerCount: {
        type: Number,
        default: 0
    },
    status: {
        type: String,
        enum: ['active', 'archived'],
        default: 'active'
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Indexes for performance
playlistSchema.index({ owner: 1, status: 1 });
playlistSchema.index({ name: 'text', description: 'text' });
playlistSchema.index({ privacy: 1, playCount: -1 });
playlistSchema.index({ category: 1 });

// Virtual for song count
playlistSchema.virtual('songCount').get(function() {
    return this.songs.length;
});

// Method to increment play count
playlistSchema.methods.incrementPlayCount = function() {
    this.playCount += 1;
    return this.save();
};

// Static method to get playlists for a specific user
playlistSchema.statics.getUserPlaylists = function(userId) {
    return this.find({
        status: 'active',
        $or: [
            { owner: userId },
            { collaborators: userId }
        ]
    })
    .populate('owner', 'username profile.avatar')
    .sort({ updatedAt: -1 });
};

// Static method to search public playlists
playlistSchema.statics.searchPublicPlaylists = function(queryString) {
    const query = {
        status: 'active',
        privacy: 'public'
    };

    if (queryString) {
        query.$text = { $search: queryString };
    }

    return this.find(query)
        .populate('owner', 'username profile.avatar')
        .sort(queryString ? { score: { $meta: 'textScore' } } : { playCount: -1 });
};

module.exports = mongoose.model('Playlist', playlistSchema);