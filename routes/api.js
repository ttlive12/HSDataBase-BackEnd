const express = require('express');
const router = express.Router();
const crawlerService = require('../services/crawler');
const deckNameService = require('../services/deckNameService');
const rankCrawler = require('../services/rankCrawler');
const cardStatsService = require('../services/cardStatsService');
const deckDetailsService = require('../services/deckDetailsService');
const { getModelForCollection } = require('../utils/modelHelper');
const {
    deckSchema,
    rankDataSchema,
    cardStatsSchema,
    deckDetailsSchema,
    rankDetailsSchema
} = require('../models/schemas');

// POST /fetchDecksData - 爬取并存储所有rank的卡组数据
router.post('/fetchDecksData', async (req, res) => {
    try {
        const isTemp = req.query.temp === 'true';
        const isWild = req.query.wild === 'true';
        const DeckModel = getModelForCollection('Decks', deckSchema, isTemp, isWild);

        // 爬取常规数据
        const decks = await crawlerService.crawlAllDecks({ isWild });

        // 爬取过去一天的数据
        const pastDayDecks = await crawlerService.crawlAllDecks({ isWild, isPastDay: true });

        if ((decks && decks.length > 0) || (pastDayDecks && pastDayDecks.length > 0)) {
            // 合并所有数据并添加标记
            const allDecks = [
                ...decks.map(deck => ({ ...deck, isPastDay: false })),
                ...pastDayDecks.map(deck => ({ ...deck, isPastDay: true }))
            ];

            const operations = allDecks.map(deck => ({
                updateOne: {
                    filter: {
                        deckId: deck.deckId,
                        rank: deck.rank,
                        mode: isWild ? 'wild' : 'standard',
                        isPastDay: deck.isPastDay
                    },
                    update: {
                        $set: {
                            ...deck,
                            mode: isWild ? 'wild' : 'standard'
                        }
                    },
                    upsert: true
                }
            }));

            const result = await DeckModel.bulkWrite(operations);

            res.json({
                success: true,
                message: `成功爬取并更新 ${allDecks.length} 个卡组数据到${isTemp ? '临时' : '主'}数据库`
            });
        } else {
            res.status(400).json({
                success: false,
                message: '未获取到有效数据'
            });
        }
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
        const isWild = req.query.wild === 'true';
        const isPastDay = req.query.period === 'past_day';
        const DeckModel = getModelForCollection('Decks', deckSchema, false, isWild);
        const ranks = ['diamond_4to1', 'diamond_to_legend', 'top_10k', 'top_legend'];
        const result = {};

        for (const rank of ranks) {
            const decks = await DeckModel.find(
                {
                    rank,
                    mode: isWild ? 'wild' : 'standard',
                    isPastDay: isPastDay,  // 根据参数筛选数据
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
            data: result,
            mode: isWild ? 'wild' : 'standard',
            period: isPastDay ? 'past_day' : 'all_time'
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
        const isTemp = req.query.temp === 'true';

        // 获取标准模式和狂野模式的 Model
        const standardModels = {
            deck: getModelForCollection('Decks', deckSchema, isTemp, false),
            rankDetails: getModelForCollection('RankDetails', rankDetailsSchema, isTemp, false),
            rankData: getModelForCollection('RankDatas', rankDataSchema, isTemp, false)
        };

        const wildModels = {
            deck: getModelForCollection('Decks', deckSchema, isTemp, true),
            rankDetails: getModelForCollection('RankDetails', rankDetailsSchema, isTemp, true),
            rankData: getModelForCollection('RankDatas', rankDataSchema, isTemp, true)
        };

        // 先重新加载最新的翻译数据
        await deckNameService.loadTranslations();
        console.log('已重新加载翻译数据');

        // 收集所有未翻译的卡组名称
        const untranslatedNames = new Set();
        const processedNames = new Set();
        const stats = {
            standard: {
                deck: { processed: 0, updated: 0 },
                rankDetails: { processed: 0, updated: 0 },
                rankData: { processed: 0, updated: 0 }
            },
            wild: {
                deck: { processed: 0, updated: 0 },
                rankDetails: { processed: 0, updated: 0 },
                rankData: { processed: 0, updated: 0 }
            }
        };

        // 处理指定模式的数据
        async function processMode(models, mode) {
            // 处理 Deck 表
            console.log(`开始处理${mode}模式 Deck 表...`);
            const decks = await models.deck.find({});
            const deckOperations = await Promise.all(decks.map(async deck => {
                stats[mode].deck.processed++;
                processedNames.add(deck.name);
                const zhName = await deckNameService.getChineseName(deck.name);
                if (zhName === deck.name) {
                    untranslatedNames.add(deck.name);
                }
                if (zhName !== deck.zhName) {
                    stats[mode].deck.updated++;
                }
                return {
                    updateOne: {
                        filter: { _id: deck._id },
                        update: { $set: { zhName } }
                    }
                };
            }));

            // 处理 RankDetails 表
            console.log(`开始处理${mode}模式 RankDetails ...`);
            const rankDetails = await models.rankDetails.find({});
            const rankDetailsOperations = await Promise.all(rankDetails.map(async detail => {
                stats[mode].rankDetails.processed++;
                processedNames.add(detail.name);
                const zhName = await deckNameService.getChineseName(detail.name);
                if (zhName === detail.name) {
                    untranslatedNames.add(detail.name);
                }
                if (zhName !== detail.zhName) {
                    stats[mode].rankDetails.updated++;
                }
                return {
                    updateOne: {
                        filter: { _id: detail._id },
                        update: { $set: { zhName } }
                    }
                };
            }));

            // 处理 RankData 表
            console.log(`开始处理${mode}模式 RankData 表...`);
            const rankDatas = await models.rankData.find({});
            const rankDataOperations = await Promise.all(rankDatas.map(async data => {
                stats[mode].rankData.processed++;
                processedNames.add(data.name);
                const zhName = await deckNameService.getChineseName(data.name);
                if (zhName === data.name) {
                    untranslatedNames.add(data.name);
                }
                if (zhName !== data.zhName) {
                    stats[mode].rankData.updated++;
                }
                return {
                    updateOne: {
                        filter: { _id: data._id },
                        update: { $set: { zhName } }
                    }
                };
            }));

            // 执行批量更新
            console.log(`执行${mode}模式数据库更新...`);
            if (deckOperations.length > 0) {
                await models.deck.bulkWrite(deckOperations);
            }
            if (rankDetailsOperations.length > 0) {
                await models.rankDetails.bulkWrite(rankDetailsOperations);
            }
            if (rankDataOperations.length > 0) {
                await models.rankData.bulkWrite(rankDataOperations);
            }
        }

        // 处理标准模式数据
        await processMode(standardModels, 'standard');
        console.log('标准模式数据修复完成');

        // 处理狂野模式数据
        await processMode(wildModels, 'wild');
        console.log('狂野模式数据修复完成');

        // 将 Set 转换为数组并排序
        const untranslatedList = Array.from(untranslatedNames).sort();
        const processedList = Array.from(processedNames).sort();

        res.json({
            success: true,
            message: `数据修复完成 (${isTemp ? '临时' : '主'}数据库)`,
            stats: {
                standard: {
                    deck: {
                        processed: stats.standard.deck.processed,
                        updated: stats.standard.deck.updated
                    },
                    rankDetails: {
                        processed: stats.standard.rankDetails.processed,
                        updated: stats.standard.rankDetails.updated
                    },
                    rankData: {
                        processed: stats.standard.rankData.processed,
                        updated: stats.standard.rankData.updated
                    }
                },
                wild: {
                    deck: {
                        processed: stats.wild.deck.processed,
                        updated: stats.wild.deck.updated
                    },
                    rankDetails: {
                        processed: stats.wild.rankDetails.processed,
                        updated: stats.wild.rankDetails.updated
                    },
                    rankData: {
                        processed: stats.wild.rankData.processed,
                        updated: stats.wild.rankData.updated
                    }
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
        const isTemp = req.query.temp === 'true';
        const isWild = req.query.wild === 'true';
        const RankDataModel = getModelForCollection('RankDatas', rankDataSchema, isTemp, isWild);

        const decks = await rankCrawler.crawlAllRanks(isWild);
        const filteredDecks = decks.filter(deck => deck.popularityPercent > 0.2);

        if (filteredDecks.length > 0) {
            const operations = filteredDecks.map(deck => ({
                updateOne: {
                    filter: {
                        rank: deck.rank,
                        name: deck.name,
                        mode: isWild ? 'wild' : 'standard'
                    },
                    update: {
                        $set: {
                            ...deck,
                            mode: isWild ? 'wild' : 'standard'
                        }
                    },
                    upsert: true
                }
            }));

            const result = await RankDataModel.bulkWrite(operations);
            const upsertedCount = result.upsertedCount || 0;
            const modifiedCount = result.modifiedCount || 0;
            const totalWritten = upsertedCount + modifiedCount;

            res.json({
                success: true,
                message: `成功爬取 ${decks.length} 个排名数据，过滤后剩余 ${filteredDecks.length} 个，实际写入${isTemp ? '临时' : ''}数据库 ${totalWritten} 条`
            });
        } else {
            res.status(400).json({
                success: false,
                message: '未获取到有效数据'
            });
        }
    } catch (error) {
        console.error('处理排名数据爬取请求出错:', error);
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
        const isWild = req.query.wild === 'true';
        const RankDataModel = getModelForCollection('RankDatas', rankDataSchema, false, isWild);
        const ranks = ['diamond_4to1', 'diamond_to_legend', 'top_10k', 'top_legend'];
        const result = {};

        for (const rank of ranks) {
            const decks = await RankDataModel.find(
                {
                    rank,
                    mode: isWild ? 'wild' : 'standard'
                },
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
            data: result,
            mode: isWild ? 'wild' : 'standard'
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
        const isTemp = req.query.temp === 'true';
        const isWild = req.query.wild === 'true';
        const CardStatsModel = getModelForCollection('CardStats', cardStatsSchema, isTemp, isWild);
        const RankDataModel = getModelForCollection('RankDatas', rankDataSchema, isTemp, isWild);

        // 获取所有卡组名称
        console.log('获取卡组名称列表...');
        const rankData = await RankDataModel.find({}, { name: 1, _id: 0 });
        const deckNames = [...new Set(rankData.map(d => d.name))];
        console.log(`共找到 ${deckNames.length} 个唯一卡组名称`);

        const allStats = [];

        // 串行处理每个卡组
        for (const deckName of deckNames) {
            try {
                console.log(`处理卡组 ${deckName} 的数据...`);
                const stats = await cardStatsService.getAllRanksCardStats(deckName, isWild);

                for (const rank of Object.keys(stats)) {
                    if (stats[rank] && stats[rank].length > 0) {
                        allStats.push({
                            deckName,
                            rank,
                            cards: stats[rank]
                        });
                        console.log(`成功获取 ${deckName} 在 ${rank} 的卡牌统计数据，共 ${stats[rank].length} 张卡牌`);
                    }
                }
            } catch (error) {
                console.error(`处理 ${deckName} 失败:`, error);
            }
        }

        // 所有数据收集完成后，一次性更新数据库
        if (allStats.length > 0) {
            console.log(`开始更新数据库，共有 ${allStats.length} 条数据...`);

            const operations = allStats.map(stat => ({
                updateOne: {
                    filter: {
                        deckName: stat.deckName,
                        rank: stat.rank,
                        mode: isWild ? 'wild' : 'standard'
                    },
                    update: {
                        $set: {
                            ...stat,
                            mode: isWild ? 'wild' : 'standard'
                        }
                    },
                    upsert: true
                }
            }));

            await CardStatsModel.bulkWrite(operations);
            console.log(`成功写入 ${allStats.length} 条数据到数据库`);
        } else {
            console.log('未获取到任何有效数据');
        }

        res.json({
            success: true,
            message: `成功更新 ${allStats.length} 条卡组统计数据到${isTemp ? '临时' : '主'}数据库`
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
        const { deckName } = req.query;
        const isWild = req.query.wild === 'true';
        const CardStatsModel = getModelForCollection('CardStats', cardStatsSchema, false, isWild);

        if (!deckName) {
            return res.status(400).json({
                success: false,
                message: '缺少必要的 deckName 参数'
            });
        }

        const result = {};
        const stats = await CardStatsModel.find(
            {
                deckName,
                mode: isWild ? 'wild' : 'standard'
            },
            { cards: 1, rank: 1, _id: 0 }
        );

        stats.forEach(stat => {
            result[stat.rank] = stat.cards;
        });

        res.json({
            success: true,
            data: result,
            mode: isWild ? 'wild' : 'standard'
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
        const isTemp = req.query.temp === 'true';
        const isWild = req.query.wild === 'true';
        const DeckDetailsModel = getModelForCollection('DeckDetails', deckDetailsSchema, isTemp, isWild);
        const DeckModel = getModelForCollection('Decks', deckSchema, isTemp, isWild);
        const RankDetailsModel = getModelForCollection('RankDetails', rankDetailsSchema, isTemp, isWild);

        const deckIds1 = await DeckModel.distinct('deckId');
        const deckIds2 = await RankDetailsModel.distinct('deckId');
        const uniqueDeckIds = [...new Set([...deckIds1, ...deckIds2])];
        const allDetails = [];
        const concurrencyLimit = 3;

        // 2. 分批获取所有数据
        for (let i = 0; i < uniqueDeckIds.length; i += concurrencyLimit) {
            const batch = uniqueDeckIds.slice(i, i + concurrencyLimit);
            console.log(`处理卡组批次 ${Math.floor(i / concurrencyLimit) + 1}/${Math.ceil(uniqueDeckIds.length / concurrencyLimit)}...`);

            const batchPromises = batch.map(async (deckId) => {
                try {
                    console.log(`处理卡组 ${deckId} 的对战数据...`);
                    const details = await deckDetailsService.getAllRanksDetails(deckId, isWild);

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

            await Promise.all(batchPromises);
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        if (allDetails.length > 0) {
            const operations = allDetails.map(detail => ({
                updateOne: {
                    filter: {
                        deckId: detail.deckId,
                        rank: detail.rank,
                        mode: isWild ? 'wild' : 'standard'
                    },
                    update: {
                        $set: {
                            ...detail,
                            mode: isWild ? 'wild' : 'standard'
                        }
                    },
                    upsert: true
                }
            }));

            await DeckDetailsModel.bulkWrite(operations);
        }

        res.json({
            success: true,
            message: `成功处理 ${uniqueDeckIds.length} 个卡组的对战据到${isTemp ? '临时' : '主'}数据库`,
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
        const isWild = req.query.wild === 'true';
        const DeckDetailsModel = getModelForCollection('DeckDetails', deckDetailsSchema, false, isWild);

        if (!deckId) {
            return res.status(400).json({
                success: false,
                message: '缺少必要的 deckId 参数'
            });
        }

        const result = {};
        const details = await DeckDetailsModel.find(
            { deckId },
            { opponents: 1, rank: 1, _id: 0 }
        );

        details.forEach(detail => {
            result[detail.rank] = detail.opponents;
        });

        res.json({
            success: true,
            data: result,
            mode: isWild ? 'wild' : 'standard'
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
        const isTemp = req.query.temp === 'true';
        const isWild = req.query.wild === 'true';
        const RankDetailsModel = getModelForCollection('RankDetails', rankDetailsSchema, isTemp, isWild);
        const RankDataModel = getModelForCollection('RankDatas', rankDataSchema, isTemp, isWild);

        const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
        const rankData = await RankDataModel.distinct('name');
        const ranks = ['diamond_4to1', 'diamond_to_legend', 'top_10k', 'top_legend'];

        // 分别定义标准模式和狂野模式的 minGamesMap
        const standardMinGamesMap = {
            'top_legend': [200, 100, 50],
            'top_10k': [400, 200, 100, 50],
            'diamond_4to1': [6400, 3200, 1600, 400, 100],
            'diamond_to_legend': [12800, 6400, 3200, 800, 200]
        };

        const wildMinGamesMap = {
            'top_legend': [100, 50],
            'top_10k': [200, 100, 50],
            'diamond_4to1': [1600, 400, 100],
            'diamond_to_legend': [3200, 800, 200]
        };

        // 根据模式选择对应的 minGamesMap
        const minGamesMap = isWild ? wildMinGamesMap : standardMinGamesMap;

        const allDecks = [];  // 存储所有收集到的数据
        const processedKeys = new Set();

        // 3. 限制并发请求数量
        const concurrencyLimit = 2;
        for (let i = 0; i < rankData.length; i += concurrencyLimit) {
            const batch = rankData.slice(i, i + concurrencyLimit);
            console.log(`处理卡组批次 ${Math.floor(i / concurrencyLimit) + 1}/${Math.ceil(rankData.length / concurrencyLimit)}...`);

            await Promise.all(batch.map(async (deckName) => {
                try {
                    for (const rank of ranks) {
                        try {
                            let decks = [];
                            for (const minGames of minGamesMap[rank]) {
                                await delay(50);

                                const params = new URLSearchParams({
                                    'player_deck_archetype[]': deckName,
                                    rank: rank,
                                    min_games: minGames,
                                    format: isWild ? '1' : '2'
                                });

                                const url = `https://www.hsguru.com/decks?${params.toString()}`;
                                console.log(`请求 ${deckName} 在 ${rank} 的数据，min_games=${minGames}...`);

                                try {
                                    decks = await Promise.race([
                                        crawlerService.crawlDecksForRank(url),
                                        new Promise((_, reject) =>
                                            setTimeout(() => reject(new Error('请求超时')), 30000)
                                        )
                                    ]);
                                    
                                    const seq = minGamesMap[rank];
                                    if (decks && (decks.length >= 3 || seq[seq.length - 1] === minGames)) {
                                        decks.forEach(deck => {
                                            deck.name = deckName;  // 使用原始名称
                                            const key = `${deck.deckId}-${deck.rank}-${deck.name}`;
                                            if (!processedKeys.has(key)) {
                                                processedKeys.add(key);
                                                allDecks.push(deck);
                                            }
                                        });
                                        console.log(`成功获取 ${deckName} 在 ${rank} 的数据，找到 ${decks.length} 个卡组`);
                                        break;
                                    }
                                } catch (error) {
                                    console.error(`请求失败 (${deckName}, ${rank}, ${minGames}):`, error.message);
                                    await delay(1000);
                                    continue;
                                }
                            }
                        } catch (error) {
                            console.error(`处理 ${deckName} 在 ${rank} 失败:`, error);
                        }
                    }
                } catch (error) {
                    console.error(`处理卡组 ${deckName} 失败:`, error);
                }
            }));

            await delay(500);
        }

        // 所有数据收集完成后，一次性更新数据库
        if (allDecks.length > 0) {
            console.log(`开始更新数据库，共有 ${allDecks.length} 条数据...`);

            // 先清空数据库
            await RankDetailsModel.deleteMany({});
            console.log('已清空原有卡组详细数据');

            // 批量写入所有新数据
            const operations = allDecks.map(deck => ({
                updateOne: {
                    filter: {
                        deckId: deck.deckId,
                        rank: deck.rank,
                        name: deck.name,
                        mode: isWild ? 'wild' : 'standard'
                    },
                    update: {
                        $set: {
                            ...deck,
                            updatedAt: new Date(),
                            mode: isWild ? 'wild' : 'standard'
                        }
                    },
                    upsert: true
                }
            }));

            await RankDetailsModel.bulkWrite(operations);
            console.log(`成功写入 ${allDecks.length} 条数据到数据库`);
        }

        res.json({
            success: true,
            message: `成功更新卡组详细数据到${isTemp ? '临时' : '主'}数据库`,
            stats: {
                totalDecks: allDecks.length,
                uniqueKeys: processedKeys.size
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
        const isWild = req.query.wild === 'true';
        const RankDetailsModel = getModelForCollection('RankDetails', rankDetailsSchema, false, isWild);

        if (!name) {
            return res.status(400).json({
                success: false,
                message: '缺少必要的 name 参数'
            });
        }

        const ranks = ['diamond_4to1', 'diamond_to_legend', 'top_10k', 'top_legend'];
        const result = {};

        for (const rank of ranks) {
            const decks = await RankDetailsModel.find(
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
        // const totalDecks = Object.values(result).flat().length;
        // if (totalDecks === 0) {
        //     return res.status(404).json({
        //         success: false,
        //         data: {},
        //         message: `未找到卡组 "${name}" 的数据`
        //     });
        // }

        res.json({
            success: true,
            data: result,
            mode: isWild ? 'wild' : 'standard'
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
    const { mode } = req.query;
    try {
        // 启动测试任务
        const scheduledTasks = require('../services/scheduledTasks');
        console.log('开始测试定时更新任务...');

        // 异步执行任务，不等待完成
        scheduledTasks.runTasksManually(mode || 'all').then(() => {
            console.log('测试定时更新任务完成');
        }).catch(error => {
            console.error('测试定时更新任务失败:', error);
        });

        res.json({
            success: true,
            message: '测试更新任务已启动'
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

module.exports = router; 