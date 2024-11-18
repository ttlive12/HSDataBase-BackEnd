const mongoose = require('mongoose');

const opponentInfoSchema = new mongoose.Schema({
    class: {
        type: String,
        required: true,
        enum: ['shaman', 'priest', 'hunter', 'rogue', 'warlock', 'mage', 
               'warrior', 'druid', 'paladin', 'deathknight', 'demonhunter', 'total']
    },
    winrate: {
        type: Number,
        required: true
    },
    total: {
        type: Number,
        required: true
    }
}, { _id: false });

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
    opponents: [opponentInfoSchema]
}, {
    timestamps: true
});

// 创建复合唯一索引
deckDetailsSchema.index({ deckId: 1, rank: 1 }, { unique: true });

const DeckDetails = mongoose.model('DeckDetails', deckDetailsSchema);

module.exports = {
    DeckDetails
}; 