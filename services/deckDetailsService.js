const axios = require('axios');
const cheerio = require('cheerio');

class DeckDetailsService {
    constructor() {
        this.baseUrl = 'https://www.hsguru.com/deck';
        this.ranks = ['diamond_4to1', 'diamond_to_legend', 'top_10k', 'top_legend'];
    }

    /**
     * 构建URL
     */
    buildUrl(deckId, rank, isWild = false) {
        return `${this.baseUrl}/${deckId}?rank=${rank}`;
    }

    /**
     * 解析职业名称
     */
    parseClassName(element) {
        const classNames = element.find('.tag').attr('class').split(' ');
        const className = classNames.find(c => c !== 'tag' && c !== 'player-name');
        return className || 'unknown';
    }

    /**
     * 解析胜率
     */
    parseWinrate(element) {
        const text = element.find('.basic-black-text').text().trim();
        return parseFloat(text) || 0;
    }

    /**
     * 解析对局数
     */
    parseTotal(text) {
        return parseInt(text) || 0;
    }

    /**
     * 获取卡组对战数据
     */
    async getDeckDetails(deckId, rank, isWild = false) {
        try {
            const url = this.buildUrl(deckId, rank, isWild);
            const response = await axios.get(url);
            const $ = cheerio.load(response.data);
            const opponents = [];

            $('tbody tr').each((_, element) => {
                try {
                    const $row = $(element);
                    const $cells = $row.find('td');
                    
                    const className = $cells.eq(0).text().trim() === 'Total' ? 
                        'total' : 
                        this.parseClassName($cells.eq(0));
                    
                    const winrate = this.parseWinrate($cells.eq(1));
                    const total = this.parseTotal($cells.eq(2).text().trim());

                    opponents.push({
                        class: className,
                        winrate,
                        total
                    });
                } catch (error) {
                    console.warn('解析对战数据时出错:', error);
                }
            });

            return opponents;
        } catch (error) {
            console.error('获取卡组对战数据时出错:', error);
            throw error;
        }
    }

    /**
     * 获取所有等级的对战数据
     */
    async getAllRanksDetails(deckId, isWild = false) {
        const result = {};
        for (const rank of this.ranks) {
            try {
                console.log(`获取卡组 ${deckId} 在 ${rank} 的对战数据...`);
                result[rank] = await this.getDeckDetails(deckId, rank, isWild);
            } catch (error) {
                console.error(`获取 ${rank} 的对战数据失败:`, error);
                result[rank] = [];
            }
        }
        return result;
    }
}

module.exports = new DeckDetailsService(); 