const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

// 设置通用的速率限制器
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15分钟
    max: 100, // 每个IP在windowMs时间内最多可以发出100个请求
    standardHeaders: true, // 返回RateLimit相关响应头
    legacyHeaders: false, // 禁用X-RateLimit-*响应头
    // 使用X-Forwarded-For头部来识别用户IP (如果存在)
    keyGenerator: (request, response) => {
        // 优先使用X-Forwarded-For头部中的第一个IP (最初的客户端IP)
        if (request.headers['x-forwarded-for']) {
            const forwardedIps = request.headers['x-forwarded-for'].split(',');
            const clientIp = forwardedIps[0].trim();
            return clientIp;
        }
        return request.ip; // 否则使用请求对象中的IP
    },
    message: {
        success: false,
        message: '请求过于频繁，请稍后再试'
    },
    skip: (req, res) => {
        // 监测可疑查询参数，对包含SQL注入关键字的请求增加限制
        const suspiciousPatterns = [
            'union select', 'sleep(', 'benchmark(', 'or 1=1', 'or 1 =',
            'select*from', '--', '/*', ';--', "'; --", '";--', "';", '";',
            '%27', '%22', 'xp_cmdshell'
        ];
        
        // 检查所有查询参数
        for (const key in req.query) {
            const value = req.query[key].toString().toLowerCase();
            if (suspiciousPatterns.some(pattern => value.includes(pattern))) {
                // 记录可疑请求
                console.warn(`检测到可疑请求: ${req.ip} - ${req.method} ${req.originalUrl}`);
                
                // 对可疑请求，直接返回403禁止访问
                res.status(403).json({
                    success: false,
                    message: '检测到非法请求参数'
                });
                
                return true; // 跳过标准速率限制，直接拒绝请求
            }
        }
        
        return false; // 正常请求应用标准限制
    }
});

// 特定API的速率限制器（更严格）
const sensitiveApiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15分钟
    max: 50, // 更严格的限制
    // 使用与通用限制器相同的IP识别逻辑
    keyGenerator: (request, response) => {
        if (request.headers['x-forwarded-for']) {
            const forwardedIps = request.headers['x-forwarded-for'].split(',');
            const clientIp = forwardedIps[0].trim();
            return clientIp;
        }
        return request.ip;
    },
    message: {
        success: false,
        message: '对敏感API请求过于频繁，请稍后再试'
    }
});

// 安全中间件配置
const setupSecurity = (app) => {
    // 应用Helmet设置HTTP安全头
    app.use(helmet());
    
    // 应用通用API限制
    app.use('/api', apiLimiter);
    
    // 为特定敏感路由应用更严格的限制
    app.use('/getRankDetails', sensitiveApiLimiter);
    app.use('/getDeckDetails', sensitiveApiLimiter);
    
    // 检查和净化请求参数的中间件
    app.use((req, res, next) => {
        // 用于记录和阻止潜在的恶意请求
        const requestUrl = req.originalUrl;
        
        // 检查URL中的可疑模式
        // 正确识别合法的URL编码：必须是%后跟两个十六进制字符
        // URL编码必须遵循%XX格式，其中XX是两个十六进制字符
        const hasIllegalPercentEncoding = (() => {
            const percentIndices = [];
            // 找出所有%符号的位置
            for (let i = 0; i < requestUrl.length; i++) {
                if (requestUrl[i] === '%') {
                    percentIndices.push(i);
                }
            }
            
            // 检查每个%后面是否跟着两个十六进制字符
            for (const index of percentIndices) {
                if (
                    index + 2 >= requestUrl.length || // 确保%后有至少两个字符
                    !/^[0-9A-Fa-f]{2}$/.test(requestUrl.substring(index + 1, index + 3)) // 确保是两个十六进制字符
                ) {
                    return true; // 发现非法编码
                }
            }
            
            return false; // 所有%编码都是合法的
        })();
        
        if (
            requestUrl.includes('..') || 
            hasIllegalPercentEncoding ||
            requestUrl.includes('/*') ||
            requestUrl.includes('*/')
        ) {
            console.warn(`检测到可疑URL路径: ${requestUrl}`);
            return res.status(403).json({
                success: false,
                message: '检测到非法URL路径'
            });
        }
        
        next();
    });
};

module.exports = {
    setupSecurity
}; 