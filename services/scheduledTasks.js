const cron = require('node-cron');
const axios = require('axios');
const { DatabaseLock } = require('../models/databaseLock');

class ScheduledTasks {
    constructor() {
        this.baseUrl = 'http://localhost:3000';
    }

    async executeAllTasks() {
        const startTime = new Date();
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

                const endTime = new Date();
                const duration = (endTime - startTime) / 1000; // 转换为秒
                const hours = Math.floor(duration / 3600);
                const minutes = Math.floor((duration % 3600) / 60);
                const seconds = Math.floor(duration % 60);

                console.log(`所有任务执行完成！总耗时: ${hours}小时 ${minutes}分钟 ${seconds}秒`);
            } finally {
                // 无论成功还是失败，都要解除更新状态
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
            const endTime = new Date();
            const duration = (endTime - startTime) / 1000; // 转换为秒
            const hours = Math.floor(duration / 3600);
            const minutes = Math.floor((duration % 3600) / 60);
            const seconds = Math.floor(duration % 60);

            console.error('执行定时任务时出错:', error);
            console.log(`任务执行失败！总耗时: ${hours}小时 ${minutes}分钟 ${seconds}秒`);
        }
    }

    startScheduledTasks() {
        // 每天凌晨 4 点执行
        cron.schedule('0 4 * * *', async () => {
            const now = new Date();
            console.log(`触发定时任务... 当前北京时间: ${now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
            await this.executeAllTasks();
        }, {
            timezone: "Asia/Shanghai"
        });

        const now = new Date();
        console.log(`定时任务已启动，将在每天北京时间 04:00 执行。当前北京时间: ${now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
    }

    async runTasksManually() {
        console.log('手动执行所有任务...');
        await this.executeAllTasks();
    }
}

module.exports = new ScheduledTasks(); 