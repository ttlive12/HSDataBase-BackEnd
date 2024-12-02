const axios = require('axios');
const cheerio = require('cheerio');
const cardService = require('./cardService');
const deckNameService = require('./deckNameService');

class CrawlerService {
    constructor() {
        this.baseUrl = 'https://www.hsguru.com/decks';
        this.ranks = ['diamond_4to1', 'diamond_to_legend', 'top_10k', 'top_legend'];
        this.minGamesLevels = {
            'top_legend': [200, 100, 50],
            'top_10k': [400, 200, 100, 50],
            'diamond_4to1': [6400, 3200, 1600, 400, 100],
            'diamond_to_legend': [12800, 6400, 3200, 800, 200]
        };
        // 过去一天数据的固定 min_games 值
        this.pastDayMinGames = {
            'top_legend': 50,
            'top_10k': 100,
            'diamond_4to1': 100,
            'diamond_to_legend': 200
        };
    }

    /**
     * 构建特定rank的URL
     */
    buildUrl(rank, options = {}) {
        const { minGames = null, isWild = false, isPastDay = false } = options;
        let url = `${this.baseUrl}?rank=${rank}&format=${isWild ? '1' : '2'}`;
        
        if (minGames) {
            url += `&min_games=${minGames}`;
        }
        
        if (isPastDay) {
            url += `&period=past_day`;
        }
        
        return url;
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
     */
    async crawlDecksForRank(urlOrRank, options = {}) {
        try {
            const { isWild = false, isPastDay = false } = options;
            
            if (urlOrRank.startsWith('http')) {
                const response = await axios.get(urlOrRank);
                const $ = cheerio.load(response.data);
                return await this.extractDecksFromHtml($, urlOrRank);
            }

            if (isPastDay) {
                // 过去一天的数据使用固定的 min_games
                const url = this.buildUrl(urlOrRank, {
                    minGames: this.pastDayMinGames[urlOrRank],
                    isWild,
                    isPastDay: true
                });
                const response = await axios.get(url);
                const $ = cheerio.load(response.data);
                return await this.extractDecksFromHtml($, urlOrRank);
            } else {
                // 使用原有的降级逻辑
                let decks = [];
                for (const minGames of this.minGamesLevels[urlOrRank]) {
                    const url = this.buildUrl(urlOrRank, { minGames, isWild });
                    console.log(`尝试使用 min_games=${minGames} 请求...`);
                    
                    const response = await axios.get(url);
                    const $ = cheerio.load(response.data);
                    decks = await this.extractDecksFromHtml($, urlOrRank);
                    
                    if (decks.length >= 10) {
                        console.log(`使用 min_games=${minGames} 成功获取到足够数据(${decks.length}条)`);
                        break;
                    }
                }
                return decks;
            }
        } catch (error) {
            console.error(`爬取数据时出错:`, error);
            throw error;
        }
    }

    // 从HTML中提取卡组数据的辅助方法
    async extractDecksFromHtml($, rank) {
        const decks = [];
        const deckElements = $('div[id^="deck_stats-"]').toArray();
        
        for (const element of deckElements) {
            try {
                const $element = $(element);
                const deckId = $element.attr('id')?.split('-')[1];
                if (!deckId) continue;
                
                const dustText = $element.find('.dust-bar-inner').text().trim();
                const dust = this.safeParseNumber(dustText);

                const gamesText = $element.find('.column.tag').text().trim();
                const winrateMatch = gamesText.match(/^(\d+\.?\d*)/);
                const gamesMatch = gamesText.match(/Games:\s*(\d+)/);

                const winrate = winrateMatch ? parseFloat(winrateMatch[1]) : 0;
                const games = gamesMatch ? parseInt(gamesMatch[1]) : 0;

                const cardInfos = this.extractCardIds($, element);
                const cards = cardInfos.map(info => {
                    const cardData = cardService.getCardById(info.id);
                    return cardData ? { ...cardData, back: info.back } : null;
                }).filter(card => card !== null);

                const name = this.extractDeckName($, element);
                const zhName = await deckNameService.getChineseName(name);
                const legendaryCardNum = cards.filter(card => card.rarity === 'LEGENDARY').length;

                const deckData = {
                    deckId,
                    rank,
                    order: decks.length,
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
                console.warn(`处理${rank}中的卡组出错:`, error);
            }
        }
        
        return decks;
    }

    /**
     * 爬取所有rank卡组数据
     */
    async crawlAllDecks(options = {}) {
        const { isWild = false, isPastDay = false } = options;
        const allDecks = [];
        for (const rank of this.ranks) {
            try {
                console.log(`开始爬取 ${rank} 的${isPastDay ? '过去一天' : ''}数据...`);
                const decks = await this.crawlDecksForRank(rank, { isWild, isPastDay });
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