const path = require('path');
const { fetchRanking } = require(path.join(__dirname, '..', 'dist', 'main', 'data', 'ranking.js'));
(async () => {
  for (const kind of ['gainers', 'losers', 'volume', 'new']) {
    const t0 = Date.now();
    try {
      const rows = await fetchRanking(kind);
      const top = rows
        .slice(0, 3)
        .map((r) => {
          let s = r.symbol;
          if (r.priceChange24h != null) s += ' ' + r.priceChange24h.toFixed(1) + '%';
          if (r.volume24h) s += ' vol=' + r.volume24h.toFixed(0);
          if (r.listedAt) s += ' listed=' + new Date(r.listedAt).toISOString().slice(0, 10);
          return s;
        });
      console.log(`[${kind}] ok n=${rows.length} top=${top.join(' | ')} (${Date.now() - t0}ms)`);
    } catch (e) {
      console.log(`[${kind}] FAIL: ${e.message} (${Date.now() - t0}ms)`);
    }
  }
})();
