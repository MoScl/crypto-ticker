// 无头数据验证：直接驱动应用的行情数据层（不依赖 Electron GUI）
const { fetchBinanceSnapshot, BinanceStream } = require('../dist/main/data/binance.js');

const watch = [
  { id: 'BTCUSDT', symbol: 'BTC', name: 'Bitcoin', order: 0 },
  { id: 'ETHUSDT', symbol: 'ETH', name: 'Ethereum', order: 1 },
  { id: 'SOLUSDT', symbol: 'SOL', name: 'Solana', order: 2 },
];

(async () => {
  console.log('=== [1] Binance REST 24h 快照 ===');
  try {
    const snap = await fetchBinanceSnapshot(watch, 'USDT');
    for (const t of snap) {
      const up = t.changePercent >= 0;
      console.log(
        `${t.base.padEnd(5)} 价=$${t.price.toLocaleString()}  24h=${
          up ? '+' : ''
        }${t.changePercent.toFixed(2)}%  [${up ? '涨(绿)' : '跌(红)'}]`,
      );
    }
  } catch (e) {
    console.log('Binance REST 失败:', e.message);
  }

  console.log('\n=== [2] Binance WebSocket 直播推送（监听 6 秒）===');
  const stream = new BinanceStream(
    watch,
    'USDT',
    (t) =>
      console.log(
        `直播: ${t.base} 现价=$${t.price}  24h=${t.changePercent.toFixed(2)}%`,
      ),
    (ok) => console.log('WS 连接状态:', ok ? '已连接 ✓' : '断开'),
  );
  stream.start();
  setTimeout(() => {
    stream.close();
    console.log('\n=== 无头数据验证结束 ===');
    process.exit(0);
  }, 6000);
})();
