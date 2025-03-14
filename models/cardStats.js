const mongoose = require('mongoose');

const cardStatsSchema = new mongoose.Schema({
    deckName: {
        type: String,
        required: true
    },
    rank: {
        type: String,
        required: true,
        enum: ['diamond_4to1', 'diamond_to_legend', 'top_5k', 'top_legend']
    },
    cards: [{
        dbfid: String,
        id: String,
        cost: Number,
        name: String,
        rarity: String,
        mulliganImpact: Number,
        drawnImpact: Number,
        keptImpact: Number,
        mulliganImpactColor: String,
        drawnImpactColor: String,
        keptImpactColor: String
    }]
}, {
    timestamps: true
});

// 创建复合唯一索引
cardStatsSchema.index({ deckName: 1, rank: 1 }, { unique: true });

const CardStats = mongoose.model('CardStats', cardStatsSchema);

module.exports = {
    CardStats
}; 