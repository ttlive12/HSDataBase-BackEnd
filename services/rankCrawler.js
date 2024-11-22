const axios = require('axios');
const cheerio = require('cheerio');
const deckNameService = require('./deckNameService');

class RankCrawlerService {
    constructor() {
        this.baseUrl = 'https://www.hsguru.com/meta';
        this.ranks = ['diamond_4to1', 'diamond_to_legend', 'top_10k', 'top_legend'];
        this.minGamesLevels = [1000, 500, 250, 100];
    }

    /**
     * 构建特定rank的URL
     */
    buildUrl(rank, minGames = null) {
        let url = `${this.baseUrl}?rank=${rank}`;
        if (minGames) {
            url += `&min_games=${minGames}`;
        }
        return url;
    }

    /**
     * 从类名中提取职业
     */
    extractClass(classNames) {
        const classes = classNames.split(' ');
        return classes.find(c => !['decklist-info', 'basic-black-text'].includes(c)) || 'unknown';
    }

    /**
     * 爬取指定rank的数据
     */
    async crawlRankData(rank) {
        try {
            let decks = [];
            
            // 先尝试不带 min_games 参数的请求
            decks = await this.fetchRankDataWithUrl(rank);
            
            // 如果数据量小于10，尝试使用不同的 min_games 值
            if (decks.length < 10) {
                console.log(`${rank} 获取到的数据量不足(${decks.length})，开始尝试降级请求...`);
                
                for (const minGames of this.minGamesLevels) {
                    console.log(`尝试使用 min_games=${minGames} 重新请求...`);
                    decks = await this.fetchRankDataWithUrl(rank, minGames);
                    
                    if (decks.length >= 10) {
                        console.log(`使用 min_games=${minGames} 成功获取到足够数据(${decks.length}条)`);
                        break;
                    }
                }
            }

            return decks;
        } catch (error) {
            console.error(`爬取${rank}数据时出错:`, error);
            throw error;
        }
    }

    /**
     * 使用指定URL获取数据
     */
    async fetchRankDataWithUrl(rank, minGames = null) {
        const url = this.buildUrl(rank, minGames);
        console.log(`请求URL: ${url}`);
        
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);
        const decks = [];

        // 使用 for...of 替代 each 以支持 async/await
        const rows = $('tbody tr').toArray();
        for (const element of rows) {
            try {
                const $row = $(element);
                const $nameCell = $row.find('td:first-child');
                const name = $nameCell.find('a.basic-black-text').text().trim();
                const classType = this.extractClass($nameCell.attr('class'));
                
                const winrateText = $row.find('td:nth-child(2) .basic-black-text').text().trim();
                const winrate = parseFloat(winrateText);

                const popularityText = $row.find('td:nth-child(3)').text().trim();
                const popularityMatch = popularityText.match(/(\d+\.?\d*)%\s*\((\d+)\)/);
                const popularityPercent = popularityMatch ? parseFloat(popularityMatch[1]) : 0;
                const popularityNum = popularityMatch ? parseInt(popularityMatch[2]) : 0;

                const climbingSpeedText = $row.find('td:last-child').text().trim();
                const climbingSpeedMatch = climbingSpeedText.match(/([-\d.]+)⭐\/h/);
                const ClimbingSpeed = climbingSpeedMatch ? parseFloat(climbingSpeedMatch[1]) : 0;

                const zhName = await deckNameService.getChineseName(name);

                const deckData = {
                    rank,
                    name,
                    zhName,
                    class: classType,
                    winrate,
                    popularityPercent,
                    popularityNum,
                    ClimbingSpeed
                };

                decks.push(deckData);
            } catch (error) {
                console.warn(`解析卡组数据时出错:`, error);
            }
        }

        return decks;
    }

    /**
     * 爬取所有rank的数据
     */
    async crawlAllRanks() {
        const allDecks = [];
        for (const rank of this.ranks) {
            try {
                console.log(`开始爬取 ${rank} 的数据...`);
                const decks = await this.crawlRankData(rank);
                allDecks.push(...decks);
                console.log(`成功爬取 ${rank} 的 ${decks.length} 条数据`);
            } catch (error) {
                console.error(`爬取 ${rank} 失败:`, error);
            }
        }
        return allDecks;
    }
}

module.exports = new RankCrawlerService(); 