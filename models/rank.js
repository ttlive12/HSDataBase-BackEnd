const mongoose = require('mongoose');

const rankDataSchema = new mongoose.Schema({
    rank: {
        type: String,
        required: true,
        enum: ['diamond_4to1', 'diamond_to_legend', 'top_10k', 'top_legend']
    },
    name: {
        type: String,
        required: true
    },
    zhName: {
        type: String,
        required: true
    },
    class: {
        type: String,
        required: true,
        enum: ['shaman', 'priest', 'hunter', 'rogue', 'warlock', 'mage', 
               'warrior', 'druid', 'paladin', 'deathknight', 'demonhunter']
    },
    winrate: {
        type: Number,
        required: true
    },
    popularityPercent: {
        type: Number,
        required: true
    },
    popularityNum: {
        type: Number,
        required: true
    },
    ClimbingSpeed: {
        type: Number,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// 创建复合唯一索引
rankDataSchema.index({ rank: 1, name: 1 }, { unique: true });

const RankData = mongoose.model('RankData', rankDataSchema);

module.exports = {
    RankData
}; 