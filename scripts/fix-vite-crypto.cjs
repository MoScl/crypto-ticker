// scripts/fix-vite-crypto.cjs
// 幂等修复: Vite 5.4.x 在 Node < 19 下 `crypto$2.getRandomValues is not a function`
// (node:crypto 顶层 getRandomValues 是 Node 19+ 才有, Vite 源码却直接调用)。
// 修复方式: 将 Vite chunk 里的 import 改为 default 导入 + 从 webcrypto 显式绑定 getRandomValues。
// v3 用 Object.defineProperty 遮蔽 —— 兼容 Node 16(赋值普通属性) 与 Node 22(getter-only 属性)。
// 兼容 Node 16/18/20/22; 可重复执行; 不依赖网络/npx/git。
// 用法: node scripts/fix-vite-crypto.cjs

const fs = require('fs');
const path = require('path');

const chunksDir = path.join(__dirname, '..', 'node_modules', 'vite', 'dist', 'node', 'chunks');

// 原始 bug 行: import crypto$2, { createHash as createHash$2 } from 'node:crypto';
const BUG_LINE = /import crypto\$2, \{ createHash as createHash\$2 \} from 'node:crypto';/;
// 旧版补丁 v1 (Object.assign 合并 webcrypto —— Node 16 下 getRandomValues 不可枚举而失效)
const OLD_PATCH =
  /import __viteNodeCrypto, \{ webcrypto as __wc, createHash as createHash\$2 \} from 'node:crypto';\r?\nconst crypto\$2 = Object\.assign\(Object\.create\(__viteNodeCrypto\), __wc\);?/;
// 旧版补丁 v2 (直接赋值 —— Node 22 下 getRandomValues 是 getter-only 属性, 赋值抛 TypeError)
const OLD_V2_PATCH =
  /const crypto\$2 = Object\.create\(__viteNodeCrypto\);\r?\nif \(__viteNodeCrypto\.webcrypto\) \{\r?\n\s*crypto\$2\.getRandomValues = __viteNodeCrypto\.webcrypto\.getRandomValues\.bind\(__viteNodeCrypto\.webcrypto\);\r?\n\}/;
// v3 补丁的 import + 定义块 (用于从 bug 行 / v1 升级)
const NEW_PATCH =
  "import __viteNodeCrypto, { createHash as createHash$2 } from 'node:crypto';\n" +
  'const crypto$2 = Object.create(__viteNodeCrypto);\n' +
  'if (__viteNodeCrypto.webcrypto) {\n' +
  "  Object.defineProperty(crypto$2, 'getRandomValues', {\n" +
  '    value: __viteNodeCrypto.webcrypto.getRandomValues.bind(__viteNodeCrypto.webcrypto),\n' +
  '    writable: true,\n' +
  '    configurable: true,\n' +
  '    enumerable: false,\n' +
  '  });\n' +
  '}';
// v3 的定义块 (仅用于 v2 -> v3 原地升级, import 行已是 __viteNodeCrypto)
const V23_PATCH =
  'const crypto$2 = Object.create(__viteNodeCrypto);\n' +
  'if (__viteNodeCrypto.webcrypto) {\n' +
  "  Object.defineProperty(crypto$2, 'getRandomValues', {\n" +
  '    value: __viteNodeCrypto.webcrypto.getRandomValues.bind(__viteNodeCrypto.webcrypto),\n' +
  '    writable: true,\n' +
  '    configurable: true,\n' +
  '    enumerable: false,\n' +
  '  });\n' +
  '}';

// v3 已修复特征行
const V3_MARK = "Object.defineProperty(crypto$2, 'getRandomValues'";

function main() {
  if (!fs.existsSync(chunksDir)) {
    console.log('[fix-vite-crypto] vite chunks 目录不存在, 跳过:', chunksDir);
    process.exit(0);
  }
  const files = fs.readdirSync(chunksDir).filter((f) => f.endsWith('.js'));
  let fixed = false;
  for (const f of files) {
    const fp = path.join(chunksDir, f);
    let src = fs.readFileSync(fp, 'utf8');
    if (src.includes(V3_MARK)) {
      continue; // 已是 v3 补丁, 跳过
    }
    let changed = false;
    if (OLD_V2_PATCH.test(src)) {
      src = src.replace(OLD_V2_PATCH, () => V23_PATCH);
      changed = true;
    }
    if (OLD_PATCH.test(src)) {
      src = src.replace(OLD_PATCH, () => NEW_PATCH); // 函数形式, 避免 $2 被当作捕获组
      changed = true;
    }
    if (BUG_LINE.test(src)) {
      src = src.replace(BUG_LINE, () => NEW_PATCH);
      changed = true;
    }
    if (changed) {
      fs.writeFileSync(fp, src);
      console.log('[fix-vite-crypto] 已修复:', fp);
      fixed = true;
    }
  }
  if (!fixed) {
    console.log('[fix-vite-crypto] 无需修复(补丁已生效或未找到 bug 行)');
  }
}

main();
