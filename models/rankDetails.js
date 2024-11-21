const mongoose = require('mongoose');

// 定义卡牌信息的 Schema (与 deck model 相同)
const cardSchema = new mongoose.Schema({
    dbfId: Number,
    cost: Number,
    id: String,
    rarity: String,
    name: String,
    back: String
}, { _id: false });

// 定义卡组详细数据模型的 Schema
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

// 删除所有现有索引并创建新的复合索引的函数
async function rebuildRankDetailsIndexes() {
    try {
        const RankDetails = mongoose.model('RankDetails', rankDetailsSchema);
        
        // 删除所有现有索引
        await RankDetails.collection.dropIndexes();
        console.log('已删除 RankDetails 的所有现有索引');
        
        // 创建新的复合唯一索引，使用 deckId、rank 和 name 的组合
        await RankDetails.collection.createIndex(
            { deckId: 1, rank: 1, name: 1 }, 
            { unique: true }
        );
        console.log('已为 RankDetails 创建新的复合唯一索引 (deckId + rank + name)');
    } catch (error) {
        console.error('重建 RankDetails 索引时出错:', error);
        throw error;
    }
}

const RankDetails = mongoose.model('RankDetails', rankDetailsSchema);

module.exports = {
    RankDetails,
    rebuildRankDetailsIndexes
}; 