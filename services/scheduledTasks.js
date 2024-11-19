const cron = require('node-cron');
const axios = require('axios');
const { DatabaseLock } = require('../models/databaseLock');
const mongoose = require('mongoose');

class ScheduledTasks {
    constructor() {
        this.baseUrl = 'http://localhost:3000';
    }

    // 锁定数据库
    async lockDatabase() {
        try {
            await DatabaseLock.updateOne(
                {},
                { 
                    $set: { 
                        isLocked: true, 
                        lockedAt: new Date(),
                        unlockedAt: null
                    }
                },
                { upsert: true }
            );
            console.log('数据库已锁定');
            return true;
        } catch (error) {
            console.error('锁定数据库失败:', error);
            return false;
        }
    }

    // 解锁数据库
    async unlockDatabase() {
        try {
            await DatabaseLock.updateOne(
                {},
                { 
                    $set: { 
                        isLocked: false,
                        unlockedAt: new Date()
                    }
                }
            );
            console.log('数据库已解锁');
            return true;
        } catch (error) {
            console.error('解锁数据库失败:', error);
            return false;
        }
    }

    // 按顺序执行所有任务
    async executeAllTasks() {
        try {
            const now = new Date();
            console.log(`开始执行定时任务... 当前北京时间: ${now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
            
            // 标记为更新状态
            await DatabaseLock.updateOne(
                {},
                { 
                    $set: { 
                        isUpdating: true,
                        lockedAt: new Date()
                    }
                },
                { upsert: true }
            );

            try {
                // 创建临时集合
                await mongoose.connection.db.createCollection('deck_temp');
                await mongoose.connection.db.createCollection('rankdata_temp');
                await mongoose.connection.db.createCollection('rankdetails_temp');
                await mongoose.connection.db.createCollection('cardstats_temp');
                await mongoose.connection.db.createCollection('deckdetails_temp');

                // 1. 爬取排名数据
                console.log('1/6 执行 fetchRanksData...');
                await axios.post(`${this.baseUrl}/fetchRanksData`);
                console.log('fetchRanksData 完成');

                // 2. 爬取卡组数据
                console.log('2/6 执行 fetchDecksData...');
                await axios.post(`${this.baseUrl}/fetchDecksData`);
                console.log('fetchDecksData 完成');

                // 3. 爬取卡牌统计数据
                console.log('3/6 执行 fetchDeckCardStats...');
                await axios.post(`${this.baseUrl}/fetchDeckCardStats`);
                console.log('fetchDeckCardStats 完成');

                // 4. 爬取卡组详细数据
                console.log('4/6 执行 fetchRankDetails...');
                await axios.post(`${this.baseUrl}/fetchRankDetails`);
                console.log('fetchRankDetails 完成');

                // 5. 爬取卡组对战数据
                console.log('5/6 执行 fetchDeckDetails...');
                await axios.post(`${this.baseUrl}/fetchDeckDetails`);
                console.log('fetchDeckDetails 完成');

                // 6. 修复数据
                console.log('6/6 执行 repairDecksData...');
                await axios.post(`${this.baseUrl}/repairDecksData`);
                console.log('repairDecksData 完成');

                // 所有任务完成后，替换集合
                await mongoose.connection.db.collection('deck_temp').rename('deck', { dropTarget: true });
                await mongoose.connection.db.collection('rankdata_temp').rename('rankdata', { dropTarget: true });
                await mongoose.connection.db.collection('rankdetails_temp').rename('rankdetails', { dropTarget: true });
                await mongoose.connection.db.collection('cardstats_temp').rename('cardstats', { dropTarget: true });
                await mongoose.connection.db.collection('deckdetails_temp').rename('deckdetails', { dropTarget: true });

            } finally {
                // 标记更新完成
                await DatabaseLock.updateOne(
                    {},
                    { 
                        $set: { 
                            isUpdating: false,
                            unlockedAt: new Date()
                        }
                    }
                );
            }
        } catch (error) {
            console.error('执行定时任务时出错:', error);
            // 清理临时集合
            try {
                await mongoose.connection.db.dropCollection('deck_temp');
                await mongoose.connection.db.dropCollection('rankdata_temp');
                await mongoose.connection.db.dropCollection('rankdetails_temp');
                await mongoose.connection.db.dropCollection('cardstats_temp');
                await mongoose.connection.db.dropCollection('deckdetails_temp');
            } catch (e) {
                console.error('清理临时集合时出错:', e);
            }
            await DatabaseLock.updateOne(
                {},
                { 
                    $set: { 
                        isUpdating: false,
                        unlockedAt: new Date()
                    }
                }
            );
        }
    }

    // 启动定时任务
    startScheduledTasks() {
        // 每天晚上 12 点执行
        cron.schedule('0 0 * * *', async () => {
            const now = new Date();
            console.log(`触发定时任务... 当前北京时间: ${now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
            await this.executeAllTasks();
        }, {
            timezone: "Asia/Shanghai"
        });

        const now = new Date();
        console.log(`定时任务已启动，将在每天北京时间 00:00 执行。当前北京时间: ${now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
    }

    // 手动执行所有任务
    async runTasksManually() {
        console.log('手动执行所有任务...');
        await this.executeAllTasks();
    }
}

module.exports = new ScheduledTasks(); 