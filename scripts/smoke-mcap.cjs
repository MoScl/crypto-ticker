const path = require('path');
const { fetchRanking } = require(path.join(__dirname, '..', 'dist', 'main', 'data', 'ranking.js'));
(async () => {
  const t0 = Date.now();
  try {
    const rows = await fetchRanking('marketcap');
    console.log(
      '[marketcap] ok n=' +
        rows.length +
        ' top=' +
        rows
          .slice(0, 3)
          .map((r) => r.symbol + ' ' + (r.marketCap ?? 0).toFixed(0))
          .join(' | ') +
        ' (' +
        (Date.now() - t0) +
        'ms)',
    );
  } catch (e) {
    console.log('[marketcap] FAIL: ' + e.message.slice(0, 200) + ' (' + (Date.now() - t0) + 'ms)');
  }
})();
