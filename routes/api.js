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
const { RankDetails } = require('../models/rankDetails');
const { DatabaseLock } = require('../models/databaseLock');

// 添加锁检查中间件
const checkDatabaseLock = async (req, res, next) => {
    if (req.method === 'GET') {  // 只对 GET 请求进行检查
        try {
            const lock = await DatabaseLock.findOne({});
            if (lock && lock.isUpdating) {
                console.log(`数据正在更新中，拒绝访问请求: ${req.path}`);
                return res.status(503).json({
                    success: false,
                    message: '数据正在更新中，请稍后访问'
                });
            }
        } catch (error) {
            console.error('检查数据库锁定状态时出错:', error);
        }
    }
    next();
};

// 在所有路由之前使用中间件
router.use(checkDatabaseLock);

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
        const processedNames = new Set();
        const stats = {
            deck: { processed: 0, updated: 0 },
            rankDetails: { processed: 0, updated: 0 },
            rankData: { processed: 0, updated: 0 }
        };

        // 新 Deck 表
        console.log('开始处理 Deck 表...');
        const decks = await Deck.find({});
        const deckOperations = await Promise.all(decks.map(async deck => {
            stats.deck.processed++;
            processedNames.add(deck.name);
            const zhName = await deckNameService.getChineseName(deck.name);
            if (zhName === deck.name) {
                untranslatedNames.add(deck.name);
            }
            if (zhName !== deck.zhName) {
                stats.deck.updated++;
            }
            return {
                updateOne: {
                    filter: { _id: deck._id },
                    update: { $set: { zhName } }
                }
            };
        }));

        // 更新 RankDetails 表
        console.log('开始处理 RankDetails 表...');
        const rankDetails = await RankDetails.find({});
        const rankDetailsOperations = await Promise.all(rankDetails.map(async detail => {
            stats.rankDetails.processed++;
            processedNames.add(detail.name);
            const zhName = await deckNameService.getChineseName(detail.name);
            if (zhName === detail.name) {
                untranslatedNames.add(detail.name);
            }
            if (zhName !== detail.zhName) {
                stats.rankDetails.updated++;
            }
            return {
                updateOne: {
                    filter: { _id: detail._id },
                    update: { $set: { zhName } }
                }
            };
        }));

        // 更新 RankData 表
        console.log('开始处理 RankData 表...');
        const rankDatas = await RankData.find({});
        const rankDataOperations = await Promise.all(rankDatas.map(async data => {
            stats.rankData.processed++;
            processedNames.add(data.name);
            const zhName = await deckNameService.getChineseName(data.name);
            if (zhName === data.name) {
                untranslatedNames.add(data.name);
            }
            if (zhName !== data.zhName) {
                stats.rankData.updated++;
            }
            return {
                updateOne: {
                    filter: { _id: data._id },
                    update: { $set: { zhName } }
                }
            };
        }));

        // 执行批量更新
        console.log('��行数据库更新...');
        const deckResult = await Deck.bulkWrite(deckOperations);
        const rankDetailsResult = await RankDetails.bulkWrite(rankDetailsOperations);
        const rankDataResult = await RankData.bulkWrite(rankDataOperations);

        // 将 Set 转换为数组并排序
        const untranslatedList = Array.from(untranslatedNames).sort();
        const processedList = Array.from(processedNames).sort();

        res.json({
            success: true,
            message: '数据修复完成',
            stats: {
                deck: {
                    processed: stats.deck.processed,
                    updated: stats.deck.updated
                },
                rankDetails: {
                    processed: stats.rankDetails.processed,
                    updated: stats.rankDetails.updated
                },
                rankData: {
                    processed: stats.rankData.processed,
                    updated: stats.rankData.updated
                },
                total: {
                    uniqueNames: processedList.length,
                    untranslatedCount: untranslatedList.length
                }
            },
            untranslatedNames: untranslatedList
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
            message: '爬取失败',
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
            message: `功更新 ${allStats.length} 条卡组统计数据`
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
        // 1. 从两个表中获取所有 deckId
        const deckIds1 = await Deck.distinct('deckId');
        const deckIds2 = await RankDetails.distinct('deckId');
        
        // 2. 合并���去重
        const uniqueDeckIds = [...new Set([...deckIds1, ...deckIds2])];
        console.log(`总共找到 ${uniqueDeckIds.length} 个唯一卡组ID（Deck表: ${deckIds1.length}, RankDetails表: ${deckIds2.length}）`);

        const allDetails = [];
        const concurrencyLimit = 3; // 限制并发请求数量

        // 3. 分批处理卡组
        for (let i = 0; i < uniqueDeckIds.length; i += concurrencyLimit) {
            const batch = uniqueDeckIds.slice(i, i + concurrencyLimit);
            console.log(`处理卡组批次 ${Math.floor(i/concurrencyLimit) + 1}/${Math.ceil(uniqueDeckIds.length/concurrencyLimit)}...`);

            const batchPromises = batch.map(async (deckId) => {
                try {
                    console.log(`处理卡组 ${deckId} 的对战数据...`);
                    const details = await deckDetailsService.getAllRanksDetails(deckId);
                    
                    // 为每个 rank 创建一个记录
                    for (const [rank, opponents] of Object.entries(details)) {
                        allDetails.push({
                            deckId,
                            rank,
                            opponents,
                            updatedAt: new Date()
                        });
                    }
                } catch (error) {
                    console.error(`处理卡组 ${deckId} 失败:`, error);
                }
            });

            // 等待当前批次完
            await Promise.all(batchPromises);

            // 4. 每处理完一批次就更新数据库
            if (allDetails.length > 0) {
                const operations = allDetails.map(detail => ({
                    updateOne: {
                        filter: { deckId: detail.deckId, rank: detail.rank },
                        update: { $set: detail },
                        upsert: true
                    }
                }));

                await DeckDetails.bulkWrite(operations);
                console.log(`已保存 ${allDetails.length} 条对战数据到数据库`);
                
                // 清空数组，释放内存
                allDetails.length = 0;
            }

            // 添加延迟，避免请求过快
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        res.json({
            success: true,
            message: `成功处理 ${uniqueDeckIds.length} 个卡组的对战数据`,
            stats: {
                totalUniqueDeckIds: uniqueDeckIds.length,
                fromDeckTable: deckIds1.length,
                fromRankDetailsTable: deckIds2.length
            }
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

// POST /fetchRankDetails - 爬取卡组详细数据
router.post('/fetchRankDetails', async (req, res) => {
    try {
        // 1. 清理数据库中的错误数据
        console.log('清理数据库中的错误数据...');
        await RankDetails.deleteMany({
            $or: [
                { deckId: { $exists: false } },
                { deckId: null },
                { deckId: '' }
            ]
        });

        // 2. 获取有卡组名称
        const rankData = await RankData.distinct('name');
        const ranks = ['diamond_4to1', 'diamond_to_legend', 'top_10k', 'top_legend'];
        const minGamesMap = {
            'top_legend': [200, 100, 50],
            'top_10k': [400, 200, 100],
            'diamond_4to1': [6400, 3200, 1600],
            'diamond_to_legend': [12800, 6400, 3200]
        };
        const allDecks = [];
        const processedDeckIds = new Set();

        // 3. 限制并发请求数量
        const concurrencyLimit = 3;
        for (let i = 0; i < rankData.length; i += concurrencyLimit) {
            const batch = rankData.slice(i, i + concurrencyLimit);
            console.log(`处理卡组批次 ${i/concurrencyLimit + 1}/${Math.ceil(rankData.length/concurrencyLimit)}...`);

            await Promise.all(batch.map(async (deckName) => {
                try {
                    for (const rank of ranks) {
                        try {
                            let decks = [];
                            for (const minGames of minGamesMap[rank]) {
                                const params = new URLSearchParams({
                                    'player_deck_archetype[]': deckName,
                                    rank: rank,
                                    min_games: minGames
                                });

                                const url = `https://www.hsguru.com/decks?${params.toString()}`;
                                console.log(`请求 ${deckName} 在 ${rank} 的数据，min_games=${minGames}...`);
                                
                                decks = await crawlerService.crawlDecksForRank(url);

                                if (decks && decks.length > 0) {
                                    break;  // 找到非空结果，退出循环
                                }
                            }

                            if (decks && decks.length > 0) {
                                // 只保留每个 deckId 的最新数据
                                decks.forEach(deck => {
                                    if (!processedDeckIds.has(deck.deckId)) {
                                        processedDeckIds.add(deck.deckId);
                                        allDecks.push(deck);
                                    }
                                });
                            }
                        } catch (error) {
                            console.error(`处理 ${deckName} 在 ${rank} 失败:`, error);
                        }
                    }
                } catch (error) {
                    console.error(`处理卡组 ${deckName} 失败:`, error);
                }
            }));

            // 5. 每处理完一批次就更新数据库
            if (allDecks.length > 0) {
                const operations = allDecks.map(deck => ({
                    updateOne: {
                        filter: { 
                            deckId: deck.deckId,
                            rank: deck.rank    // 添加 rank 作为过滤条件
                        },
                        update: { 
                            $set: {
                                ...deck,
                                updatedAt: new Date()
                            }
                        },
                        upsert: true
                    }
                }));

                await RankDetails.bulkWrite(operations);
                console.log(`已保存 ${allDecks.length} 条数据到数据库`);
                
                allDecks.length = 0;
            }
        }

        res.json({
            success: true,
            message: '成功更新卡组详细数据',
            stats: {
                uniqueDeckIds: processedDeckIds.size
            }
        });
    } catch (error) {
        console.error('处理卡组详细数据时出错:', error);
        res.status(500).json({
            success: false,
            message: '获取数据失败',
            error: error.message
        });
    }
});

// GET /getRankDetails - 获取指定卡组在所有rank的详细数据
router.get('/getRankDetails', async (req, res) => {
    try {
        const { name } = req.query;
        
        if (!name) {
            return res.status(400).json({
                success: false,
                message: '缺少必要的 name 参数'
            });
        }

        const ranks = ['diamond_4to1', 'diamond_to_legend', 'top_10k', 'top_legend'];
        const result = {};

        for (const rank of ranks) {
            const decks = await RankDetails.find(
                { 
                    name,
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
                    updatedAt: 1,
                    rank: 1,
                    order: 1,
                    _id: 0
                }
            ).sort({ order: 1 });

            result[rank] = decks;
        }

        // 如所有rank都没有找到数据
        const totalDecks = Object.values(result).flat().length;
        if (totalDecks === 0) {
            return res.status(404).json({
                success: false,
                message: `未找到卡组 "${name}" 的数据`
            });
        }

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('获取卡组详细数据时出错:', error);
        res.status(500).json({
            success: false,
            message: '获取数据失败',
            error: error.message
        });
    }
});

// 测试定时任务
router.post('/testScheduledUpdate', async (req, res) => {
    try {
        // 检查是否已经在更新中
        const existingLock = await DatabaseLock.findOne({});
        if (existingLock?.isUpdating) {
            return res.status(400).json({
                success: false,
                message: '已有更新任务在进行中',
                lockedAt: existingLock.lockedAt
            });
        }

        // 启动测试任务
        const scheduledTasks = require('../services/scheduledTasks');
        console.log('开始测试定时更新任务...');
        
        // 异步执行任务，不等待完成
        scheduledTasks.executeAllTasks().then(() => {
            console.log('测试定时更新任务完成');
        }).catch(error => {
            console.error('测试定时更新任务失败:', error);
        });

        res.json({
            success: true,
            message: '测试更新任务已启动，请通过 GET /checkLockStatus 查看更新状态'
        });
    } catch (error) {
        console.error('启动测试更新任务失败:', error);
        res.status(500).json({
            success: false,
            message: '启动测试更新任务失败',
            error: error.message
        });
    }
});

// 查看锁状态
router.get('/checkLockStatus', async (req, res) => {
    try {
        const lock = await DatabaseLock.findOne({});
        res.json({
            success: true,
            data: {
                isUpdating: lock?.isUpdating || false,
                lockedAt: lock?.lockedAt,
                unlockedAt: lock?.unlockedAt
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: '获取锁状态失败',
            error: error.message
        });
    }
});

module.exports = router; 