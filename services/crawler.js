const axios = require('axios');
const cheerio = require('cheerio');
const cardService = require('./cardService');
const deckNameService = require('./deckNameService');

class CrawlerService {
    constructor() {
        this.baseUrl = 'https://www.hsguru.com/decks';
        this.ranks = ['diamond_4to1', 'diamond_to_legend', 'top_10k', 'top_legend'];
    }

    /**
     * 构建特定rank的URL
     * @param {string} rank 
     * @returns {string}
     */
    buildUrl(rank) {
        return `${this.baseUrl}?format=2&rank=${rank}`;
    }

    /**
     * 从HTML中提取卡组代码
     * @param {CheerioElement} element 
     * @returns {string}
     */
    extractDeckCode($, element) {
        const titleSpan = $(element).find('.deck-title span[style="font-size: 0; line-size: 0; display: block"]');
        return titleSpan.text().trim() || '';
    }

    /**
     * 从HTML中提取卡牌ID列表和back值
     * @param {CheerioElement} element 
     * @returns {Array<{id: string, back: string}>}
     */
    extractCardIds($, element) {
        const cards = new Map();
        $(element).find('div[phx-value-card_id]').each((_, cardElement) => {
            const cardId = $(cardElement).attr('phx-value-card_id');
            if (cardId) {
                const back = $(cardElement)
                    .find('.has-text-right.card-number.deck-text.decklist-card-background')
                    .text()
                    .trim();
                cards.set(cardId, back);
            }
        });
        return Array.from(cards.entries()).map(([id, back]) => ({ id, back }));
    }

    /**
     * 从HTML中提取卡组名称
     * @param {CheerioElement} element 
     * @returns {string}
     */
    extractDeckName($, element) {
        return $(element).find('.deck-title a.basic-black-text').text().trim() || 'Unknown Deck';
    }

    /**
     * 从HTML中提取职业
     * @param {CheerioElement} element 
     * @returns {string}
     */
    extractClass($, element) {
        const classElement = $(element).find('.decklist-info.dust-bar');
        if (!classElement.length) return 'unknown';
        
        const classes = classElement.attr('class')?.split(' ') || [];
        return classes.find(c => !['basic-black-text', 'decklist-info', 'dust-bar'].includes(c)) || 'unknown';
    }

    /**
     * 安全地提取数字
     * @param {string} text 
     * @param {number} defaultValue 
     * @returns {number}
     */
    safeParseNumber(text, defaultValue = 0) {
        try {
            const matches = text.match(/\d+(\.\d+)?/);
            if (matches && matches[0]) {
                return parseFloat(matches[0]);
            }
        } catch (error) {
            console.warn('数字解析失败:', error);
        }
        return defaultValue;
    }

    /**
     * 爬取指定rank的卡组数据
     * @param {string} rank 
     * @returns {Promise<Array>}
     */
    async crawlDecksForRank(rank) {
        try {
            const response = await axios.get(this.buildUrl(rank));
            const $ = cheerio.load(response.data);
            const decks = [];

            $('div[id^="deck_stats-"]').each(async (index, element) => {
                try {
                    const deckId = $(element).attr('id')?.split('-')[1];
                    if (!deckId) return;
                    
                    const dustText = $(element).find('.dust-bar-inner').text().trim();
                    const dust = this.safeParseNumber(dustText);

                    const gamesText = $(element).find('.column.tag').text().trim();
                    const winrateMatch = gamesText.match(/^(\d+\.?\d*)/);
                    const gamesMatch = gamesText.match(/Games:\s*(\d+)/);

                    const winrate = winrateMatch ? parseFloat(winrateMatch[1]) : 0;
                    const games = gamesMatch ? parseInt(gamesMatch[1]) : 0;

                    // 获取卡牌ID列表和back值
                    const cardInfos = this.extractCardIds($, element);
                    const cards = cardInfos.map(info => {
                        const cardData = cardService.getCardById(info.id);
                        return cardData ? { ...cardData, back: info.back } : null;
                    }).filter(card => card !== null);

                    // 获取英文名和中文名
                    const name = this.extractDeckName($, element);
                    const zhName = await deckNameService.getChineseName(name);

                    // 计算传说卡牌数量
                    const legendaryCardNum = cards.filter(card => card.rarity === 'LEGENDARY').length;

                    const deckData = {
                        deckId,
                        rank,
                        order: index,
                        name,
                        zhName,
                        legendaryCardNum,
                        deckcode: this.extractDeckCode($, element),
                        cards,
                        dust,
                        games,
                        winrate,
                        class: this.extractClass($, element)
                    };

                    if (deckData.deckId && deckData.name && deckData.cards.length > 0) {
                        decks.push(deckData);
                    }
                } catch (error) {
                    console.warn(`处理${rank}中的卡组时出错:`, error);
                }
            });

            return decks;
        } catch (error) {
            console.error(`爬取${rank}数据时出错:`, error);
            throw error;
        }
    }

    /**
     * 爬取所有rank的卡组数据
     * @returns {Promise<Array>}
     */
    async crawlAllDecks() {
        const allDecks = [];
        for (const rank of this.ranks) {
            try {
                console.log(`开始爬取 ${rank} 的数据...`);
                const decks = await this.crawlDecksForRank(rank);
                allDecks.push(...decks);
                console.log(`成功爬取 ${rank} 的 ${decks.length} 条数据`);
            } catch (error) {
                console.error(`爬取 ${rank} 失败:`, error);
            }
        }
        return allDecks;
    }
}

module.exports = new CrawlerService(); 