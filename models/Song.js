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
        name: { type: String, trim: true },
        releaseDate: Date
    },
    duration: {
        type: Number,
        required: [true, 'Song duration is required'],
        min: [1, 'Duration must be at least 1 second']
    },
    genre: {
        type: [String],
        required: [true, 'At least one genre is required']
    },
    mood: {
        type: [String],
        enum: ['happy', 'sad', 'energetic', 'calm', 'romantic', 'party', 'uplifting'],
        default: []
    },
    language: {
        type: String,
        required: [true, 'Language is required']
    },
    audioFile: {
        cloudinaryId: { type: String, required: true },
        url: { type: String, required: true },
        secureUrl: { type: String, required: true }
    },
    coverUrl: {
        type: String,
        default: 'https://via.placeholder.com/300x300/1a1a1a/ffffff?text=Music'
    },
    tags: [String],
    playCount: { type: Number, default: 0 },
    likeCount: { type: Number, default: 0 },
    ratings: {
        average: { type: Number, default: 0, min: 0, max: 5 },
        count: { type: Number, default: 0 }
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
    featured: { type: Boolean, default: false },
    trending: {
        score: { type: Number, default: 0 },
        lastUpdated: { type: Date, default: Date.now }
    }
}, {
    timestamps: true
});

// ✅ CORRECTED TEXT INDEX
songSchema.index(
    { title: 'text', artist: 'text', 'album.name': 'text' },
    { default_language: 'none' }
);

// Other Indexes
songSchema.index({ playCount: -1 });
songSchema.index({ 'ratings.average': -1 });
songSchema.index({ 'trending.score': -1 });
songSchema.index({ genre: 1, language: 1 });
songSchema.index({ status: 1, featured: 1 });


songSchema.methods.incrementPlayCount = function() {
    this.playCount += 1;
    return this.save();
};

songSchema.statics.getTrending = function(limit = 20) {
    return this.find({ status: 'active' })
        .sort({ 'trending.score': -1 })
        .limit(limit)
        .populate('uploadedBy', 'username profile.avatar');
};

songSchema.statics.getFeatured = function(limit = 10) {
    return this.find({ status: 'active', featured: true })
        .sort({ playCount: -1 })
        .limit(limit)
        .populate('uploadedBy', 'username profile.avatar');
};

module.exports = mongoose.model('Song', songSchema);