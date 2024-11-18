const mongoose = require('mongoose');

// 定义卡牌信息的 Schema
const cardSchema = new mongoose.Schema({
    dbfId: Number,
    cost: Number,
    id: String,
    rarity: String,
    name: String,
    back: String
}, { _id: false });

// 定义卡组数据模型的 Schema
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

// 删除所有现有索引并创建新的复合索引
const Deck = mongoose.model('Deck', deckSchema);

// 在应用启动时执行索引重建
async function rebuildIndexes() {
    try {
        // 删除所有现有索引
        await Deck.collection.dropIndexes();
        console.log('已删除所有现有索引');
        
        // 创建新的复合唯一索引
        await Deck.collection.createIndex(
            { deckId: 1, rank: 1 }, 
            { unique: true }
        );
        console.log('已创建新的复合唯一索引');
    } catch (error) {
        console.error('重建索引时出错:', error);
    }
}

// 导出模型和重建索引函数
module.exports = {
    Deck,
    rebuildIndexes
}; 