const axios = require('axios');
const cheerio = require('cheerio');
const cardService = require('./cardService');
const deckNameService = require('./deckNameService');

class CrawlerService {
    constructor() {
        this.baseUrl = 'https://www.hsguru.com/decks';
        this.ranks = ['diamond_4to1', 'diamond_to_legend', 'top_10k', 'top_legend'];
        this.minGamesLevels = [1600, 800, 400, 200, 50];
    }

    /**
     * 构建特定rank的URL
     * @param {string} rank 
     * @param {number} minGames 
     * @param {boolean} isWild 
     * @returns {string}
     */
    buildUrl(rank, minGames = null, isWild = false) {
        let url = `${this.baseUrl}?rank=${rank}&format=${isWild ? '1' : '2'}`;
        if (minGames) {
            url += `&min_games=${minGames}`;
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
     * @param {string} urlOrRank 
     * @param {boolean} isWild 
     * @returns {Promise<Array>}
     */
    async crawlDecksForRank(urlOrRank, isWild = false) {
        try {
            const url = urlOrRank.startsWith('http') ? 
                urlOrRank : 
                this.buildUrl(urlOrRank, null, isWild);
            
            const response = await axios.get(url);
            const $ = cheerio.load(response.data);
            
            // 从URL中提取rank参数
            const rankMatch = url.match(/[?&]rank=([^&]+)/);
            const rank = rankMatch ? rankMatch[1] : urlOrRank;

            let decks = await this.extractDecksFromHtml($, rank);

            // 如果数据量小于10且是基础URL（不包含min_games参数），尝试使用不同的min_games值
            if (decks.length < 10 && !url.includes('min_games=')) {
                console.log(`${rank} 获取到的数据量不足(${decks.length})，开始尝试降级请求...`);
                
                for (const minGames of this.minGamesLevels) {
                    console.log(`尝试使用 min_games=${minGames} 重新请求...`);
                    const newUrl = this.buildUrl(rank, minGames, isWild);
                    const newResponse = await axios.get(newUrl);
                    const new$ = cheerio.load(newResponse.data);
                    decks = await this.extractDecksFromHtml(new$, rank);
                    
                    if (decks.length >= 10) {
                        console.log(`使用 min_games=${minGames} 成功获取到足够数据(${decks.length}条)`);
                        break;
                    }
                    
                    if (minGames === 50) {
                        console.log(`已降至最低等级(min_games=50)，返回当前结果(${decks.length}条)`);
                    }
                }
            }

            return decks;
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
                console.warn(`处理${rank}中的卡组时出错:`, error);
            }
        }
        
        return decks;
    }

    /**
     * 爬取所有rank���卡组数据
     * @param {boolean} isWild 
     * @returns {Promise<Array>}
     */
    async crawlAllDecks(isWild = false) {
        const allDecks = [];
        for (const rank of this.ranks) {
            try {
                console.log(`开始爬取 ${rank} 的数据...`);
                const decks = await this.crawlDecksForRank(rank, isWild);
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