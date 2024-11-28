const cron = require('node-cron');
const axios = require('axios');
const { swapCollections, cleanupTempCollections } = require('../models/databaseLock');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

class ScheduledTasks {
    constructor() {
        this.baseUrl = 'http://localhost:3000';
    }

    async executeAllTasks() {
        const startTime = new Date();
        try {
            const now = new Date();
            console.log(`开始执行定时任务... 当前北京时间: ${now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);

            try {
                // 清理可能存在的临时集合
                await cleanupTempCollections();

                // 收集所有任务的结果
                const results = [];

                // 执行所有更新任务，写入临时集合
                console.log('1/6 执行 fetchRanksData...');
                const ranksResult = await axios.post(`${this.baseUrl}/fetchRanksData?temp=true`);
                results.push({ name: 'fetchRanksData', success: ranksResult.data.success });
                console.log('fetchRanksData 完成');
                await delay(1000);

                console.log('2/6 执行 fetchDecksData...');
                const decksResult = await axios.post(`${this.baseUrl}/fetchDecksData?temp=true`);
                results.push({ name: 'fetchDecksData', success: decksResult.data.success });
                console.log('fetchDecksData 完成');
                await delay(1000);

                console.log('3/6 执行 fetchDeckCardStats...');
                const cardStatsResult = await axios.post(`${this.baseUrl}/fetchDeckCardStats?temp=true`);
                results.push({ name: 'fetchDeckCardStats', success: cardStatsResult.data.success });
                console.log('fetchDeckCardStats 完成');
                await delay(1000);

                console.log('4/6 执行 fetchRankDetails...');
                const rankDetailsResult = await axios.post(`${this.baseUrl}/fetchRankDetails?temp=true`);
                results.push({ name: 'fetchRankDetails', success: rankDetailsResult.data.success });
                console.log('fetchRankDetails 完成');
                await delay(1000);

                console.log('5/6 执行 fetchDeckDetails...');
                const deckDetailsResult = await axios.post(`${this.baseUrl}/fetchDeckDetails?temp=true`);
                results.push({ name: 'fetchDeckDetails', success: deckDetailsResult.data.success });
                console.log('fetchDeckDetails 完成');
                await delay(1000);

                console.log('6/6 执行 repairDecksData...');
                const repairResult = await axios.post(`${this.baseUrl}/repairDecksData?temp=true`);
                results.push({ name: 'repairDecksData', success: repairResult.data.success });
                console.log('repairDecksData 完成');
                await delay(1000);

                // 检查所有任务是否都成功
                const failedTasks = results.filter(r => !r.success);
                if (failedTasks.length > 0) {
                    throw new Error(`以下任务执行失败: ${failedTasks.map(t => t.name).join(', ')}`);
                }


                await delay(30000);

                // 所有任务都成功后，才执行集合切换
                console.log('所有任务执行成功，开始切换集合...');
                await swapCollections();
                console.log('集合切换完成');

                const endTime = new Date();
                const duration = (endTime - startTime) / 1000;
                const hours = Math.floor(duration / 3600);
                const minutes = Math.floor((duration % 3600) / 60);
                const seconds = Math.floor(duration % 60);

                console.log(`所有任务执行完成！总耗时: ${hours}小时 ${minutes}分钟 ${seconds}秒`);
            } catch (error) {
                console.error('执行任务时出错:', error);
                // 清理临时集合，不执行切换
                console.log('由于出错，开始清理临时集合...');
                await cleanupTempCollections();
                console.log('临时集合清理完成，原有数据保持不变');
                throw error;
            }
        } catch (error) {
            const endTime = new Date();
            const duration = (endTime - startTime) / 1000;
            const hours = Math.floor(duration / 3600);
            const minutes = Math.floor((duration % 3600) / 60);
            const seconds = Math.floor(duration % 60);

            console.error('执行定时任务时出错:', error);
            console.log(`任务执行失败！总耗时: ${hours}小时 ${minutes}分钟 ${seconds}秒`);
        }
    }

    startScheduledTasks() {
        // 每天凌晨 4:30 执行
        cron.schedule('30 4 * * *', async () => {
            const now = new Date();
            console.log(`触发定时任务... 当前北京时间: ${now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
            await this.executeAllTasks();
        }, {
            timezone: "Asia/Shanghai"
        });

        const now = new Date();
        console.log(`定时任务已启动，将在每天北京时间 04:30 执行。当前北京时间: ${now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
    }

    async runTasksManually() {
        console.log('手动执行所有任务...');
        await this.executeAllTasks();
    }
}

module.exports = new ScheduledTasks(); 