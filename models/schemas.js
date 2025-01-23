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
    mode: {
        type: String,
        required: true,
        enum: ['standard', 'wild'],
        default: 'standard'
    },
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
    },
    isPastDay: {
        type: Boolean,
        required: true,
        default: false
    }
});

// RankData Schema
const rankDataSchema = new mongoose.Schema({
    mode: {
        type: String,
        required: true,
        enum: ['standard', 'wild'],
        default: 'standard'
    },
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
    mode: {
        type: String,
        required: true,
        enum: ['standard', 'wild'],
        default: 'standard'
    },
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
    mode: {
        type: String,
        required: true,
        enum: ['standard', 'wild'],
        default: 'standard'
    },
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
    mode: {
        type: String,
        required: true,
        enum: ['standard', 'wild'],
        default: 'standard'
    },
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

const configSchema = new mongoose.Schema({
    key: {
        type: String,
        required: true,
        unique: true
    },
    value: {
        type: String,
        required: true
    }
}, { timestamps: true });


module.exports = {
    cardSchema,
    deckSchema,
    rankDataSchema,
    cardStatsSchema,
    deckDetailsSchema,
    rankDetailsSchema,
    configSchema
}; 