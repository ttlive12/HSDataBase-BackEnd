const axios = require('axios');
const cheerio = require('cheerio');
const cardService = require('./cardService');

class CardStatsService {
    constructor() {
        this.baseUrl = 'https://www.hsguru.com/card-stats';
        this.ranks = ['diamond_4to1', 'diamond_to_legend', 'top_10k', 'top_legend'];
    }

    /**
     * 获取颜色值
     */
    getColor(value) {
        if (value <= -20) {
            return "rgb(255, 0, 0)";
        } else if (value >= 20) {
            return "rgb(0, 255, 0)";
        } else {
            const ratio = (value + 20) / 40;
            const red = Math.round(255 * (1 - ratio));
            const green = Math.round(255 * ratio);
            return `rgb(${red}, ${green}, 0)`;
        }
    }

    /**
     * 解析数值
     */
    parseNumber(text) {
        const match = text.trim().match(/[-\d.]+/);
        return match ? parseFloat(match[0]) : 0;
    }

    /**
     * 获取卡牌统计数据
     */
    async getCardStats(deckName, rank, isWild = false) {
        try {
            const url = `${this.baseUrl}?archetype=${encodeURIComponent(deckName)}&rank=${rank}&format=${isWild ? '1' : '2'}`;
            const response = await axios.get(url);
            const $ = cheerio.load(response.data);
            const cards = [];

            $('tbody tr').each((_, element) => {
                try {
                    const $row = $(element);
                    const dbfid = $row.find('.decklist-card').attr('class')
                        .match(/card-(\d+)/)?.[1];

                    if (!dbfid) return;

                    const mulliganImpact = this.parseNumber(
                        $row.find('td:nth-child(2) .basic-black-text').text()
                    );
                    const drawnImpact = this.parseNumber(
                        $row.find('td:nth-child(3) .basic-black-text').text()
                    );
                    const keptImpact = this.parseNumber(
                        $row.find('td:nth-child(4) .basic-black-text').text()
                    );

                    // 获取卡牌基础信息
                    const cardInfo = cardService.getCardById(dbfid);
                    if (!cardInfo) return;

                    cards.push({
                        dbfid,
                        ...cardInfo,
                        mulliganImpact,
                        drawnImpact,
                        keptImpact,
                        mulliganImpactColor: this.getColor(mulliganImpact),
                        drawnImpactColor: this.getColor(drawnImpact),
                        keptImpactColor: this.getColor(keptImpact)
                    });
                } catch (error) {
                    console.warn('解析卡牌数据时出错:', error);
                }
            });

            return cards;
        } catch (error) {
            console.error('获取卡牌统计数据时出错:', error);
            throw error;
        }
    }

    /**
     * 获取所有等级的卡牌统计数据
     */
    async getAllRanksCardStats(deckName, isWild = false) {
        const result = {};
        for (const rank of this.ranks) {
            try {
                console.log(`获取 ${deckName} 在 ${rank} 的卡牌统计数据...`);
                result[rank] = await this.getCardStats(deckName, rank, isWild);
            } catch (error) {
                console.error(`获取 ${rank} 的卡牌统计失败:`, error);
                result[rank] = [];
            }
        }
        return result;
    }
}

module.exports = new CardStatsService(); 