const axios = require('axios');

class CardService {
    constructor() {
        this.cards = null;
        this.cardMap = new Map();
    }

    /**
     * 初始化卡牌数据
     */
    async initializeCards() {
        try {
            const response = await axios.get('https://api.hearthstonejson.com/v1/latest/zhCN/cards.collectible.json');
            this.cards = response.data;
            
            // 创建以 dbfId 为键的 Map
            this.cardMap = new Map(
                this.cards.map(card => [
                    card.dbfId.toString(),
                    {
                        dbfId: card.dbfId,
                        cost: card.cost,
                        id: card.id,
                        rarity: card.rarity,
                        name: card.name
                    }
                ])
            );
            
            console.log('卡牌数据初始化成功');
        } catch (error) {
            console.error('初始化卡牌数据失败:', error);
            throw error;
        }
    }

    /**
     * 根据 dbfId 获取卡牌信息
     * @param {string} dbfId 
     * @returns {Object|null}
     */
    getCardById(dbfId) {
        return this.cardMap.get(dbfId) || null;
    }

    /**
     * 将 dbfId 数组转换为卡牌对象数组
     * @param {string[]} dbfIds 
     * @returns {Array}
     */
    getCardsByIds(dbfIds) {
        return dbfIds
            .map(dbfId => this.getCardById(dbfId))
            .filter(card => card !== null);
    }
}

module.exports = new CardService(); 