const mongoose = require('mongoose');

const translationSchema = new mongoose.Schema({
    englishName: {
        type: String,
        required: true,
        unique: true
    },
    chineseName: {
        type: String,
        required: true
    }
}, {
    timestamps: true
});

const Translation = mongoose.model('Translation', translationSchema);

module.exports = {
    Translation
}; 