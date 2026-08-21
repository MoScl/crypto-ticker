// 启动 Electron 的包装器：
// 1. 清除某些终端/沙箱注入的破坏性环境变量（ELECTRON_RUN_AS_NODE 会让
//    electron.exe 退化成纯 Node 导致 app 未定义；NODE_OPTIONS 里的
//    --use-system-ca 不被 Electron 接受直接退出）。
// 2. 以继承 stdio 的方式启动 electron.exe，转发退出码。
const { spawn } = require('node:child_process');

delete process.env.ELECTRON_RUN_AS_NODE;
delete process.env.NODE_OPTIONS;

const electronPath = require('electron'); // electron npm 包导出 exe 绝对路径

const child = spawn(electronPath, ['.'], {
  stdio: 'inherit',
  env: process.env,
});

child.on('error', (err) => {
  console.error('[run-electron] 启动失败:', err.message);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
