const mongoose = require('mongoose');

// 卡牌信息的 Schema
const cardSchema = new mongoose.Schema({
    dbfId: Number,
    cost: Number,
    id: String,
    rarity: String,
    name: String,
    back: String
}, { _id: false });

// Deck Schema
const deckSchema = new mongoose.Schema({
    deckId: {
        type: String,
        required: true
    },
    rank: {
        type: String,
        required: true,
        enum: ['diamond_4to1', 'diamond_to_legend', 'top_10k', 'top_legend']
    },
    order: {
        type: Number,
        required: true
    },
    name: {
        type: String,
        required: true
    },
    zhName: {
        type: String,
        required: true
    },
    legendaryCardNum: {
        type: Number,
        required: true
    },
    deckcode: {
        type: String,
        required: true
    },
    cards: [cardSchema],
    dust: {
        type: Number,
        required: true
    },
    games: {
        type: Number,
        required: true
    },
    winrate: {
        type: Number,
        required: true
    },
    class: {
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// RankData Schema
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
        required: true
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
    }
});

// CardStats Schema
const cardStatsSchema = new mongoose.Schema({
    deckName: {
        type: String,
        required: true
    },
    rank: {
        type: String,
        required: true,
        enum: ['diamond_4to1', 'diamond_to_legend', 'top_10k', 'top_legend']
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
});

// DeckDetails Schema
const deckDetailsSchema = new mongoose.Schema({
    deckId: {
        type: String,
        required: true
    },
    rank: {
        type: String,
        required: true,
        enum: ['diamond_4to1', 'diamond_to_legend', 'top_10k', 'top_legend']
    },
    opponents: [{
        class: String,
        winrate: Number,
        total: Number
    }],
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// RankDetails Schema
const rankDetailsSchema = new mongoose.Schema({
    deckId: {
        type: String,
        required: true
    },
    name: {
        type: String,
        required: true
    },
    rank: {
        type: String,
        required: true,
        enum: ['diamond_4to1', 'diamond_to_legend', 'top_10k', 'top_legend']
    },
    order: {
        type: Number,
        required: true
    },
    zhName: {
        type: String,
        required: true
    },
    legendaryCardNum: {
        type: Number,
        required: true
    },
    deckcode: {
        type: String,
        required: true
    },
    cards: [cardSchema],
    dust: {
        type: Number,
        required: true
    },
    games: {
        type: Number,
        required: true
    },
    winrate: {
        type: Number,
        required: true
    },
    class: {
        type: String,
        required: true
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = {
    cardSchema,
    deckSchema,
    rankDataSchema,
    cardStatsSchema,
    deckDetailsSchema,
    rankDetailsSchema
}; 