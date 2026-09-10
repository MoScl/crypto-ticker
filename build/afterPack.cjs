/**
 * electron-builder afterPack 钩子：打包完成、压缩成安装包之前，
 * 删除 Electron 运行时里的「非必需大文件」。
 *
 * 两个开关当前都是 true（已启用）。若出现异常，把对应开关改回 false 即可。
 *
 * 1. STRIP_LICENSES（-10MB 解压后体积）
 *    删除 LICENSES.chromium.html(9.8MB) + LICENSE.electron.txt。
 *    ⚠️ 合规提示：Chromium/Electron 的许可条款要求分发时保留版权与许可声明。
 *    删除前建议在应用内「关于」页或仓库 README 中给出许可链接再启用。
 *
 * 2. STRIP_SWIFTSHADER（-13MB 解压后体积）
 *    删除 SwiftShader 软件渲染库（vk_swiftshader.dll / libEGL / libGLESv2）。
 *    ⚠️ 高危：这几个是 GPU 合成（ANGLE）与软件渲染（SwiftShader）的后端。
 *    Electron 即使调用了 app.disableHardwareAcceleration()，GPU 进程初始化仍依赖
 *    libEGL.dll / libGLESv2.dll；删掉它们会导致窗口无法渲染（白屏/打不开）。
 *    因此【默认关闭本开关】，保持 DLL 完整。若确有体积诉求，应改用
 *    --use-gl=angle --use-angle=swiftshader 显式指定软件渲染后端，而非删除 DLL。
 *
 * 说明：这里删的是「安装后磁盘占用」，对安装包体积影响有限——
 * 许可文本是纯文本压缩率极高（10MB → 约 0.3MB）；SwiftShader 是二进制，压缩率一般。
 */
const fs = require('node:fs');
const path = require('node:path');

const STRIP_LICENSES = true;
// 关闭 SwiftShader 剥离：libEGL/libGLESv2/vk_swiftshader 是渲染后端，删掉会让窗口打不开。
const STRIP_SWIFTSHADER = false;

/** 删除存在的文件/目录，返回被删掉的条目（相对 appOutDir） */
function remove(appOutDir, relPath) {
  const abs = path.join(appOutDir, relPath);
  if (!fs.existsSync(abs)) return null;
  const stat = fs.statSync(abs);
  fs.rmSync(abs, { recursive: stat.isDirectory(), force: true });
  return relPath;
}

module.exports = async function afterPack(context) {
  const appOutDir = context.appOutDir;
  const isMac = context.electronPlatformName === 'darwin';
  const removed = [];

  if (STRIP_LICENSES) {
    for (const f of ['LICENSES.chromium.html', 'LICENSE.electron.txt']) {
      const r = remove(appOutDir, f);
      if (r) removed.push(r);
    }
  }

  if (STRIP_SWIFTSHADER) {
    const targets = isMac
      ? [
          // macOS：位于 Electron Framework 的 Libraries 下
          // 注意必须带 Versions/A：Frameworks 下的 Libraries 只是指向它的符号链接，
          // 删链接本身不会删掉真实文件。
          path.join(
            'Contents',
            'Frameworks',
            'Electron Framework.framework',
            'Versions',
            'A',
            'Libraries',
            'libEGL.dylib',
          ),
          path.join(
            'Contents',
            'Frameworks',
            'Electron Framework.framework',
            'Versions',
            'A',
            'Libraries',
            'libGLESv2.dylib',
          ),
          path.join(
            'Contents',
            'Frameworks',
            'Electron Framework.framework',
            'Versions',
            'A',
            'Libraries',
            'libvk_swiftshader.dylib',
          ),
          path.join(
            'Contents',
            'Frameworks',
            'Electron Framework.framework',
            'Versions',
            'A',
            'Libraries',
            'vk_swiftshader_icd.json',
          ),
        ]
      : ['vk_swiftshader.dll', 'libEGL.dll', 'libGLESv2.dll', 'vk_swiftshader_icd.json'];
    for (const f of targets) {
      const r = remove(appOutDir, f);
      if (r) removed.push(r);
    }
  }

  if (removed.length) {
    console.log(`[afterPack] 已清理 ${removed.length} 项：${removed.join(', ')}`);
  }
};
