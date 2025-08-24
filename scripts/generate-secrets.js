#!/usr/bin/env node

const crypto = require('crypto');

console.log('🔐 生成教育会议调度系统密钥\n');

// 生成各种密钥
const jwtSecret = crypto.randomBytes(32).toString('hex');
const jwtRefreshSecret = crypto.randomBytes(32).toString('hex');
const nextAuthSecret = crypto.randomBytes(32).toString('hex');

console.log('📋 复制以下密钥到你的环境变量中：\n');

console.log('JWT_SECRET=' + jwtSecret);
console.log('JWT_REFRESH_SECRET=' + jwtRefreshSecret);
console.log('NEXTAUTH_SECRET=' + nextAuthSecret);

console.log('\n📝 使用说明：');
console.log('1. 在 Vercel 项目设置中添加这些环境变量');
console.log('2. 确保每个密钥都是唯一的');
console.log('3. 不要将这些密钥提交到 Git 仓库');
console.log('4. 在生产环境中定期轮换这些密钥');

console.log('\n⚠️  安全提示：');
console.log('- 每个环境（Production/Preview）使用不同的密钥');
console.log('- 密钥长度至少32位');
console.log('- 定期更换密钥');
console.log('- 不要在代码中硬编码这些密钥');

console.log('\n✅ 密钥生成完成！');
https://github.com/bigkrys/EducationalMeetingSchedulingSystem
https://EducationalMeetingSchedulingSystem-git-develop-bigkrys.vercel.app