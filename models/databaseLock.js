const mongoose = require('mongoose');

const databaseLockSchema = new mongoose.Schema({
    isLocked: {
        type: Boolean,
        required: true
    },
    lockedAt: {
        type: Date,
        default: Date.now
    },
    unlockedAt: {
        type: Date
    },
    isUpdating: {
        type: Boolean,
        default: false
    }
});

const DatabaseLock = mongoose.model('DatabaseLock', databaseLockSchema);

module.exports = {
    DatabaseLock
}; 