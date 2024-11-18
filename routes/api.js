const express = require('express');
const router = express.Router();
const { Deck } = require('../models/deck');
const crawlerService = require('../services/crawler');
const deckNameService = require('../services/deckNameService');
const rankCrawler = require('../services/rankCrawler');
const { RankData } = require('../models/rank');
const cardStatsService = require('../services/cardStatsService');
const { CardStats } = require('../models/cardStats');
const deckDetailsService = require('../services/deckDetailsService');
const { DeckDetails } = require('../models/deckDetails');

// POST /fetchDecksData - 爬取并存储所有rank的卡组数据
router.post('/fetchDecksData', async (req, res) => {
    try {
        const decks = await crawlerService.crawlAllDecks();
        
        const operations = decks.map(deck => ({
            updateOne: {
                filter: { deckId: deck.deckId, rank: deck.rank },
                update: { $set: deck },
                upsert: true
            }
        }));

        const result = await Deck.bulkWrite(operations);

        res.json({
            success: true,
            message: `成功爬取并更新 ${decks.length} 个卡组数据`
        });
    } catch (error) {
        console.error('处理爬请求时出错:', error);
        res.status(500).json({
            success: false,
            message: '爬取数据失败',
            error: error.message
        });
    }
});

// GET /getDecksData - 获取所有rank的卡组数据
router.get('/getDecksData', async (req, res) => {
    try {
        const ranks = ['diamond_4to1', 'diamond_to_legend', 'top_10k', 'top_legend'];
        const result = {};

        for (const rank of ranks) {
            const decks = await Deck.find(
                { 
                    rank,
                    order: { $exists: true },
                    cards: { 
                        $exists: true,
                        $ne: [],
                        $type: 'array'
                    },
                    zhName: { $exists: true, $ne: '' }
                }, 
                {
                    deckId: 1,
                    name: 1,
                    zhName: 1,
                    legendaryCardNum: 1,
                    deckcode: 1,
                    cards: 1,
                    dust: 1,
                    games: 1,
                    winrate: 1,
                    class: 1,
                    createdAt: 1,
                    rank: 1,
                    order: 1,
                    _id: 0
                }
            ).sort({ order: 1 });

            // 进步过滤确保所有必要字段都存在且有效
            const validDecks = decks.filter(deck => 
                deck.cards.every(card => 
                    card && 
                    card.dbfId && 
                    card.cost !== undefined && 
                    card.id && 
                    card.rarity && 
                    card.name
                ) &&
                deck.name &&
                deck.zhName && // 确保 zhName 存在
                deck.legendaryCardNum !== undefined
            );

            // 如果发现没有 zhName 的数据，打印日志以便调试
            const invalidDecks = decks.filter(deck => !deck.zhName);
            if (invalidDecks.length > 0) {
                console.warn(`发现 ${invalidDecks.length} 个缺失 zhName 的卡组:`, 
                    invalidDecks.map(d => ({
                        deckId: d.deckId,
                        name: d.name,
                        rank: d.rank
                    }))
                );
            }

            result[rank] = validDecks;
        }

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('获取卡组数据时出错:', error);
        res.status(500).json({
            success: false,
            message: '获数据失败',
            error: error.message
        });
    }
});

// 修复数据
router.post('/repairDecksData', async (req, res) => {
    try {
        // 先重新加载最新的翻译数据
        await deckNameService.loadTranslations();
        console.log('已重新加载翻译数据');

        // 收集所有未翻译的卡组名称
        const untranslatedNames = new Set();

        // 更新 Deck 表
        const decks = await Deck.find({});
        const deckOperations = await Promise.all(decks.map(async deck => {
            const zhName = await deckNameService.getChineseName(deck.name);
            if (zhName === deck.name) {  // 如果中文名等于英文名，说明没有翻译
                untranslatedNames.add(deck.name);
            }
            return {
                updateOne: {
                    filter: { _id: deck._id },
                    update: { 
                        $set: { zhName }
                    }
                }
            };
        }));

        // 更新 RankData 表
        const rankDatas = await RankData.find({});
        const rankOperations = await Promise.all(rankDatas.map(async rankData => {
            const zhName = await deckNameService.getChineseName(rankData.name);
            if (zhName === rankData.name) {  // 如果中文名等于英文名，说明没有翻译
                untranslatedNames.add(rankData.name);
            }
            return {
                updateOne: {
                    filter: { _id: rankData._id },
                    update: { 
                        $set: { zhName }
                    }
                }
            };
        }));

        // 执行批量更新
        const deckResult = await Deck.bulkWrite(deckOperations);
        const rankResult = await RankData.bulkWrite(rankOperations);

        const deckModified = deckResult.modifiedCount || 0;
        const rankModified = rankResult.modifiedCount || 0;

        // 将 Set 转换为数组并排序
        const untranslatedList = Array.from(untranslatedNames).sort();

        res.json({
            success: true,
            message: `已更新 Deck 表 ${deckModified} 条记录，RankData 表 ${rankModified} 条记录的 zhName`,
            untranslatedNames: untranslatedList,
            untranslatedCount: untranslatedList.length
        });
    } catch (error) {
        console.error('修复数据时出错:', error);
        res.status(500).json({
            success: false,
            message: '修复数据失败',
            error: error.message
        });
    }
});

// POST /fetchRanksData - 爬取并存储排名数据
router.post('/fetchRanksData', async (req, res) => {
    try {
        // 先清空数据库中的所有数据
        await RankData.deleteMany({});
        console.log('已清空原有排名数据');

        const decks = await rankCrawler.crawlAllRanks();
        
        // 过滤掉出场率在 0.2% 及以下的卡组
        const filteredDecks = decks.filter(deck => deck.popularityPercent > 0.2);
        
        const operations = filteredDecks.map(deck => ({
            updateOne: {
                filter: { rank: deck.rank, name: deck.name },
                update: { $set: deck },
                upsert: true
            }
        }));

        const result = await RankData.bulkWrite(operations);
        const upsertedCount = result.upsertedCount || 0;
        const modifiedCount = result.modifiedCount || 0;
        const totalWritten = upsertedCount + modifiedCount;

        res.json({
            success: true,
            message: `成功爬取 ${decks.length} 个排名数据，过滤后剩余 ${filteredDecks.length} 个（已过滤掉出场率 ≤ 0.2% 的卡组），实际写入数据库 ${totalWritten} 条（新增 ${upsertedCount} 条，更新 ${modifiedCount} 条）`
        });
    } catch (error) {
        console.error('处理排名数据爬取请求时出错:', error);
        res.status(500).json({
            success: false,
            message: '爬取数据失败',
            error: error.message
        });
    }
});

// GET /getRanksData - 获取排名数据
router.get('/getRanksData', async (req, res) => {
    try {
        const ranks = ['diamond_4to1', 'diamond_to_legend', 'top_10k', 'top_legend'];
        const result = {};

        for (const rank of ranks) {
            const decks = await RankData.find(
                { rank },
                {
                    name: 1,
                    zhName: 1,
                    class: 1,
                    winrate: 1,
                    popularityPercent: 1,
                    popularityNum: 1,
                    ClimbingSpeed: 1,
                    _id: 0
                }
            ).sort({ winrate: -1 }); // 按胜率降序排序

            result[rank] = decks;
        }

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('获取排名数据时出错:', error);
        res.status(500).json({
            success: false,
            message: '获取据失败',
            error: error.message
        });
    }
});

// POST /fetchDeckCardStats - 爬取卡组卡牌统计数据
router.post('/fetchDeckCardStats', async (req, res) => {
    try {
        const rankData = await RankData.find({}, { name: 1, _id: 0 });
        const deckNames = [...new Set(rankData.map(d => d.name))];
        const allStats = [];

        for (const deckName of deckNames) {
            try {
                console.log(`处理卡组 ${deckName} 的数据...`);
                const stats = await cardStatsService.getAllRanksCardStats(deckName);
                
                // 为每个 rank 创建一个记录
                for (const rank of Object.keys(stats)) {
                    allStats.push({
                        deckName,
                        rank,
                        cards: stats[rank]
                    });
                }
            } catch (error) {
                console.error(`处理 ${deckName} 失败:`, error);
            }
        }

        // 批量更新数据库
        const operations = allStats.map(stat => ({
            updateOne: {
                filter: { deckName: stat.deckName, rank: stat.rank },
                update: { $set: stat },
                upsert: true
            }
        }));

        await CardStats.bulkWrite(operations);

        res.json({
            success: true,
            message: `成功更新 ${allStats.length} 条卡组统计数据`
        });
    } catch (error) {
        console.error('处理卡牌统计数据时出错:', error);
        res.status(500).json({
            success: false,
            message: '获取数据失败',
            error: error.message
        });
    }
});

// GET /getDeckCardStats - 获取指定卡组的卡牌统计数据
router.get('/getDeckCardStats', async (req, res) => {
    try {
        const { deckName } = req.query;  // 从查询参数中获取 deckName
        
        if (!deckName) {
            return res.status(400).json({
                success: false,
                message: '缺少必要的 deckName 参数'
            });
        }

        const result = {};
        const stats = await CardStats.find(
            { deckName },
            { cards: 1, rank: 1, _id: 0 }
        );

        stats.forEach(stat => {
            result[stat.rank] = stat.cards;
        });

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('获取卡牌统计数据时出错:', error);
        res.status(500).json({
            success: false,
            message: '获取数据失败',
            error: error.message
        });
    }
});

// POST /fetchDeckDetails - 爬取卡组对战数据
router.post('/fetchDeckDetails', async (req, res) => {
    try {
        const decks = await Deck.find({}, { deckId: 1, _id: 0 });
        const uniqueDeckIds = [...new Set(decks.map(d => d.deckId))];
        const allDetails = [];

        for (const deckId of uniqueDeckIds) {
            try {
                console.log(`处理卡组 ${deckId} 的对战数据...`);
                const details = await deckDetailsService.getAllRanksDetails(deckId);
                
                // 为每个 rank 创建一个记录
                for (const [rank, opponents] of Object.entries(details)) {
                    allDetails.push({
                        deckId,
                        rank,
                        opponents
                    });
                }
            } catch (error) {
                console.error(`处理卡组 ${deckId} 失败:`, error);
            }
        }

        // 批量更新数据库
        const operations = allDetails.map(detail => ({
            updateOne: {
                filter: { deckId: detail.deckId, rank: detail.rank },
                update: { $set: detail },
                upsert: true
            }
        }));

        await DeckDetails.bulkWrite(operations);

        res.json({
            success: true,
            message: `成功更新 ${allDetails.length} 条对战数据`
        });
    } catch (error) {
        console.error('处理对战数据时出错:', error);
        res.status(500).json({
            success: false,
            message: '获取数据失败',
            error: error.message
        });
    }
});

// GET /getDeckDetails - 获取指定卡组的对战数据
router.get('/getDeckDetails', async (req, res) => {
    try {
        const { deckId } = req.query;
        
        if (!deckId) {
            return res.status(400).json({
                success: false,
                message: '缺少必要的 deckId 参数'
            });
        }

        const result = {};
        const details = await DeckDetails.find(
            { deckId },
            { opponents: 1, rank: 1, _id: 0 }
        );

        details.forEach(detail => {
            result[detail.rank] = detail.opponents;
        });

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('获取对战数据时出错:', error);
        res.status(500).json({
            success: false,
            message: '获取数据失败',
            error: error.message
        });
    }
});

module.exports = router; 