const mongoose = require('mongoose');

const databaseLockSchema = new mongoose.Schema({
    isUpdating: {
        type: Boolean,
        default: false
    },
    lockedAt: {
        type: Date,
        default: Date.now
    },
    unlockedAt: {
        type: Date
    }
});

const DatabaseLock = mongoose.model('DatabaseLock', databaseLockSchema);

module.exports = {
    DatabaseLock
}; 